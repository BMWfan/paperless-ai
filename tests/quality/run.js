'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const {createHash}=require('node:crypto');
require('dotenv').config({path:'data/.env'});
const {corpus,fieldTypes,revision}=require('./corpus');
const {schema,system,revision:protocolRevision}=require('./protocol');
const {evaluate}=require('./scoring');const {selectContext}=require('../../services/learningContext');
const {relevantContext}=require('../../services/learningRelevance');
const {buildCustomFieldUpdates}=require('../../services/customFieldUpdates');
assert.equal(process.env.PAPERLESS_API_URL,'http://paperless:8000/api');
const model=process.env.QUALITY_MODEL;assert.ok(['qwen2.5:0.5b','qwen2.5:1.5b'].includes(model));
const seed=Number(process.env.QUALITY_SEED||42);assert.ok([42,43].includes(seed));
const splits=(process.env.QUALITY_SPLITS||'evaluation,confirmation').split(',');assert.ok(splits.every(s=>['evaluation','confirmation'].includes(s)));
const origin='http://quality-model:11434';const json={'Content-Type':'application/json'};const createdEvents=[];
const report={complete:false,model,seed,commit:process.env.GITHUB_SHA||null,corpusRevision:revision,protocolRevision,
  corpusDigest:createHash('sha256').update(JSON.stringify(['training','evaluation','confirmation'].map(corpus))).digest('hex'),
  environment:{platform:os.platform(),architecture:os.arch(),parallelism:os.availableParallelism()},system,schema,rows:[],integration:{fieldWrites:0,unrelatedPreserved:0},
  limits:'Synthetic controlled protocol via actual Ollama adapter; not the historical production prompt or a hosted-provider quality claim. Raw model errors remain errors even if source support rejects them. Source presence does not prove the semantic field. Experimental selector not enabled in production.'};
async function api(path,body,method='POST'){
  const r=await fetch(`http://paperless:8000/api${path}`,{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`,...(body instanceof FormData?{}:json)},...(body===undefined?{}:{method,body:body instanceof FormData?body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
  assert.ok(r.ok,`${path}: ${r.status}`);return r.status===204?null:r.json();
}
async function learning(path,body){const r=await fetch('http://ai:3000/api/learning'+path,{headers:{...json,'x-api-key':'isolated-test-api-key'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});assert.ok(r.ok,`${path}: ${r.status}`);return r.json();}
async function upload(fixture){
  const filename=`quality-${fixture.id}.txt`;const form=new FormData();form.set('document',new Blob([fixture.content],{type:'text/plain'}),filename);
  await api('/documents/post_document/',form);
  for(let i=0;i<90;i++){const doc=(await api('/documents/?ordering=-id&page_size=100')).results.find(d=>d.original_file_name===filename);if(doc)return doc;await new Promise(r=>setTimeout(r,1000));}
  throw new Error('Synthetic ingestion timed out');
}
function summary(rows){
  const result={documents:rows.length,totalDurationMs:rows.reduce((s,r)=>s+r.durationMs,0),raw:{},sourceSupported:{},expectedPresent:{},errors:{}};
  for(const field of Object.keys(rows[0]?.scores.fields||{}))result.raw[field]=Object.fromEntries(['correct','wrong','missing'].map(status=>[status,rows.filter(r=>r.scores.fields[field]===status).length]));
  for(const field of Object.keys(fieldTypes)){
    const present=rows.filter(r=>r.expected.custom_fields[field]!==null);
    result.expectedPresent[field]={present:present.length,absent:rows.length-present.length,rawCorrect:present.filter(r=>r.scores.fields[field]==='correct').length,sourceSupportedCorrect:present.filter(r=>r.scores.sourceSupported[field]==='correct').length,falseFilledWhenAbsent:rows.filter(r=>r.expected.custom_fields[field]===null&&r.scores.fields[field]==='wrong').length};
    result.sourceSupported[field]=Object.fromEntries(['correct','wrong','missing'].map(status=>[status,rows.filter(r=>r.scores.sourceSupported[field]===status).length]));
    result.errors[field]={};for(const row of rows){const error=row.scores.errors[field];if(error)result.errors[field][error]=(result.errors[field][error]||0)+1;}
  }
  return result;
}
(async()=>{
  fs.mkdirSync('logs',{recursive:true});const original=await learning('/settings');
  try{
    assert.ok(!(await learning('/examples')).examples.some(e=>e.active),'requires fresh isolated quality project');
    await learning('/settings',{enabled:false,mode:'manual',stabilizationMs:0});
    const models=await (await fetch(origin+'/api/tags')).json();const actual=models.models.find(r=>r.name===model);assert.ok(actual?.digest);
    report.modelDigest=actual.digest;report.ollamaVersion=(await (await fetch(origin+'/api/version')).json()).version;
    console.log('QUALITY_MODEL',JSON.stringify({model,digest:actual.digest,seed}));
    const definitions={};for(const [name,data_type]of Object.entries({...fieldTypes,quality_unrelated:'string'}))definitions[name]=await api('/custom_fields/',{name,data_type});
    const train=corpus('training');const refs=[];
    for(const fixture of train){
      const doc=await upload(fixture);await learning('/scan',{});
      const typeRows=(await api('/document_types/?page_size=100')).results;
      const type=typeRows.find(r=>r.name===fixture.expected.document_type)||await api('/document_types/',{name:fixture.expected.document_type,matching_algorithm:0});
      const tagRows=(await api('/tags/?page_size=100')).results;
      const tag=tagRows.find(r=>r.name===fixture.kind)||await api('/tags/',{name:fixture.kind,matching_algorithm:0});
      const sender=await api('/correspondents/',{name:fixture.expected.correspondent,matching_algorithm:0});
      const fields=Object.entries(fixture.expected.custom_fields).filter(([,v])=>v!==null).map(([key,value])=>({field:definitions[key].id,value}));
      await api(`/documents/${doc.id}/`,{title:`Reviewed ${fixture.kind} ${fixture.language}`,document_type:type.id,tags:[tag.id],correspondent:sender.id,custom_fields:fields},'PATCH');
      await learning('/scan',{});
      const event=(await learning(`/events?status=pending&q=${doc.id}`)).events.find(e=>e.document_id===doc.id);assert.ok(event);await learning(`/events/${event.id}/review`,{decision:'confirmed'});createdEvents.push(event.id);
      const stored=(await learning('/examples')).examples.find(e=>e.document_id===doc.id&&e.active);assert.ok(stored,'only actually reviewed examples enter retrieval');
      refs.push({id:fixture.id,document_id:doc.id,metadata:{...stored.metadata,document_type:type.name,tags:[tag.name],correspondent:sender.name,
        custom_fields:Object.fromEntries(Object.entries(fieldTypes).map(([name])=>[name,stored.metadata.custom_fields.find(f=>f.field===definitions[name].id)?.value??null]))},content_preview:stored.content_preview});
    }
    const service=Object.create(require('../../services/ollamaService'));service.apiUrl=origin;service.model=model;
    // Fresh client avoids changing the shared singleton or production settings.
    service.client=require('axios').create({timeout:300000});
    service.client.interceptors.request.use(config=>{config.data.options={...config.data.options,seed,temperature:0,num_predict:512};report.generationOptions=config.data.options;return config;});
    const {get_encoding}=require('tiktoken');const encoding=get_encoding('cl100k_base');
    try{
      for(const split of splits){
        const fixtures=corpus(split);const docs=new Map();
        for(const fixture of fixtures){const doc=await upload(fixture);await api(`/documents/${doc.id}/`,{custom_fields:[{field:definitions.quality_unrelated.id,value:'preserve unrelated'}]},'PATCH');docs.set(fixture.id,doc);}
        for(const arm of ['none','current','selective'])for(const fixture of fixtures){
          const selected=arm==='selective'?relevantContext(fixture.content,refs):{context:arm==='current'?selectContext(fixture.content,refs):'',selected:[]};
          if(arm==='current'&&selected.context){const records=JSON.parse(selected.context.slice(selected.context.indexOf('[{')));selected.selected=records.map(record=>({id:refs.find(r=>r.metadata.correspondent===record.metadata.correspondent)?.id}));}
          const started=Date.now();const response=await service._callOllamaAPI(`CURRENT DOCUMENT:\n${fixture.content}`,system+selected.context,4096,schema);
          assert.ok(response.eval_count>0,'real inference tokens');const actual=JSON.parse(response.response);
          assert.ok(schema.properties.document_type.enum.includes(actual.document_type));assert.ok(Array.isArray(actual.tags));
          const scores=evaluate(actual,fixture,train);
          const row={split,arm,id:fixture.id,expected:fixture.expected,actual,durationMs:Date.now()-started,scores,
            contextTokens:encoding.encode(selected.context).length,promptTokens:response.prompt_eval_count,generatedTokens:response.eval_count,
            selected:selected.selected.map(item=>({...item,relevant:train.find(r=>r.id===item.id)?.kind===fixture.kind}))};
          report.rows.push(row);
          const doc=docs.get(fixture.id);
          const suggestions=Object.fromEntries(Object.entries(require('./scoring').supportedFields(fixture.content,actual.custom_fields).supported).map(([field,value])=>[field,{field_name:field,value}]));
          const patch=await buildCustomFieldUpdates({findExistingCustomField:async name=>definitions[name],getExistingCustomFields:async()=> (await api(`/documents/${doc.id}/`)).custom_fields},doc.id,suggestions);
          if(patch.length){await api(`/documents/${doc.id}/`,{custom_fields:patch},'PATCH');const after=await api(`/documents/${doc.id}/`);
            for(const field of patch)assert.deepEqual(after.custom_fields.find(f=>f.field===field.field)?.value,field.value,'actual typed API roundtrip');
            assert.equal(after.custom_fields.find(f=>f.field===definitions.quality_unrelated.id)?.value,'preserve unrelated');
            report.integration.fieldWrites+=Object.keys(suggestions).length;report.integration.unrelatedPreserved++;
          }
          console.log('QUALITY_CASE',JSON.stringify({split,arm,id:fixture.id,fields:scores.fields,errors:scores.errors}));
        }
        assert.ok((await learning('/examples')).examples.filter(e=>e.active).every(e=>refs.some(r=>r.document_id===e.document_id)),'evaluation predictions never train retrieval');
      }
    }finally{encoding.free();}
    report.summary=Object.fromEntries(splits.map(split=>[split,Object.fromEntries(['none','current','selective'].map(arm=>[arm,summary(report.rows.filter(r=>r.split===split&&r.arm===arm))]))]));
    report.complete=true;console.log('QUALITY_SUMMARY',JSON.stringify({model,seed,summary:report.summary,integration:report.integration}));
  }catch(error){report.error=error.message;throw error;}
  finally{fs.writeFileSync('/app/data/learning-quality.json',JSON.stringify(report,null,2)+'\n');for(const id of createdEvents)await learning(`/events/${id}/review`,{decision:'deleted'});await learning('/settings',original);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
