// Runs only inside the disposable app image; no production endpoint is configurable.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Database from '/app/node_modules/better-sqlite3/lib/index.js';
import { AppContext } from '/app/dist/server/context.js';
import { hashPassword } from '/app/dist/server/auth.js';
const file = '/fixtures/runtime.json';
const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
if (previous) assert.equal(previous.scope, 'paperless-ai-v4-e2e');
const response = await fetch('http://paperless:8000/api/token/', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'isolated-test-only' }), signal: AbortSignal.timeout(20000),
});
assert.equal(response.status, 200, 'Isolated test token initialization failed');
const { token } = await response.json();
assert.equal(typeof token, 'string'); assert.ok(token);
const digest = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
let legacyDocumentId = previous?.legacyDocumentId;
let legacyDatabaseDigest = previous?.legacyDatabaseDigest;
let legacyEnvDigest = previous?.legacyEnvDigest;
const seededLegacy = !fs.existsSync('/app/data/paperless-ai.db') && !fs.existsSync('/app/data/documents.db');
if (seededLegacy) {
  const headers = { Authorization: `Token ${token}` };
  const form = new FormData();
  form.set('document', new Blob(['SYNTHETIC LEGACY LEARNING MIGRATION ONLY'], { type: 'text/plain' }), 'synthetic-v4-legacy-seed.txt');
  const upload = await fetch('http://paperless:8000/api/documents/post_document/', { method: 'POST', headers, body: form, signal: AbortSignal.timeout(20000) });
  assert.equal(upload.status, 200);
  for (let attempt = 0; attempt < 180; attempt++) {
    const list = await fetch('http://paperless:8000/api/documents/?ordering=-id&page_size=100', { headers, signal: AbortSignal.timeout(20000) });
    assert.equal(list.status, 200);
    legacyDocumentId = (await list.json()).results.find(row => row.original_file_name === 'synthetic-v4-legacy-seed.txt')?.id;
    if (legacyDocumentId) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(legacyDocumentId, 'synthetic legacy document was not ingested');
  const title = 'Confirmed imported legacy correction';
  const update = await fetch(`http://paperless:8000/api/documents/${legacyDocumentId}/`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }), signal: AbortSignal.timeout(20000) });
  assert.equal(update.status, 200);
  // Actual pre-v4 schemas from models/document.js at 363c0c6; no old application is run here.
  const legacy = new Database('/app/data/documents.db');
  try {
    legacy.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE learning_feedback(id INTEGER PRIMARY KEY,document_id INTEGER,title TEXT,content_preview TEXT,tags TEXT,correspondent TEXT,document_type TEXT,corrected_by_user INTEGER DEFAULT 0,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE learning_feedback_archive(id INTEGER PRIMARY KEY,original_id INTEGER NOT NULL,document_id INTEGER NOT NULL,payload_json TEXT NOT NULL,archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
    legacy.prepare('INSERT INTO users(username,password) VALUES(?,?)').run('fixture-user', await hashPassword('isolated-v4-password'));
    legacy.prepare('INSERT INTO learning_feedback(document_id,title,tags,corrected_by_user) VALUES(?,?,?,1)').run(legacyDocumentId, title, '["synthetic-v4"]');
    legacy.prepare('INSERT INTO learning_feedback(document_id,title,corrected_by_user) VALUES(?,?,0)').run(legacyDocumentId, 'Newer unconfirmed legacy prediction');
    legacy.prepare('INSERT INTO learning_feedback_archive(original_id,document_id,payload_json) VALUES(?,?,?)').run(99, legacyDocumentId, JSON.stringify({ title: 'Older archived prediction', corrected_by_user: 0 }));
  } finally { legacy.close(); }
  fs.writeFileSync('/app/data/.env', `PAPERLESS_API_URL=http://paperless:8000/api\nPAPERLESS_API_TOKEN=${token}\nAI_PROVIDER=ollama\nOLLAMA_API_URL=http://mock-ai:11434\nOLLAMA_MODEL=fixture-native\nDISABLE_AUTOMATIC_PROCESSING=yes\n`, { mode: 0o600 });
  legacyDatabaseDigest = digest('/app/data/documents.db'); legacyEnvDigest = digest('/app/data/.env');
}
const ctx = new AppContext({ dataDir: '/app/data', env: {} });
try {
  if (legacyDocumentId) {
    assert.ok(ctx.repos.users.byUsername('fixture-user'), 'legacy user was not imported');
    if (seededLegacy) assert.ok(ctx.learning.hasLegacyExample(legacyDocumentId), 'confirmed legacy correction was not imported');
    assert.equal(ctx.cfg.processing.automatic, false, 'legacy automatic-processing setting was not preserved');
    assert.equal(digest('/app/data/documents.db'), legacyDatabaseDigest);
    assert.equal(digest('/app/data/.env'), legacyEnvDigest);
    assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM learning_feedback_archive').get().n, 2, 'legacy archive or duplicate prediction was lost');
  }
  ctx.config.update({
    setupCompleted: true,
    paperless: { url: 'http://paperless:8000', token },
    ai: { provider: 'custom', custom: { baseUrl: 'http://mock-ai:11434/v1', model: 'fixture-native', apiKey: 'synthetic-no-external-key' }, timeoutSeconds: 20 },
    processing: { automatic: false },
    rag: { enabled: false, autoSync: false, embeddingProvider: 'none' },
    ocr: { enabled: false },
  });
  ctx.learning.configure({ mode: 'hybrid', enabled: false, stabilizationMs: 0 });
  if (!ctx.repos.users.byUsername('fixture-user')) ctx.repos.users.create('fixture-user', await hashPassword('isolated-v4-password'));
  fs.writeFileSync(file, JSON.stringify({ scope: 'paperless-ai-v4-e2e', paperlessUrl: 'http://paperless:8000', paperlessToken: token, aiUrl: 'http://ai:3000', apiKey: ctx.cfg.security.apiKey, legacyDocumentId, legacyDatabaseDigest, legacyEnvDigest }), { mode: 0o600 });
  console.log('Isolated upstream4 fixture initialized; credentials were not printed.');
} finally { ctx.close(); }
