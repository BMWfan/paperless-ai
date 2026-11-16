'use strict';
// Replay archived accepted field values only; never generate, repair or train.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('dotenv').config({path:'data/.env'});
assert.equal(process.env.PAPERLESS_API_URL,'http://paperless:8000/api');
const {load,hash}=require('./core'),{aggregate,bytes}=require('./report');
const {buildCustomFieldUpdates}=require('../../services/customFieldUpdates');
const fieldTypes={invoice_number:'string',contract_number:'string',policy_number:'string',amount:'monetary',due_date:'date',end_date:'date'};
const {wrapSyntheticText}=require('../context-projection/ingestion');
// Dependency-only smoke check; deliberately performs no native I/O or inference.
if(process.env.IDENTIFIER_ROLES_REPLAY_PREFLIGHT==='1'){
  assert.equal(typeof wrapSyntheticText,'function');assert.equal(typeof buildCustomFieldUpdates,'function');
  console.log('IDENTIFIER_ROLES_REPLAY_DEPENDENCIES_OK');process.exit(0);
}
const directory=path.join(__dirname,'archive');
const archive=require('./artifact-sources.json');
for(const [name,digest]of Object.entries(archive.files)){assert.equal(hash(fs.readFileSync(path.join(directory,name))),digest);assert.equal(hash(bytes(path.join(directory,name))),archive.decodedSHA256[name]);}
const qualification=aggregate(directory),{cases}=load();
const result={commit:process.env.GITHUB_SHA||null,sourceRun:archive.sourceRun,attempts:0,typedAssignments:0,unrelatedPreserved:0,documents:0,qualification:qualification.qualification,qualifiedForLaterProposal:qualification.qualifiedForLaterProposal,productionActivation:false};
async function api(route,body,method='PATCH'){
  const response=await fetch(process.env.PAPERLESS_API_URL+route,{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{method,body:body instanceof FormData?body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,`${route}: HTTP${response.status}`);return response.status===204?null:response.json();
}
async function examples(){const response=await fetch('http://ai:3000/api/learning/examples',{headers:{'x-api-key':'isolated-test-api-key'}});assert.ok(response.ok);return response.json();}
(async()=>{
  const before=await examples();assert.equal(before.examples.filter(row=>row.active).length,0);
  const definitions={};
  for(const [name,data_type]of Object.entries({...fieldTypes,roles_unrelated:'string'}))definitions[name]=await api('/custom_fields/',{name,data_type},'POST');
  const documents=new Map();
  for(const fixture of cases.filter(row=>row.split!=='training')){
    const filename=`synthetic-identifier-roles-${fixture.id}.txt`,form=new FormData();form.set('document',new Blob([wrapSyntheticText(fixture.content)],{type:'text/plain'}),filename);
    const task=await api('/documents/post_document/',form,'POST');let document;
    for(let attempt=0;attempt<90;attempt++){
      document=(await api('/documents/?ordering=-id&page_size=100')).results.find(row=>row.original_file_name===filename);if(document)break;
      const taskRows=await api('/tasks/');const state=(Array.isArray(taskRows)?taskRows:taskRows.results).find(row=>row.task_id===task);
      assert.notEqual(state?.status,'failure',`Synthetic ingestion ${fixture.id}: ${state?.result_data?.error_message||'native task failed'}`);
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(document,`Synthetic ingestion: ${fixture.id}`);documents.set(fixture.id,document.id);result.documents++;
  }
  for(const name of Object.keys(archive.files).filter(name=>name.startsWith('identifier-roles-'))){
    const report=JSON.parse(bytes(path.join(directory,name)));
    for(const row of report.rows){
      const id=documents.get(row.id);assert.ok(id);
      await api(`/documents/${id}/`,{custom_fields:[{field:definitions.roles_unrelated.id,value:'preserve unrelated'},{field:definitions.amount.id,value:'EUR12.30'},{field:definitions.due_date.id,value:'2035-03-04'},{field:definitions.end_date.id,value:'2036-05-06'}]});
      const before=await api(`/documents/${id}/`);
      const suggestions=Object.fromEntries(Object.entries(row.validation.accepted).map(([field,value])=>[field,{field_name:field,value}]));
      const patch=await buildCustomFieldUpdates({findExistingCustomField:async field=>definitions[field],getExistingCustomFields:async()=> (await api(`/documents/${id}/`)).custom_fields},id,suggestions);
      if(patch.length)await api(`/documents/${id}/`,{custom_fields:patch});
      const after=await api(`/documents/${id}/`);
      for(const [field,value]of Object.entries(row.validation.accepted)){assert.deepEqual(after.custom_fields.find(item=>item.field===definitions[field].id)?.value,value);result.typedAssignments++;}
      for(const field of ['title','tags','correspondent','document_type'])assert.deepEqual(after[field],before[field]);
      for(const field of ['roles_unrelated','amount','due_date','end_date'])assert.deepEqual(after.custom_fields.find(item=>item.field===definitions[field].id)?.value,before.custom_fields.find(item=>item.field===definitions[field].id)?.value);result.unrelatedPreserved++;result.attempts++;
    }
  }
  assert.equal(result.attempts,180);assert.equal(result.documents,60);assert.equal(result.unrelatedPreserved,180);assert.equal((await examples()).examples.filter(row=>row.active).length,0,'predictions never train the fixture');
  fs.writeFileSync('/app/data/identifier-roles-replay.json',JSON.stringify(result,null,2)+'\n');console.log('IDENTIFIER_ROLES_REPLAY',JSON.stringify(result));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
