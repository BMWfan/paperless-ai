'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const os = require('node:os');
require('dotenv').config({path:'data/.env'});
const corpus = require('./generate').corpus();
const origin = 'http://ai:3000/api/learning';
const modelOrigin = 'http://real-model:11434';
const key = {'Content-Type':'application/json','x-api-key':'isolated-test-api-key'};
const fields = ['document_type', 'tags', 'correspondent', 'language'];
const seed = 42;

function score(value, expected) {
  const normalize = input => typeof input === 'string' ? input.normalize('NFC').trim().toLowerCase() : '';
  if (Array.isArray(expected)) {
    if (!Array.isArray(value)) return 'missing';
    const actual = [...new Set(value.map(normalize).filter(Boolean))].sort();
    if (!actual.length) return 'missing';
    return JSON.stringify(actual) === JSON.stringify(expected.map(normalize).sort()) ? 'correct' : 'wrong';
  }
  if (!normalize(value)) return 'missing';
  return normalize(value) === normalize(expected) ? 'correct' : 'wrong';
}
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
  assert.ok(!(await learning('/examples')).examples.some(row=>row.active || row.legacy),
    'quality evaluation requires a fresh synthetic test stack');
  const createdEvents=[];
  const heldOutIds=new Map();
  const service=require('../../services/ollamaService');
  service.apiUrl=modelOrigin;service.model='qwen2.5:0.5b';
  const context=require('../../services/serviceUtils').buildLearningContext;
  const tags=await (await fetch(modelOrigin+'/api/tags')).json();
  const model=tags.models.find(row=>row.name===service.model);assert.ok(model,'real downloaded model is available');
  let inferenceCount=0;
  let contextSent=false;
  let generationOptions;
  service.client.interceptors.request.use(config=>{
    config.data.options.seed=seed;
    return config;
  });
  service.client.interceptors.response.use(response=>{
    assert.equal(new URL(response.config.url).origin,modelOrigin,'inference uses only the isolated local model');
    assert.ok(response.data.eval_count>0,'actual generated tokens, not a protocol fixture');
    const generated=JSON.parse(response.data.response);
    assert.equal(typeof generated.title,'string');assert.equal(typeof generated.document_type,'string');
    assert.ok(Array.isArray(generated.tags),'model returned schema-constrained JSON');
    const sent=typeof response.config.data==='string'?JSON.parse(response.config.data):response.config.data;
    assert.equal(sent.options.seed,seed);
    generationOptions=sent.options;
    contextSent=sent.system.includes('Reference classification data');
    inferenceCount++;return response;
  });
  const labels=[...new Set(corpus.map(row=>row.expected.document_type))];
  const allowedTags=[...new Set(corpus.flatMap(row=>row.expected.tags))];
  const training=labels.map(label=>({label, content:`Fictional training sender. ${label}. Synthetic training reference, amount EUR 17. Not an evaluation document.`}));
  const prompt=`Classify the document. Choose document_type from: ${labels.join(', ')}. Choose relevant tags from: ${allowedTags.join(', ')}. Use a concise title, the sender as correspondent and language en or de. Return JSON only.`;
  const evaluate=async phase=>{
    const rows=[];
    for(const fixture of corpus) {
      const started=Date.now();
      const result=await service.analyzeDocument(fixture.content,[],[],[],heldOutIds.get(fixture.name),prompt);
      assert.equal(result.error,undefined,`${phase}/${fixture.name}: inference succeeded`);
      assert.ok(Array.isArray(result.document.tags));
      rows.push({name:fixture.name,expected:fixture.expected,actual:result.document,durationMs:Date.now()-started,
        complete:Boolean(result.document.title && result.document.document_type),
        fields:Object.fromEntries(fields.map(field=>[field,score(result.document[field],fixture.expected[field])])),
        generationOptions,
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
    assert.ok(baseline.every(row=>!row.learningContextPresent),'baseline prompts contain no references');
    await learning('/settings',{mode:'manual',enabled:false,stabilizationMs:0});
    for(const [index,{label,content}] of training.entries()) {
      let type=(await paperless('/document_types/?page_size=100')).results.find(row=>row.name===label);
      if(!type) type=await paperless('/document_types/',{name:label},'POST');
      const name=`model-training-${Date.now()}-${index}.txt`;
      const form=new FormData();
      form.set('document',new Blob([content],{type:'text/plain'}),name);
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
    assert.equal(inferenceCount,corpus.length*2);
    const summarize=rows=>({
      documents:rows.length,
      complete:rows.filter(row=>row.complete).length,
      totalDurationMs:rows.reduce((total,row)=>total+row.durationMs,0),
      fields:Object.fromEntries(fields.map(field=>[field,Object.fromEntries(
        ['correct','wrong','missing'].map(status=>[status,rows.filter(row=>row.fields[field]===status).length])
      )]))
    });
    const report={model:model.name,digest:model.digest,ollamaVersion:(await (await fetch(modelOrigin+'/api/version')).json()).version,
      commit:process.env.GITHUB_SHA || null,
      corpusDigest:createHash('sha256').update(JSON.stringify({corpus,training})).digest('hex'),
      environment:{platform:os.platform(),architecture:os.arch(),parallelism:os.availableParallelism()},
      prompt,generationOptions,
      baseline:summarize(baseline),reviewed:summarize(reviewed),results:{baseline,reviewed},
      limits:'Small local CPU model, ten synthetic held-out documents; descriptive quality measurements, no guaranteed improvement or hosted-provider quality claim.'};
    fs.writeFileSync('/app/data/real-model-evaluation.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({model:report.model,baseline:report.baseline,reviewed:report.reviewed}));
  } finally {
    for(const id of createdEvents) await learning(`/events/${id}/review`,{decision:'deleted'});
    await learning('/settings',previous);
  }
});
