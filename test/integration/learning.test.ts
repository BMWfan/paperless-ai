import { applyPlannedUpdate } from '../../src/server/processing/applier.js';
import { seedLegacyLearning } from '../helpers/legacyLearning.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, type Harness } from '../helpers/appHarness.js';
let h: Harness;
beforeEach(async () => { h = await createHarness(); h.paperless.addDocument({ id: 1, title: 'Before', content: 'Synthetic invoice' }); });
afterEach(async () => h.close());
const doc = (title: string) => ({ id: 1, title, content: 'Synthetic invoice', tags: [], correspondent: null, document_type: null, custom_fields: [] });
describe('Learning v2 management API', () => {
  it('requires authentication and validates settings', async () => {
    expect((await h.inject({ method: 'GET', url: '/api/learning/summary' })).statusCode).toBe(401);
    expect((await h.inject({ method: 'POST', url: '/api/learning/settings', headers: h.apiKeyHeaders(), payload: { intervalMs: 1 } })).statusCode).toBe(400);
    expect((await h.inject({ method: 'POST', url: '/api/learning/settings', headers: { ...h.apiKeyHeaders(), origin: 'https://other.invalid' }, payload: { enabled: true } })).statusCode).toBe(403);
  });
  it('confirms only a current correction and exposes its review history', async () => {
    h.ctx.learning.observe(doc('Initial'));
    const { eventId } = h.ctx.learning.observe(doc('Before'), 'unknown');
    const res = await h.inject({ method: 'POST', url: `/api/learning/events/${eventId}/review`, headers: h.apiKeyHeaders(), payload: { decision: 'confirmed' } });
    expect(res.statusCode).toBe(200);
    expect(h.ctx.learning.examples()).toHaveLength(1);
    const history = await h.inject({ method: 'GET', url: '/api/learning/history?documentId=1', headers: h.apiKeyHeaders() });
    expect(history.statusCode).toBe(200);
    expect(history.json().history.length).toBeGreaterThan(0);
  });
  it('refuses stale confirmation after external metadata changed', async () => {
    h.ctx.learning.observe(doc('Initial'));
    const { eventId } = h.ctx.learning.observe(doc('Unverified change'), 'unknown');
    const res = await h.inject({ method: 'POST', url: `/api/learning/events/${eventId}/review`, headers: h.apiKeyHeaders(), payload: { decision: 'confirmed' } });
    expect(res.statusCode).toBe(409);
    expect(h.ctx.learning.examples()).toHaveLength(0);
  });
  it('skips automatic inference for a confirmed correction', async () => {
    h.ctx.learning.configure({ mode: 'hybrid' });
    h.ctx.learning.observe(doc('Initial'));
    h.ctx.learning.observe(doc('Before'), 'confirmed_ui', { actor: 'user:1' });
    const outcome = await h.engine.run({ documentId: 1, source: 'manual', force: true });
    expect(outcome).toBe('skipped');
    expect(h.llm.chatRequests()).toHaveLength(0);
    expect(h.paperless.patches()).toHaveLength(0);
  });

  it('does not automatically trust workflow changes returned with an authenticated UI save', async () => {
    const client = h.ctx.paperless(), original = client.updateDocument.bind(client);
    const spy = vi.spyOn(client, 'updateDocument').mockImplementation(async (id, patch) => {
      await original(id, patch);
      h.paperless.editDocument(id, { tags: [99] });
      return client.getDocument(id);
    });
    const cookie = await h.login();
    const result = await h.inject({ method: 'POST', url: '/api/documents/1/apply', headers: { cookie }, payload: { title: 'Chosen title' } });
    expect(result.statusCode).toBe(200);
    expect(h.ctx.learning.examples()).toHaveLength(0);
    expect(h.ctx.learning.list('pending')).toMatchObject([{ source: 'unknown', metadata: { title: 'Chosen title', tags: [99] } }]);
    spy.mockRestore();
  });
  it('still accepts an exact authenticated UI change in hybrid mode', async () => {
    const cookie = await h.login();
    const result = await h.inject({ method: 'POST', url: '/api/documents/1/apply', headers: { cookie }, payload: { title: 'Chosen title' } });
    expect(result.statusCode).toBe(200);
    expect(h.ctx.learning.examples()).toMatchObject([{ metadata: { title: 'Chosen title' } }]);
    expect(h.ctx.learning.list('confirmed')).toMatchObject([{ source: 'confirmed_ui' }]);
  });
  it('does not hide unrequested changes returned with an automatic write as self-writes', async () => {
    const client = h.ctx.paperless(), original = client.updateDocument.bind(client);
    const spy = vi.spyOn(client, 'updateDocument').mockImplementation(async (id, patch) => {
      await original(id, patch);
      h.paperless.editDocument(id, { title: 'Workflow changed title' });
      return client.getDocument(id);
    });
    const before = await client.getDocument(1);
    await applyPlannedUpdate(h.ctx, before, { patch: { title: 'AI title' }, display: { title: 'AI title', tags: [], correspondent: null, documentType: null }, notes: [] }, { source: 'api' });
    expect(h.ctx.learning.examples()).toHaveLength(0);
    expect(h.ctx.learning.list('pending')).toMatchObject([{ source: 'unknown', metadata: { title: 'Workflow changed title' } }]);
    spy.mockRestore();
  });

  it('rejects a plan when OCR text changed while metadata stayed the same', async () => {
    const before = await h.ctx.paperless().getDocument(1);
    h.paperless.editDocument(1, { content: 'Different current synthetic contract' });
    await expect(applyPlannedUpdate(h.ctx, before, { patch: { title: 'Stale AI title' }, display: { title: 'Stale AI title', tags: [], correspondent: null, documentType: null }, notes: [] }, { source: 'api' })).rejects.toMatchObject({ statusCode: 409 });
    expect(h.paperless.patches()).toHaveLength(0);
  });

  it('preserves a correction confirmed after an automatic plan was prepared', async () => {
    const before = await h.ctx.paperless().getDocument(1);
    const analysis = { suggestion: { title: 'AI title', tags: [], correspondent: null, document_type: null, document_date: null, language: null, custom_fields: [] }, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, model: 'synthetic', provider: 'fixture', durationMs: 0, truncated: false };
    const plan = { patch: { title: 'AI title' }, display: { title: 'AI title', tags: [], correspondent: null, documentType: null }, notes: [] };
    h.ctx.learning.observe(doc('Initial'));
    h.ctx.learning.observe(doc('Before'), 'confirmed_ui', { actor: 'user:1' });
    await expect(applyPlannedUpdate(h.ctx, before, plan, { source: 'api', analysis })).rejects.toMatchObject({ statusCode: 409 });
    expect(h.paperless.patches()).toHaveLength(0);
    expect(h.ctx.learning.examples()).toMatchObject([{ metadata: { title: 'Before' } }]);
  });

  it('pages imported corrections and keeps an auditable revocation outside v2 event filters', async () => {
    seedLegacyLearning(h.ctx.db, 500); seedLegacyLearning(h.ctx.db, 501, 'Second imported correction');
    expect((await h.inject({ method: 'GET', url: '/api/learning/legacy' })).statusCode).toBe(401);
    const page = await h.inject({ method: 'GET', url: '/api/learning/legacy?limit=1&offset=1', headers: h.apiKeyHeaders() });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ total: 2, hasMore: false, examples: [{ document_id: 500 }] });
    const revoke = await h.inject({ method: 'POST', url: '/api/learning/legacy/500/revoke', headers: h.apiKeyHeaders(), payload: {} });
    expect(revoke.statusCode).toBe(200); expect(h.ctx.learning.hasLegacyExample(500)).toBe(false);
    expect(h.ctx.learning.hasLegacyExample(501)).toBe(true);
    const history = await h.inject({ method: 'GET', url: '/api/learning/history?limit=1', headers: h.apiKeyHeaders() });
    expect(history.json()).toMatchObject({ hasMore: false, history: [{ document_id: 500, decision: 'revoked', actor: 'api-key' }] });
  });

});
