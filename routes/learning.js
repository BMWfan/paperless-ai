'use strict';
const express = require('express');
const actorFor = req => req.user?.apiKey ? 'api-key' : `user:${req.user?.id || req.user?.sub || 'session'}`;
function sameOriginJSON(req,res,next) {
  if (req.method !== 'POST') return next();
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
  const origin = req.get('origin');
  try {
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin changes forbidden' });
  } catch { return res.status(400).json({ error: 'Invalid Origin' }); }
  next();
}
function createLearningRouter(options = {}) {
  const router = express.Router();
  router.use(sameOriginJSON);
  const store = options.store || require('../services/learningEngine').store;
  const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;
  router.get('/pending', (req,res) => res.json({ events: store.listPending(req.query.limit) }));
  router.get('/events', (req,res) => {
    if (!['','pending','confirmed','rejected','deleted'].includes(req.query.status || '')) return res.status(400).json({ error: 'Invalid status' });
    res.json(store.page(req.query.status,req.query.q,req.query.limit,req.query.offset));
  });
  router.get('/examples', (req,res) => res.json({ examples: store.examples(true), legacy: store.legacyExamples() }));
  router.get('/summary', (req,res) => res.json({ ...store.summary(), monitor: options.monitor?.status?.() }));
  router.get('/history', (req,res) => {
    if (req.query.documentId && !validId(req.query.documentId)) return res.status(400).json({ error: 'Invalid document' });
    res.json({ history: store.history(req.query.documentId,req.query.limit,req.query.offset) });
  });
  router.get('/vocabulary', async (req,res) => {
    try {
      const vocabulary = await (options.paperless || require('../services/paperlessService')).getLearningVocabulary();
      res.json(Object.fromEntries(Object.entries(vocabulary).map(([key,value]) => [key,Object.fromEntries(value)])));
    } catch { res.status(503).json({ error: 'Paperless metadata names are temporarily unavailable' }); }
  });
  router.get('/settings', (req,res) => res.json(store.settings()));
  router.post('/settings', (req,res) => {
    try {
      const settings = store.configure(req.body);
      options.monitor?.reschedule?.();
      res.json(settings);
    } catch(error) { res.status(400).json({ error: error.message }); }
  });
  router.post('/scan', async (req,res) => {
    if (store.settings().mode === 'disabled') return res.status(409).json({ error: 'Enable a learning mode before scanning' });
    try { res.json(await options.monitor.scan()); } catch(error) { res.status(503).json({ error: error.message }); }
  });
  router.post('/events/:id/review', async (req,res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid event' });
    if (req.body?.decision === 'confirmed') {
      const event = store.event(Number(req.params.id));
      if (!event) return res.status(404).json({ error: 'Event not found' });
      if (event.status !== 'pending') return res.status(404).json({ error: 'Event is no longer pending' });
      try {
        const document = await (options.paperless || require('../services/paperlessService')).getDocument(event.document_id);
        store.observe(document,'unknown');
      } catch { return res.status(503).json({ error: 'Cannot verify current Paperless metadata; retry when connected' }); }
    }
    try {
      const updated = store.review(Number(req.params.id),req.body?.decision,actorFor(req));
      res.status(updated ? 200 : 404).json({ updated });
    } catch(error) { res.status(409).json({ error: error.message }); }
  });
  router.post('/legacy/:id/revoke', (req,res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid document' });
    const updated = store.revokeLegacy(Number(req.params.id),actorFor(req));
    res.status(updated ? 200 : 404).json({ updated });
  });
  return router;
}
module.exports = { createLearningRouter, sameOriginJSON, actorFor };
