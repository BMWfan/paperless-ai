'use strict';
const engine = require('./learningEngine');
function createLearningMonitor(paperlessService, options = {}) {
  const store = options.store || engine.store;
  let timer;
  let running = false;
  let stopped = true;
  async function scan() {
    if (running) return { skipped: true };
    running = true;
    try {
      // getDocuments follows Paperless pagination; never starve later pages by slicing.
      const documents = await (paperlessService.getLearningDocuments ? paperlessService.getLearningDocuments() : paperlessService.getDocuments());
      if (!Array.isArray(documents)) throw new TypeError('Paperless API did not return a document array');
      let scanned = 0, pending = 0;
      for (const doc of documents) {
        if (!doc || !doc.id || engine.inFlight.has(Number(doc.id))) continue;
        const result = store.observe(doc, 'unknown', { stabilizationMs: store.settings().stabilizationMs });
        scanned++;
        if (result.pendingReview) pending++;
      }
      return { scanned, pending };
    } finally { running = false; }
  }
  async function tick() {
    const settings = store.settings();
    try {
      if ((settings.enabled || process.env.LEARNING_MONITOR_ENABLED === 'true') && settings.mode !== 'disabled') await scan();
    } catch (error) { console.warn('[LEARNING] Scan failed:', error.message); }
    if (!stopped) {
      timer = setTimeout(tick, Math.max(1000, Number(options.intervalMs) || settings.intervalMs));
      timer.unref?.();
    }
  }
  function start() { if (!stopped) return; stopped = false; void tick(); }
  function stop() { stopped = true; clearTimeout(timer); }
  return { scan, start, stop, store };
}
module.exports = { createLearningMonitor };
