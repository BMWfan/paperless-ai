import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../helpers/appHarness.js';
let h: Harness;
beforeEach(async () => {
  h = await createHarness();
  h.paperless.addCustomField('Count', 'integer', null, 10);
  h.paperless.addCustomField('Date', 'date', null, 11);
  h.paperless.addCustomField('Flag', 'boolean', null, 12);
  h.paperless.addCustomField('Keep', 'string', null, 13);
  h.paperless.addCustomField('Unsupported', 'documentlink', null, 14);
  h.paperless.addDocument({ id: 88, title: 'Synthetic', content: '', custom_fields: [
    { field: 10, value: 0 }, { field: 11, value: '2032-02-29' }, { field: 12, value: false },
    { field: 13, value: 'untouched' }, { field: 14, value: [9] },
  ] });
});
afterEach(async () => h.close());
async function current() {
  const result = await h.inject({ method: 'POST', url: '/api/documents/88/fields/current', headers: h.apiKeyHeaders(), payload: { content: '' } });
  expect(result.statusCode).toBe(200); return result.json();
}
async function clear(snapshot: { snapshotDigest: string; reviewFieldIds: number[] }, fields: number[]) {
  return h.inject({ method: 'POST', url: '/api/documents/88/fields/clear', headers: h.apiKeyHeaders(), payload: { snapshotDigest: snapshot.snapshotDigest, reviewFieldIds: snapshot.reviewFieldIds, fields } });
}
describe('Explicit reviewed field clearing', () => {
  it('can inspect existing values without OCR or a model and preserves zero/false', async () => {
    const snapshot = await current();
    expect(snapshot.rows.find((row: { fieldId: number }) => row.fieldId === 10).currentValue).toBe(0);
    expect(snapshot.rows.find((row: { fieldId: number }) => row.fieldId === 12).currentValue).toBe(false);
    expect(h.paperless.patches()).toHaveLength(0); expect(h.llm.chatRequests()).toHaveLength(0);
  });
  it('clears only selected native values and keeps unsupported/unselected fields intact', async () => {
    const snapshot = await current();
    expect((await clear(snapshot, [10, 11, 12])).statusCode).toBe(200);
    expect((await h.ctx.paperless().getDocument(88)).custom_fields).toEqual(expect.arrayContaining([
      { field: 10, value: null }, { field: 11, value: null }, { field: 12, value: null },
      { field: 13, value: 'untouched' }, { field: 14, value: [9] },
    ]));
    expect(h.ctx.learning.examples()).toHaveLength(0); // An API key is not human provenance.
    expect(h.llm.chatRequests()).toHaveLength(0);
  });
  it('rejects a stale snapshot before clearing anything', async () => {
    const snapshot = await current(); h.paperless.editDocument(88, { title: 'External edit' });
    expect((await clear(snapshot, [10])).statusCode).toBe(409);
    expect(h.paperless.patches()).toHaveLength(0);
  });
  it('rejects out-of-review or unsupported selections atomically', async () => {
    const snapshot = await current();
    expect((await clear(snapshot, [999])).statusCode).toBe(400);
    expect((await clear(snapshot, [10, 14])).statusCode).toBe(400);
    expect(h.paperless.patches()).toHaveLength(0);
  });
  it('does not interpret null AI/review values as permission to clear', async () => {
    const snapshot = await current();
    const result = await h.inject({ method: 'POST', url: '/api/documents/88/fields/apply', headers: h.apiKeyHeaders(), payload: {
      snapshotDigest: snapshot.snapshotDigest, reviewFieldIds: snapshot.reviewFieldIds, fields: [{ field: 10, value: null }],
    } });
    expect(result.statusCode).toBe(400); expect(h.paperless.patches()).toHaveLength(0);
  });
});
