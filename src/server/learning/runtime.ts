/** Small integration surface between upstream processing and the fork's Learning v2 store. */
import { createRequire } from 'node:module';
import type { AppContext } from '../context.js';
import type { PaperlessDocument } from '../paperless/types.js';
import { HttpProblem } from '../http/helpers.js';
const require = createRequire(import.meta.url);
const { normalizeDocumentMetadata } = require('./legacy/documentSnapshotService.cjs') as { normalizeDocumentMetadata(document: unknown): unknown };
const { selectContext, rankExamples } = require('./legacy/learningContext.cjs') as {
  selectContext(content: string, examples: unknown[], budget?: number): string;
  rankExamples<T>(content: string, examples: T[]): T[];
};
const monitors = new WeakMap<AppContext, { running: boolean; stopped: boolean; generation: number; timer?: NodeJS.Timeout; lastScan: unknown; lastError: string | null }>();
function state(ctx: AppContext) {
  let value = monitors.get(ctx);
  if (!value) { value = { running: false, stopped: true, generation: 0, lastScan: null, lastError: null }; monitors.set(ctx, value); }
  return value;
}
export function learningStatus(ctx: AppContext) { const s = state(ctx); return { running: s.running, lastScan: s.lastScan, lastError: s.lastError }; }
export async function scanLearning(ctx: AppContext) {
  const s = state(ctx);
  if (s.running) return { skipped: true };
  s.running = true;
  try {
    const revisions = ctx.learning.snapshotRevisions();
    const docs = await ctx.paperless().listDocuments({ fields: ['id', 'title', 'tags', 'correspondent', 'document_type', 'custom_fields', 'modified'], pageSize: 100 });
    let scanned = 0, pending = 0;
    for (let doc of docs) {
      if (ctx.learningWrites.has(doc.id)) continue;
      if (ctx.learning.needsContent(doc)) doc = await ctx.paperless().getDocument(doc.id);
      if (ctx.learningWrites.has(doc.id)) continue;
      const result = ctx.learning.observe(doc, 'unknown', { expectedRevision: revisions.get(doc.id) ?? 0, stabilizationMs: ctx.learning.settings().stabilizationMs });
      if (result.skipped) continue;
      scanned++; if (result.pendingReview) pending++;
    }
    s.lastScan = { scanned, pending }; s.lastError = null; return { scanned, pending };
  } catch (error) { s.lastError = 'Learning scan failed'; throw error; }
  finally { s.running = false; }
}
export function startLearningMonitor(ctx: AppContext) {
  stopLearningMonitor(ctx); const s = state(ctx); s.stopped = false; const generation = s.generation;
  const tick = async () => {
    try { if (ctx.learning.settings().enabled && ctx.learning.settings().mode !== 'disabled') await scanLearning(ctx); }
    catch { /* status contains a non-sensitive failure; next interval retries */ }
    if (!s.stopped && s.generation === generation) { s.timer = setTimeout(tick, ctx.learning.settings().intervalMs); s.timer.unref(); }
  };
  void tick();
}
export function stopLearningMonitor(ctx: AppContext) { const s = state(ctx); s.stopped = true; s.generation++; clearTimeout(s.timer); }
export function sameLearningMetadata(a: PaperlessDocument, b: PaperlessDocument): boolean {
  return JSON.stringify(normalizeDocumentMetadata(a)) === JSON.stringify(normalizeDocumentMetadata(b));
}
export async function withLearningWrite<T>(ctx: AppContext, id: number, operation: () => Promise<T>): Promise<T> {
  if (ctx.learningWrites.has(id)) throw new HttpProblem(409, 'Document update in progress; refresh and retry');
  ctx.learningWrites.add(id);
  try { return await operation(); } finally { ctx.learningWrites.delete(id); }
}
export async function learningContext(ctx: AppContext, content: string): Promise<string> {
  if (ctx.learning.settings().mode === 'disabled') return '';
  let examples = ctx.learning.examples();
  if (examples.length) {
    try {
      const vocabulary = await ctx.metadata().snapshot();
      const name = (rows: { id: number; name: string }[], id: unknown) => rows.find(row => row.id === Number(id))?.name ?? null;
      examples = examples.map(row => ({ ...row, metadata: { ...row.metadata,
        tags: Array.isArray(row.metadata.tags) ? row.metadata.tags.map(id => name(vocabulary.tags, id)).filter(Boolean) : [],
        correspondent: name(vocabulary.correspondents, row.metadata.correspondent),
        document_type: name(vocabulary.documentTypes, row.metadata.document_type),
      } }));
    } catch {
      examples = examples.map(row => ({ ...row, metadata: { title: row.metadata.title, tags: [], correspondent: null, document_type: null } }));
    }
  }
  return selectContext(content, [...rankExamples(content, examples).slice(0, 8), ...ctx.learning.legacyExamples()], 1500);
}

export function hasProtectedLearning(ctx: AppContext, id: number): boolean {
  return ctx.learning.settings().mode !== 'disabled' &&
    (!!ctx.learning.protectedMetadata(id) || ctx.learning.hasLegacyExample(id));
}
