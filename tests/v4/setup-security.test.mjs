import test from 'node:test';
import assert from 'node:assert/strict';

// Only the isolated compose fixture is permitted. Never point at production.
const base = 'http://ai:3000';
const json = { 'content-type': 'application/json' };
const fixtureKey = 'isolated-test-api-key';
const endpoints = [
  ['GET', '/api/setup/defaults'],
  ['POST', '/api/setup/test-paperless'],
  ['POST', '/api/setup/test-ai'],
  ['POST', '/api/setup/models'],
  ['POST', '/api/setup'],
];
async function call(method, path, headers = {}) {
  return fetch(base + path, {
    method, headers: { ...json, ...headers },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(5000),
  });
}

test('configured fixture rejects anonymous setup requests before processing body', async () => {
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.status, 'healthy', 'test requires already-configured isolated fixture');
  for (const [method, path] of endpoints) {
    const r = await call(method, path);
    assert.equal(r.status, 401, method + ' ' + path);
  }
});

test('configured fixture rejects API-key-only setup access', async () => {
  for (const [method, path] of endpoints) {
    const r = await call(method, path, { 'x-api-key': fixtureKey });
    assert.equal(r.status, 403, method + ' ' + path);
  }
});

test('configured fixture rejects invalid bearer sessions', async () => {
  for (const [method, path] of endpoints) {
    const r = await call(method, path, { authorization: 'Bearer invalid.synthetic.jwt' });
    assert.equal(r.status, 401, method + ' ' + path);
  }
});

test('cross-site Fetch Metadata and preflight are rejected', async () => {
  for (const [method, path] of endpoints) {
    const r = await call(method, path, { 'sec-fetch-site': 'cross-site' });
    assert.equal(r.status, 403, method + ' ' + path);
  }
  const preflight = await fetch(base + '/api/setup', { method: 'OPTIONS', signal: AbortSignal.timeout(5000) });
  assert.equal(preflight.status, 403);
});

test('mismatched Origin is rejected even without Sec-Fetch-Site', async () => {
  // Security gate: currently expected to expose a missing Origin check.
  const r = await call('GET', '/api/setup/defaults', { origin: 'https://other.example.invalid' });
  assert.equal(r.status, 403, 'setup must reject an explicit foreign Origin');
});
