'use strict';
// Replays immutable raw model answers through the current typed boundary.
// It never calls a model, alters raw predictions or uses expected answers to choose values.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
require('dotenv').config({path:'data/.env'});
const {corpus,fieldTypes}=require('./corpus');const {evaluate,score,supportedFields}=require('./scoring');
const {normalizeValue,buildCustomFieldUpdates}=require('../../services/customFieldUpdates');
const root=process.argv[2];if(!root)throw new Error('Provide immutable report directory');
assert.equal(process.env.PAPERLESS_API_URL,'http://paperless:8000/api');
const json={'Content-Type':'application/json'};const docs=new Map();
const expectedDigest=createHash('sha256').update(JSON.stringify(['training','evaluation','confirmation'].map(corpus))).digest('hex');
const fixtures=new Map(['evaluation','confirmation'].flatMap(corpus).map(row=>[row.id,row]));
const replay={commit:process.env.GITHUB_SHA||null,sourceRun:43118154733,corpusDigest:expectedDigest,reports:[],typedWrites:0,unrelatedPreserved:0};
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?files(path.join(dir,row.name)):[path.join(dir,row.name)]);}
async function api(url,body,method='POST'){
  const response=await fetch(`http://paperless:8000/api${url}`,{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`,...(body instanceof FormData?{}:json)},...(body===undefined?{}:{method,body:body instanceof FormData?body:JSON.stringify(body)})});
  assert.ok(response.ok,`${url}: ${response.status}`);return response.json();
}
async function document(fixture,unrelated){
  if(docs.has(fixture.id))return docs.get(fixture.id);
  const name=`replay-${fixture.id}.txt`,form=new FormData();form.set('document',new Blob([fixture.content],{type:'text/plain'}),name);await api('/documents/post_document/',form);
  for(let i=0;i<90;i++){
    const found=(await api('/documents/?page_size=100&ordering=-id')).results.find(d=>d.original_file_name===name);
    if(found){await api(`/documents/${found.id}/`,{custom_fields:[{field:unrelated.id,value:'preserve replay metadata'}]},'PATCH');docs.set(fixture.id,found);return found;}
    await new Promise(r=>setTimeout(r,1000));
  }throw new Error('Replay ingestion timed out');
}
(async()=>{
  const defs={};for(const [name,data_type]of Object.entries({...fieldTypes,replay_unrelated:'string'}))defs[name]=await api('/custom_fields/',{name,data_type});
  for(const file of files(root).filter(f=>f.endsWith('.json'))){
    const original=JSON.parse(fs.readFileSync(file,'utf8'));if(!original.rows)continue;
    assert.equal(original.complete,true);assert.equal(original.corpusDigest,expectedDigest,'do not replay against changed ground truth');
    console.log('QUALITY_ARCHIVE_HEADER',JSON.stringify({model:original.model,seed:original.seed,modelDigest:original.modelDigest,commit:original.commit,complete:original.complete,corpusDigest:original.corpusDigest,protocolRevision:original.protocolRevision,system:original.system,schema:original.schema,generationOptions:original.generationOptions,environment:original.environment}));
    const result={model:original.model,modelDigest:original.modelDigest,seed:original.seed,sourceCommit:original.commit,groups:{},cases:[]};
    for(const row of original.rows){
      console.log('QUALITY_ARCHIVE_ROW',JSON.stringify({model:original.model,seed:original.seed,row:{id:row.id,split:row.split,arm:row.arm,actual:row.actual,scores:{fields:row.scores.fields,errors:row.scores.errors},durationMs:row.durationMs,selected:row.selected,contextTokens:row.contextTokens,promptTokens:row.promptTokens,generatedTokens:row.generatedTokens}}));
      const fixture=fixtures.get(row.id);assert.ok(fixture);if(row.expected)assert.deepEqual(row.expected,fixture.expected);
      // A scoring bug/change cannot silently rewrite the original raw evaluation.
      assert.deepEqual(evaluate(row.actual,fixture,corpus('training')).fields,row.scores.fields);
      const values=Object.fromEntries(Object.entries(fieldTypes).map(([name,data_type])=>[name,normalizeValue(row.actual.custom_fields?.[name],{data_type})]));
      const supported=supportedFields(fixture.content,values).supported;
      const groupKey=`${row.split}/${row.arm}`;
      const group=result.groups[groupKey]||(result.groups[groupKey]={documents:0,amount:{present:0,rawCorrect:0,normalizedCorrect:0,supportedCorrect:0,rejected:0},rawCriticalIdentifierErrors:0});group.documents++;
      if(fixture.expected.custom_fields.amount!==null){group.amount.present++;if(row.scores.fields.amount==='correct')group.amount.rawCorrect++;if(score(values.amount,fixture.expected.custom_fields.amount)==='correct')group.amount.normalizedCorrect++;if(score(supported.amount,fixture.expected.custom_fields.amount)==='correct')group.amount.supportedCorrect++;}
      if(row.actual.custom_fields?.amount!=null&&supported.amount===undefined)group.amount.rejected++;
      for(const name of ['invoice_number','contract_number','policy_number'])if(['training_value_copy','historical_value_copy','invented_absent_value'].includes(row.scores.errors[name]))group.rawCriticalIdentifierErrors++;
      const doc=await document(fixture,defs.replay_unrelated);
      const suggestions=Object.fromEntries(Object.entries(supported).map(([name,value])=>[name,{field_name:name,value}]));
      const updates=await buildCustomFieldUpdates({findExistingCustomField:async name=>defs[name],getExistingCustomFields:async()=> (await api(`/documents/${doc.id}/`)).custom_fields},doc.id,suggestions);
      if(updates.length){await api(`/documents/${doc.id}/`,{custom_fields:updates},'PATCH');const after=await api(`/documents/${doc.id}/`);
        for(const value of updates)assert.deepEqual(after.custom_fields.find(v=>v.field===value.field)?.value,value.value);
        assert.equal(after.custom_fields.find(v=>v.field===defs.replay_unrelated.id)?.value,'preserve replay metadata');replay.typedWrites+=Object.keys(suggestions).length;replay.unrelatedPreserved++;}
      result.cases.push({id:row.id,split:row.split,arm:row.arm,raw:row.actual.custom_fields,normalized:values,supported});
    }
    replay.reports.push(result);console.log('QUALITY_REPLAY_SUMMARY',JSON.stringify({...result,cases:undefined}));
  }
  assert.equal(replay.reports.length,4,'all original model/seed reports required');
  fs.writeFileSync('/app/data/quality-replay.json',JSON.stringify(replay,null,2)+'\n');console.log('QUALITY_REPLAY_INTEGRATION',JSON.stringify({typedWrites:replay.typedWrites,unrelatedPreserved:replay.unrelatedPreserved}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
