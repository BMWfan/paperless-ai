const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openLearningStore } = require('../services/learningStore');

test('snapshot changes create review events', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-'));
  const store = openLearningStore(path.join(dir, 'store.db'));
  try {
    assert.equal(store.observe({ id: 7, title: 'Old', tags: [1] }).baselineCreated, true);
    assert.equal(store.listPending().length, 0);
    assert.equal(store.observe({ id: 7, title: 'New', tags: [1] }).pendingReview, true);
    const events = store.listPending();
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].changes.title, { before: 'Old', after: 'New' });
    assert.equal(store.review(events[0].id, 'confirmed'), true);
    assert.equal(store.listPending().length, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('self writes are not corrections', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-'));
  const store = openLearningStore(path.join(dir, 'store.db'));
  try {
    store.observe({ id: 8, title: 'Old' });
    store.observe({ id: 8, title: 'AI result' }, 'self_write');
    assert.equal(store.listPending().length, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
