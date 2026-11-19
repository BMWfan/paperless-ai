import { seedLegacyLearning } from '../helpers/legacyLearning.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
