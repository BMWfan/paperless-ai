'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {snapshotDigest,validateReviewRequest}=require('../services/customFieldReview');
const {previewCustomFields}=require('../services/customFieldPreview');
const {createCustomFieldApplyHandler}=require('../routes/customFieldApply');
const definition={id:1,name:'Number',data_type:'string',extra_data:null};

test('review snapshot binds document, content, metadata and field definitions canonically',()=>{
  const document={id:7,content:'Current invoice',title:'Invoice',tags:[3,2],custom_fields:[{field:9,value:{b:2,a:1}},{field:1,value:'OLD'}],modified:'v1'};
  const hash=snapshotDigest(7,document,[definition]);
  assert.equal(hash,snapshotDigest(7,{...document,tags:[2,3],custom_fields:[{field:1,value:'OLD'},{field:9,value:{a:1,b:2}}]},[{...definition}]));
  for(const changed of [{...document,content:'Changed'},{...document,title:'Changed'},{...document,modified:'v2'},
    {...document,custom_fields:[{field:1,value:'Other'}]}])assert.notEqual(hash,snapshotDigest(7,changed,[definition]));
  assert.notEqual(hash,snapshotDigest(8,document,[definition]));
  assert.notEqual(hash,snapshotDigest(7,document,[{...definition,data_type:'date'}]));
  assert.notEqual(hash,snapshotDigest(7,document,[{...definition,name:'Other meaning'}]));
  assert.notEqual(hash,snapshotDigest(7,document,[{...definition,extra_data:{select_options:[{id:'a',label:'Changed'}]}}]));
});

test('review requests reject empty, duplicate, out-of-snapshot and unsupported value shapes',()=>{
  const good={documentId:7,snapshotDigest:'a'.repeat(64),reviewFieldIds:[2,1],fields:[{field:1,value:'NEW'}]};
  assert.deepEqual(validateReviewRequest(good).reviewFieldIds,[1,2]);
  for(const bad of [null,[],{...good,documentId:true},{...good,snapshotDigest:''},{...good,fields:[]},
    {...good,reviewFieldIds:[1,1]},{...good,reviewFieldIds:[]},{...good,fields:[{field:3,value:'NEW'}]},
    {...good,fields:[{field:1,value:'A'},{field:1,value:'B'}]},
    ...[null,{},[],undefined].map(value=>({...good,fields:[{field:1,value}]})),
    {...good,reviewFieldIds:Array.from({length:51},(_,i)=>i+1)}]){
    assert.throws(()=>validateReviewRequest(bad),error=>error.status===400);
  }
});

test('preview exposes a full definition receipt but never preselects invalid or unsupported fields',async()=>{
  const definitions=[definition,{id:2,name:'Links',data_type:'documentlink'}];
  const document={id:7,content:'NEW and another NEW',custom_fields:[]};
  const paperless={async getDocument(){return document;},async getCustomFieldDefinitionMatches(name){return {count:1,results:[definitions.find(row=>row.name===name)]};}};
  const preview=await previewCustomFields(paperless,7,document.content,[{field_name:'Number',value:'NEW'},{field_name:'Links',value:'123'}]);
  assert.equal(preview.readOnly,true);assert.deepEqual(preview.reviewFieldIds,[1,2]);
  assert.equal(preview.snapshotDigest,snapshotDigest(7,document,definitions));
  assert.equal(preview.rows[0].canApply,true,'multiple occurrences remain a human review decision');
  assert.equal(preview.rows[0].semanticStatus,'unverified');
  assert.equal(preview.rows[1].canApply,false);assert.ok(preview.rows[1].flags.includes('unsupported_type'));
});

test('actual writer guards reviewed saves, keeps learning modes and reports uncertain outcomes',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'field-review-'));
  const store=require('../services/learningStore').openLearningStore(path.join(directory,'test.db'));
  const engine=require('../services/learningEngine'),descriptor=Object.getOwnPropertyDescriptor(engine,'store');
  Object.defineProperty(engine,'store',{configurable:true,value:store});
  const service=Object.create(require('../services/paperlessService'));service.initialize=()=>{};
  let documents=new Map(),definitions=new Map(),nextId=100,patches=0,clock=0,onDefinition,onPatch;
  const clone=value=>structuredClone(value);
  service.client={async get(url,options){
    if(url.startsWith('/documents/'))return {data:clone(documents.get(Number(url.split('/')[2])))};
    if(url==='/custom_fields/'){const results=[...definitions.values()].filter(row=>row.name.toLowerCase()===options.params.name__iexact.toLowerCase());return {data:{count:results.length,results:clone(results)}};}
    const id=Number(url.split('/')[2]);assert.ok(engine.inFlight.size,'definition revalidation occurs inside writer exclusion');
    if(onDefinition){const callback=onDefinition;onDefinition=null;await callback();}
    if(!definitions.has(id)){const error=new Error('isolated missing field');error.response={status:404};throw error;}
    return {data:clone(definitions.get(id))};
  },async patch(url,payload){
    patches++;const id=Number(url.split('/')[2]);
    const updated={...documents.get(id),...clone(payload),modified:`v${++clock}`};
    if(onPatch)await onPatch(updated);
    documents.set(id,updated);return {data:clone(updated)};
  }};
  const fixture=async(mode='manual')=>{
    definitions=new Map([[1,clone(definition)],[2,{id:2,name:'Date',data_type:'date'}]]);
    onDefinition=null;onPatch=null;
    const id=++nextId,document={id,content:'Current number NEW-42, date2032-02-29',title:'Preserve title',tags:[3],document_type:4,correspondent:5,
      modified:'v0',custom_fields:[{field:1,value:'OLD'},{field:9,value:[11,12]}]};
    documents.set(id,document);store.configure({mode,enabled:false,stabilizationMs:0});store.observe(document);
    const preview=await previewCustomFields(service,id,document.content,[{field_name:'Number',value:'NEW-42'},{field_name:'Date',value:'2032-2-29'}]);
    return {id,document:clone(document),request:{documentId:id,snapshotDigest:preview.snapshotDigest,reviewFieldIds:preview.reviewFieldIds,fields:[{field:1,value:'NEW-42'}]}};
  };
  const save=request=>service.updateDocument(request.documentId,{}, {confirmedUser:true,actor:'test-reviewer',customFieldReview:request});
  const previousKey=process.env.API_KEY;
  t.after(()=>{Object.defineProperty(engine,'store',descriptor);engine.inFlight.clear();store.close();fs.rmSync(directory,{recursive:true,force:true});if(previousKey===undefined)delete process.env.API_KEY;else process.env.API_KEY=previousKey;});

  await t.test('all four learning modes preserve unselected native values',async()=>{
    for(const mode of ['manual','automatic','hybrid','disabled']){
      const {id,document,request}=await fixture(mode);const result=await save(request);
      assert.equal(result.custom_fields.find(row=>row.field===1).value,'NEW-42');
      assert.deepEqual(result.custom_fields.find(row=>row.field===9).value,[11,12]);
      assert.equal(result.title,document.title);assert.deepEqual(result.tags,document.tags);
      const event=store.list().find(row=>row.document_id===id);
      if(mode==='disabled')assert.equal(event,undefined);
      else {assert.equal(event.source,'confirmed_ui');assert.equal(event.status,mode==='manual'?'pending':'confirmed');}
      const count=patches;await assert.rejects(save(request),error=>error.status===409);assert.equal(patches,count,'old receipt cannot repeat a changed save');
    }
  });
  await t.test('stale content, metadata, types, missing and ambiguous definitions never PATCH',async()=>{
    for(const change of ['content','metadata','type','deleted','ambiguous','receipt_scope']){
      const {id,request}=await fixture();
      if(change==='content')documents.get(id).content='Changed text';
      if(change==='metadata')documents.get(id).custom_fields.push({field:10,value:'External'});
      if(change==='type')definitions.get(1).data_type='date';
      if(change==='deleted')definitions.delete(1);
      if(change==='ambiguous')definitions.set(3,{...definition,id:3});
      if(change==='receipt_scope')request.reviewFieldIds=[1];
      const count=patches;await assert.rejects(save(request),error=>error.status===409);assert.equal(patches,count);assert.equal(engine.inFlight.has(id),false);
    }
  });
  await t.test('selected typed values preserve false, zero and native option IDs',async()=>{
    const f=await fixture();
    const additional=[
      {id:3,name:'Count',data_type:'integer'}, {id:4,name:'Flag',data_type:'boolean'},
      {id:5,name:'Category',data_type:'select',extra_data:{select_options:[{id:'choice-1',label:'Fixture'}]}},
      {id:6,name:'Amount',data_type:'monetary'}, {id:7,name:'Ratio',data_type:'float'}, {id:8,name:'Note',data_type:'longtext'}
    ];
    for(const field of additional)definitions.set(field.id,field);
    const raw={1:'NEW-42',2:'2032-2-29',3:0,4:false,5:'Fixture',6:'42.50 EUR',7:1.25,8:'Long note'};
    const preview=await previewCustomFields(service,f.id,f.document.content,[...definitions.values()].map(field=>({field_name:field.name,value:raw[field.id]})));
    f.request={documentId:f.id,snapshotDigest:preview.snapshotDigest,reviewFieldIds:preview.reviewFieldIds,
      fields:[...definitions.keys()].map(field=>({field,value:raw[field]}))};
    const saved=await save(f.request),values=new Map(saved.custom_fields.map(row=>[row.field,row.value]));
    assert.equal(values.get(3),0);assert.equal(values.get(4),false);assert.equal(values.get(5),'choice-1');
    assert.equal(values.get(6),'EUR42.50');assert.equal(values.get(7),1.25);assert.equal(values.get(2),'2032-02-29');
    assert.deepEqual(values.get(9),[11,12]);
  });
  await t.test('invalid selected value aborts the whole batch and late changes are rechecked',async()=>{
    let f=await fixture();f.request.fields.push({field:2,value:'2031-02-30'});
    let count=patches;await assert.rejects(save(f.request),error=>error.status===400);assert.equal(patches,count);
    f=await fixture();definitions.set(9,{id:9,name:'Links',data_type:'documentlink'});
    const unsupported=await previewCustomFields(service,f.id,f.document.content,[{field_name:'Links',value:'123'}]);
    f.request={documentId:f.id,snapshotDigest:unsupported.snapshotDigest,reviewFieldIds:unsupported.reviewFieldIds,fields:[{field:9,value:'123'}]};
    count=patches;await assert.rejects(save(f.request),error=>error.status===400);assert.equal(patches,count,'unsupported selected types cannot PATCH');
    f=await fixture();onDefinition=async()=>{documents.get(f.id).content='Changed while fetching definitions';};
    count=patches;await assert.rejects(save(f.request),error=>error.status===409);assert.equal(patches,count);
    assert.equal(engine.inFlight.has(f.id),false);
  });
  await t.test('local writes exclude each other and native workflow changes stay unknown',async()=>{
    let f=await fixture('automatic');let release,reached;
    const hold=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{reached=resolve;});
    onDefinition=async()=>{reached();await hold;};const pending=save(f.request);await started;
    await assert.rejects(save(f.request),error=>error.status===409);release();await pending;
    f=await fixture('automatic');onPatch=async doc=>{doc.title='Native workflow title';};await save(f.request);
    const event=store.list().find(row=>row.document_id===f.id);assert.equal(event.source,'unknown');assert.equal(event.status,'pending');
    assert.equal(store.examples().some(row=>row.document_id===f.id),false);
  });
  await t.test('authenticated HTTP contract rejects bad requests and never retries an ambiguous write',async()=>{
    const express=require('express'),{authenticateJWT}=require('../routes/auth'),{sameOriginJSON}=require('../routes/learning');
    process.env.API_KEY='isolated-field-review-key';
    const marked=[];let markerSucceeds=true;
    const model={async addProcessedDocument(id){marked.push(id);return markerSucceeds;}};
    const app=express();app.use(express.json(),require('cookie-parser')());app.post('/apply',authenticateJWT,sameOriginJSON,createCustomFieldApplyHandler(service,model));
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    try{
      const url=`http://127.0.0.1:${server.address().port}/apply`;
      const post=(body,extra={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':'isolated-field-review-key',...extra},body:JSON.stringify(body)});
      assert.equal((await fetch(url,{method:'POST'})).status,401);
      let f=await fixture();assert.equal((await post(f.request,{Origin:'https://untrusted.example'})).status,403);
      assert.equal((await post({...f.request,fields:[]})).status,400);
      let response=await post(f.request);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.deepEqual(marked,[f.id],'new route retains the existing Manual processing marker');
      assert.equal(store.list().find(row=>row.document_id===f.id).source,'confirmed_ui');
      f=await fixture('automatic');
      const jwt=require('jsonwebtoken').sign({id:42},process.env.JWT_SECRET||'your-secret-key');
      response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`jwt=${jwt}`},body:JSON.stringify(f.request)});
      assert.equal(response.status,200);assert.equal(store.history(f.id)[0].actor,'user:42');
      f=await fixture();markerSucceeds=false;
      response=await post(f.request);assert.equal(response.status,502);assert.equal((await response.json()).outcome,'unknown');
      assert.equal(documents.get(f.id).custom_fields[0].value,'NEW-42','native write must not be called unwritten when later local tracking fails');
      markerSucceeds=true;
      f=await fixture();let count=patches;onDefinition=async()=>{throw new Error('isolated backend outage');};
      response=await post(f.request);assert.equal(response.status,502);assert.equal((await response.json()).outcome,'not_written');assert.equal(patches,count);
      f=await fixture();count=patches;onPatch=async doc=>{documents.set(f.id,doc);throw new Error('isolated response lost after native save');};
      response=await post(f.request);assert.equal(response.status,502);assert.equal((await response.json()).outcome,'unknown');
      assert.equal(patches,count+1);assert.equal(documents.get(f.id).custom_fields[0].value,'NEW-42');assert.equal(engine.inFlight.has(f.id),false);
      response=await post(f.request);assert.equal(response.status,409);assert.equal(patches,count+1,'no second PATCH after fresh-state conflict');
    }finally{server.closeAllConnections();server.close();}
  });
});
