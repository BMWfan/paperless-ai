/** Fork-owned Learning v2 management; Paperless remains the metadata authority. */
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../http/app.js';
import { HttpProblem } from '../http/helpers.js';
import { learningStatus, scanLearning, startLearningMonitor } from '../learning/runtime.js';

const id = z.object({ id: z.coerce.number().int().positive() });
const pagination = { limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) };
export const learningRoutes = ({ ctx }: Services): FastifyPluginAsync => async fastify => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', async req => {
    if (req.method !== 'POST') return;
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpProblem(403, 'Cross-origin changes forbidden');
    if (req.headers.origin) {
      let host: string;
      try { host = new URL(req.headers.origin).host; } catch { throw new HttpProblem(400, 'Invalid Origin'); }
      if (host !== req.headers.host) throw new HttpProblem(403, 'Cross-origin changes forbidden');
    }
  });
  app.get('/api/learning/events', { schema: { querystring: z.object({ ...pagination, status: z.enum(['', 'pending', 'confirmed', 'rejected', 'deleted']).default(''), q: z.string().max(500).default('') }) } }, async req =>
    ctx.learning.page(req.query.status, req.query.q, req.query.limit, req.query.offset));
  app.get('/api/learning/legacy', { schema: { querystring: z.object(pagination) } }, async req => ctx.learning.legacyPage(req.query.limit, req.query.offset));
  app.get('/api/learning/examples', async () => ({ examples: ctx.learning.examples(true), legacy: ctx.learning.legacyExamples() }));
  app.get('/api/learning/summary', async () => ({ ...ctx.learning.summary(), monitor: learningStatus(ctx) }));
  app.get('/api/learning/history', { schema: { querystring: z.object({ ...pagination, documentId: z.coerce.number().int().positive().optional() }) } }, async req =>
    { const rows = ctx.learning.history(req.query.documentId, req.query.limit + 1, req.query.offset); return { history: rows.slice(0, req.query.limit), hasMore: rows.length > req.query.limit }; });
  app.get('/api/learning/settings', async () => ctx.learning.settings());
  app.post('/api/learning/settings', { schema: { body: z.object({
    mode: z.enum(['manual', 'automatic', 'hybrid', 'disabled']).optional(), enabled: z.boolean().optional(),
    intervalMs: z.number().int().min(1000).max(86400000).optional(), stabilizationMs: z.number().int().min(0).max(3600000).optional(),
  }).strict() } }, async req => { const settings = ctx.learning.configure(req.body); startLearningMonitor(ctx); return settings; });
  app.post('/api/learning/scan', async () => {
    if (ctx.learning.settings().mode === 'disabled') throw new HttpProblem(409, 'Enable a learning mode before scanning');
    return scanLearning(ctx);
  });
  app.post('/api/learning/events/:id/review', { schema: { params: id, body: z.object({ decision: z.enum(['confirmed', 'rejected', 'deleted']) }).strict() } }, async req => {
    if (req.body.decision === 'confirmed') {
      const event = ctx.learning.event(req.params.id);
      if (!event || event.status !== 'pending') throw new HttpProblem(404, 'Pending event not found');
      if (ctx.learningWrites.has(event.document_id)) throw new HttpProblem(409, 'Document update in progress; retry review');
      const expectedRevision = ctx.learning.snapshotRevision(event.document_id);
      const document = await ctx.paperless().getDocument(event.document_id);
      if (ctx.learningWrites.has(event.document_id) || ctx.learning.observe(document, 'unknown', { expectedRevision }).skipped)
        throw new HttpProblem(409, 'Document changed during review; refresh and retry');
    }
    const actor = req.principal?.kind === 'user' ? `user:${req.principal.userId}` : 'api-key';
    try {
      const updated = ctx.learning.review(req.params.id, req.body.decision, actor);
      if (!updated) throw new HttpProblem(404, 'Event not found');
      return { updated };
    } catch (error) { if (error instanceof HttpProblem) throw error; throw new HttpProblem(409, 'Review is stale; refresh and retry'); }
  });
  app.post('/api/learning/legacy/:id/revoke', { schema: { params: id } }, async req => {
    const actor = req.principal?.kind === 'user' ? `user:${req.principal.userId}` : 'api-key';
    const updated = ctx.learning.revokeLegacy(req.params.id, actor);
    if (!updated) throw new HttpProblem(404, 'Legacy example not found');
    return { updated };
  });
};
