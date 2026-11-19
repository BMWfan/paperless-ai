import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../helpers/appHarness.js';
let h: Harness;
const content = 'Synthetic invoice\nInvoice number: NEW-42\nOld invoice: OLD-17\nAmount: EUR84.20';
beforeEach(async () => {
  h = await createHarness();
  h.paperless.addCustomField('Invoice number', 'string', null, 10);
  h.paperless.addCustomField('Amount', 'monetary', null, 11);
  h.paperless.addCustomField('Count', 'integer', null, 12);
  h.paperless.addDocument({ id: 1, title: 'Invoice', content, custom_fields: [{ field: 11, value: 'EUR12.00' }] });
});
afterEach(async () => h.close());
async function preview(suggestions = [{ field_name: 'Invoice number', value: 'NEW-42' }]) {
  const result = await h.inject({ method: 'POST', url: '/api/documents/1/fields/preview', headers: h.apiKeyHeaders(), payload: { content, suggestions } });
  expect(result.statusCode).toBe(200); return result.json();
}
async function apply(snapshot: { snapshotDigest: string; reviewFieldIds: number[] }, fields: unknown[]) {
  return h.inject({ method: 'POST', url: '/api/documents/1/fields/apply', headers: h.apiKeyHeaders(), payload: { snapshotDigest: snapshot.snapshotDigest, reviewFieldIds: snapshot.reviewFieldIds, fields } });
}
describe('Reviewed custom fields on upstream4', () => {
  it('previews without writes and preserves unselected native values when saved', async () => {
    const snapshot = await preview();
    expect(snapshot.rows[0]).toMatchObject({ normalizedValue: 'NEW-42', semanticStatus: 'unverified', canApply: true });
    expect(h.paperless.patches()).toHaveLength(0);
    expect((await apply(snapshot, [{ field: 10, value: 'NEW-42' }])).statusCode).toBe(200);
    expect((await h.ctx.paperless().getDocument(1)).custom_fields).toEqual(expect.arrayContaining([{ field: 10, value: 'NEW-42' }, { field: 11, value: 'EUR12.00' }]));
    expect(h.ctx.learning.examples()).toHaveLength(0); // API key does not establish a human actor.
  });
  it('rejects a stale document or content without writing', async () => {
    const snapshot = await preview(); h.paperless.editDocument(1, { content: content + '\nChanged' });
    expect((await apply(snapshot, [{ field: 10, value: 'NEW-42' }])).statusCode).toBe(409);
    expect(h.paperless.patches()).toHaveLength(0);
  });
  it('rejects invalid fractional integers rather than rounding them', async () => {
    const snapshot = await preview([{ field_name: 'Count', value: '1.5' }]);
    expect(snapshot.rows[0]).toMatchObject({ canApply: false, flags: expect.arrayContaining(['invalid_value']) });
    expect((await apply(snapshot, [{ field: 12, value: '1.5' }])).statusCode).toBe(400);
    expect(h.paperless.patches()).toHaveLength(0);
  });
  it('does not create field definitions or call a model when there are no learned patterns', async () => {
    const result = await h.inject({ method: 'POST', url: '/api/documents/1/fields/hints', headers: h.apiKeyHeaders(), payload: { content } });
    expect(result.statusCode).toBe(200); expect(result.json().rows).toEqual([]);
    expect(h.llm.chatRequests()).toHaveLength(0);
    expect(h.paperless.calls('POST', /^\/api\/custom_fields\/$/)).toHaveLength(0);
  });
  it('uses a confirmed label pattern to read the new number, never the old source value', async () => {
    h.ctx.learning.configure({ mode: 'hybrid' });
    const source = { id: 99, title: 'Earlier invoice', correspondent: 2, document_type: 3, tags: [], content: 'Invoice number: OLD-17', custom_fields: [{ field: 10, value: 'WRONG' }] };
    h.ctx.learning.observe(source);
    h.ctx.learning.observe({ ...source, custom_fields: [{ field: 10, value: 'OLD-17' }] }, 'confirmed_ui', { actor: 'user:1' });
    h.paperless.editDocument(1, { correspondent: 2, document_type: 3 });
    const result = await h.inject({ method: 'POST', url: '/api/documents/1/fields/hints', headers: h.apiKeyHeaders(), payload: { content } });
    expect(result.statusCode).toBe(200);
    expect(result.json().rows).toHaveLength(1);
    expect(result.json().rows[0]).toMatchObject({ proposedValue: 'NEW-42', normalizedValue: 'NEW-42', origin: { kind: 'learned_pattern' } });
    expect(h.paperless.patches()).toHaveLength(0);
    expect(h.llm.chatRequests()).toHaveLength(0);
  });

});
