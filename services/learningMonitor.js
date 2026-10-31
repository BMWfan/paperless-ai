'use strict';

const { openLearningStore } = require('./learningStore');

/**
 * Polling service. Disabled by default until explicitly enabled by operator.
 * Changes observed via the Paperless API are never automatically trusted as user edits.
 */
function createLearningMonitor(paperlessService, options = {}) {
  const store = options.store || openLearningStore();
  const intervalMs = Math.max(60000, Number(options.intervalMs) || 900000);
  const maxDocuments = Math.max(1, Math.min(500, Number(options.maxDocuments) || 100));
  let timer;
  let running = false;

  async function scan() {
    if (running) return { skipped: true };
    running = true;
    try {
      const documents = await paperlessService.getDocuments();
      if (!Array.isArray(documents)) throw new TypeError('Paperless API did not return a document array');
      let scanned = 0;
      let pending = 0;
      for (const doc of documents.slice(0, maxDocuments)) {
        if (!doc || !doc.id) continue;
        const result = store.observe(doc);
        scanned++;
        if (result.pendingReview) pending++;
      }
      return { scanned, pending };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      scan().catch(error => console.warn('[LEARNING] Scan failed:', error.message));
    }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { scan, start, stop, store };
}

module.exports = { createLearningMonitor };
