'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const shared=require('../quality/extraction/core');
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}'):JSON.stringify(value);
const sourceFiles=['core.js','run.js','model-lock.json','manifest.json','../qwen3-readiness.test.js','../../.github/workflows/classification-evaluation.yml'];
const sourceDigests=()=>Object.fromEntries(sourceFiles.map(name=>[name,shared.hash(fs.readFileSync(path.join(__dirname,name)))]));
function load(){
  const manifest=require('./manifest.json'),protocol=require('./protocol.json'),model=require('./model-lock.json'),selection=require('./smoke-selection.json');
  for(const [name,digest]of Object.entries(manifest.files))assert.equal(shared.hash(fs.readFileSync(path.join(__dirname,name))),digest,`Frozen ${name} changed`);
  for(const [name,digest]of Object.entries(model.files))assert.equal(shared.hash(fs.readFileSync(path.join(__dirname,'metadata-archive',name))),digest,`Metadata ${name} changed`);
  const metadata=require('./metadata-archive/report.json');assert.equal(metadata.passed,true);assert.equal(metadata.generationRequests,0);assert.equal(model.candidate,protocol.candidate);assert.equal(metadata.metadata.manifestDigest,model.candidateDigest);assert.equal(shared.hash(fs.readFileSync(path.join(__dirname,'metadata-archive/manifest.json'))),model.candidateDigest);
  const archive=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'..',selection.sourceArchive)),{maxOutputLength:16*1024*1024}));
  const cases=require('../identifier-roles/cases.json').cases,training=cases.filter(row=>row.split==='training');
  assert.equal(selection.caseIds.length,20);assert.equal(new Set(selection.caseIds).size,20);
  assert.equal(archive.commit,selection.sourceCommit);assert.equal(archive.run,selection.sourceRun);
  const requests=selection.caseIds.map(id=>{
    const original=archive.rows.find(row=>row.id===id)?.request;assert.ok(original);assert.equal(shared.hash(canonical(original)),selection.requests[id]);
    return {id,request:{...original,model:protocol.candidate,think:false,options:{...protocol.options,seed:protocol.smokeSeed}}};
  });
  return {manifest,protocol,model,selection,cases,training,requests};
}
function evaluate(response,fixture,context){
  const {protocol,training}=context;
  let actual,validation;
  try{
    assert.equal(response.done,true,'incomplete response');assert.ok(Number.isSafeInteger(response.eval_count)&&response.eval_count>0,'missing inference count');
    assert.ok(response.thinking===undefined||response.thinking===null||response.thinking==='','unexpected thinking');
    actual=JSON.parse(response.response);validation=shared.validate(actual,fixture.content,false,protocol);
  }catch(error){validation={accepted:{},rejected:{},protocolErrors:[error.message]};}
  return {actual,validation,scores:shared.scores(actual,validation.accepted,fixture,training)};
}
function gate(report,context){
  const reasons=[];const {protocol,selection,cases}=context;
  const complete=report.complete&&report.requestCount===20&&report.rows.length===20&&report.rows.every(row=>row.terminal)&&canonical(report.rows.map(row=>row.id))===canonical(selection.caseIds);
  if(!complete)reasons.push('incomplete_attempts');
  const summary=shared.summarize(report.rows,cases),identifiers=shared.identifierTotals(summary);
  if(summary.failedAttempts)reasons.push('protocol_failure');
  if(identifiers.wrong>protocol.smokeGate.maximumWrongAcceptedIdentifiers)reasons.push('wrong_identifier');
  if(identifiers.present!==10||identifiers.correct<protocol.smokeGate.minimumCorrectPresentIdentifiers)reasons.push('positive_coverage');
  if(report.fixtureOnly)reasons.push('fixture_only');
  return {passed:reasons.length===0,reasons,summary,identifiers};
}
function audit(report,{fixtureOnly=false}={}){
  const context=load();assert.equal(report.revision,context.protocol.revision);assert.equal(report.stage,'smoke');assert.equal(report.attempt,1);
  assert.equal(report.model,context.protocol.candidate);assert.equal(report.modelDigest,context.model.candidateDigest);
  assert.deepEqual(report.sourceDigests,require('./harness-lock.json'));assert.deepEqual(report.manifest,context.manifest);
  if(!fixtureOnly){assert.equal(report.fixtureOnly,undefined);assert.match(report.commit||'',/^[a-f0-9]{40}$/);assert.match(report.run||'',/^\d+$/);}
  assert.ok(report.rows.length<=20);assert.equal(report.requestCount,report.rows.length);
  for(let index=0;index<report.rows.length;index++){
    const row=report.rows[index],expected=context.requests[index];assert.equal(row.id,expected.id);assert.deepEqual(row.request,expected.request);
    if(row.terminal){const reconstructed=row.error?{validation:{accepted:{},rejected:{},protocolErrors:['request_or_json_failure']},actual:undefined}:evaluate(row.response,context.cases.find(c=>c.id===row.id),context);
      if(row.error)reconstructed.scores=shared.scores(undefined,{},context.cases.find(c=>c.id===row.id),context.training);
      assert.deepEqual(row.actual,reconstructed.actual);assert.deepEqual(row.validation,reconstructed.validation);assert.deepEqual(row.scores,reconstructed.scores);
    }
  }
  const result=gate(report,context);if(report.gate)assert.deepEqual(report.gate,result);return result;
}
module.exports={...shared,canonical,sourceDigests,load,evaluate,gate,audit};
if(require.main===module)process.stdout.write(JSON.stringify(audit(JSON.parse(fs.readFileSync(process.argv[2]))),null,2)+'\n');
