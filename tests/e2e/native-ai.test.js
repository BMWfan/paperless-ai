'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('dotenv').config({path:'data/.env'});
assert.equal(process.env.PAPERLESS_API_URL,'http://paperless:8000/api');
const json={'Content-Type':'application/json'};
const report={commit:process.env.GITHUB_SHA||null,profiles:[],limits:'Synthetic isolated compatibility/provenance experiment; no model accuracy or external PATCH atomicity claim.'};
async function api(path,body,method='POST') {
  const response=await fetch(`http://paperless:8000/api${path}`,{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`,...(body instanceof FormData?{}:json)},
    ...(body===undefined?{}:{method,body:body instanceof FormData?body:JSON.stringify(body)}),signal:AbortSignal.timeout(300000)});
  assert.ok(response.ok,`${path}: HTTP ${response.status}: ${response.ok?'':await response.text()}`);
  return response.status===204?null:response.json();
}
async function learning(path,body) {
  const response=await fetch(`http://ai:3000/api/learning${path}`,{headers:{...json,'x-api-key':'isolated-test-api-key'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  assert.ok(response.ok,`${path}: ${response.status}`);return response.json();
}
async function waitFor(fn,message,attempts=180) {
  for(let i=0;i<attempts;i++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,1000));}
  assert.fail(message);
}
async function upload(label,tags=[]) {
  const name=`native-${label}-${Date.now()}.txt`;const form=new FormData();
  form.set('document',new Blob([`SYNTHETIC DATA ONLY ${name}\nExample Energy Ltd\nElectricity invoice INV-42\nAmount EUR 42.50. Due 2030-05-01.`],{type:'text/plain'}),name);
  form.set('title',`Unclassified ${label}`);for(const tag of tags)form.append('tags',String(tag));
  await api('/documents/post_document/',form);
  return waitFor(async()=>{const rows=(await api('/documents/?ordering=-id')).results;return rows.find(d=>d.original_file_name===name);},'document ingested');
}
async function workflow(tag,trigger,action) {
  return api('/workflows/',{name:`Native experiment ${Date.now()}`,order:1,enabled:true,
    triggers:[{type:trigger,filter_has_tags:[tag]}],actions:[action]});
}
async function disable(id){await api(`/workflows/${id}/`,{enabled:false},'PATCH');}
async function eventsFor(id){return (await learning(`/events?q=${id}&limit=200`)).events.filter(e=>e.document_id===id);}
const metadata=d=>Object.fromEntries(['title','tags','correspondent','document_type','storage_path','created','custom_fields'].map(k=>[k,d[k]]));

test('native disabled baseline rejects AI without changing metadata',{skip:process.env.NATIVE_PROFILE!=='disabled',timeout:180000},async()=>{
  const doc=await upload('disabled');const before=metadata(await api(`/documents/${doc.id}/`));
  const response=await fetch(`http://paperless:8000/api/documents/${doc.id}/ai_suggestions/`,{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`}});
  assert.equal(response.status,400);assert.deepEqual(metadata(await api(`/documents/${doc.id}/`)),before);
});

test('native read, disjoint writes, overlapping writes and manual provenance',{skip:process.env.NATIVE_PROFILE==='disabled',timeout:1200000},async t=>{
  const original=await learning('/settings');
  await learning('/settings',{enabled:false,mode:'hybrid',stabilizationMs:0});
  try {
    const models=await (await fetch('http://native-model:11434/api/tags')).json();
    report.models=models.models.map(({name,digest})=>({name,digest}));console.log('NATIVE_MODEL_DIGESTS',JSON.stringify(report.models));
    for(const line of fs.readFileSync('tests/e2e/native-models.sha256','utf8').trim().split('\n')) {
      const [digest,manifest]=line.split(/\s+/);const name=manifest.split('/library/')[1].replace('/',':');
      assert.equal(report.models.find(m=>m.name===name)?.digest,digest,'loaded model must match the qualified manifest');
    }
    // Exercise actual local embeddings, not just the configured backend name.
    const embedding=await fetch('http://native-model:11434/api/embed',{method:'POST',headers:json,body:JSON.stringify({model:'all-minilm:22m',input:'Synthetic invoice'})});
    assert.ok(embedding.ok);assert.ok((await embedding.json()).embeddings[0].length>0);
    const doc=await upload('read');await learning('/scan',{});
    const before=metadata(await api(`/documents/${doc.id}/`));const suggestions=await api(`/documents/${doc.id}/ai_suggestions/`);
    assert.equal(typeof suggestions.title,'string');assert.ok(suggestions.title.trim());
    assert.deepEqual(metadata(await api(`/documents/${doc.id}/`)),before,'suggestions must be read-only');
    assert.equal((await eventsFor(doc.id)).length,0);
    report.profiles.push({profile:'read-only',document:doc.id,before,after:before,suggestions});

    const disjointTag=await api('/tags/',{name:`Native disjoint ${Date.now()}`,matching_algorithm:0});
    const disjoint=await workflow(disjointTag.id,2,{type:8,ai_suggestion_fields:['title'],ai_create_missing:false,ai_overwrite_existing:true});
    try{
      const added=await upload('disjoint',[disjointTag.id]);
      const changed=await waitFor(async()=>{const current=await api(`/documents/${added.id}/`);return current.title!=='Unclassified disjoint'&&current;},'native added workflow writes title');
      // Fork writes only a separate custom field in this profile; no automatic fork scan.
      const field=await api('/custom_fields/',{name:`Native coexistence ${Date.now()}`,data_type:'string'});
      const title=changed.title;
      const forkWrite=await fetch('http://ai:3000/manual/updateDocument',{method:'POST',headers:{...json,'x-api-key':'isolated-test-api-key'},body:JSON.stringify({documentId:added.id,custom_fields:[{field:field.id,value:'fork-owned synthetic value'}]})});
      assert.equal(forkWrite.status,200);
      const after=await api(`/documents/${added.id}/`);assert.equal(after.title,title);assert.equal(after.custom_fields.find(f=>f.field===field.id).value,'fork-owned synthetic value');
      report.profiles.push({profile:'disjoint',document:added.id,writers:{title:'native workflow',custom_fields:'explicit fork manual API'},after:metadata(after)});
    }finally{await disable(disjoint.id);}

    const overlapTag=await api('/tags/',{name:`Native overlap ${Date.now()}`,matching_algorithm:0});
    const overlapDoc=await upload('overlap',[overlapTag.id]);await learning('/scan',{});
    const overlap=await workflow(overlapTag.id,3,{type:8,ai_suggestion_fields:['title'],ai_create_missing:false,ai_overwrite_existing:true});
    let current;
    try{
      await api(`/documents/${overlapDoc.id}/`,{title:'External pending native trigger'},'PATCH');
      current=await waitFor(async()=>{const d=await api(`/documents/${overlapDoc.id}/`);return d.title!=='External pending native trigger'&&d;},'native updated workflow changes title');
    }finally{await disable(overlap.id);}
    await learning('/scan',{});const events=await eventsFor(overlapDoc.id);assert.ok(events.length);
    assert.ok(events.every(e=>e.source==='unknown'&&e.status==='pending'));
    assert.ok(!(await learning('/examples')).examples.some(e=>e.document_id===overlapDoc.id&&e.active));
    const newest=events[0];await learning(`/events/${newest.id}/review`,{decision:'confirmed'});
    assert.ok((await learning('/examples')).examples.some(e=>e.document_id===overlapDoc.id&&e.active));
    report.profiles.push({profile:'overlap',document:overlapDoc.id,after:metadata(current),events});

    await t.test('manual PATCH plus workflow preserves provenance',async()=>{
    // Deterministic workflow exercises the same native update pipeline without model timing ambiguity.
    const manualTag=await api('/tags/',{name:`Native manual ${Date.now()}`,matching_algorithm:0});
    const manualDoc=await upload('manual',[manualTag.id]);await learning('/scan',{});
    const manualWorkflow=await workflow(manualTag.id,3,{type:1,assign_title:'Workflow-owned title'});
    const type=await api('/document_types/',{name:`Explicit user type ${Date.now()}`,matching_algorithm:0});
    try{
      const response=await fetch('http://ai:3000/manual/updateDocument',{method:'POST',headers:{...json,'x-api-key':'isolated-test-api-key'},body:JSON.stringify({documentId:manualDoc.id,document_type:type.id})});
      assert.equal(response.status,200);const patchResponse=await response.json();
      const after=await waitFor(async()=>{const d=await api(`/documents/${manualDoc.id}/`);return d.title==='Workflow-owned title'&&d;},'deterministic native workflow writes title');
      await learning('/scan',{});const manualEvents=await eventsFor(manualDoc.id);
      report.profiles.push({profile:'manual-plus-workflow',requested:{document_type:type.id},patchResponse:metadata(patchResponse),after:metadata(after),events:manualEvents});
      assert.ok(!manualEvents.some(e=>e.status==='confirmed'&&JSON.parse(e.metadata_json).title==='Workflow-owned title'),
        'workflow-owned title must not become a human-confirmed learning example');
    }finally{await disable(manualWorkflow.id);}
    });
    await t.test('implicit ancestor tags are not explicit human feedback',async()=>{
      const parent=await api('/tags/',{name:`Native parent ${Date.now()}`,matching_algorithm:0});
      const child=await api('/tags/',{name:`Native child ${Date.now()}`,matching_algorithm:0,parent:parent.id});
      const tagDoc=await upload('ancestors');await learning('/scan',{});
      const response=await fetch('http://ai:3000/manual/updateDocument',{method:'POST',headers:{...json,'x-api-key':'isolated-test-api-key'},body:JSON.stringify({documentId:tagDoc.id,tags:[child.id]})});
      assert.equal(response.status,200);const returned=await response.json();
      const after=await api(`/documents/${tagDoc.id}/`);assert.ok(after.tags.includes(parent.id)&&after.tags.includes(child.id));
      await learning('/scan',{});const events=await eventsFor(tagDoc.id);
      report.profiles.push({profile:'implicit-tag-ancestor',requested:{tags:[child.id]},patchResponse:metadata(returned),after:metadata(after),events});
      assert.ok(!events.some(e=>e.status==='confirmed'&&e.metadata.tags.includes(parent.id)),
        'implicit parent tag must not be recorded as explicitly confirmed by the user');
      assert.ok(events.some(e=>e.source==='unknown'&&e.status==='pending'&&e.metadata.tags.includes(parent.id)));
      assert.ok(!(await learning('/examples')).examples.some(e=>e.document_id===tagDoc.id&&e.active));
    });
  }finally{
    await learning('/settings',original);console.log('NATIVE_PROFILE_RESULTS',JSON.stringify(report.profiles));fs.writeFileSync('/app/data/native-ai-report.json',JSON.stringify(report,null,2)+'\n');
  }
});
