'use strict';
const engine = require('./learningEngine');
function createLearningMonitor(paperlessService, options = {}) {
  const store = options.store || engine.store;
  let timer;
  let running = false;
  let stopped = true;
  let generation = 0;
  let lastScan = null;
  let lastError = null;
  let lastFinished = null;
  async function scan() {
    if (running) return { skipped: true };
    running = true;
    try {
      const revisions = store.snapshotRevisions();
      // getDocuments follows Paperless pagination; never starve later pages by slicing.
      const documents = await (paperlessService.getLearningDocuments ? paperlessService.getLearningDocuments() : paperlessService.getDocuments());
      if (!Array.isArray(documents)) throw new TypeError('Paperless API did not return a document array');
      let scanned = 0, pending = 0;
      for (let doc of documents) {
        if (!doc || !doc.id || engine.inFlight.has(Number(doc.id))) continue;
        if (doc.content === undefined && store.needsContent(doc) && paperlessService.getDocumentContent) {
          doc = paperlessService.getDocument ? await paperlessService.getDocument(doc.id) :
            { ...doc, content: await paperlessService.getDocumentContent(doc.id) };
        }
        if (engine.inFlight.has(Number(doc.id))) continue;
        const result = store.observe(doc, 'unknown', { stabilizationMs: store.settings().stabilizationMs,
          expectedRevision: revisions.get(Number(doc.id)) || 0 });
        if (result.skipped) continue;
        scanned++;
        if (result.pendingReview) pending++;
      }
      lastScan = { scanned, pending };
      lastError = null;
      return lastScan;
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally { running = false; lastFinished = new Date().toISOString(); }
  }
  async function tick(version) {
    if (stopped || version !== generation) return;
    const settings = store.settings();
    try {
      if (settings.enabled && settings.mode !== 'disabled') await scan();
    } catch (error) { console.warn('[LEARNING] Scan failed:', error.message); }
    if (!stopped && version === generation) {
      timer = setTimeout(() => tick(version), Math.max(1000, Number(options.intervalMs) || store.settings().intervalMs));
      timer.unref?.();
    }
  }
  function start() { if (!stopped) return; stopped = false; void tick(++generation); }
  function stop() { stopped = true; generation++; clearTimeout(timer); }
  function reschedule() { if (!stopped) { clearTimeout(timer); void tick(++generation); } }
  return { scan, start, stop, reschedule, store,
    status: () => ({ running, lastScan, lastError, lastFinished }) };
}
module.exports = { createLearningMonitor };
