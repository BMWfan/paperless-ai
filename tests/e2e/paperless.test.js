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

test('real scan applies typed custom fields without losing unrelated metadata', { timeout: 180000 }, async () => {
  const name = `synthetic-field-contract-${Date.now()}.txt`;
  const form = new FormData();
  form.set('document', new Blob([`SYNTHETIC CUSTOM FIELD CONTRACT ${name}`], { type: 'text/plain' }), name);
  await api('/documents/post_document/', { method: 'POST', body: form });
  let document;
  for (let attempt = 0; attempt < 90; attempt++) {
    document = (await api('/documents/?ordering=-id')).results.find(row => row.original_file_name === name);
    if (document) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(document, 'synthetic contract document ingested');
  const json = { 'Content-Type': 'application/json' };
  const fields = {};
  for (const [key, type] of Object.entries({
    count: 'integer', price: 'monetary', ratio: 'float', flag: 'boolean', category: 'select',
    note: 'longtext', invalid: 'monetary', untouched: 'string',
    date: 'date', invalidDate: 'date', impossibleDate: 'date'
  })) {
    const fieldName = `Contract ${key}`;
    const existing = (await api(`/custom_fields/?name__iexact=${encodeURIComponent(fieldName)}`)).results
      .find(field=>field.name===fieldName);
    if (existing) {
      assert.equal(existing.data_type,type,'existing synthetic field fixture keeps its type');
      if (type === 'select') assert.equal(existing.extra_data.select_options.filter(option=>option.label==='Fixture').length,1);
    }
    fields[key] = existing || await api('/custom_fields/', {
      method: 'POST', headers: json,
      body: JSON.stringify({
        name: fieldName, data_type: type,
        ...(type === 'select' ? { extra_data: { select_options: [{ label: 'Fixture' }] } } : {})
      })
    });
  }
  await api(`/documents/${document.id}/`, {
    method: 'PATCH', headers: json,
    body: JSON.stringify({ custom_fields: [{ field: fields.untouched.id, value: 'keep me' },
      { field: fields.invalidDate.id, value: '2030-01-01' }] })
  });
  const rejected = await fetch(`${base}/documents/${document.id}/`, {
    method: 'PATCH', headers: { ...headers, ...json },
    body: JSON.stringify({ title: 'Must not apply', custom_fields: [{ field: fields.invalidDate.id, value: 'null' }] })
  });
  assert.equal(rejected.status, 400, 'native API correctly rejects the invalid date');
  assert.notEqual((await api(`/documents/${document.id}/`)).title, 'Must not apply');
  const response = await fetch('http://ai:3000/api/scan/now', {
    method: 'POST', headers: { 'x-api-key': 'isolated-test-api-key' }, redirect: 'manual',
    signal: AbortSignal.timeout(45000)
  });
  assert.equal(response.status, 200, 'the automatic scan entry point completes');
  const updated = await api(`/documents/${document.id}/`);
  const values = new Map(updated.custom_fields.map(row => [row.field, row.value]));
  assert.equal(updated.title, 'Typed synthetic invoice', 'invalid field must not block other metadata');
  assert.equal(values.get(fields.count.id), 0);
  assert.equal(values.get(fields.price.id), 'EUR42.50');
  assert.equal(values.get(fields.ratio.id), 1.25);
  assert.equal(values.get(fields.flag.id), false);
  assert.equal(values.get(fields.category.id), fields.category.extra_data.select_options.find(option=>option.label==='Fixture').id);
  assert.equal(values.get(fields.note.id), 'Synthetic long text '.repeat(8).trim());
  assert.equal(values.get(fields.untouched.id), 'keep me');
  assert.equal(values.has(fields.invalid.id), false);
  assert.equal(values.get(fields.date.id), '2032-02-29');
  assert.equal(values.get(fields.invalidDate.id), '2030-01-01', 'invalid automatic date does not clear prior value');
  assert.equal(values.has(fields.impossibleDate.id), false);
  const manual = await fetch('http://ai:3000/manual/updateDocument', {
    method: 'POST', headers: { ...json, 'x-api-key': 'isolated-test-api-key' },
    body: JSON.stringify({ documentId: document.id, custom_fields: updated.custom_fields.map(row =>
      row.field === fields.count.id || row.field === fields.date.id ? { ...row, value: null } : row) })
  });
  assert.equal(manual.status, 200);
  const cleared = await api(`/documents/${document.id}/`);
  assert.equal(cleared.custom_fields.find(row => row.field === fields.count.id)?.value, null);
  assert.equal(cleared.custom_fields.find(row => row.field === fields.date.id)?.value, null, 'manual date clearing remains allowed');
  assert.equal(cleared.custom_fields.find(row => row.field === fields.invalidDate.id)?.value, '2030-01-01');
  assert.equal(cleared.custom_fields.find(row => row.field === fields.untouched.id)?.value, 'keep me');
});

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

test('real manual API honors modes, multi-field protection and legacy revocation', {timeout:180000}, async () => {
  const fixture=generate(Date.now()+99,'de');
  const form=new FormData();form.set('document',new Blob([fixture.content],{type:'text/plain'}),fixture.name);
  await api('/documents/post_document/',{method:'POST',body:form});
  let document;
  for(let attempt=0;attempt<90;attempt++) {
    document=(await api('/documents/?ordering=-id')).results.find(row=>row.original_file_name===fixture.name);
    if(document) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(document);
  const create=(resource,name,extra={})=>api(`/${resource}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,...extra})});
  const tag=await create('tags',`typed-tag-${document.id}`);
  const correspondent=await create('correspondents',`Synthetic insurer ${document.id}`);
  const type=await create('document_types',`Synthetic insurance ${document.id}`);
  const custom=await create('custom_fields',`Synthetic field ${document.id}`,{data_type:'string'});
  await learning('/settings',{mode:'manual',enabled:false,stabilizationMs:0});await learning('/scan',{});
  const correction={title:'Synthetic insurance correction',tags:[tag.id],correspondent:correspondent.id,document_type:type.id,custom_fields:[{field:custom.id,value:'synthetic-value'}]};
  await api(`/documents/${document.id}/`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(correction)});
  await learning('/scan',{});
  const eventsFor=async()=> (await learning('/events?limit=200')).events.filter(row=>row.document_id===document.id);
  let event=(await eventsFor()).find(row=>row.status==='pending');assert.ok(event);
  for(const field of Object.keys(correction)) assert.ok(event.changes[field],`direct API detects ${field}`);
  const staleId=event.id;
  correction.title='Synthetic insurance corrected again';
  await api(`/documents/${document.id}/`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:correction.title})});
  const stale=await fetch(`http://ai:3000/api/learning/events/${staleId}/review`,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':'isolated-test-api-key'},body:JSON.stringify({decision:'confirmed'})});
  assert.equal(stale.status,409,'approval checks live Paperless metadata even before the next scheduled scan');
  await learning(`/events/${staleId}/review`,{decision:'rejected'});
  event=(await eventsFor()).find(row=>row.status==='pending');assert.ok(event);
  await learning(`/events/${event.id}/review`,{decision:'confirmed'});
  const count=(await eventsFor()).length;await learning('/scan',{});assert.equal((await eventsFor()).length,count);
  const paperless=require('../../services/paperlessService');
  const protectedDoc=await paperless.updateDocument(document.id,{title:'Untrusted overwrite',tags:[],correspondent:null,document_type:null,custom_fields:[]});
  for(const field of Object.keys(correction)) assert.deepEqual(protectedDoc[field],correction[field],`confirmed ${field} is protected`);
  const model=require('../../models/document');
  await model.saveLearningFeedback(document.id,'Legacy resurrection trap','synthetic insurance',['legacy'],'Synthetic','Insurance',true);
  await learning(`/events/${event.id}/review`,{decision:'deleted'});
  assert.equal(await model.getConfirmedLearningFeedback(document.id),null,'legacy duplicate cannot keep write protection after revocation');
  assert.ok((await model.getLearningExamples(100,true)).some(row=>row.document_id===document.id),'legacy data remains stored');
  const afterRevocation=await paperless.updateDocument(document.id,{title:'Allowed after revocation'});
  assert.equal(afterRevocation.title,'Allowed after revocation');
  assert.doesNotMatch(await require('../../services/serviceUtils').buildLearningContext('synthetic insurance'),/Legacy resurrection trap/);
  const manual=async body=>{
    const response=await fetch('http://ai:3000/manual/updateDocument',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':'isolated-test-api-key'},body:JSON.stringify(body),redirect:'manual'});
    assert.equal(response.status,200,'existing manual route returns a successful update');return response.json();
  };
  for(const mode of ['automatic','hybrid','manual','disabled']) {
    await learning('/settings',{mode});const before=(await eventsFor()).length;
    const updated=await manual({documentId:document.id,title:`Explicit synthetic ${mode}`});
    assert.equal(updated.title,`Explicit synthetic ${mode}`);assert.deepEqual(updated.tags,[tag.id],'partial manual edit preserves tags');
    const events=await eventsFor();
    if(mode==='disabled') assert.equal(events.length,before);
    else {
      const latest=events[0];assert.equal(latest.source,'confirmed_ui');
      assert.equal(latest.status,mode==='manual'?'pending':'confirmed');
      if(mode==='manual') await learning(`/events/${latest.id}/review`,{decision:'rejected'});
    }
  }
  await learning('/settings',{mode:'hybrid'});
  const history=(await learning(`/history?documentId=${document.id}`)).history;
  assert.ok(history.some(row=>row.actor==='api-key' && row.decision==='confirmed'));
  const page=await fetch('http://ai:3000/learning',{headers:{'x-api-key':'isolated-test-api-key'}});
  assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/Confirmed learning examples/);assert.match(html,/Review history/);assert.match(html,/learning.css/);
  assert.equal((await fetch('http://ai:3000/learning',{redirect:'manual'})).status,302,'the dashboard uses the existing login flow');
});
