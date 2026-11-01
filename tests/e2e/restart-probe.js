'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('dotenv').config({path:'data/.env'});
assert.equal(process.env.PAPERLESS_API_URL,'http://paperless:8000/api');
async function learning(route,body) {
  const response=await fetch('http://ai:3000/api/learning'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-api-key':'isolated-test-api-key'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.ok(response.ok,`Learning ${route}: ${response.status}`);return response.json();
}
(async()=>{
  if(process.argv[2]==='prepare') {
    const response=await fetch(process.env.PAPERLESS_API_URL+'/documents/?ordering=-id',{headers:{Authorization:`Token ${process.env.PAPERLESS_API_TOKEN}`}});
    assert.ok(response.ok);const document=(await response.json()).results[0];
    assert.match(document.original_file_name,/^synthetic-/,'restart probe only changes synthetic test documents');
    await learning('/settings',{mode:'manual',enabled:false,stabilizationMs:0});await learning('/scan',{});
    const probe={id:document.id,title:`Offline synthetic correction ${document.id}`};
    fs.writeFileSync('data/restart-probe.json',JSON.stringify(probe));process.stdout.write(JSON.stringify(probe));
  } else if(process.argv[2]==='verify') {
    const probe=JSON.parse(fs.readFileSync('data/restart-probe.json','utf8'));
    await learning('/scan',{});
    const event=(await learning('/events?limit=200')).events.find(row=>row.document_id===probe.id && row.metadata.title===probe.title);
    assert.ok(event,'metadata edited while the app was stopped is detected after restart');
    assert.equal(event.status,'pending');assert.equal(event.source,'unknown');
    await learning(`/events/${event.id}/review`,{decision:'rejected'});
    await learning('/settings',{mode:'hybrid'});
    console.log('Restart detection passed for synthetic document',probe.id);
  } else throw new Error('Use prepare or verify');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
