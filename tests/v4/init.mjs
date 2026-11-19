// Runs only inside the disposable app image; no production endpoint is configurable.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { AppContext } from '/app/dist/server/context.js';
import { hashPassword } from '/app/dist/server/auth.js';
const file = '/fixtures/runtime.json';
if (fs.existsSync(file)) assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).scope, 'paperless-ai-v4-e2e');
const response = await fetch('http://paperless:8000/api/token/', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'isolated-test-only' }), signal: AbortSignal.timeout(20000),
});
assert.equal(response.status, 200, 'Isolated test token initialization failed');
const { token } = await response.json();
assert.equal(typeof token, 'string'); assert.ok(token);
const ctx = new AppContext({ dataDir: '/app/data', env: {} });
try {
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
  fs.writeFileSync(file, JSON.stringify({ scope: 'paperless-ai-v4-e2e', paperlessUrl: 'http://paperless:8000', paperlessToken: token, aiUrl: 'http://ai:3000', apiKey: ctx.cfg.security.apiKey }), { mode: 0o600 });
  console.log('Isolated upstream4 fixture initialized; credentials were not printed.');
} finally { ctx.close(); }
