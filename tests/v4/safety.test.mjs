import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFixture } from './safety.mjs';
const fixture = { scope: 'paperless-ai-v4-e2e', paperlessUrl: 'http://paperless:8000', aiUrl: 'http://ai:3000', apiKey: 'synthetic-key', paperlessToken: 'synthetic-token' };
test('permits only the isolated fixture and qualified version', () => assert.doesNotThrow(() => validateFixture(fixture, { EXPECTED_PAPERLESS_VERSION: '3.5.1' })));
test('refuses URL substitution even when the fixture marker is correct', () => {
  for (const key of ['paperlessUrl', 'aiUrl']) assert.throws(() => validateFixture({ ...fixture, [key]: 'https://example.invalid' }, {}), /Only the isolated/);
});
test('refuses accidental injection of real provider or instance variables', () => {
  for (const key of ['PAPERLESS_URL', 'PAPERLESS_API_URL', 'OLLAMA_URL', 'OPENAI_API_KEY', 'OPENAI_TEST_API_KEY', 'AZURE_OPENAI_API_KEY'])
    assert.throws(() => validateFixture(fixture, { [key]: 'synthetic-test-value' }), /External provider\/instance/);
});
test('rejects unmarked or incomplete state before any network operation', () => {
  for (const change of [{ scope: 'other' }, { apiKey: '' }, { paperlessToken: null }]) assert.throws(() => validateFixture({ ...fixture, ...change }, {}));
  assert.throws(() => validateFixture(fixture, { EXPECTED_PAPERLESS_VERSION: 'latest' }), /qualification matrix/);
});
