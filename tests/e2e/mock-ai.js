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
  if (body.prompt?.includes('SYNTHETIC CUSTOM FIELD CONTRACT')) {
    result.title = 'Typed synthetic invoice';
    result.custom_fields = {
      count: { field_name: 'Contract count', value: 0 },
      price: { field_name: 'Contract price', value: 'EUR42,50' },
      ratio: { field_name: 'Contract ratio', value: 1.25 },
      flag: { field_name: 'Contract flag', value: false },
      category: { field_name: 'Contract category', value: 'Fixture' },
      note: { field_name: 'Contract note', value: 'Synthetic long text '.repeat(8) },
      invalid: { field_name: 'Contract invalid', value: '1,234' },
      omitted: { field_name: 'Contract untouched', value: null }
    };
  }
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"ok":true}');
  res.end(JSON.stringify({ response: JSON.stringify(result), done: true,
    choices: [{ message: { role: 'assistant', content: JSON.stringify(result) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
}).listen(11434, '0.0.0.0');
