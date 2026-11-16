'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {load,hash,summarize,inputFor,validateArm,scoreRow,sourceDigests}=require('./core');
const {cases,protocol,manifest}=load(),arm=process.env.IDENTIFIER_ROLES_ARM,split=process.env.IDENTIFIER_ROLES_SPLIT,seed=Number(process.env.IDENTIFIER_ROLES_SEED);
assert.ok(['A','B'].includes(arm));assert.ok(protocol.seeds[split]?.includes(seed));
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','measured answers must never be rerun');
const fixtureOnly=process.env.IDENTIFIER_ROLES_FIXTURE_TEST==='1';
if(!fixtureOnly)assert.ok(!fs.existsSync(path.join(__dirname,'artifact-sources.json')),'This experiment already has measured artifacts; no extra run');
const origin=process.env.IDENTIFIER_ROLES_ORIGIN||'http://127.0.0.1:11434',parsed=new URL(origin);
assert.equal(parsed.protocol,'http:');assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.username+parsed.password+parsed.search+parsed.hash,'');assert.equal(parsed.pathname,'/');
if(!fixtureOnly)assert.equal(origin,'http://127.0.0.1:11434');
assert.deepEqual(sourceDigests(),require('./harness-lock.json'));
const output=process.env.IDENTIFIER_ROLES_OUTPUT||`identifier-roles-${arm}-${split}-${seed}.json`;
const report={revision:protocol.revision,arm,split,seed,model:protocol.model,commit:process.env.GITHUB_SHA||null,run:process.env.GITHUB_RUN_ID||null,attempt:1,
  origin,...(fixtureOnly?{fixtureOnly:true}:{}),manifest,sourceDigests:sourceDigests(),modelDigest:null,complete:false,requestCount:0,
  options:{...protocol.options,seed},environment:{platform:os.platform(),arch:os.arch(),parallelism:os.availableParallelism(),totalMemory:os.totalmem(),cpuModel:os.cpus()[0]?.model,node:process.version},rows:[]};
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');write();
(async()=>{
  const version=await fetch(origin+'/api/version',{signal:AbortSignal.timeout(20000),redirect:'error'});assert.ok(version.ok);report.ollamaVersion=(await version.json()).version;assert.equal(report.ollamaVersion,protocol.ollamaVersion);
  const tags=await fetch(origin+'/api/tags',{signal:AbortSignal.timeout(20000),redirect:'error'});assert.ok(tags.ok);
  report.modelDigest=(await tags.json()).models.find(row=>row.name===protocol.model)?.digest;assert.equal(report.modelDigest,protocol.modelDigest);write();
  const service=Object.create(require('../../services/ollamaService'));service.apiUrl=origin;service.model=protocol.model;
  service.client=require('axios').create({timeout:protocol.requestTimeoutMs,maxRedirects:0});let active;
  service.client.interceptors.request.use(config=>{
    assert.equal(config.url,origin+'/api/generate');assert.ok(active&&!active.request,'one request per fixture');
    assert.ok(report.requestCount<30);config.data.options=report.options;active.request=structuredClone(config.data);report.requestCount++;write();return config;
  });
  const training=cases.filter(row=>row.split==='training');
  for(const fixture of cases.filter(row=>row.split===split)){
    const input=inputFor(fixture.content,training,arm,protocol),{prompt,system,format}=input;
    const row={id:fixture.id,input,inputDigest:hash(JSON.stringify(input)),durationMs:0,terminal:false};active=row;report.rows.push(row);write();const started=Date.now();
    try{
      row.response=await service._callOllamaAPI(prompt,system,protocol.options.num_ctx,format);
      if(!row.response.done||!Number.isSafeInteger(row.response.eval_count)||row.response.eval_count<=0)throw Error('Missing complete real inference token count');
      row.actual=JSON.parse(row.response.response);row.validation=validateArm(row.actual,input,arm,fixture.content,protocol);
    }catch(error){row.error={message:error.message,code:error.code||null,response:error.response?.data??null};row.validation={accepted:{},rejected:{},sources:{},claims:[],blocked:{},protocolErrors:['request_or_json_failure']};}
    row.durationMs=Date.now()-started;row.scores=scoreRow(row.actual,row.validation,input,fixture,training,arm);
    row.terminal=true;write();console.log('IDENTIFIER_ROLES_ATTEMPT',JSON.stringify({arm,split,seed,id:fixture.id,error:row.error?.message||null,protocolErrors:row.validation.protocolErrors,durationMs:row.durationMs}));
  }
  report.summary=summarize(report.rows,cases);report.summaryByLanguage=Object.fromEntries(['en','de'].map(language=>[language,summarize(report.rows.filter(row=>cases.find(item=>item.id===row.id).language===language),cases)]));
  report.summaryByCohort=Object.fromEntries(['present','missing','inapplicable'].map(cohort=>[cohort,summarize(report.rows.filter(row=>cases.find(item=>item.id===row.id).cohort===cohort),cases)]));
  report.complete=report.rows.length===30&&report.requestCount===30&&report.rows.every(row=>row.terminal);write();assert.equal(report.complete,true);
  console.log('IDENTIFIER_ROLES_COMPLETE',JSON.stringify({arm,split,seed,failed:report.summary.failedAttempts}));
})().catch(error=>{report.error=error.message;write();console.error(error.message);process.exitCode=1;});
