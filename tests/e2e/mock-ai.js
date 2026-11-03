'use strict';
// Deterministic protocol fixture. No external model or network access.
const http = require('node:http');
const classification = { title: 'Synthetic invoice', correspondent: 'Fictional Acme', document_type: 'Invoice', tags: ['synthetic'], language: 'en' };
const requests = [];
http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (req.url === '/requests') return res.end(JSON.stringify(requests));
  const context = body.system || (body.messages || []).filter(row => row.role === 'system').map(row => row.content).join('\n');
  requests.push({ path: req.url, context });
  const result = { ...classification, title: context.includes('Confirmed synthetic correction') ? 'Confirmed synthetic correction' : classification.title };
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"ok":true}');
  res.end(JSON.stringify({ response: JSON.stringify(result), done: true,
    choices: [{ message: { role: 'assistant', content: JSON.stringify(result) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
}).listen(11434, '0.0.0.0');
