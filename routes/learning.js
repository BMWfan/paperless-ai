'use strict';
const express = require('express');
const { openLearningStore } = require('../services/learningStore');

function createLearningRouter(options = {}) {
  const router = express.Router();
  const store = options.store || openLearningStore();
  // This router must only be mounted behind the application's authenticated session middleware.
  router.get('/pending', (req, res) => {
    try {
      res.json({ events: store.listPending(Number(req.query.limit) || 50) });
    } catch (error) {
      res.status(500).json({ error: 'Unable to load learning events' });
    }
  });
  router.post('/events/:id/review', (req, res) => {
    try {
      const decision = req.body && req.body.decision;
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0 || !['confirmed', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid event or decision' });
      }
      const updated = store.review(id, decision);
      return res.status(updated ? 200 : 404).json({ updated });
    } catch (error) {
      return res.status(500).json({ error: 'Unable to review learning event' });
    }
  });
  return router;
}

module.exports = { createLearningRouter };
