import { expect, it } from 'vitest';
import { createHarness } from '../helpers/appHarness.js';

it('requires a session and uses the same inventory filter for counts and pages', async () => {
  const h = await createHarness();
  try {
    for (let id = 1; id <= 26; id++) h.paperless.addDocument({ id, title: `Document ${id}` });
    h.paperless.addDocument({ id: 27, tags: [1], correspondent: 1, document_type: 1 });
    const request = (url: string, headers?: Record<string, string>) => h.inject({ method: 'GET', url, headers });
    expect((await request('/api/inventory')).statusCode).toBe(401);
    expect((await request('/api/inventory/documents?category=tags', h.apiKeyHeaders())).statusCode).toBe(403);
    const headers = { cookie: await h.login() };
    expect((await request('/api/inventory', headers)).json()).toEqual({
      total: 27, tags: 26, correspondent: 26, documentType: 26,
    });
    expect((await request('/api/inventory/documents?category=unknown', headers)).statusCode).toBe(400);
    const list = await request('/api/inventory/documents?category=tags&page=2', headers);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({
      count: 26,
      documents: [{ id: 26, title: 'Document 26', url: h.ctx.documentLink(26) }],
    });
  } finally {
    await h.close();
  }
});
