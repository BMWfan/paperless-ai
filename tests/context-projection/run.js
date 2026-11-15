'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {load,hash,validate,scores,summarize,referenceInput,provenance,sourceDigests}=require('./core');
const {cases,protocol,manifest}=load(),arm=process.env.PROJECTION_ARM,split=process.env.PROJECTION_SPLIT,seed=Number(process.env.PROJECTION_SEED);
assert.ok(Object.hasOwn(protocol.arms,arm));assert.ok(protocol.seeds[split]?.includes(seed));
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','measured answers must never be rerun');
const fixtureOnly=process.env.PROJECTION_FIXTURE_TEST==='1';
if(!fixtureOnly)assert.ok(!fs.existsSync(path.join(__dirname,'artifact-sources.json')),'This experiment already has measured artifacts; no extra run');
const origin=process.env.PROJECTION_ORIGIN||'http://127.0.0.1:11434',parsed=new URL(origin);
assert.equal(parsed.protocol,'http:');assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.username+parsed.password+parsed.search+parsed.hash,'');assert.equal(parsed.pathname,'/');
if(!fixtureOnly)assert.equal(origin,'http://127.0.0.1:11434');
assert.deepEqual(sourceDigests(),require('./harness-lock.json'));
const output=process.env.PROJECTION_OUTPUT||`projection-${arm}-${split}-${seed}.json`;
const report={revision:protocol.revision,arm,split,seed,model:protocol.model,commit:process.env.GITHUB_SHA||null,run:process.env.GITHUB_RUN_ID||null,attempt:1,
  origin,...(fixtureOnly?{fixtureOnly:true}:{}),manifest,sourceDigests:sourceDigests(),modelDigest:null,complete:false,requestCount:0,
  options:{...protocol.options,seed},environment:{platform:os.platform(),arch:os.arch(),parallelism:os.availableParallelism(),totalMemory:os.totalmem(),cpuModel:os.cpus()[0]?.model,node:process.version},rows:[]};
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');write();
(async()=>{
  const version=await fetch(origin+'/api/version',{signal:AbortSignal.timeout(20000)});assert.ok(version.ok);report.ollamaVersion=(await version.json()).version;assert.equal(report.ollamaVersion,protocol.ollamaVersion);
  const tags=await fetch(origin+'/api/tags',{signal:AbortSignal.timeout(20000)});assert.ok(tags.ok);
  report.modelDigest=(await tags.json()).models.find(row=>row.name===protocol.model)?.digest;assert.equal(report.modelDigest,protocol.modelDigest);write();
  const service=Object.create(require('../../services/ollamaService'));service.apiUrl=origin;service.model=protocol.model;
  service.client=require('axios').create({timeout:protocol.requestTimeoutMs,maxRedirects:0});let active;
  service.client.interceptors.request.use(config=>{
    assert.equal(config.url,origin+'/api/generate');assert.ok(active&&!active.request,'one request per fixture');
    assert.ok(report.requestCount<30);config.data.options=report.options;active.request=structuredClone(config.data);report.requestCount++;write();return config;
  });
  const training=cases.filter(row=>row.split==='training');
  for(const fixture of cases.filter(row=>row.split===split)){
    const input=referenceInput(fixture,training),context=input.contexts[arm],prompt=`CURRENT DOCUMENT:\n${fixture.content}`,system=protocol.baselineSystem+context;
    const row={id:fixture.id,context,contextDigest:hash(context),controlContextDigest:hash(input.contexts.A),selectedReferences:input.selectedIds,rankedReferences:input.rankedIds,referenceTokens:input.tokens,
      prompt,systemDigest:hash(system),durationMs:0,terminal:false};active=row;report.rows.push(row);write();const started=Date.now();
    try{
      row.response=await service._callOllamaAPI(prompt,system,protocol.options.num_ctx,protocol.baselineSchema);
      if(!row.response.done||!Number.isSafeInteger(row.response.eval_count)||row.response.eval_count<=0)throw Error('Missing complete real inference token count');
      row.actual=JSON.parse(row.response.response);row.validation=validate(row.actual,fixture.content,protocol);
    }catch(error){row.error={message:error.message,code:error.code||null,response:error.response?.data??null};row.validation={accepted:{},rejected:{},protocolErrors:['request_or_json_failure']};}
    row.durationMs=Date.now()-started;row.scores=scores(row.actual,row.validation.accepted,fixture,training);row.provenance=provenance(row.actual,fixture,training);
    row.terminal=true;write();console.log('PROJECTION_ATTEMPT',JSON.stringify({arm,split,seed,id:fixture.id,error:row.error?.message||null,protocolErrors:row.validation.protocolErrors,durationMs:row.durationMs}));
  }
  report.summary=summarize(report.rows,cases);report.summaryByLanguage=Object.fromEntries(['en','de'].map(language=>[language,summarize(report.rows.filter(row=>cases.find(item=>item.id===row.id).language===language),cases)]));
  report.complete=report.rows.length===30&&report.requestCount===30&&report.rows.every(row=>row.terminal);write();assert.equal(report.complete,true);
  console.log('PROJECTION_COMPLETE',JSON.stringify({arm,split,seed,failed:report.summary.failedAttempts}));
})().catch(error=>{report.error=error.message;write();console.error(error.message);process.exitCode=1;});
