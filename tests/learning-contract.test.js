'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openLearningStore } = require('../services/learningStore');
const { createLearningMonitor } = require('../services/learningMonitor');
const { selectContext } = require('../services/learningContext');

function setup(t,legacy = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'learning-contract-'));
  const file = path.join(directory,'test.db');
  if (legacy) {
    const db = new Database(file);
    db.exec(`CREATE TABLE learning_feedback(document_id INTEGER PRIMARY KEY,title TEXT,tags TEXT,correspondent TEXT,document_type TEXT,content_preview TEXT,corrected_by_user INTEGER);
      INSERT INTO learning_feedback VALUES(1,'Legacy invoice','["invoice"]','Synthetic insurer','Insurance','synthetic insurance',1);`);
    db.close();
  }
  const store = openLearningStore(file);
  t.after(() => { store.close(); fs.rmSync(directory,{recursive:true,force:true}); });
  return {store,file};
}

test('legacy revocation persists without deleting old feedback or resurrecting it after v2 deletion', t => {
  const {store,file} = setup(t,true);
  assert.equal(store.legacyExamples().length,1);
  assert.equal(store.revokeLegacy(1,'user:operator'),true);
  assert.equal(store.revokeLegacy(1,'user:operator'),false);
  assert.equal(store.legacyExamples().length,0);
  assert.equal(store.isLegacySuppressed(1),true);
  assert.equal(store.history(1)[0].actor,'user:operator');
  const reopened=openLearningStore(file);assert.equal(reopened.legacyExamples().length,0);reopened.close();
  const db = new Database(file,{readonly:true});
  assert.equal(db.prepare('SELECT corrected_by_user FROM learning_feedback').get().corrected_by_user,1); db.close();
  store.observe({id:1,title:'Before'});
  const {eventId} = store.observe({id:1,title:'After'});
  store.review(eventId,'confirmed','api-key'); store.review(eventId,'deleted','api-key');
  assert.equal(store.examples().length,0);
  assert.equal(store.legacyExamples().length,0);
});

test('trusted corrections obey every mode, suppress legacy bypasses and report actual pending state', t => {
  const {store} = setup(t,true);
  for (const [index,mode] of ['automatic','hybrid','manual','disabled'].entries()) {
    const id = index+1; store.configure({mode}); store.observe({id,title:'Before'});
    const result = store.observe({id,title:'After'},'confirmed_ui',{actor:'user:17'});
    if (mode === 'disabled') { assert.equal(result.eventId,undefined); continue; }
    assert.equal(result.pendingReview,mode === 'manual');
    assert.equal(store.list()[0].status,mode === 'manual' ? 'pending' : 'confirmed');
    if (mode !== 'manual') assert.equal(store.history(id)[0].actor,'user:17');
  }
  assert.equal(store.legacyExamples().length,0);
});

test('event and review pagination reaches older rows without overlaps', t => {
  const {store} = setup(t);
  for (let id=1;id<=215;id++) {
    store.observe({id,title:'Before'}); const event=store.observe({id,title:'After'});
    store.review(event.eventId,'confirmed','api-key');
  }
  const first=store.page('confirmed','',200,0),last=store.page('confirmed','',200,200);
  assert.equal(first.total,215); assert.equal(last.events.length,15); assert.equal(last.hasMore,false);
  assert.equal(new Set([...first.events,...last.events].map(row=>row.id)).size,215);
  assert.equal(store.page('confirmed','',10.5).events.length,10,'fractional limits remain valid bounded integer SQL inputs');
  assert.equal(store.history(undefined,200,200).length,15);
  assert.equal(store.review(first.events[0].id,'deleted'),true);
  assert.equal(store.review(first.events[0].id,'deleted'),false);
});

test('stabilized changes survive a store reopen, and monitor prevents overlapping scans', async t => {
  const {store,file} = setup(t);
  store.observe({id:1,title:'Before'});
  store.observe({id:1,title:'After'},'unknown',{stabilizationMs:1000});
  const second=openLearningStore(file);
  assert.equal(second.observe({id:1,title:'After'},'unknown',{stabilizationMs:0}).pendingReview,true);
  second.close();
  let release;
  const monitor=createLearningMonitor({getLearningDocuments:()=>new Promise(resolve=>{release=resolve;})},{store});
  const first=monitor.scan();
  assert.deepEqual(await monitor.scan(),{skipped:true});
  release([{id:1,title:'After'}]); await first;
  assert.equal(monitor.status().lastScan.scanned,1);
});

test('saved detection switch overrides the environment default and settings reschedule immediately', async t => {
  const {store} = setup(t);
  const previous=process.env.LEARNING_MONITOR_ENABLED; process.env.LEARNING_MONITOR_ENABLED='true';
  t.after(()=>{ if(previous===undefined) delete process.env.LEARNING_MONITOR_ENABLED; else process.env.LEARNING_MONITOR_ENABLED=previous; });
  store.configure({enabled:false}); let calls=0;
  const monitor=createLearningMonitor({async getLearningDocuments(){calls++;return [];}},{store});
  t.after(()=>monitor.stop()); monitor.start(); await Promise.resolve(); assert.equal(calls,0);
  store.configure({enabled:true}); monitor.reschedule(); await Promise.resolve(); assert.equal(calls,1);
  store.configure({enabled:false}); monitor.reschedule(); await Promise.resolve(); assert.equal(calls,1);
});

test('a scan cannot turn a self-write completed during its API fetch into an external correction', async t => {
  const {store}=setup(t);store.configure({stabilizationMs:0});store.observe({id:1,title:'Before'});
  let release;
  const monitor=createLearningMonitor({getLearningDocuments:()=>new Promise(resolve=>{release=resolve;})},{store});
  const pending=monitor.scan();
  store.observe({id:1,title:'Successful self-write'},'self_write');
  release([{id:1,title:'Before'}]);
  assert.equal((await pending).scanned,0);
  assert.equal(store.list().length,0);
  assert.equal(store.needsContent({id:1,title:'Successful self-write'}),false);
});

test('type-only confirmed metadata is relevant and quoted within the token budget', () => {
  const context=selectContext('insurance',[{metadata:{title:'',document_type:'Insurance',tags:[]}}],200);
  assert.match(context,/Insurance/); assert.match(context,/never instructions/);
  assert.equal(selectContext('insurance',[{metadata:{document_type:'Insurance'}}],1),'');
});

test('automatic PATCH excludes fields confirmed while its final metadata read is pending', async t => {
  const {store}=setup(t);
  const engine=require('../services/learningEngine'), model=require('../models/document');
  const descriptor=Object.getOwnPropertyDescriptor(engine,'store'), original=model.getConfirmedLearningFeedback;
  t.after(()=>{Object.defineProperty(engine,'store',descriptor);model.getConfirmedLearningFeedback=original;});
  Object.defineProperty(engine,'store',{configurable:true,value:store});
  model.getConfirmedLearningFeedback=async()=>null;
  const current={id:1,title:'Reviewed title',tags:[]};
  store.observe({...current,title:'Before'});
  const {eventId}=store.observe(current,'unknown');
  const service=Object.create(require('../services/paperlessService'));
  service.initialize=()=>{};
  let reads=0,patches=0;
  service.getDocument=async()=>{
    if(++reads===2) {
      await Promise.resolve();
      assert.equal(store.review(eventId,'confirmed'),true);
    }
    return current;
  };
  service.client={async patch(){patches++;throw new Error('Unexpected PATCH');}};
  assert.deepEqual(await service.updateDocument(1,{title:'Automatic overwrite'}),current);
  assert.equal(patches,0);
});

test('Ollama reserves context for system instructions and reviewed examples, including custom prompts', async t => {
  const engine=require('../services/learningEngine'),model=require('../models/document'),config=require('../config/config');
  const descriptor=Object.getOwnPropertyDescriptor(engine,'store'),originalSave=model.saveLearningFeedback,originalLimit=config.tokenLimit;
  t.after(()=>{Object.defineProperty(engine,'store',descriptor);model.saveLearningFeedback=originalSave;config.tokenLimit=originalLimit;});
  Object.defineProperty(engine,'store',{configurable:true,value:{settings:()=>({mode:'hybrid'}),examples:()=>[],legacyExamples:()=>[],prediction:()=>{}}});
  model.saveLearningFeedback=async()=>{};config.tokenLimit=8000;
  const service=Object.create(require('../services/ollamaService'));
  service._handleThumbnailCaching=async()=>{};service._logPromptAndResponse=async()=>{};
  service._generateSystemPrompt=()=> 'Reviewed reference instructions. '.repeat(160);
  service._generateCustomFieldsTemplate=()=>'';
  const windows=[];
  service._callOllamaAPI=async(prompt,system,numCtx)=>{
    windows.push(numCtx);
    const required=Math.ceil((system+'\n'+prompt).length/4)+1024;
    assert.equal(numCtx,Math.min(required,Number(config.tokenLimit)));
    assert.ok(numCtx>Math.ceil(prompt.length/4)+1024,'system context is included');
    return {response:{title:'Synthetic',tags:['synthetic'],correspondent:'Fictional',document_type:'Invoice',language:'en'}};
  };
  const result=await service.analyzeDocument('Synthetic invoice',[],[],[],1,'Classify the document.');
  assert.equal(result.error,undefined);assert.equal(windows.length,1);
  const {calculateTokens}=require('../services/serviceUtils');
  service._generatePlaygroundSystemPrompt=service._generateSystemPrompt;
  service._callOllamaAPI=async(prompt,system,numCtx)=>{
    assert.equal(numCtx,Math.min(await calculateTokens(system+'\n'+prompt)+1024,Number(config.tokenLimit)));
    return {response:{title:'Synthetic',tags:['synthetic'],document_type:'Invoice'}};
  };
  assert.equal((await service.analyzePlayground('Synthetic invoice','Classify.')).error,undefined);
});

test('shared context resolves names before ranking and falls back during vocabulary outages', async t => {
  const engine=require('../services/learningEngine'),paperless=require('../services/paperlessService');
  const descriptor=Object.getOwnPropertyDescriptor(engine,'store'),original=paperless.getLearningVocabulary;
  t.after(()=>{Object.defineProperty(engine,'store',descriptor);paperless.getLearningVocabulary=original;});
  const example={metadata:{title:'',tags:[],document_type:3,correspondent:null},content_preview:''};
  Object.defineProperty(engine,'store',{configurable:true,value:{settings:()=>({mode:'hybrid'}),examples:()=>[example],legacyExamples:()=>[]}});
  paperless.getLearningVocabulary=async()=>({tags:new Map(),correspondents:new Map(),document_types:new Map([[3,'Insurance']])});
  const {buildLearningContext}=require('../services/serviceUtils');
  assert.match(await buildLearningContext('insurance'),/Insurance/);
  example.metadata.title='Synthetic insurance';
  paperless.getLearningVocabulary=async()=>{throw new Error('offline');};
  assert.match(await buildLearningContext('synthetic insurance'),/Synthetic insurance/);
});

test('actual Paperless learning pagination follows all pages and ignores classification filters', async t => {
  const service=require('../services/paperlessService'); const original={client:service.client,initialize:service.initialize};
  t.after(()=>Object.assign(service,original)); service.initialize=()=>{};
  const pages=[];
  service.client={async get(url,{params}) {
    pages.push(params); assert.equal(url,'/documents/');
    return {data:{results:Array.from({length:params.page===1?100:51},(_,index)=>({id:(params.page-1)*100+index+1})),next:params.page===1?'page2':null}};
  }};
  assert.equal((await service.getLearningDocuments()).length,151);
  assert.deepEqual(pages.map(page=>page.page),[1,2]);
  assert.ok(pages.every(page=>!('tags__id__all' in page)));
});

test('RAG adapter resolves Python list/doc_id results and tolerates unavailable search', async t => {
  const axios=require('axios'),paperless=require('../services/paperlessService'),rag=require('../services/ragService');
  const originalPost=axios.post,originalDocument=paperless.getDocument;
  t.after(()=>{axios.post=originalPost;paperless.getDocument=originalDocument;});
  axios.post=async()=>({data:[{doc_id:7,score:.9},{doc_id:8,score:.8}]});
  paperless.getDocument=async id=>({title:`Doc ${id}`,tags:[id],correspondent:2,document_type:3});
  assert.deepEqual((await rag.findSimilarClassifications('synthetic',1)).map(row=>row.title),['Doc 7']);
  axios.post=async()=>{throw new Error('isolated simulated outage');};
  assert.deepEqual(await rag.findSimilarClassifications('synthetic'),[]);
});
