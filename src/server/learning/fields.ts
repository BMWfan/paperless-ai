/** Reuse the fork's reviewed extraction contracts with the upstream client. */
import { createRequire } from 'node:module';
import type { AppContext } from '../context.js';
import type { PaperlessDocument, PaperlessCustomField } from '../paperless/types.js';
import { HttpProblem } from '../http/helpers.js';
const require = createRequire(import.meta.url);
export interface FieldReview {
  documentId: number;
  snapshotDigest: string;
  reviewFieldIds: number[];
  fields: { field: number; value: string | number | boolean }[];
}
export interface FieldClear { documentId: number; snapshotDigest: string; reviewFieldIds: number[]; fields: number[] }
export interface FieldPreview {
  documentId: number;
  snapshotDigest: string;
  reviewFieldIds: number[];
  rows: unknown[];
  [key: string]: unknown;
}
const preview = require('./legacy/customFieldPreview.cjs');
const hints = require('./legacy/learnedFieldHints.cjs');
const review = require('./legacy/customFieldReview.cjs');
const updates = require('./legacy/customFieldUpdates.cjs');
export const normalizeFieldValue = updates.normalizeValue as (value: unknown, field: PaperlessCustomField) => unknown;
function adapter(ctx: AppContext) {
  // One fresh definition snapshot per request, never the long-lived metadata cache.
  let snapshot: Promise<PaperlessCustomField[]> | undefined;
  const definitions = () => snapshot ??= ctx.paperless().customFields();
  return {
    getCustomFields: definitions,
    getDocument: (id: number) => ctx.paperless().getDocument(id),
    getCustomFieldDefinition: async (id: number) => {
      const field = (await definitions()).find(row => row.id === id);
      if (!field) { const error = new Error('Field not found') as Error & { response: { status: number } }; error.response = { status: 404 }; throw error; }
      return field;
    },
    getCustomFieldDefinitionMatches: async (name: string) => {
      const results = (await definitions()).filter(row => row.name.trim().toLowerCase() === name.trim().toLowerCase());
      return { count: results.length, results };
    },
  };
}
async function bridge<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const value = error as { status?: number; message?: string };
    if (value.status && [400, 409].includes(value.status)) throw new HttpProblem(value.status, value.message ?? 'Invalid field review');
    throw error;
  }
}
export function previewFields(ctx: AppContext, id: number, content: string, suggestions: { field_name: string; value: unknown }[]): Promise<FieldPreview> {
  return bridge(() => preview.previewCustomFields(adapter(ctx), id, content, suggestions));
}
export function learnedFields(ctx: AppContext, id: number, content: string): Promise<FieldPreview> {
  return bridge(() => hints.learnedFieldPreview(adapter(ctx), ctx.learning, id, content));
}
export function reviewedFields(ctx: AppContext, doc: PaperlessDocument, request: FieldReview): Promise<{ custom_fields: { field: number; value: unknown }[] }> {
  return bridge(() => review.prepareReviewedFields(adapter(ctx), doc.id, doc, request));
}

export function clearedFields(ctx: AppContext, doc: PaperlessDocument, request: FieldClear): Promise<{ custom_fields: { field: number; value: unknown }[] }> {
  return bridge(() => review.prepareClearedFields(adapter(ctx), doc.id, doc, request));
}
export function currentFields(ctx: AppContext, id: number, content: string, offset = 0): Promise<FieldPreview> {
  return bridge(async () => {
    const service = adapter(ctx), document = await service.getDocument(id), definitions = await service.getCustomFields();
    const assigned = document.custom_fields ?? [];
    const suggestions = assigned.slice(offset, offset + 50).flatMap(row => {
      const definition = definitions.find(field => field.id === row.field);
      return definition ? [{ field_name: definition.name, value: row.value }] : [];
    });
    const result = await preview.previewCustomFields(service, id, content, suggestions, { allowEmptyContent: true });
    const used = definitions.filter(field => result.reviewFieldIds.includes(field.id));
    if (result.snapshotDigest !== review.snapshotDigest(id, document, used)) throw new HttpProblem(409, 'Document changed; refresh before editing fields');
    for (const row of result.rows as { flags: string[] }[]) row.flags = row.flags.filter(flag => !['no_exact_occurrence', 'multiple_occurrences', 'not_provided'].includes(flag));
    return { ...result, suggestionSource: 'current_native_values', offset, totalFields: assigned.length, hasMoreFields: offset + 50 < assigned.length };
  });
}
