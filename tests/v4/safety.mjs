/** Fixed internal targets keep this fixture incapable of selecting production URLs. */
export function validateFixture(fixture, env = process.env) {
  if (fixture?.scope !== 'paperless-ai-v4-e2e' || fixture.paperlessUrl !== 'http://paperless:8000' || fixture.aiUrl !== 'http://ai:3000')
    throw new Error('Only the isolated upstream4 fixture is permitted');
  for (const key of ['apiKey', 'paperlessToken']) if (typeof fixture[key] !== 'string' || !fixture[key]) throw new Error('Fixture credential missing');
  for (const key of ['PAPERLESS_URL', 'PAPERLESS_API_URL', 'OLLAMA_URL', 'OPENAI_API_KEY', 'OPENAI_TEST_API_KEY', 'AZURE_OPENAI_API_KEY'])
    if (env[key]) throw new Error(`External provider/instance variable forbidden: ${key}`);
  if (env.EXPECTED_PAPERLESS_VERSION && !['3.4.2', '3.5.1'].includes(env.EXPECTED_PAPERLESS_VERSION)) throw new Error('Paperless version is not in the fixture qualification matrix');
}
