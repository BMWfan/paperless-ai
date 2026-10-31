'use strict';
// Deterministic protocol fixture. No external model or network access.
const http = require('node:http');
const classification = { title: 'Synthetic invoice', correspondent: 'Fictional Acme', document_type: 'Invoice', tags: ['synthetic'], language: 'en' };
http.createServer(async (req, res) => {
  for await (const chunk of req) { void chunk; }
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"ok":true}');
  res.end(JSON.stringify({ response: JSON.stringify(classification), done: true,
    choices: [{ message: { role: 'assistant', content: JSON.stringify(classification) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
}).listen(11434, '0.0.0.0');
