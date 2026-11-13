'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {load,hash,validate,scores,summarize,identifierTotals,referenceInput}=require('./core');
const {normalizeValue}=require('../../../services/customFieldUpdates');
const {fieldTypes}=require('../corpus');
function reportBytes(file){const bytes=fs.readFileSync(file);return file.endsWith('.gz')?require('node:zlib').gunzipSync(bytes,{maxOutputLength:16*1024*1024}):bytes;}
function aggregate(directory){
  const {cases,protocol,manifest}=load(),training=cases.filter(row=>row.split==='training');
  const reports=fs.readdirSync(directory).sort().filter(name=>/^extraction-[ABC]-(development|confirmation)-4[23]\.json(?:\.gz)?$/.test(name)).map(name=>({name,bytes:reportBytes(path.join(directory,name)),containerDigest:hash(fs.readFileSync(path.join(directory,name)))}));
  assert.equal(reports.length,9,'all nine measured jobs required');
  const result={revision:protocol.revision,sourceFiles:{},sources:[],groups:{},qualification:{},productionActivation:false,attempts:0};
  const seen=new Set(),contexts=new Map(),expectedContexts=new Map(),runs=new Set(),commits=new Set();
  for(const {name,bytes,containerDigest}of reports){
    const report=JSON.parse(bytes);runs.add(report.run);commits.add(report.commit);const key=`${report.arm}/${report.split}/${report.seed}`;
    assert.ok(!seen.has(key));seen.add(key);assert.ok(protocol.arms[report.arm]);assert.ok(protocol.seeds[report.split].includes(report.seed));
    assert.deepEqual(report.manifest,manifest);assert.equal(report.model,protocol.arms[report.arm].model);assert.equal(report.modelDigest,require('./model-locks.json')[report.model]);
    assert.equal(report.complete,true);assert.equal(report.rows.length,30);assert.equal(report.attempt,1);assert.deepEqual(report.options,{...protocol.options,seed:report.seed});
    const rowIds=new Set();
    for(const row of report.rows){
      const fixture=cases.find(item=>item.id===row.id&&item.split===report.split);assert.ok(fixture);assert.ok(!rowIds.has(row.id));rowIds.add(row.id);
      if(!expectedContexts.has(fixture.id))expectedContexts.set(fixture.id,referenceInput(fixture,training));
      const input=expectedContexts.get(fixture.id);assert.equal(row.context,input.context);assert.equal(row.contextDigest,hash(input.context));
      if(!row.error)assert.deepEqual(row.actual,JSON.parse(row.response.response));
      const validation=row.error?{accepted:{},rejected:{},protocolErrors:['request_or_json_failure']}:validate(row.actual,fixture.content,protocol.arms[report.arm].evidence,protocol);
      assert.deepEqual(row.validation,validation);assert.deepEqual(row.scores,scores(row.actual,validation.accepted,fixture,training));
      const contextKey=fixture.id;if(contexts.has(contextKey))assert.equal(row.contextDigest,contexts.get(contextKey));else contexts.set(contextKey,row.contextDigest);
    }
    const summary=summarize(report.rows,cases);assert.deepEqual(summary,report.summary);
    const proposalDiagnostics={};
    for(const [field,data_type]of Object.entries(fieldTypes)){
      const detail={correctTypedInput:0,correctTypedRetained:0,correctTypedLost:0,lossReasons:{}};
      for(const row of report.rows){
        const expected=cases.find(item=>item.id===row.id).expected.custom_fields[field];
        if(expected!==null&&normalizeValue(row.actual?.custom_fields?.[field],{data_type})===expected){
          detail.correctTypedInput++;
          if(Object.hasOwn(row.validation.accepted,field))detail.correctTypedRetained++;
          else {detail.correctTypedLost++;const reason=row.validation.rejected[field]||'protocol_failure';detail.lossReasons[reason]=(detail.lossReasons[reason]||0)+1;}
        }
      }
      proposalDiagnostics[field]=detail;
    }
    result.groups[key]={...summary,proposalDiagnostics,identifiers:identifierTotals(summary),byLanguage:Object.fromEntries(['en','de'].map(language=>[language,summarize(report.rows.filter(row=>cases.find(item=>item.id===row.id).language===language),cases)]))};
    result.sources.push({name,sha256:hash(bytes),containerSHA256:containerDigest,commit:report.commit,run:report.run,modelDigest:report.modelDigest});result.attempts+=report.rows.length;
  }
  assert.equal(result.attempts,protocol.maxRequests);assert.equal(runs.size,1);assert.equal(commits.size,1);
  for(const arm of ['B','C']){
    const seeds=[42,43].map(seed=>{
      const row=result.groups[`${arm}/confirmation/${seed}`],baseline=result.groups[`A/confirmation/${seed}`],s=row.identifiers;
      return {seed,...s,failedAttempts:row.failedAttempts,baselineCorrect:baseline.identifiers.correct,
        passes:row.failedAttempts===0&&baseline.failedAttempts===0&&s.present>0&&s.wrong===0&&s.correct/s.present>=0.8&&s.correct>=baseline.identifiers.correct};
    });
    result.qualification[arm]={seeds,qualifiedForLaterProposal:seeds.every(row=>row.passes)};
  }
  for(const file of ['core.js','report.js','protocol.json','manifest.json','model-locks.json'])result.sourceFiles[file]=hash(fs.readFileSync(path.join(__dirname,file)));
  return result;
}
if(require.main===module){const report=aggregate(process.argv[2]);const output=JSON.stringify(report,null,2)+'\n';if(process.argv[3])fs.writeFileSync(process.argv[3],output);else process.stdout.write(output);}
module.exports={aggregate,reportBytes};
