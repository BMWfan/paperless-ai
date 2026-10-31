'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const generate = require('./generate');
require('dotenv').config({ path: 'data/.env' });
const { openLearningStore } = require('../../services/learningStore');
const base = process.env.PAPERLESS_API_URL;
assert.equal(base, 'http://paperless:8000/api', 'E2E must only use the isolated service');
const headers = { Authorization: `Token ${process.env.PAPERLESS_API_TOKEN}` };
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
test('real Paperless ingestion, direct correction, persistent detection and review', { timeout: 180000 }, async () => {
  const fixture = generate(Date.now());
  const form = new FormData();
  form.set('document', new Blob([fixture.content], { type: 'text/plain' }), fixture.name);
  form.set('title', fixture.expected.title);
  await api('/documents/post_document/', { method: 'POST', body: form });
  let document;
  for (let attempt = 0; attempt < 90; attempt++) {
    const page = await api('/documents/?ordering=-id');
    document = page.results.find(row => row.original_file_name === fixture.name);
    if (document) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(document, 'synthetic document consumed');
  const provider = require('../../services/aiServiceFactory').getService();
  const result = await provider.analyzeDocument(document.content, [], [], [], document.id);
  assert.equal(result.error, undefined, 'classification should succeed');
  assert.equal(result.document.title, fixture.expected.title);
  assert.deepEqual(result.document.tags, fixture.expected.tags);
  const tag = await api('/tags/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `synthetic-${document.id}` }) });
  document = await api(`/documents/${document.id}/`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: result.document.title, tags: [tag.id] }) });
  assert.deepEqual((await api(`/documents/${document.id}/`)).tags, [tag.id]);
  const dbPath = `/tmp/e2e-${document.id}.db`;
  let store = openLearningStore(dbPath);
  assert.ok(store.observe(document).baselineCreated);
  const corrected = await api(`/documents/${document.id}/`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Confirmed synthetic correction' }) });
  store.close();
  store = openLearningStore(dbPath);
  try {
    assert.ok(store.observe(corrected).pendingReview);
    const [event] = store.listPending();
    assert.equal(event.changes.title.after, 'Confirmed synthetic correction');
    assert.ok(store.review(event.id, 'confirmed'));
    assert.equal(store.observe(corrected).pendingReview, false);
    assert.equal(store.listPending().length, 0);
  } finally { store.close(); }
  const health = await fetch('http://ai:3000/health');
  assert.equal(health.status, 200);
});
