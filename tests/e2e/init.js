'use strict';
const fs = require('node:fs');
(async () => {
  const response = await fetch('http://paperless:8000/api/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'isolated-test-only' })
  });
  if (!response.ok) throw new Error(`Test token initialization failed: ${response.status}`);
  const { token } = await response.json();
  if (!token) throw new Error('Missing test token');
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/.env', [
    'PAPERLESS_API_URL=http://paperless:8000/api', `PAPERLESS_API_TOKEN=${token}`,
    'PAPERLESS_USERNAME=test', 'AI_PROVIDER=ollama',
    'OLLAMA_API_URL=http://mock-ai:11434', 'OLLAMA_MODEL=deterministic-test',
    'RAG_SERVICE_ENABLED=false', 'DISABLE_AUTOMATIC_PROCESSING=yes',
    'SYSTEM_PROMPT=Classify the synthetic document.', 'TOKEN_LIMIT=8000',
    'RESPONSE_TOKENS=1000', 'CUSTOM_FIELDS={"custom_fields":[]}'
  ].join('\n') + '\n', { mode: 0o600 });
  console.log('Isolated test connection initialized.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
