'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {load,hash,validate,referenceInput,scores,summarize}=require('./core');
const {cases,protocol,manifest}=load();
const arm=process.env.EXTRACTION_ARM,split=process.env.EXTRACTION_SPLIT,seed=Number(process.env.EXTRACTION_SEED);
assert.ok(Object.hasOwn(protocol.arms,arm));assert.ok(['development','confirmation'].includes(split));assert.ok(protocol.seeds[split].includes(seed));
const origin=process.env.EXTRACTION_ORIGIN||'http://127.0.0.1:11434';assert.equal(origin,'http://127.0.0.1:11434','isolated local model only');
const output=process.env.EXTRACTION_OUTPUT||`extraction-${arm}-${split}-${seed}.json`;
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','never silently rerun measured answers');
const model=protocol.arms[arm].model,withEvidence=protocol.arms[arm].evidence;
const report={revision:protocol.revision,complete:false,arm,split,seed,model,commit:process.env.GITHUB_SHA||null,run:process.env.GITHUB_RUN_ID||null,attempt:1,manifest,
  sourceDigests:Object.fromEntries(['core.js','run.js','CONTRACT.md','../../../services/learningContext.js','../../../services/ollamaService.js','../../../services/customFieldUpdates.js'].map(file=>[file,hash(fs.readFileSync(path.join(__dirname,file)))])),
  environment:{platform:os.platform(),arch:os.arch(),parallelism:os.availableParallelism(),totalMemory:os.totalmem(),cpuModel:os.cpus()[0]?.model,node:process.version},options:{...protocol.options,seed},rows:[]};
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');write();
(async()=>{
  const locks=require('./model-locks.json');
  const timeout={signal:AbortSignal.timeout(20000)};
  const version=await fetch(origin+'/api/version',timeout);assert.ok(version.ok);report.ollamaVersion=(await version.json()).version;assert.equal(report.ollamaVersion,'0.12.6');
  const tags=await fetch(origin+'/api/tags',{signal:AbortSignal.timeout(20000)});assert.ok(tags.ok);const actual=(await tags.json()).models.find(row=>row.name===model);
  assert.equal(actual?.digest,locks[model]);report.modelDigest=actual.digest;report.modelLocks=locks;write();
  const service=Object.create(require('../../../services/ollamaService'));service.apiUrl=origin;service.model=model;
  service.client=require('axios').create({timeout:protocol.requestTimeoutMs});
  service.client.interceptors.request.use(config=>{config.data.options={...protocol.options,seed};return config;});
  const training=cases.filter(row=>row.split==='training');
  for(const fixture of cases.filter(row=>row.split===split)){
    const {context,ranked}=referenceInput(fixture,training);
    const document=withEvidence?fixture.content.split('\n').map((line,index)=>`${index+1} | ${line}`).join('\n'):fixture.content;
    const prompt=`CURRENT DOCUMENT:\n${document}`,system=(withEvidence?protocol.evidenceSystem:protocol.baselineSystem)+context;
    const row={id:fixture.id,context,contextDigest:hash(context),rankedReferences:ranked,prompt,systemDigest:hash(system),durationMs:0};
    const started=Date.now();
    try{
      row.response=await service._callOllamaAPI(prompt,system,protocol.options.num_ctx,withEvidence?protocol.evidenceSchema:protocol.baselineSchema);
      if(!row.response.done)throw new Error('Incomplete model response');
      if(!Number.isSafeInteger(row.response.eval_count)||row.response.eval_count<=0)throw new Error('Missing real inference token count');
      row.actual=JSON.parse(row.response.response);
      row.validation=validate(row.actual,fixture.content,withEvidence,protocol);
    }catch(error){row.error={message:error.message,code:error.code||null,response:error.response?.data??null};row.validation={accepted:{},rejected:{},protocolErrors:['request_or_json_failure']};}
    row.durationMs=Date.now()-started;row.scores=scores(row.actual,row.validation.accepted,fixture,training);
    report.rows.push(row);write();console.log('EXTRACTION_ATTEMPT',JSON.stringify({arm,split,seed,id:row.id,error:row.error?.message||null,protocolErrors:row.validation.protocolErrors,durationMs:row.durationMs}));
  }
  report.summary=summarize(report.rows,cases);report.summaryByLanguage=Object.fromEntries(['en','de'].map(language=>[language,summarize(report.rows.filter(row=>cases.find(item=>item.id===row.id).language===language),cases)]));report.complete=report.rows.length===30;write();
  assert.equal(report.complete,true);console.log('EXTRACTION_COMPLETE',JSON.stringify({arm,split,seed,failed:report.summary.failedAttempts}));
})().catch(error=>{report.error=error.message;write();console.error(error.message);process.exitCode=1;});
