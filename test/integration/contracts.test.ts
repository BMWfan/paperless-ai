import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../helpers/appHarness.js';
import { configSchema } from '../../src/server/config/schema.js';
let h: Harness, headers: { cookie: string };
beforeEach(async () => {
  h = await createHarness(); headers = { cookie: await h.login() };
  h.paperless.addDocumentType('Contract', 10); h.paperless.addDocumentType('Invoice', 11);
  h.paperless.addCustomField('Contract ID', 'string', null, 20);
  h.paperless.addCustomField('Party', 'longtext', null, 21);
  h.paperless.addCustomField('End date', 'date', null, 22);
  h.paperless.addCustomField('Amount', 'monetary', null, 23);
});
afterEach(async () => h.close());
const get = (url = '/api/contracts') => h.inject({ method: 'GET', url, headers });
async function configure(overrides: Record<string, unknown> = {}) {
  const definitions = (await get('/api/contracts/settings')).json();
  return h.inject({ method: 'PUT', url: '/api/contracts/settings', headers, payload: { snapshotDigest: definitions.snapshotDigest,
    documentTypeIds: [10], fields: { number: 20, party: 21, end: 22 }, ...overrides } });
}
describe('Read-only native contract overview', () => {
  it('requires a session for lists and configuration; API keys cannot read or configure', async () => {
    for (const url of ['/api/contracts', '/api/contracts/settings']) {
      expect((await h.inject({ method: 'GET', url })).statusCode).toBe(401);
      expect((await h.inject({ method: 'GET', url, headers: h.apiKeyHeaders() })).statusCode).toBe(403);
    }
    expect((await h.inject({ method: 'PUT', url: '/api/contracts/settings', headers: h.apiKeyHeaders(), payload: { snapshotDigest: '0'.repeat(64), documentTypeIds: [] } })).statusCode).toBe(403);
  });
  it('defaults to no mapping and makes no native document or model request', async () => {
    h.paperless.clearRequests();
    expect((await get()).json()).toMatchObject({ configured: false, count: null, documents: [] });
    expect(h.paperless.requests).toHaveLength(0); expect(h.llm.chatRequests()).toHaveLength(0);
    expect(configSchema.parse({}).contracts.documentTypes).toEqual([]);
  });
  it('filters and pages metadata without full content or native writes, retaining config across restart', async () => {
    for (let id = 1; id <= 26; id++) h.paperless.addDocument({ id, title: `Contract ${id}`, document_type: 10,
      custom_fields: [{ field: 20, value: 'NEW-' + id }, { field: 21, value: '<img src=x onerror=alert(1)>' }, { field: 22, value: '2032-02-29' }] });
    h.paperless.addDocument({ id: 27, title: 'Not a contract', document_type: 11 });
    expect((await configure()).statusCode).toBe(200);
    const before = JSON.stringify(h.ctx.learning.summary()); h.paperless.clearRequests();
    const response = await get('/api/contracts?page=2');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: true, count: 26, page: 2, documents: [{ id: 26, fields: {
      number: { state: 'value', value: 'NEW-26' }, party: { state: 'value', value: '<img src=x onerror=alert(1)>' }, end: { state: 'value', value: '2032-02-29' }, start: { state: 'not-mapped' },
    } }] });
    const calls = h.paperless.calls('GET', '/api/documents/');
    expect(calls).toHaveLength(1); expect(calls[0].query).toMatchObject({ document_type__id__in: '10', page: '2', page_size: '25', ordering: 'id' });
    expect(calls[0].query.fields.split(',')).not.toContain('content');
    expect(h.paperless.requests.every(r => r.method === 'GET')).toBe(true);
    expect(h.llm.chatRequests()).toHaveLength(0); expect(JSON.stringify(h.ctx.learning.summary())).toBe(before);
    const { ConfigStore } = await import('../../src/server/config/store.js');
    expect(ConfigStore.load(h.dataDir, {}).current.contracts).toEqual(h.ctx.cfg.contracts);
  });
  it('keeps missing, invalid and duplicate native values explicitly unknown', async () => {
    h.paperless.addDocument({ id: 1, document_type: 10, custom_fields: [{ field: 20, value: 'A' }, { field: 20, value: 'B' }, { field: 22, value: '2031-02-30' }] });
    await configure();
    expect((await get()).json().documents[0].fields).toMatchObject({ number: { state: 'ambiguous' }, party: { state: 'missing' }, end: { state: 'invalid' } });
  });
  it('rejects stale mapping selection before saving and shows later definition changes as unknown', async () => {
    const original = (await get('/api/contracts/settings')).json();
    h.paperless.customFields.get(22)!.data_type = 'string';
    expect((await configure({ snapshotDigest: original.snapshotDigest })).statusCode).toBe(409);
    expect(h.ctx.cfg.contracts.documentTypes).toEqual([]);
    h.paperless.customFields.get(22)!.data_type = 'date'; await configure();
    h.paperless.addDocument({ id: 1, document_type: 10, custom_fields: [{ field: 22, value: '2032-02-29' }] });
    h.paperless.customFields.get(22)!.name = 'Reused field';
    expect((await get()).json().documents[0].fields.end).toMatchObject({ state: 'definition-changed', value: null });
  });
  it('rejects incompatible/duplicate roles and cross-origin configuration without altering other settings', async () => {
    const before = JSON.stringify(h.ctx.cfg);
    expect((await configure({ fields: { end: 23 } })).statusCode).toBe(400);
    expect((await configure({ fields: { number: 20, party: 20 } })).statusCode).toBe(400);
    expect((await configure({ documentTypeIds: [10, 10] })).statusCode).toBe(400);
    expect((await configure({ documentTypeIds: [999] })).statusCode).toBe(400);
    const definitions = (await get('/api/contracts/settings')).json();
    expect((await h.inject({ method: 'PUT', url: '/api/contracts/settings', headers: { ...headers, origin: 'https://other.invalid' }, payload: { snapshotDigest: definitions.snapshotDigest, documentTypeIds: [10] } })).statusCode).toBe(403);
    expect(JSON.stringify(h.ctx.cfg)).toBe(before);
  });
  it('does not reuse mappings after type/connection changes, and can disable locally while offline', async () => {
    await configure();
    h.paperless.documentTypes.get(10)!.name = 'Different scope';
    expect((await get()).json()).toMatchObject({ configured: false, count: null });
    h.ctx.config.update({ paperless: { url: 'http://unavailable.invalid' } });
    expect((await get()).json()).toMatchObject({ configured: false, count: null });
    const disabled = await h.inject({ method: 'PUT', url: '/api/contracts/settings', headers, payload: { snapshotDigest: '0'.repeat(64), documentTypeIds: [] } });
    expect(disabled.statusCode).toBe(200); expect(h.ctx.cfg.contracts.fields.end).toBeNull();
  });
  it('reports a native failure rather than displaying an empty archive', async () => {
    await configure(); h.paperless.intercept = record => record.path === '/api/documents/' ? { status: 503, body: { detail: 'synthetic unavailable' } } : undefined;
    expect((await get()).statusCode).toBe(502);
  });
  it('rejects out-of-scope native pages and configuration changes during an in-flight read', async () => {
    await configure();
    h.paperless.intercept = record => record.path === '/api/documents/' ? { status: 200, body: { count: 1, results: [{ id: 1, title: 'Outside scope', document_type: 11 }], next: null, previous: null } } : undefined;
    expect((await get()).statusCode).toBe(502);
    h.paperless.intercept = record => {
      if (record.path === '/api/documents/') h.ctx.config.update({ contracts: { documentTypes: [] } });
      return undefined;
    };
    expect((await get()).statusCode).toBe(409);
  });
});
