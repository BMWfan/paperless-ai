'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const core=require('./qwen3-readiness/core');
const root=path.join(__dirname,'qwen3-readiness');
function response(actual,extra={}){return {done:true,eval_count:1,prompt_eval_count:2,response:JSON.stringify(actual),...extra};}
test('Qwen3 freezes 40 fresh documents and reuses exactly20 original requests with only declared model/sampler/think changes',()=>{
  const context=core.load(),{protocol,requests}=context;
  const fresh=require('./qwen3-readiness/cases.json').cases;assert.equal(fresh.length,40);assert.equal(fresh.filter(c=>c.split==='confirmation').length,30);
  assert.deepEqual(core.sourceDigests(),require('./qwen3-readiness/harness-lock.json'));
  for(const row of requests){assert.equal(row.request.think,false);assert.equal(row.request.model,protocol.candidate);assert.deepEqual(row.request.options,{...protocol.options,seed:42});assert.deepEqual(row.request.format,protocol.baselineSchema);assert.equal(row.request.stream,false);}
  assert.equal(protocol.maxTotalRequests,140);assert.equal(protocol.maxSmokeRequests,20);assert.equal(protocol.maxConfirmationRequests,120);
});
test('unexpected thinking and incomplete/invalid JSON/schema are protocol errors and never stripped',()=>{
  const context=core.load(),fixture=context.cases.find(c=>c.id===context.requests[0].id);
  for(const extra of [{thinking:'hidden reasoning'},{done:false},{eval_count:0},{response:'not JSON'},{response:'{}'}]){
    const result=core.evaluate(response(fixture.expected,extra),fixture,context);assert.ok(result.validation.protocolErrors.length);assert.deepEqual(result.validation.accepted,{});
  }
});
test('predeclared smoke gates reject wrong accepted IDs,7/10 coverage,partial attempts and fixture evidence',()=>{
  const context=core.load();const rows=context.requests.map(({id,request})=>({id,request,terminal:true,durationMs:1,...core.evaluate(response(context.cases.find(c=>c.id===id).expected),context.cases.find(c=>c.id===id),context)}));
  const report={complete:true,requestCount:20,rows};assert.equal(core.gate(report,context).passed,true);
  const fixture=structuredClone(report);fixture.fixtureOnly=true;assert.ok(core.gate(fixture,context).reasons.includes('fixture_only'));
  const partial=structuredClone(report);partial.rows.pop();assert.equal(core.gate(partial,context).passed,false);
  const low=structuredClone(report);let changed=0;
  for(const row of low.rows){const f=context.cases.find(c=>c.id===row.id);if(f.cohort==='present'&&changed++<3){const actual=structuredClone(f.expected);actual.custom_fields[f.targetIdentifier]=null;Object.assign(row,core.evaluate(response(actual),f,context));}}
  assert.ok(core.gate(low,context).reasons.includes('positive_coverage'));
  const wrong=structuredClone(report),r=wrong.rows[0],f=context.cases.find(c=>c.id===r.id),actual=structuredClone(f.expected);actual.custom_fields.invoice_number='OLD-REFERENCE-123';Object.assign(r,core.evaluate(response(actual),f,context));assert.ok(core.gate(wrong,context).reasons.includes('wrong_identifier'));
});
test('actual HTTP runner sends20 attempts once, retains errors/partials and refuses retries/redirects; fixtures cannot unlock phase2',async()=>{
  const context=core.load(),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'qwen3-smoke-')),seen=[];let redirectHits=0;
  const server=http.createServer((req,res)=>{
    if(req.url==='/api/version')return res.end(JSON.stringify({version:context.protocol.ollamaVersion}));
    if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:context.protocol.candidate,digest:context.model.candidateDigest}]}));
    if(req.url==='/redirected'){redirectHits++;return res.end('{}');}
    assert.equal(req.url,'/api/generate');let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      const request=JSON.parse(body),index=seen.length;seen.push(request);assert.deepEqual(request,context.requests[index].request);
      const fixture=context.cases.find(c=>c.id===context.requests[index].id);
      if(index===0){res.writeHead(302,{Location:'/redirected'});return res.end('{}');}
      if(index===1)return res.end('invalid outer JSON');
      return res.end(JSON.stringify(response(fixture.expected,index===2?{thinking:'unexpected reasoning'}:{})));
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const output=path.join(temporary,'smoke.json');
  const child=attempt=>new Promise((resolve,reject)=>{
    const process_=spawn(process.execPath,[path.join(root,'run.js')],{env:{...process.env,GITHUB_RUN_ATTEMPT:String(attempt),QWEN3_FIXTURE_TEST:'1',QWEN3_ORIGIN:`http://127.0.0.1:${server.address().port}`,QWEN3_OUTPUT:output}});
    let stderr='';process_.stderr.on('data',chunk=>stderr+=chunk);process_.stdout.resume();process_.on('error',reject);process_.on('exit',code=>resolve({code,stderr}));
  });
  try{
    assert.equal((await child(1)).code,0);assert.equal(seen.length,20);assert.equal(redirectHits,0);
    const report=JSON.parse(fs.readFileSync(output));assert.equal(report.complete,true);assert.equal(report.requestCount,20);assert.equal(report.gate.passed,false);assert.equal(report.gate.summary.failedAttempts,3);
    assert.equal(report.rows[1].responseRaw,'invalid outer JSON');assert.equal(report.rows[2].response.thinking,'unexpected reasoning');
    assert.deepEqual(core.audit(report,{fixtureOnly:true}),report.gate);
    const tampered=structuredClone(report);tampered.rows[3].request.think=true;assert.throws(()=>core.audit(tampered,{fixtureOnly:true}));
    assert.notEqual((await child(2)).code,0);assert.equal(seen.length,20);assert.notEqual((await child(1)).code,0);assert.equal(seen.length,20);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
});
