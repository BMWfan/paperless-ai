'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {load,hash,validate,scores,summarize,identifierTotals,referenceInput,provenance,sourceDigests}=require('./core');
const bytes=file=>file.endsWith('.gz')?require('node:zlib').gunzipSync(fs.readFileSync(file),{maxOutputLength:16*1024*1024}):fs.readFileSync(file);
function aggregate(directory,{fixtureOnly=false}={}){
  const {cases,protocol,manifest}=load(),training=cases.filter(row=>row.split==='training'),contexts=new Map();
  assert.deepEqual(sourceDigests(),require('./harness-lock.json'));
  const files=fs.readdirSync(directory).sort().filter(name=>/^projection-[AB]-(development|confirmation)-4[23]\.json(?:\.gz)?$/.test(name));
  assert.equal(files.length,6,'all six measured groups required');
  const result={revision:protocol.revision,attempts:0,sources:[],groups:{},byLanguage:{},provenance:{},qualification:{},fixtureOnly,productionActivation:false};
  const seen=new Set(),runs=new Set(),commits=new Set();
  for(const name of files){
    const file=path.join(directory,name),data=bytes(file),report=JSON.parse(data),key=`${report.arm}/${report.split}/${report.seed}`;
    assert.ok(!seen.has(key));seen.add(key);assert.ok(protocol.arms[report.arm]);assert.ok(protocol.seeds[report.split]?.includes(report.seed));
    assert.equal(name.replace(/\.gz$/,''),`projection-${report.arm}-${report.split}-${report.seed}.json`);
    assert.equal(report.revision,protocol.revision);assert.deepEqual(report.manifest,manifest);assert.deepEqual(report.sourceDigests,require('./measurement-lock.json')); // Original measurement runtime, before native-only import repair.
    assert.equal(report.model,protocol.model);assert.equal(report.modelDigest,protocol.modelDigest);assert.equal(report.ollamaVersion,protocol.ollamaVersion);
    assert.equal(report.origin,'http://127.0.0.1:11434');assert.equal(report.attempt,1);assert.equal(report.complete,true);assert.equal(report.rows.length,30);assert.equal(report.requestCount,30);
    assert.deepEqual(report.options,{...protocol.options,seed:report.seed});runs.add(report.run);commits.add(report.commit);
    if(!fixtureOnly){assert.match(report.run||'',/^\d+$/);assert.match(report.commit||'',/^[a-f0-9]{40}$/);assert.equal(report.fixtureOnly,undefined);}
    const rowIds=new Set(),sourceCounts={};
    for(const row of report.rows){
      assert.equal(row.terminal,true);
      const fixture=cases.find(item=>item.id===row.id&&item.split===report.split);assert.ok(fixture);assert.ok(!rowIds.has(row.id));rowIds.add(row.id);
      if(!contexts.has(fixture.id))contexts.set(fixture.id,referenceInput(fixture,training));const input=contexts.get(fixture.id);
      const context=input.contexts[report.arm],prompt=`CURRENT DOCUMENT:\n${fixture.content}`,system=protocol.baselineSystem+context;
      assert.equal(row.context,context);assert.equal(row.contextDigest,hash(context));assert.equal(row.controlContextDigest,hash(input.contexts.A));
      assert.deepEqual(row.selectedReferences,input.selectedIds);assert.deepEqual(row.rankedReferences,input.rankedIds);assert.deepEqual(row.referenceTokens,input.tokens);
      assert.equal(row.prompt,prompt);assert.equal(row.systemDigest,hash(system));
      assert.equal(row.request.model,protocol.model);assert.equal(row.request.prompt,prompt);assert.equal(row.request.system,system);assert.equal(row.request.stream,false);
      assert.deepEqual(row.request.format,protocol.baselineSchema);assert.deepEqual(row.request.options,{...protocol.options,seed:report.seed});
      if(!row.error){assert.equal(row.response.done,true);assert.ok(row.response.eval_count>0);assert.deepEqual(row.actual,JSON.parse(row.response.response));}
      const checked=row.error?{accepted:{},rejected:{},protocolErrors:['request_or_json_failure']}:validate(row.actual,fixture.content,protocol);
      assert.deepEqual(row.validation,checked);assert.deepEqual(row.scores,scores(row.actual,checked.accepted,fixture,training));assert.deepEqual(row.provenance,provenance(row.actual,fixture,training));
      for(const reason of Object.values(row.provenance))sourceCounts[reason]=(sourceCounts[reason]||0)+1;
    }
    const summary=summarize(report.rows,cases);assert.deepEqual(report.summary,summary);
    const byLanguage=Object.fromEntries(['en','de'].map(language=>[language,summarize(report.rows.filter(row=>cases.find(item=>item.id===row.id).language===language),cases)]));
    assert.deepEqual(report.summaryByLanguage,byLanguage);
    result.groups[key]=summary;result.byLanguage[key]=byLanguage;result.provenance[key]=sourceCounts;result.attempts+=report.rows.length;
    result.sources.push({file:name,sha256:hash(data),storedSha256:hash(fs.readFileSync(file)),commit:report.commit,run:report.run});
  }
  assert.equal(runs.size,1);assert.equal(commits.size,1);assert.equal(result.attempts,180);
  for(const seed of protocol.seeds.confirmation){
    const a=result.groups[`A/confirmation/${seed}`],b=result.groups[`B/confirmation/${seed}`],ai=identifierTotals(a),bi=identifierTotals(b),reasons=[];
    assert.ok(a&&b);
    if(a.failedAttempts||b.failedAttempts)reasons.push('protocol_failure');
    if(bi.wrong>protocol.qualification.maximumWrongAcceptedIdentifiers)reasons.push('wrong_identifier');
    if(!bi.present||bi.correct/bi.present<protocol.qualification.minimumPositiveIdentifierCoverage)reasons.push('positive_identifier_coverage');
    if(bi.correct<ai.correct)reasons.push('identifier_coverage_decline');
    for(const field of Object.keys(b.fields)){
      if(b.fields[field].correctPresent<a.fields[field].correctPresent)reasons.push(`${field}:correct_decline`);
      if(b.fields[field].wrongAccepted>a.fields[field].wrongAccepted)reasons.push(`${field}:wrong_increase`);
    }
    for(const field of Object.keys(b.metadata))for(const status of ['correct','wrong','missing']){
      if(status==='correct'?b.metadata[field][status]<a.metadata[field][status]:b.metadata[field][status]>a.metadata[field][status])reasons.push(`${field}:${status}_regression`);
    }
    result.qualification[seed]={passed:reasons.length===0,reasons,controlIdentifiers:ai,candidateIdentifiers:bi};
  }
  result.qualifiedForLaterProposal=!fixtureOnly&&Object.values(result.qualification).every(value=>value.passed);
  return result;
}
if(require.main===module)process.stdout.write(JSON.stringify(aggregate(process.argv[2]),null,2)+'\n');
module.exports={aggregate,bytes};
