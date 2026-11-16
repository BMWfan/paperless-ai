'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {load,hash,inputFor,validateArm,scoreRow,summarize,identifierTotals,sourceDigests}=require('./core');
const bytes=file=>file.endsWith('.gz')?require('node:zlib').gunzipSync(fs.readFileSync(file),{maxOutputLength:16*1024*1024}):fs.readFileSync(file);
function qualify(groups,protocol){
  return Object.fromEntries(protocol.seeds.confirmation.map(seed=>{
    const a=groups[`A/confirmation/${seed}`],b=groups[`B/confirmation/${seed}`];assert.ok(a&&b);
    const ai=identifierTotals(a),bi=identifierTotals(b),reasons=[];
    if(a.failedAttempts||b.failedAttempts)reasons.push('protocol_failure');
    if(bi.wrong>protocol.qualification.maximumWrongAcceptedIdentifiers)reasons.push('wrong_identifier');
    if(b.wrongAcceptedSources>protocol.qualification.maximumWrongAcceptedSources)reasons.push('wrong_source');
    if(!bi.present||bi.correct/bi.present<protocol.qualification.minimumPositiveIdentifierCoverage)reasons.push('positive_coverage');
    if(bi.correct<ai.correct)reasons.push('coverage_decline');
    return [seed,{passed:!reasons.length,reasons,controlIdentifiers:ai,candidateIdentifiers:bi,wrongAcceptedSources:b.wrongAcceptedSources}];
  }));
}
function aggregate(directory,{fixtureOnly=false}={}){
  const {cases,protocol,manifest}=load(),training=cases.filter(row=>row.split==='training');
  assert.deepEqual(sourceDigests(),require('./harness-lock.json'));
  const files=fs.readdirSync(directory).sort().filter(name=>/^identifier-roles-[AB]-(development|confirmation)-4[23]\.json(?:\.gz)?$/.test(name));assert.equal(files.length,6,'all six measured groups required');
  const result={revision:protocol.revision,attempts:0,groups:{},byLanguage:{},byCohort:{},sources:[],fixtureOnly,productionActivation:false};
  const seen=new Set(),runs=new Set(),commits=new Set(),inputs=new Map();
  for(const name of files){
    const file=path.join(directory,name),data=bytes(file),report=JSON.parse(data),key=`${report.arm}/${report.split}/${report.seed}`;
    assert.ok(!seen.has(key));seen.add(key);assert.ok(['A','B'].includes(report.arm));assert.ok(protocol.seeds[report.split]?.includes(report.seed));
    assert.equal(name.replace(/\.gz$/,''),`identifier-roles-${report.arm}-${report.split}-${report.seed}.json`);
    assert.equal(report.revision,protocol.revision);assert.deepEqual(report.manifest,manifest);assert.deepEqual(report.sourceDigests,require('./harness-lock.json'));
    assert.equal(report.origin,'http://127.0.0.1:11434');assert.equal(report.model,protocol.model);assert.equal(report.modelDigest,protocol.modelDigest);assert.equal(report.ollamaVersion,protocol.ollamaVersion);
    assert.equal(report.complete,true);assert.equal(report.attempt,1);assert.equal(report.rows.length,30);assert.equal(report.requestCount,30);assert.deepEqual(report.options,{...protocol.options,seed:report.seed});runs.add(report.run);commits.add(report.commit);
    if(!fixtureOnly){assert.equal(report.fixtureOnly,undefined);assert.match(report.run||'',/^\d+$/);assert.match(report.commit||'',/^[a-f0-9]{40}$/);}
    const rowIds=new Set();
    for(const row of report.rows){
      assert.equal(row.terminal,true);const fixture=cases.find(c=>c.id===row.id&&c.split===report.split);assert.ok(fixture);assert.ok(!rowIds.has(row.id));rowIds.add(row.id);
      const inputKey=report.arm+'/'+row.id;if(!inputs.has(inputKey))inputs.set(inputKey,inputFor(fixture.content,training,report.arm,protocol));const input=inputs.get(inputKey);
      assert.deepEqual(row.input,input);assert.equal(row.inputDigest,hash(JSON.stringify(input)));
      assert.equal(row.request.model,protocol.model);assert.equal(row.request.prompt,input.prompt);assert.equal(row.request.system,input.system);assert.equal(row.request.stream,false);assert.deepEqual(row.request.format,input.format);assert.deepEqual(row.request.options,{...protocol.options,seed:report.seed});
      if(!row.error){assert.equal(row.response.done,true);assert.ok(Number.isSafeInteger(row.response.eval_count)&&row.response.eval_count>0);assert.deepEqual(row.actual,JSON.parse(row.response.response));}
      const checked=row.error?{accepted:{},rejected:{},sources:{},claims:[],blocked:{},protocolErrors:['request_or_json_failure']}:validateArm(row.actual,input,report.arm,fixture.content,protocol);
      assert.deepEqual(row.validation,checked);assert.deepEqual(row.scores,scoreRow(row.actual,checked,input,fixture,training,report.arm));
    }
    const summary=summarize(report.rows,cases);assert.deepEqual(report.summary,summary);result.groups[key]=summary;result.attempts+=report.rows.length;
    for(const [target,property,values]of [['byLanguage','language',['en','de']],['byCohort','cohort',['present','missing','inapplicable']]]){
      const split=Object.fromEntries(values.map(value=>[value,summarize(report.rows.filter(row=>cases.find(c=>c.id===row.id)[property]===value),cases)]));
      assert.deepEqual(report[target==='byLanguage'?'summaryByLanguage':'summaryByCohort'],split);result[target][key]=split;
    }
    result.sources.push({file:name,sha256:hash(data),storedSha256:hash(fs.readFileSync(file)),commit:report.commit,run:report.run});
  }
  assert.equal(runs.size,1);assert.equal(commits.size,1);assert.equal(result.attempts,180);
  result.qualification=qualify(result.groups,protocol);result.qualifiedForLaterProposal=!fixtureOnly&&Object.values(result.qualification).every(q=>q.passed);return result;
}
if(require.main===module)process.stdout.write(JSON.stringify(aggregate(process.argv[2]),null,2)+'\n');
module.exports={aggregate,qualify,bytes};
