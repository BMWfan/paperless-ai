'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {previewCustomFields,occurrences}=require('../services/customFieldPreview');
const {createCustomFieldPreviewHandler}=require('../routes/customFieldPreview');
const {authenticateJWT}=require('../routes/auth');
const {sameOriginJSON}=require('../routes/learning');

test('read-only preview uses current native fields, shows typed values and leaves meaning unverified',async()=>{
  const content='Invoice number: INV-007\nHistorical reference: OLD-009\nAmount: EUR 42.50';
  const document={id:4,content,modified:'2030-01-01T00:00:00Z',custom_fields:[{field:8,value:'Previous'}]};
  const fields={Number:{id:8,name:'Number',data_type:'string'},Amount:{id:9,name:'Amount',data_type:'monetary'}};
  const calls=[];
  const paperless={async getDocument(id){assert.equal(id,4);return document;},async getCustomFieldDefinitionMatches(name){calls.push(name);return {count:1,results:[fields[name]]};}};
  const before=JSON.stringify(document);
  const result=await previewCustomFields(paperless,4,content,[{field_name:'Number',value:'INV-007'},{field_name:'Amount',value:'42.50 EUR'}]);
  assert.equal(result.readOnly,true);assert.equal(result.searchScope,'submitted_text');assert.match(result.contentDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.rows[0].currentValue,'Previous');assert.equal(result.rows[0].evidence.count,1);
  assert.equal(result.rows[0].semanticStatus,'unverified');assert.equal(result.rows[1].normalizedValue,'EUR42.50');
  assert.ok(result.rows[1].flags.includes('no_exact_occurrence'),'format conversion is not fabricated source evidence');
  assert.equal(JSON.stringify(document),before);assert.deepEqual(calls,['Number','Amount']);
  const old=await previewCustomFields(paperless,4,content,[{field_name:'Number',value:'OLD-009'}]);
  assert.equal(old.rows[0].evidence.count,1);assert.equal(old.rows[0].semanticStatus,'unverified','historical occurrence is never semantic confirmation');
});

test('preview reports ambiguous fields, invalid values, duplicate proposals and bounded occurrences',async()=>{
  const content='ID ABC-42. ID ABC-42. Other ABC-420.\nDue date: 2031-02-30';
  const paperless={async getDocument(){return {content,custom_fields:[]};},async getCustomFieldDefinitionMatches(name){
    if(name==='Unknown')return {count:0,results:[]};
    if(name==='Ambiguous')return {count:2,results:[{id:1},{id:2}]};
    return {count:1,results:[{id:name==='Date'?3:4,name,data_type:name==='Date'?'date':'string'}]};
  }};
  const result=await previewCustomFields(paperless,1,content,[{field_name:'Unknown',value:'ABC-42'},{field_name:'Ambiguous',value:'ABC-42'},
    {field_name:'Date',value:'2031-02-30'},{field_name:'Number',value:'ABC-42'},{field_name:'Number',value:null}]);
  assert.ok(result.rows[0].flags.includes('unknown_field'));assert.ok(result.rows[1].flags.includes('ambiguous_field'));
  assert.ok(result.rows[2].flags.includes('invalid_value'));assert.equal(result.rows[3].evidence.count,2);
  assert.ok(result.rows[3].flags.includes('multiple_proposals'));assert.ok(result.rows[4].flags.includes('not_provided'));
  const evidence=occurrences('N-42 '.repeat(20),['N-42']);assert.equal(evidence.count,20);assert.equal(evidence.excerpts.length,5);
  assert.ok(occurrences('x'.repeat(1000),['x'.repeat(1000)]).excerpts[0].text.length<=300);
});

test('preview binds the submitted prefix to the current document and fails on unreadable definitions',async()=>{
  let lookups=0;
  const paperless={async getDocument(){return {content:'a'.repeat(50001)};},async getCustomFieldDefinitionMatches(){lookups++;return {count:1,results:[]};}};
  await assert.rejects(previewCustomFields(paperless,1,'old text',[]),error=>error.status===409);assert.equal(lookups,0);
  const result=await previewCustomFields(paperless,1,'a'.repeat(50000),[]);assert.notEqual(result.contentDigest,result.submittedTextDigest);
  await assert.rejects(previewCustomFields(paperless,1,'a'.repeat(50000),[{field_name:'Name',value:'test'}]),/Invalid custom field definitions/);
});

test('preview API requires authentication, same-origin JSON, bounded input and returns conflicts without writes',async t=>{
  const previous=process.env.API_KEY;process.env.API_KEY='isolated-preview-key';let reads=0;
  const paperless={async getDocument(){reads++;return {content:'Current text'};}};
  const app=express();app.use(express.json(),require('cookie-parser')());app.post('/preview',authenticateJWT,sameOriginJSON,createCustomFieldPreviewHandler(paperless));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();if(previous===undefined)delete process.env.API_KEY;else process.env.API_KEY=previous;});
  const url=`http://127.0.0.1:${server.address().port}/preview`;
  const post=(body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':'isolated-preview-key',...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(url,{method:'POST'})).status,401);
  assert.equal((await post({documentId:1,content:'Current text',suggestions:[]},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post({documentId:true,content:'Current text',suggestions:[]})).status,400);
  assert.equal((await post({documentId:1,content:'x'.repeat(50001),suggestions:[]})).status,400);
  assert.equal((await post({documentId:1,content:'Current text',suggestions:Array(51).fill({})})).status,400);assert.equal(reads,0);
  assert.equal((await post({documentId:1,content:'Stale text',suggestions:[]})).status,409);
  const response=await post({documentId:1,content:'Current text',suggestions:[]});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).readOnly,true);
});
