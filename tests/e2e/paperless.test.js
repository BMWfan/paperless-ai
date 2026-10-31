'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const generate = require('./generate');
require('dotenv').config({ path: 'data/.env' });
const fs = require('node:fs');
fs.mkdirSync('logs', {recursive:true});
async function learning(path, body) {
  const response = await fetch('http://ai:3000/api/learning' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'x-api-key':'isolated-test-api-key','Content-Type':'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  assert.ok(response.ok, `Learning ${path}: ${response.status}`);
  return response.json();
}
const base = process.env.PAPERLESS_API_URL;
assert.equal(base, 'http://paperless:8000/api', 'E2E must only use the isolated service');
const headers = { Authorization: `Token ${process.env.PAPERLESS_API_TOKEN}` };
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
test('real Paperless ingestion, direct correction, persistent detection and review', { timeout: 180000 }, async () => {
  const fixture = generate(Date.now());
  const form = new FormData();
  form.set('document', new Blob([fixture.content], { type: 'text/plain' }), fixture.name);
  form.set('title', fixture.expected.title);
  await api('/documents/post_document/', { method: 'POST', body: form });
  let document;
  for (let attempt = 0; attempt < 90; attempt++) {
    const page = await api('/documents/?ordering=-id');
    document = page.results.find(row => row.original_file_name === fixture.name);
    if (document) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(document, 'synthetic document consumed');
  const provider = require('../../services/aiServiceFactory').getService();
  const result = await provider.analyzeDocument(document.content, [], [], [], document.id);
  assert.equal(result.error, undefined, 'classification should succeed');
  assert.equal(result.document.title, fixture.expected.title);
  assert.deepEqual(result.document.tags, fixture.expected.tags);
  const tag = await api('/tags/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `synthetic-${document.id}` }) });
  document = await api(`/documents/${document.id}/`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: result.document.title, tags: [tag.id] }) });
  assert.deepEqual((await api(`/documents/${document.id}/`)).tags, [tag.id]);
  await learning('/settings', {enabled:false,mode:'hybrid',intervalMs:1000,stabilizationMs:0});
  await learning('/scan', {});
  await api(`/documents/${document.id}/`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Confirmed synthetic correction' }) });
  await learning('/scan', {});
  const {events} = await learning('/events?status=pending');
  const event = events.find(row => row.document_id === document.id);
  assert.ok(event, 'real app monitor detects direct API edit');
  assert.equal(event.source,'unknown');
  await learning(`/events/${event.id}/review`, {decision:'confirmed'});
  assert.ok((await learning('/examples')).examples.some(row => row.document_id === document.id));
  // Providers execute in a second process against the same SQLite volume.
  // The held-out document is never preloaded as a learning example.
  const heldOut = generate(Date.now()+1);
  const secondForm = new FormData();
  secondForm.set('document',new Blob([heldOut.content],{type:'text/plain'}),heldOut.name);
  await api('/documents/post_document/',{method:'POST',body:secondForm});
  let second;
  for(let i=0;i<90;i++) {
    second = (await api('/documents/?ordering=-id')).results.find(row=>row.original_file_name===heldOut.name);
    if(second) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(second);
  const OpenAI = require('openai');
  const openai = require('../../services/openaiService');
  const azure = require('../../services/azureService');
  openai.client = new OpenAI({apiKey:'fixture',baseURL:'http://mock-ai:11434/v1'});
  azure.client = new OpenAI.AzureOpenAI({apiKey:'fixture',endpoint:'http://mock-ai:11434',deployment:'fixture',apiVersion:'2024-10-21'});
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
  process.env.AZURE_DEPLOYMENT_NAME = 'gpt-4o-mini';
  for(const [name,service] of [['ollama',provider],['openai',openai],['azure',azure]]) {
    const classified = await service.analyzeDocument(second.content,[],[],[],second.id,'Classify this synthetic invoice.');
    assert.equal(classified.error,undefined,`${name} classification succeeds`);
    assert.equal(classified.document.title,'Confirmed synthetic correction',`${name} receives confirmed context after custom prompt`);
  }
  const paperless = require('../../services/paperlessService');
  const protectedDoc = await paperless.updateDocument(document.id,{title:'Unconfirmed AI overwrite'});
  assert.equal(protectedDoc.title,'Confirmed synthetic correction');
  await learning('/scan',{});
  assert.equal((await learning('/events?status=pending')).events.filter(row=>row.document_id===document.id).length,0,'self writes do not create corrections');
  const editInput = {tags:[]};
  const userEdited = await paperless.updateDocument(document.id,editInput,{confirmedUser:true});
  assert.deepEqual(userEdited.tags,[],'explicit user edits can remove tags');
  assert.deepEqual(editInput,{tags:[]},'write protection never mutates caller input');
  await learning(`/events/${event.id}/review`,{decision:'deleted'});
  const currentExample = (await learning('/examples')).examples.find(row=>row.document_id===document.id);
  assert.ok(currentExample,'deleting an older event must preserve a newer confirmed correction');
  await learning(`/events/${currentExample.event_id}/review`,{decision:'deleted'});
  assert.equal((await learning('/examples')).examples.filter(row=>row.document_id===document.id).length,0);
  await api(`/documents/${second.id}/`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Rejected correction'})});
  await learning('/scan',{});
  const rejected = (await learning('/events?status=pending')).events.find(row=>row.document_id===second.id);
  assert.ok(rejected);
  await learning(`/events/${rejected.id}/review`,{decision:'rejected'});
  assert.equal((await fetch('http://ai:3000/api/learning/events')).status,401,'learning API requires authentication');
  const health = await fetch('http://ai:3000/health');
  assert.equal(health.status, 200);
});
