import { clearedFields, normalizeFieldValue, reviewedFields, type FieldClear, type FieldReview } from '../learning/fields.js';
/**
 * Turns an AI suggestion (or a manual edit) into a Paperless PATCH, applies
 * it and records an undoable history entry.
 */
import type { AnalysisResult, DocumentSnapshot, DocumentSuggestion } from '../../shared/api.js';
import type { AppContext } from '../context.js';
import type { DocumentPatch } from '../paperless/client.js';
import { normalizeName } from '../paperless/metadata.js';
import type { PaperlessCustomField, PaperlessCustomFieldType, PaperlessDocument } from '../paperless/types.js';
import { logger } from '../logger.js';
import { PaperlessError } from '../paperless/client.js';
import { datePart, normalizeDate } from './dates.js';
import { localDate } from './prompt.js';
import { hasProtectedLearning, sameLearningMetadata, withLearningWrite } from '../learning/runtime.js';
import { HttpProblem } from '../http/helpers.js';

const log = logger.child({ module: 'applier' });

export const MAX_TITLE_LENGTH = 128;

export interface PlannedUpdate {
  patch: DocumentPatch;
  display: { title: string | null; correspondent: string | null; documentType: string | null; tags: number[] };
  notes: string[];
}

export function snapshotOf(doc: PaperlessDocument): DocumentSnapshot {
  return {
    title: doc.title,
    tags: [...(doc.tags ?? [])],
    correspondent: doc.correspondent ?? null,
    document_type: doc.document_type ?? null,
    created: datePart(doc.created_date ?? doc.created),
    custom_fields: (doc.custom_fields ?? []).map((f) => ({ field: f.field, value: f.value })),
  };
}

export function truncateTitle(title: string): string {
  const t = title.trim();
  return t.length > MAX_TITLE_LENGTH ? `${t.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : t;
}

/** Parse numbers written in German or English notation ("1.234,56", "1,234.56", "12,50 €"). */
export function parseNumber(input: string): number | null {
  let t = input.replace(/[^\d,.-]/g, '');
  if (!t || !/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma > -1) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Use the same conservative typed contract for automatic, manual and reviewed fields. */
export function convertCustomFieldValue(field: PaperlessCustomField, value: string, currency?: string): unknown {
  const v = value.trim();
  if (field.data_type === 'url') {
    const url = /^www\./i.test(v) ? `https://${v}` : v;
    return !/\s/.test(url) && /^[a-z][a-z0-9+.-]*:\/\/[^/]/i.test(url) && URL.canParse(url) ? url : undefined;
  }
  // Retain upstream compatibility with old index-based select fields, but never choose between duplicate labels.
  if (field.data_type === 'select' && field.extra_data?.select_options?.every(option => typeof option === 'string')) {
    const options = field.extra_data.select_options as string[];
    const matches = options.map((label, index) => ({ label, index })).filter(option => normalizeName(option.label) === normalizeName(v));
    return matches.length === 1 ? matches[0].index : undefined;
  }
  if (!['string', 'longtext', 'integer', 'float', 'boolean', 'select', 'date', 'monetary'].includes(field.data_type)) return undefined;
  const normalized = normalizeFieldValue(v, field);
  if (normalized === undefined || field.data_type !== 'monetary') return normalized;
  // An explicit currency belongs to the document; defaults must never silently relabel it.
  if (/^[A-Z]{3}/.test(String(normalized))) return normalized;
  const fallback = field.extra_data?.default_currency || currency;
  if (fallback && !/^[A-Z]{3}$/.test(fallback)) return undefined;
  return fallback ? `${fallback}${normalized}` : normalized;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

async function resolveCustomFields(
  ctx: AppContext,
  doc: PaperlessDocument,
  values: { field_name: string; value: string }[],
  onlyConfigured: boolean,
  notes: string[],
): Promise<{ field: number; value: unknown }[] | undefined> {
  const eligible = values.filter(row => !onlyConfigured || ctx.cfg.processing.customFields.some(configured => normalizeName(configured.name) === normalizeName(row.field_name)));
  if (!eligible.length) return undefined;
  const meta = ctx.metadata();
  let definitions: PaperlessCustomField[];
  try { definitions = await ctx.paperless().customFields(); }
  catch { notes.push('Custom field definitions unavailable; no field values were written'); return undefined; }
  const merged = new Map<number, unknown>((doc.custom_fields ?? []).map((f) => [f.field, f.value]));
  let changed = false;
  const names = eligible.map(row => normalizeName(row.field_name));
  for (const { field_name, value } of eligible) {
    const configured = ctx.cfg.processing.customFields.find((c) => normalizeName(c.name) === normalizeName(field_name));
    const matches = definitions.filter(field => normalizeName(field.name) === normalizeName(configured?.name ?? field_name));
    if (names.filter(name => name === normalizeName(field_name)).length > 1 || matches.length > 1) {
      notes.push(`Custom field "${field_name}" is ambiguous; no value was written`);
      continue;
    }
    try {
      const type = (configured?.type ?? 'string') as PaperlessCustomFieldType;
      const create = Boolean(configured) && type !== 'select';
      let field = matches[0];
      if (!field) {
        if (meta.customFieldByName(configured?.name ?? field_name)) {
          notes.push(`Custom field "${field_name}" changed; refresh before saving`);
          continue;
        }
        const result = await meta.resolveCustomField(configured?.name ?? field_name, create, type, configured?.currency);
        if (result.id == null) {
          notes.push(`Custom field "${field_name}" does not exist in Paperless${type === 'select' ? ' (create select fields with their options in Paperless)' : ''}`);
          continue;
        }
        field = meta.customField(result.id) ?? { id: result.id, name: result.name, data_type: type };
        definitions.push(field);
      }
      const converted = convertCustomFieldValue(field, value, configured?.currency);
      if (converted === undefined) {
        notes.push(`Value is not valid for custom field "${field.name}" (${field.data_type})`);
        continue;
      }
      if (merged.get(field.id) !== converted) {
        merged.set(field.id, converted);
        changed = true;
      }
    } catch (err) {
      notes.push(`Custom field "${field_name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return changed ? [...merged.entries()].map(([field, value]) => ({ field, value })) : undefined;
}

/** Plan the update for an automatic AI run, honouring all processing settings. */
export async function planAutomaticUpdate(ctx: AppContext, doc: PaperlessDocument, s: DocumentSuggestion): Promise<PlannedUpdate> {
  const p = ctx.cfg.processing;
  if (hasProtectedLearning(ctx, doc.id)) {
    return { patch: {}, display: { title: doc.title, correspondent: null, documentType: null, tags: doc.tags ?? [] }, notes: ['Confirmed learning protects the current metadata; revoke it before automatic replacement'] };
  }
  const meta = ctx.metadata();
  await meta.snapshot();
  const patch: DocumentPatch = {};
  const notes: string[] = [];
  const current = doc.tags ?? [];
  let tags = [...current];

  if (p.functions.tags || p.usePromptTags) {
    let names = s.tags;
    let create = !p.restrict.tags;
    if (p.usePromptTags) {
      const allowed = new Map(p.promptTags.map((t) => [normalizeName(t), t]));
      names = names.map((n) => allowed.get(normalizeName(n))).filter((n): n is string => Boolean(n));
      create = true; // prompt tags may not exist in Paperless yet
    }
    const res = await meta.resolveTags(names, create);
    if (res.missing.length) notes.push(`Ignored tags not existing in Paperless: ${res.missing.join(', ')}`);
    for (const id of res.ids) if (!tags.includes(id)) tags.push(id);
  }
  if (p.addProcessedTag && p.processedTagName) {
    const res = await meta.resolveTag(p.processedTagName, true);
    if (res.id != null && !tags.includes(res.id)) tags.push(res.id);
  }
  if (p.removeTriggerTags && p.onlyTagged && p.tags.length) {
    const trigger = (await meta.resolveTags(p.tags, false)).ids;
    tags = tags.filter((t) => !trigger.includes(t));
  }
  if (!sameSet(tags, current)) patch.tags = tags;

  let title: string | null = doc.title;
  if (p.functions.title && s.title) {
    title = truncateTitle(s.title);
    if (title !== doc.title) patch.title = title;
  }

  if (p.functions.documentDate && s.document_date && s.document_date !== datePart(doc.created_date ?? doc.created)) {
    // A document cannot be written in the future – that is a due date or a misread year (one day of slack for time zones).
    if (s.document_date > localDate(new Date(Date.now() + 86_400_000))) notes.push(`Ignored document date ${s.document_date} (in the future)`);
    else patch.created = s.document_date;
  }

  let documentType = meta.documentTypeName(doc.document_type);
  if (p.functions.documentType && s.document_type) {
    const res = await meta.resolveDocumentType(s.document_type, !p.restrict.documentTypes);
    if (res.id == null) notes.push(`Document type "${s.document_type}" does not exist (restricted to existing types)`);
    else {
      documentType = res.name;
      if (res.id !== doc.document_type) patch.document_type = res.id;
    }
  }

  let correspondent = meta.correspondentName(doc.correspondent);
  if (p.functions.correspondent && s.correspondent) {
    if (doc.correspondent && !p.overwriteCorrespondent) {
      if (normalizeName(correspondent ?? '') !== normalizeName(s.correspondent)) {
        notes.push(`Kept existing correspondent "${correspondent}" (AI suggested "${s.correspondent}")`);
      }
    } else {
      const res = await meta.resolveCorrespondent(s.correspondent, !p.restrict.correspondents);
      if (res.id == null) notes.push(`Correspondent "${s.correspondent}" does not exist (restricted to existing correspondents)`);
      else if (res.id !== doc.correspondent) {
        correspondent = res.name;
        patch.correspondent = res.id;
      }
    }
  }

  if (p.functions.customFields && p.customFields.length) {
    const cf = await resolveCustomFields(ctx, doc, s.custom_fields, true, notes);
    if (cf) patch.custom_fields = cf;
  }

  return { patch, display: { title, correspondent, documentType, tags }, notes };
}

export interface ManualUpdateInput {
  title?: string;
  correspondent?: string | null;
  documentType?: string | null;
  /** Final list of tag names (replaces the current tags). */
  tags?: string[];
  created?: string | null;
  customFields?: { field_name: string; value: string }[];
}

/** Plan an update with values explicitly chosen by the user (manual review). */
export async function planManualUpdate(ctx: AppContext, doc: PaperlessDocument, input: ManualUpdateInput): Promise<PlannedUpdate> {
  const meta = ctx.metadata();
  await meta.snapshot();
  const patch: DocumentPatch = {};
  const notes: string[] = [];
  let tags = doc.tags ?? [];
  if (input.tags) {
    const res = await meta.resolveTags(input.tags, true);
    tags = res.ids;
    if (!sameSet(tags, doc.tags ?? [])) patch.tags = tags;
  }
  let title: string | null = doc.title;
  if (input.title !== undefined && input.title.trim()) {
    title = truncateTitle(input.title);
    if (title !== doc.title) patch.title = title;
  }
  let correspondent = meta.correspondentName(doc.correspondent);
  if (input.correspondent !== undefined) {
    if (input.correspondent === null || !input.correspondent.trim()) {
      if (doc.correspondent !== null) patch.correspondent = null;
      correspondent = null;
    } else {
      const res = await meta.resolveCorrespondent(input.correspondent, true);
      correspondent = res.name;
      if (res.id !== doc.correspondent) patch.correspondent = res.id;
    }
  }
  let documentType = meta.documentTypeName(doc.document_type);
  if (input.documentType !== undefined) {
    if (input.documentType === null || !input.documentType.trim()) {
      if (doc.document_type !== null) patch.document_type = null;
      documentType = null;
    } else {
      const res = await meta.resolveDocumentType(input.documentType, true);
      documentType = res.name;
      if (res.id !== doc.document_type) patch.document_type = res.id;
    }
  }
  if (input.created) {
    const d = normalizeDate(input.created);
    if (!d) notes.push(`Invalid date "${input.created}" ignored`);
    else if (d !== datePart(doc.created_date ?? doc.created)) patch.created = d;
  }
  if (input.customFields?.length) {
    const cf = await resolveCustomFields(ctx, doc, input.customFields, false, notes);
    if (cf) patch.custom_fields = cf;
  }
  return { patch, display: { title, correspondent, documentType, tags }, notes };
}

export interface ApplyMeta {
  source: string;
  /** Only authenticated, explicitly chosen UI changes may become trusted feedback. */
  actor?: string;
  fieldReview?: FieldReview;
  fieldClear?: FieldClear;
  analysis?: AnalysisResult;
}

/** PATCH the document, then record history and processing state (only after success). */
export async function applyPlannedUpdate(ctx: AppContext, doc: PaperlessDocument, plan: PlannedUpdate, info: ApplyMeta): Promise<PaperlessDocument> {
  return withLearningWrite(ctx, doc.id, async () => {
    const current = await ctx.paperless().getDocument(doc.id);
    if (!sameLearningMetadata(current, doc) || (current.content ?? '') !== (doc.content ?? '')) {
      ctx.learning.observe(current, 'unknown');
      throw new HttpProblem(409, 'Document changed before saving; refresh and retry');
    }
    // Confirmation may happen after planning, while the analysis/metadata fetch awaits.
    if (info.analysis && hasProtectedLearning(ctx, doc.id)) {
      throw new HttpProblem(409, 'Confirmed learning now protects this document; refresh before processing');
    }
    // Capture external changes before attributing the following write to this application.
    ctx.learning.observe(current, 'unknown');
    if (info.fieldReview && info.fieldClear) throw new HttpProblem(400, 'Choose save or clear, not both');
    if (info.fieldClear) Object.assign(plan.patch, await clearedFields(ctx, current, info.fieldClear));
    if (info.fieldReview) Object.assign(plan.patch, await reviewedFields(ctx, current, info.fieldReview));
    const updated = await applyPlannedUpdateUnlocked(ctx, current, plan, info);
    // A native workflow or concurrent external write may change more than requested.
    // Never attribute the entire returned document to the human/app in that case.
    const matchesRequest = sameLearningMetadata(updated, { ...current, ...plan.patch });
    const source = !matchesRequest ? 'unknown' : info.source === 'manual' ? (info.actor ? 'confirmed_ui' : 'unknown') : 'self_write';
    ctx.learning.observe(updated, source, { actor: info.actor });
    if (info.analysis) ctx.learning.prediction(doc.id, info.analysis.suggestion);
    return updated;
  });
}
async function applyPlannedUpdateUnlocked(ctx: AppContext, doc: PaperlessDocument, plan: PlannedUpdate, info: ApplyMeta): Promise<PaperlessDocument> {
  let updated = doc;
  if (Object.keys(plan.patch).length) {
    try {
      updated = await ctx.paperless().updateDocument(doc.id, plan.patch);
    } catch (err) {
      // One unacceptable custom field value must not cost the title, tags and correspondent.
      if (info.fieldReview || info.fieldClear || !withoutRejectedCustomFields(err, plan)) throw err;
      updated = Object.keys(plan.patch).length ? await ctx.paperless().updateDocument(doc.id, plan.patch) : doc;
    }
  }
  const hasChanges = Object.keys(plan.patch).length > 0;
  try {
    // Undo snapshot and processing state are stored together (or not at all).
    ctx.db.transaction(() => recordApplied(ctx, doc, updated, plan, info, hasChanges))();
  } catch (err) {
    // Paperless was changed already: never process (and change) the document a second time.
    log.error({ err, documentId: doc.id }, `Document ${doc.id} was updated in Paperless, but the history could not be saved`);
    try {
      ctx.repos.documents.markProcessed(doc.id, updated.title ?? doc.title, updated.modified ?? null);
    } catch {
      /* database unavailable – logged above */
    }
  }
  if (plan.notes.length) log.info({ documentId: doc.id, notes: plan.notes }, `Document ${doc.id}: ${plan.notes.join('; ')}`);
  return updated;
}

/**
 * Paperless rejected the custom field values (400 with a `custom_fields` error): remove the
 * rejected ones – or all, if the response does not say which – from the plan. Returns false for
 * other errors.
 */
function withoutRejectedCustomFields(err: unknown, plan: PlannedUpdate): boolean {
  const fields = plan.patch.custom_fields;
  if (!fields || !(err instanceof PaperlessError) || err.status !== 400) return false;
  const body = (err.cause as { body?: unknown } | undefined)?.body as { custom_fields?: unknown } | undefined;
  if (!body || typeof body !== 'object' || !('custom_fields' in body)) return false;
  const errors = Array.isArray(body.custom_fields) ? body.custom_fields : null;
  // Paperless answers with one entry per submitted field – empty for the valid ones.
  const rejected = (i: number) => !errors || errors.length !== fields.length || Boolean(errors[i] && Object.keys(errors[i] as object).length);
  const kept = fields.filter((_, i) => !rejected(i));
  if (kept.length && kept.length < fields.length) plan.patch.custom_fields = kept;
  else delete plan.patch.custom_fields;
  const dropped = fields.filter((f) => !plan.patch.custom_fields?.includes(f)).map((f) => f.field);
  plan.notes.push(`Paperless rejected custom field values (${JSON.stringify(body.custom_fields).slice(0, 300)}) – saved without them`);
  log.warn(`Document custom fields ${dropped.join(', ')} were rejected by Paperless – saving the other changes`);
  return true;
}

function recordApplied(ctx: AppContext, doc: PaperlessDocument, updated: PaperlessDocument, plan: PlannedUpdate, info: ApplyMeta, hasChanges: boolean): void {
  if (hasChanges) {
    ctx.repos.history.add({
      documentId: doc.id,
      source: info.source,
      provider: info.analysis?.provider,
      model: info.analysis?.model,
      title: plan.display.title,
      correspondent: plan.display.correspondent,
      documentType: plan.display.documentType,
      tags: plan.display.tags,
      before: snapshotOf(doc),
      after: plan.patch as Record<string, unknown>,
      suggestion: info.analysis?.suggestion,
      promptTokens: info.analysis?.usage.promptTokens,
      completionTokens: info.analysis?.usage.completionTokens,
      totalTokens: info.analysis?.usage.totalTokens,
      durationMs: info.analysis?.durationMs,
    });
  }
  ctx.repos.documents.markProcessed(doc.id, updated.title ?? doc.title, updated.modified ?? null);
}

/**
 * Restore the values a document had before the AI changed it for the first time.
 * The document is marked so that it is not processed again automatically.
 */
export async function revertDocument(ctx: AppContext, documentId: number): Promise<PaperlessDocument> {
  const original = ctx.repos.history.originalForDocument(documentId);
  if (!original) throw new Error(`No undo information stored for document ${documentId}`);
  const b = original.before;
  const patch: DocumentPatch = {};
  if (b.title !== undefined) patch.title = b.title;
  if (b.tags !== undefined) patch.tags = b.tags;
  if (b.correspondent !== undefined) patch.correspondent = b.correspondent;
  if (b.document_type !== undefined) patch.document_type = b.document_type;
  if (b.created) patch.created = b.created;
  if (b.custom_fields !== undefined) patch.custom_fields = b.custom_fields;
  const updated = await ctx.paperless().updateDocument(documentId, patch);
  ctx.repos.history.markReverted(documentId);
  ctx.repos.documents.markSkipped(documentId, updated.title, 'reverted', updated.modified ?? null);
  log.info(`Reverted AI changes of document ${documentId}`);
  return updated;
}
