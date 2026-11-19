import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analysisJson, createHarness, type Harness } from '../helpers/appHarness.js';
let h: Harness;
beforeEach(async () => {
  h = await createHarness({ config: { processing: { customFields: [
    { name: 'Count', type: 'integer', description: '' },
    { name: 'Amount', type: 'monetary', currency: 'EUR', description: '' },
  ] } } });
  h.paperless.addCustomField('Count', 'integer', null, 10);
  h.paperless.addCustomField('Amount', 'monetary', { default_currency: 'EUR' }, 11);
  h.paperless.addCustomField('Keep', 'string', null, 12);
  h.paperless.addDocument({ id: 77, title: 'Before', content: 'Synthetic invoice; count unverified. Amount CHF 12.50.', custom_fields: [{ field: 10, value: 4 }, { field: 12, value: 'untouched' }] });
});
afterEach(async () => h.close());
describe('Conservative ordinary field writes', () => {
  it('automatic processing keeps fractional counters unchanged and preserves stated currency', async () => {
    h.llm.reply(analysisJson({ title: 'Invoice', custom_fields: [{ field_name: 'Count', value: '1.5' }, { field_name: 'Amount', value: 'CHF12.50' }] }));
    await h.inject({ method: 'POST', url: '/api/processing/documents', headers: h.apiKeyHeaders(), payload: { ids: [77] } });
    await h.engine.drain(10000);
    expect((await h.ctx.paperless().getDocument(77)).custom_fields).toEqual(expect.arrayContaining([
      { field: 10, value: 4 }, { field: 11, value: 'CHF12.50' }, { field: 12, value: 'untouched' },
    ]));
  });
  it('ordinary manual writes reject fractional integers and conflicting proposals without changing values', async () => {
    for (const customFields of [
      [{ field_name: 'Count', value: '1.5' }],
      [{ field_name: 'Count', value: '8' }, { field_name: 'count', value: '9' }],
    ]) {
      const result = await h.inject({ method: 'POST', url: '/api/documents/77/apply', headers: h.apiKeyHeaders(), payload: { customFields } });
      expect(result.statusCode).toBe(200); expect(result.json().changed).not.toContain('custom_fields');
      expect((await h.ctx.paperless().getDocument(77)).custom_fields).toContainEqual({ field: 10, value: 4 });
    }
  });
  it('does not select the first definition when field names are ambiguous', async () => {
    h.paperless.addCustomField('Ambiguous', 'string', null, 20);
    h.paperless.addCustomField('ambiguous', 'string', null, 21);
    const result = await h.inject({ method: 'POST', url: '/api/documents/77/apply', headers: h.apiKeyHeaders(), payload: { customFields: [{ field_name: 'Ambiguous', value: 'Wrong destination' }] } });
    expect(result.statusCode).toBe(200); expect(result.json().changed).not.toContain('custom_fields');
    expect(result.json().notes).toContain('Custom field "Ambiguous" is ambiguous; no value was written');
  });
  it('uses fresh native definitions when a field type changed outside the app', async () => {
    await h.ctx.metadata().snapshot();
    h.paperless.customFields.get(10)!.data_type = 'string';
    const result = await h.inject({ method: 'POST', url: '/api/documents/77/apply', headers: h.apiKeyHeaders(), payload: { customFields: [{ field_name: 'Count', value: '0015' }] } });
    expect(result.statusCode).toBe(200);
    expect((await h.ctx.paperless().getDocument(77)).custom_fields).toContainEqual({ field: 10, value: '0015' });
  });

});
