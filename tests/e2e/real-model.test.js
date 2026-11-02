'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('dotenv').config({path:'data/.env'});
const corpus = require('./generate').corpus();
const origin = 'http://ai:3000/api/learning';
const modelOrigin = 'http://real-model:11434';
const key = {'Content-Type':'application/json','x-api-key':'isolated-test-api-key'};
async function learning(path,body) {
  const response=await fetch(origin+path,{headers:key,...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  assert.ok(response.ok,`${path}: ${response.status}`);return response.json();
}
async function paperless(path,body,method) {
  assert.equal(process.env.PAPERLESS_API_URL,'http://paperless:8000/api');
  const response=await fetch(process.env.PAPERLESS_API_URL+path,{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{method:method || (body instanceof FormData?'POST':'PATCH'),body:body instanceof FormData?body:JSON.stringify(body)})});
  assert.ok(response.ok,`${path}: ${response.status}`);return response.json();
}

test('real local model classifies held-out English/German documents before and after review', {timeout:900000}, async () => {
  fs.mkdirSync('logs',{recursive:true});
  const previous=await learning('/settings');
  const createdEvents=[];
  const heldOutIds=new Map();
  const service=require('../../services/ollamaService');
  service.apiUrl=modelOrigin;service.model='qwen2.5:0.5b';
  const context=require('../../services/serviceUtils').buildLearningContext;
  const tags=await (await fetch(modelOrigin+'/api/tags')).json();
  const model=tags.models.find(row=>row.name===service.model);assert.ok(model,'real downloaded model is available');
  let inferenceCount=0;
  let contextSent=false;
  service.client.interceptors.response.use(response=>{
    assert.equal(new URL(response.config.url).origin,modelOrigin,'inference uses only the isolated local model');
    assert.ok(response.data.eval_count>0,'actual generated tokens, not a protocol fixture');
    const generated=JSON.parse(response.data.response);
    assert.equal(typeof generated.title,'string');assert.equal(typeof generated.document_type,'string');
    assert.ok(Array.isArray(generated.tags),'model returned schema-constrained JSON');
    const sent=typeof response.config.data==='string'?JSON.parse(response.config.data):response.config.data;
    contextSent=sent.system.includes('Reference classification data');
    inferenceCount++;return response;
  });
  const labels=[...new Set(corpus.map(row=>row.expected.document_type))];
  const prompt=`Classify the document. Choose document_type from: ${labels.join(', ')}. Use a concise title, the sender as correspondent, language en or de and relevant tags. Return JSON only.`;
  const evaluate=async phase=>{
    const rows=[];
    for(const fixture of corpus) {
      const started=Date.now();
      const result=await service.analyzeDocument(fixture.content,[],[],[],heldOutIds.get(fixture.name),prompt);
      assert.equal(result.error,undefined,`${phase}/${fixture.name}: inference succeeded`);
      assert.ok(Array.isArray(result.document.tags));
      rows.push({name:fixture.name,expected:fixture.expected,actual:result.document,durationMs:Date.now()-started,
        complete:Boolean(result.document.title && result.document.document_type),
        typeCorrect:result.document.document_type.toLowerCase()===fixture.expected.document_type.toLowerCase(),
        languageCorrect:result.document.language===fixture.expected.language,
        learningContextPresent:contextSent});
    }
    return rows;
  };
  try {
    await learning('/settings',{mode:'disabled',enabled:false,stabilizationMs:0});
    for(const fixture of corpus) {
      const name=`model-heldout-${Date.now()}-${fixture.name}`;
      const form=new FormData();form.set('document',new Blob([fixture.content],{type:'text/plain'}),name);
      await paperless('/documents/post_document/',form);
      let document;
      for(let attempt=0;attempt<90;attempt++) {
        document=(await paperless('/documents/?ordering=-id')).results.find(row=>row.original_file_name===name);
        if(document) break;
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      assert.ok(document,'held-out document ingested separately from learning references');
      heldOutIds.set(fixture.name,document.id);
    }
    assert.equal(await context(corpus[0].content),'','disabled baseline excludes learning');
    const baseline=await evaluate('baseline');
    await learning('/settings',{mode:'manual',enabled:false,stabilizationMs:0});
    for(const [index,label] of labels.entries()) {
      let type=(await paperless('/document_types/?page_size=100')).results.find(row=>row.name===label);
      if(!type) type=await paperless('/document_types/',{name:label},'POST');
      const name=`model-training-${Date.now()}-${index}.txt`;
      const form=new FormData();
      form.set('document',new Blob([`Fictional training sender. ${label}. Synthetic training reference, amount EUR 17. Not an evaluation document.`],{type:'text/plain'}),name);
      await paperless('/documents/post_document/',form);
      let document;
      for(let attempt=0;attempt<90;attempt++) {
        document=(await paperless('/documents/?ordering=-id')).results.find(row=>row.original_file_name===name);
        if(document) break;
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      assert.ok(document);await learning('/scan',{});
      await paperless(`/documents/${document.id}/`,{title:`Verified ${label} reference`,document_type:type.id});
      await learning('/scan',{});
      const event=(await learning(`/events?status=pending&q=${document.id}`)).events.find(row=>row.document_id===document.id);
      assert.ok(event);await learning(`/events/${event.id}/review`,{decision:'confirmed'});createdEvents.push(event.id);
    }
    const reviewed=await evaluate('reviewed');
    assert.ok(reviewed.every(row=>row.learningContextPresent),'reviewed examples reach every held-out prompt');
    assert.equal(inferenceCount,20);
    assert.ok(baseline.some(row=>row.complete) && reviewed.some(row=>row.complete),'both phases produced complete real classifications');
    const summarize=rows=>({documents:rows.length,complete:rows.filter(row=>row.complete).length,typeCorrect:rows.filter(row=>row.typeCorrect).length,languageCorrect:rows.filter(row=>row.languageCorrect).length});
    const report={model:model.name,digest:model.digest,ollamaVersion:(await (await fetch(modelOrigin+'/api/version')).json()).version,
      baseline:summarize(baseline),reviewed:summarize(reviewed),results:{baseline,reviewed},
      limits:'Small local CPU model, ten synthetic held-out documents; descriptive quality measurements, no guaranteed improvement or hosted-provider quality claim.'};
    fs.writeFileSync('/app/data/real-model-evaluation.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({model:report.model,baseline:report.baseline,reviewed:report.reviewed}));
  } finally {
    for(const id of createdEvents) await learning(`/events/${id}/review`,{decision:'deleted'});
    await learning('/settings',previous);
  }
});
