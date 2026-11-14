'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {derivePatterns,matchPatterns,learnedFieldPreview}=require('../services/learnedFieldHints');
const {openLearningStore}=require('../services/learningStore');
const target={id:99,correspondent:5,document_type:7,content:'Invoice (no.): NEW-0042',custom_fields:[]};
function source(value='TRAIN-001',label='Invoice (no.)'){
  return {document_id:1,event_id:1,content_preview:`${label}: ${value}`,metadata:{correspondent:5,document_type:7,custom_fields:[{field:1,value}]},
    changes:{custom_fields:{before:[{field:1,value:'Previous'}],after:[{field:1,value}]}}};
}
function native(){
  const definition={id:1,name:'Invoice number',data_type:'string'};
  return {async getDocument(){return structuredClone(target);},async getCustomFieldDefinition(){return definition;},
    async getCustomFieldDefinitionMatches(){return {count:1,results:[definition]};}};
}
function training(store,id=1){
  const document={...target,id,content:'Invoice (no.): TRAIN-001',custom_fields:[{field:1,value:'Previous'}]};
  store.observe(document);document.custom_fields[0].value='TRAIN-001';
  return store.observe(document,'confirmed_ui',{actor:'user:42'}).eventId;
}
test('field sources require confirmed active events and actual changed fields, never title-only snapshots',t=>{
  const store=openLearningStore(':memory:');t.after(()=>store.close());store.configure({mode:'manual'});
  const id=training(store);assert.deepEqual(store.fieldCorrections(),[]);
  store.review(id,'confirmed','user:42');assert.equal(store.fieldCorrections().length,1);
  assert.equal(derivePatterns(store.fieldCorrections(),target).length,1);
  const doc={...target,id:1,title:'Title-only edit',content:'Invoice (no.): TRAIN-001',custom_fields:[{field:1,value:'TRAIN-001'}]};
  const title=store.observe(doc,'confirmed_ui').eventId;store.review(title,'confirmed','user:42');
  assert.equal(store.fieldCorrections().length,1);assert.equal(derivePatterns(store.fieldCorrections(),target).length,0);
  const revoked=training(store,2);store.review(revoked,'confirmed','user:42');store.review(revoked,'deleted','user:42');
  assert.ok(!store.fieldCorrections().some(row=>row.document_id===2));
  const rejected=training(store,3);store.review(rejected,'rejected','user:42');assert.ok(!store.fieldCorrections().some(row=>row.document_id===3));
  const stale=training(store,4);store.review(stale,'confirmed','user:42');
  store.observe({...doc,id:4,title:'Changed again'},'self_write');assert.ok(!store.fieldCorrections().some(row=>row.document_id===4));
});
test('patterns transfer labels, never old values, and require exact positive native scope',()=>{
  const first=derivePatterns([source()],target),changed=derivePatterns([source('DIFFERENT-009')],target);
  assert.deepEqual(first,changed);assert.ok(!JSON.stringify(first).includes('TRAIN-001'));
  assert.equal(matchPatterns(first,target.content).candidates[0].value,'NEW-0042');
  assert.equal(matchPatterns(first,'Invoice (no.): 000007').candidates[0].value,'000007');
  assert.equal(matchPatterns(first,'No current number').candidates.length,0);
  for(const patch of [{id:1},{correspondent:8},{document_type:9},{correspondent:null},{document_type:0}])assert.deepEqual(derivePatterns([source()],{...target,...patch}),[]);
  const unchanged=source();unchanged.changes.custom_fields.before=unchanged.changes.custom_fields.after;assert.deepEqual(derivePatterns([unchanged],target),[]);
  const absent=source();absent.metadata.custom_fields=[];assert.deepEqual(derivePatterns([absent],target),[]);
});
test('legacy and orphaned examples do not provide confirmed per-field sources',t=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Database=require('better-sqlite3');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'field-hint-legacy-')),file=path.join(dir,'db.sqlite');
  const store=openLearningStore(file),raw=new Database(file);
  t.after(()=>{raw.close();store.close();fs.rmSync(dir,{recursive:true,force:true});});
  raw.exec(`CREATE TABLE learning_feedback(document_id INTEGER,title TEXT,tags TEXT,correspondent TEXT,document_type TEXT,content_preview TEXT,corrected_by_user INTEGER);
    INSERT INTO learning_feedback VALUES(1,'Legacy','[]','','','Invoice number: OLD-7',1);`);
  assert.equal(store.legacyExamples().length,1);assert.equal(store.fieldCorrections().length,0);
  store.observe({...target,id:1});
  raw.prepare('INSERT INTO learning_examples(document_id,event_id,metadata_json) SELECT document_id,999,metadata_json FROM learning_document_snapshots').run();
  assert.equal(store.examples().length,1);assert.equal(store.fieldCorrections().length,0,'missing event cannot synthesize field confirmation');
});
test('matching is literal, bounded, Unicode-safe and abstains on conflicting or truncated lines',()=>{
  const patterns=derivePatterns([source('OLD-42','Ärztliche [ID]')],target);
  assert.equal(matchPatterns(patterns,'Ärztliche [ID]: ÄB-0007').candidates[0].value,'ÄB-0007');
  assert.equal(matchPatterns(patterns,'Ärztliche I: WRONG').candidates.length,0);
  assert.equal(matchPatterns(patterns,'Ärztliche [ID]: FIRST\nÄrztliche [ID]: SECOND').ambiguous,1);
  assert.deepEqual(derivePatterns([source('OLD-42','Invoice 123')],target),[]);
  assert.deepEqual(derivePatterns([{...source(),content_preview:'x'.repeat(1980)+'\nInvoice (no.): TRAIN-001'}],target),[]);
  assert.equal(matchPatterns(derivePatterns([source()],target),'x'.repeat(49990)+'\nInvoice (no.): NEW-42').candidates.length,0);
  assert.equal(matchPatterns(patterns,'Ärztliche [ID]: '+'x'.repeat(129)).candidates.length,0);
  const duplicate=derivePatterns([source(),{...source(),document_id:2,event_id:2}],target);
  assert.equal(duplicate.length,1);assert.equal(duplicate[0].sources.length,2);
});
test('source, field, candidate and provenance limits are enforced',t=>{
  const store=openLearningStore(':memory:');t.after(()=>store.close());store.configure({mode:'automatic'});
  for(let i=1;i<=501;i++)training(store,i);
  assert.equal(store.fieldCorrections().length,500);
  const many=Array.from({length:70},(_,i)=>({field:i+1,value:`TRAIN-${i}`,label:`Reference ${String.fromCharCode(65+Math.floor(i/26))}${String.fromCharCode(65+i%26)}`}));
  const s=source();s.metadata.custom_fields=many;s.changes.custom_fields={before:[],after:many};s.content_preview=many.map(row=>`${row.label}: ${row.value}`).join('\n');
  const patterns=derivePatterns([s],target);assert.equal(patterns.length,50);
  assert.equal(matchPatterns(patterns,many.map(row=>`${row.label}: NEW`).join('\n')).candidates.length,50);
  const refs=derivePatterns(Array.from({length:510},(_,i)=>({...source(),document_id:i+100,event_id:i+1})),target);
  assert.equal(refs[0].sources.length,3);
  assert.equal(derivePatterns([...Array.from({length:500},()=>({...source(),metadata:{correspondent:8,document_type:7}})),source()],target).length,0);
});
test('readonly preview resolves fresh native string fields and cannot retarget a changed definition',async()=>{
  const store={settings:()=>({mode:'manual'}),fieldCorrections:()=>[source()]},paperless=native();
  const preview=await learnedFieldPreview(paperless,store,99,target.content);
  assert.equal(preview.readOnly,true);assert.equal(preview.rows[0].proposedValue,'NEW-0042');assert.equal(preview.rows[0].origin.kind,'learned_pattern');
  assert.equal(preview.rows[0].semanticStatus,'unverified');assert.ok(!JSON.stringify(preview).includes('TRAIN-001'));
  assert.equal((await learnedFieldPreview(paperless,{...store,settings:()=>({mode:'disabled'}),fieldCorrections:()=>{throw Error('must not read sources');}},99,target.content)).rows.length,0);
  await assert.rejects(learnedFieldPreview(paperless,store,99,'stale'),error=>error.status===409);
  for(const definition of [{id:1,name:'Invoice number',data_type:'date'},{id:2,name:'Invoice number',data_type:'string'}]){
    assert.equal((await learnedFieldPreview({...paperless,getCustomFieldDefinition:async()=>definition},store,99,target.content)).rows.length,0);
  }
  assert.equal((await learnedFieldPreview({...paperless,getCustomFieldDefinition:async()=>{throw {response:{status:404}};}},store,99,target.content)).rows.length,0);
  let reads=0;
  await assert.rejects(learnedFieldPreview({...paperless,getDocument:async()=>({...target,title:++reads===1?'first':'changed'})},store,99,target.content),error=>error.status===409);
});
test('learned API requires authentication, same-origin JSON and bounded native text',async t=>{
  const express=require('express'),{authenticateJWT}=require('../routes/auth'),{sameOriginJSON}=require('../routes/learning');
  const {createLearnedFieldPreviewHandler}=require('../routes/learnedFieldHints');
  const previous=process.env.API_KEY;process.env.API_KEY='isolated-hint-test-key';let calls=0;
  const store={settings:()=>({mode:'manual'}),fieldCorrections:()=>{calls++;return [source()];}};
  const app=express();app.use(express.json(),require('cookie-parser')());app.post('/hints',authenticateJWT,sameOriginJSON,createLearnedFieldPreviewHandler(native(),()=>store));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();if(previous===undefined)delete process.env.API_KEY;else process.env.API_KEY=previous;});
  const url=`http://127.0.0.1:${server.address().port}/hints`,body={documentId:99,content:target.content};
  const post=(data,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.API_KEY,...headers},body:JSON.stringify(data)});
  assert.equal((await fetch(url,{method:'POST'})).status,401);assert.equal((await post(body,{Origin:'https://untrusted.example'})).status,403);
  for(const input of [{...body,documentId:true},{...body,content:'x'.repeat(50001)},{...body,content:''}])assert.equal((await post(input)).status,400);
  assert.equal(calls,0);assert.equal((await post({...body,content:'stale'})).status,409);
  const response=await post(body);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).rows[0].proposedValue,'NEW-0042');assert.equal(calls,1);
});
test('frozen bilingual diagnostics report historical-role errors without claiming automatic qualification',()=>{
  const {diagnostic}=require('./field-hints/report'),result=diagnostic();
  assert.deepEqual(result,require('./field-hints/results.json'));
  assert.equal(result.cases,24);assert.equal(result.automaticQualification,false);
  for(const split of ['development','confirmation']){
    assert.deepEqual(result.groups[split],{positive:6,correctPositive:6,negative:6,negativeWithSuggestion:2,wrongSuggestions:2,abstentions:4,historicalRoleErrors:2});
  }
});
