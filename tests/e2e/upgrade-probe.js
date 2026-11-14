'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { setTimeout: delay } = require('node:timers/promises');
const generate = require('./generate');

require('dotenv').config({ path: 'data/.env' });
const base = 'http://paperless:8000/api';
assert.equal(process.env.PAPERLESS_API_URL, base);
const auth = { Authorization: `Token ${process.env.PAPERLESS_API_TOKEN}` };
const json = { 'Content-Type': 'application/json' };
const stateFile = 'data/upgrade-probe.json';

async function request(url, headers, method = 'GET', body) {
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `${method} ${url}: HTTP ${response.status}`);
  return response.json();
}

function learning(path, body) {
  const headers = { ...json, 'x-api-key': 'isolated-test-api-key' };
  return request('http://ai:3000/api/learning' + path, headers,
    body === undefined ? 'GET' : 'POST', JSON.stringify(body));
}

async function seed() {
  const fixture = generate(Date.now());
  const form = new FormData();
  form.set('document', new Blob([fixture.content+'\nUpgrade reference: UPG-001\nRetired reference: RET-001'], { type: 'text/plain' }), fixture.name);
  form.set('title', fixture.expected.title);
  await request(base + '/documents/post_document/', auth, 'POST', form);
  let document;
  for (let attempt = 0; attempt < 90; attempt++) {
    const page = await request(base + '/documents/?ordering=-id', auth);
    document = page.results.find(row => row.original_file_name === fixture.name);
    if (document) break;
    await delay(1000);
  }
  assert.ok(document, 'synthetic upgrade fixture ingested');
  const create=(resource,data)=>request(base+`/${resource}/`,{...auth,...json},'POST',JSON.stringify(data));
  const field=await create('custom_fields',{name:`Upgrade reference ${document.id}`,data_type:'string'});
  const retired=await create('custom_fields',{name:`Retired reference ${document.id}`,data_type:'string'});
  const sender=await create('correspondents',{name:`Upgrade sender ${document.id}`}),type=await create('document_types',{name:`Upgrade type ${document.id}`});
  const scope={correspondent:sender.id,document_type:type.id};
  await request(base+`/documents/${document.id}/`,{...auth,...json},'PATCH',JSON.stringify({...scope,custom_fields:[{field:field.id,value:'OLD'},{field:retired.id,value:'OLD-retired'}]}));
  const targetName=`synthetic-upgrade-target-${document.id}.txt`,targetForm=new FormData();
  targetForm.set('document',new Blob(['Upgrade reference: UPG-002\nRetired reference: RET-002'],{type:'text/plain'}),targetName);
  await request(base+'/documents/post_document/',auth,'POST',targetForm);let target;
  for(let attempt=0;attempt<90;attempt++){
    target=(await request(base+'/documents/?ordering=-id',auth)).results.find(row=>row.original_file_name===targetName);
    if(target)break;await delay(1000);
  }
  assert.ok(target);await request(base+`/documents/${target.id}/`,{...auth,...json},'PATCH',JSON.stringify(scope));
  await learning('/settings', { mode: 'hybrid', enabled: false, stabilizationMs: 0 });
  await learning('/scan', {});
  const title = 'Confirmed synthetic upgrade correction';
  await request(base + `/documents/${document.id}/`, { ...auth, ...json }, 'PATCH', JSON.stringify({ title,custom_fields:[{field:field.id,value:'UPG-001'},{field:retired.id,value:'RET-001'}] }));
  await learning('/scan', {});
  const { events } = await learning('/events?status=pending');
  const event = events.find(row => row.document_id === document.id);
  assert.ok(event, 'synthetic correction queued for review');
  await learning(`/events/${event.id}/review`, { decision: 'confirmed' });
  for(const value of ['RET-other','RET-001']){
    await request(base+`/documents/${document.id}/`,{...auth,...json},'PATCH',JSON.stringify({custom_fields:[{field:field.id,value:'UPG-001'},{field:retired.id,value}]}));
    await learning('/scan',{});
  }
  fs.writeFileSync(stateFile, JSON.stringify({ id: document.id, filename: fixture.name, title, eventId: event.id,targetId:target.id,fieldId:field.id,retiredId:retired.id }));
  await verify();
}

async function verify() {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const document = await request(base + `/documents/${state.id}/`, auth);
  assert.equal(document.original_file_name, state.filename);
  assert.equal(document.title, state.title);
  const { examples } = await learning('/examples');
  assert.ok(examples.some(row => row.document_id === state.id && row.event_id === state.eventId),
    'same confirmed example is retrievable');
  const target=await request(base+`/documents/${state.targetId}/`,auth);
  const hints=await request('http://ai:3000/manual/learned-field-preview',{'Content-Type':'application/json','x-api-key':'isolated-test-api-key'},'POST',JSON.stringify({documentId:state.targetId,content:target.content.slice(0,50000)}));
  assert.equal(hints.rows.length,1);assert.equal(hints.rows[0].fieldId,state.fieldId);assert.equal(hints.rows[0].proposedValue,'UPG-002');
  assert.equal(hints.rows[0].origin.sources[0].eventId,state.eventId);
  assert.ok(!hints.rows.some(row=>row.fieldId===state.retiredId),'invalidated field generation is not resurrected by restart/upgrade');
  console.log('Synthetic document and confirmed learning example verified.');
  console.log('Original field source and invalidated field generation verified.');
}

const action = { seed, verify }[process.argv[2]];
assert.ok(action, 'Use seed or verify');
action().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
