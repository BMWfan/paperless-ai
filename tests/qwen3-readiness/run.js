'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {load,sourceDigests,evaluate,scores,gate}=require('./core');
async function run(){
  const context=load(),{protocol,model,manifest,requests,cases,training}=context;
  assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','no measured reruns');
  const fixtureOnly=process.env.QWEN3_FIXTURE_TEST==='1';
  assert.ok(fixtureOnly||!fs.existsSync(path.join(__dirname,'smoke-artifact.json')),'smoke already archived; STOP');
  assert.deepEqual(sourceDigests(),require('./harness-lock.json'));
  const origin=process.env.QWEN3_ORIGIN||'http://127.0.0.1:11434',url=new URL(origin);
  assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/');assert.equal(url.username+url.password+url.search+url.hash,'');
  if(!fixtureOnly)assert.equal(origin,'http://127.0.0.1:11434');
  const output=process.env.QWEN3_OUTPUT||'qwen3-smoke.json';assert.ok(!fs.existsSync(output),'refuse output overwrite');
  const report={revision:protocol.revision,stage:'smoke',attempt:1,commit:process.env.GITHUB_SHA||null,run:process.env.GITHUB_RUN_ID||null,
    ...(fixtureOnly?{fixtureOnly:true}:{}),model:protocol.candidate,modelDigest:model.candidateDigest,manifest,sourceDigests:sourceDigests(),origin,
    complete:false,requestCount:0,rows:[],environment:{node:process.version,platform:os.platform(),cpuModel:os.cpus()[0]?.model,parallelism:os.availableParallelism(),totalMemory:os.totalmem()}};
  const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');write();
  try{
    for(const endpoint of ['version','tags']){
      const response=await fetch(origin+'/api/'+endpoint,{signal:AbortSignal.timeout(20000),redirect:'error'});assert.ok(response.ok);const data=await response.json();
      if(endpoint==='version')assert.equal(data.version,protocol.ollamaVersion);
      else assert.equal(data.models.find(row=>row.name===protocol.candidate)?.digest,model.candidateDigest);
    }
    for(const {id,request}of requests){
      const row={id,request,terminal:false,durationMs:0};report.rows.push(row);report.requestCount++;assert.ok(report.requestCount<=protocol.maxSmokeRequests);write();const started=Date.now();
      try{
        const response=await fetch(origin+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(protocol.requestTimeoutMs)});
        row.httpStatus=response.status;row.responseRaw=await response.text();row.response=JSON.parse(row.responseRaw);assert.ok(response.ok,`HTTP ${response.status}`);
        Object.assign(row,evaluate(row.response,cases.find(fixture=>fixture.id===id),context));
      }catch(error){row.error={message:error.message,cause:error.cause?.message||null};row.validation={accepted:{},rejected:{},protocolErrors:['request_or_json_failure']};row.scores=scores(undefined,{},cases.find(fixture=>fixture.id===id),training);}
      row.durationMs=Date.now()-started;row.terminal=true;write();console.log('QWEN3_SMOKE_ATTEMPT',JSON.stringify({id,durationMs:row.durationMs,error:row.error||null,protocolErrors:row.validation.protocolErrors}));
    }
    report.complete=report.requestCount===20&&report.rows.every(row=>row.terminal);report.gate=gate(report,context);write();console.log('QWEN3_SMOKE_GATE',JSON.stringify(report.gate));
    // A failed quality gate is a preserved negative result, not an invitation to retry CI.
  }catch(error){report.error=error.message;write();throw error;}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
