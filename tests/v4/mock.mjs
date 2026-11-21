// A deterministic protocol fixture, with no external network or model dependency.
import http from 'node:http';
let calls = 0;
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"ok":true}');
  if (req.url === '/stats') return res.end(JSON.stringify({ calls }));
  if (req.url === '/v1/models') return res.end('{"data":[{"id":"fixture-native"}]}');
  if (req.url !== '/v1/chat/completions' || req.method !== 'POST') { res.statusCode = 404; return res.end('{}'); }
  let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 1048576) { res.statusCode = 413; return res.end('{}'); } }
  calls++;
  const suggestion = { title: 'Synthetic native invoice', correspondent: 'Fixture Supplier', document_type: 'Invoice', tags: ['synthetic-v4'], language: 'en', document_date: '2024-03-14', custom_fields: [] };
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(suggestion) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
}).listen(11434, '0.0.0.0');
