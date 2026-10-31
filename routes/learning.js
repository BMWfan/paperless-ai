'use strict';
const express = require('express');
function createLearningRouter(options = {}) {
  const router = express.Router();
  router.use((req,res,next) => {
    if (req.method === 'POST') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
      const origin = req.get('origin');
      if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin changes forbidden' });
    }
    next();
  });
  const store = options.store || require('../services/learningEngine').store;
  router.get('/pending', (req,res) => res.json({ events: store.listPending(req.query.limit) }));
  router.get('/events', (req,res) => res.json({ events: store.list(req.query.status,req.query.q,req.query.limit) }));
  router.get('/examples', (req,res) => res.json({ examples: store.examples() }));
  router.get('/settings', (req,res) => res.json(store.settings()));
  router.post('/settings', (req,res) => {
    try { res.json(store.configure(req.body)); } catch(error) { res.status(400).json({ error: error.message }); }
  });
  router.post('/scan', async (req,res) => {
    try { res.json(await options.monitor.scan()); } catch(error) { res.status(503).json({ error: error.message }); }
  });
  router.post('/events/:id/review', (req,res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid event' });
    try {
      const updated = store.review(id,req.body.decision);
      res.status(updated ? 200 : 404).json({ updated });
    } catch(error) { res.status(409).json({ error: error.message }); }
  });
  return router;
}
module.exports = { createLearningRouter };
