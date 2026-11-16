'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=require('./identifier-roles/core');
const {load,hash,enumerate,inputFor,validateArm,scoreRow,summarize,sourceDigests,ids}=core;
const {aggregate,qualify}=require('./identifier-roles/report');
const {cases,protocol,manifest}=load(),training=cases.filter(row=>row.split==='training'),cache=new Map();
const input=(fixture,arm)=>{const key=arm+'/'+fixture.id;if(!cache.has(key))cache.set(key,inputFor(fixture.content,training,arm,protocol));return cache.get(key);};
const goldResponse=(fixture,prepared)=>({assignments:prepared.occurrences.candidates.map(c=>{const g=fixture.goldSpans.find(g=>g.start===c.start&&g.end===c.end);return {id:c.id,role:g?.role||'not_identifier',field:g?.field||null};})});
test('identifier roles freeze is bilingual/disjoint, positions are original UTF16 and hard cases stay positive',()=>{
  const previous=new Set([...require('./context-projection/cases.json').cases,...require('./quality/extraction/cases.json').cases].map(c=>c.content));
  assert.equal(cases.length,70);assert.equal(new Set(cases.map(c=>c.id)).size,70);assert.equal(new Set(cases.map(c=>c.content)).size,70);
  for(const c of cases){assert.ok(!previous.has(c.content));for(const g of c.goldSpans)assert.equal(c.content.slice(g.start,g.end),g.value);}
  for(const split of ['development','confirmation']){
    const rows=cases.filter(c=>c.split===split);assert.equal(rows.length,30);
    for(const language of ['en','de'])assert.equal(rows.filter(c=>c.language===language).length,15);
    for(const cohort of ['present','missing','inapplicable'])assert.equal(rows.filter(c=>c.cohort===cohort).length,10);
    const gap=rows.find(c=>c.annotation.candidateGapChallenge),overflow=rows.find(c=>c.annotation.candidateOverflowChallenge);
    assert.equal(gap.cohort,'present');assert.equal(overflow.cohort,'present');assert.equal(enumerate(overflow.content).status,'occurrence_limit');
    const candidates=enumerate(gap.content).candidates;assert.ok(gap.goldSpans.some(g=>g.role==='own_current'&&!candidates.some(c=>c.start===g.start&&c.end===g.end)));
  }
  assert.equal(protocol.maxRequests,180);assert.equal(protocol.options.num_predict,1536);assert.equal(protocol.productionActivation,false);
  assert.deepEqual(sourceDigests(),require('./identifier-roles/harness-lock.json'));
});
test('lexical enumeration preserves Unicode/CRLF/overlap and never silently takes the first32',()=>{
  const content='Invoice number: INV-17\r\nDate: 2030-01-02\nNote: A 12 B\n😀From: X-9\n';
  const result=enumerate(content);assert.equal(result.status,'ok');assert.deepEqual(result.candidates.map(c=>c.value),['INV-17','2030-01-02','A 12 B','12','X-9']);
  for(const c of result.candidates)assert.equal(content.slice(c.start,c.end),c.value);
  const unicode='Numéro: AB-e\u0301-٠٠٩\r\n';assert.equal(enumerate(unicode).candidates[0].value,'AB-e\u0301-٠٠٩');
  const repeated=enumerate('ID: SAME-001\nID: SAME-001').candidates;assert.equal(repeated.length,2);assert.notEqual(repeated[0].start,repeated[1].start);
  assert.equal(enumerate(Array.from({length:33},(_,i)=>'N-'+i).join(' ')).status,'occurrence_limit');assert.equal(enumerate('ID: '+'X'.repeat(129)).status,'candidate_length');
  assert.equal(enumerate('x'.repeat(50001)).status,'character_limit');assert.equal(enumerate('').status,'invalid_input');assert.equal(enumerate(null).status,'invalid_input');
});
test('resolver rejects invalid assignment sets, conflicts and uncertainty; repeated same current value retains all sources',()=>{
  const content='Invoice number: NEW-1\nInvoice number: NEW-1\nContract number: CT-2',prepared=inputFor(content,[],'B'),actual={assignments:prepared.occurrences.candidates.map(c=>({id:c.id,role:'own_current',field:c.value==='CT-2'?'contract_number':'invoice_number'}))};
  let checked=validateArm(actual,prepared,'B',content);assert.equal(checked.accepted.invoice_number,'NEW-1');assert.equal(checked.sources.invoice_number.length,2);
  const changed=structuredClone(actual);changed.assignments[1].id=1;assert.ok(validateArm(changed,prepared,'B',content).protocolErrors.length);
  assert.ok(validateArm({assignments:actual.assignments.slice(1)},prepared,'B',content).protocolErrors.length);
  assert.ok(validateArm({...actual,language:'de'},prepared,'B',content).protocolErrors.length,'cannot replace standard metadata');
  changed.assignments[1]={id:2,role:'unclear',field:'invoice_number'};checked=validateArm(changed,prepared,'B',content);assert.equal(checked.accepted.invoice_number,undefined);assert.equal(checked.accepted.contract_number,'CT-2');
  changed.assignments[1].field=null;assert.deepEqual(validateArm(changed,prepared,'B',content).accepted,{});
  changed.assignments[1]={id:2,role:'not_identifier',field:'invoice_number'};assert.ok(validateArm(changed,prepared,'B',content).protocolErrors.length);
  const conflicting=inputFor('ID: NEW-1\nID: NEW-2',[],'B');checked=validateArm({assignments:conflicting.occurrences.candidates.map(c=>({id:c.id,role:'own_current',field:'invoice_number'}))},conflicting,'B','');assert.equal(checked.blocked.invoice_number,'conflicting_current_values');assert.deepEqual(checked.accepted,{});
});
test('a correct literal value from a historical occurrence still fails source ownership',()=>{
  const fixture=cases.find(c=>c.split==='confirmation'&&c.cohort==='present'&&c.kind==='insurance'),prepared=input(fixture,'B'),actual=goldResponse(fixture,prepared),target=fixture.expected.custom_fields.policy_number;
  const old=prepared.occurrences.candidates.find(c=>c.value===target&&fixture.goldSpans.some(g=>g.start===c.start&&g.role==='historical'));assert.ok(old);
  const changed=actual.assignments.find(r=>r.id===old.id);changed.role='own_current';changed.field='policy_number';
  const checked=validateArm(actual,prepared,'B',fixture.content),score=scoreRow(actual,checked,prepared,fixture,training,'B');assert.equal(checked.accepted.policy_number,target);assert.equal(score.validated.policy_number,'correct');assert.equal(score.wrongAcceptedSources,1);
  assert.ok(score.rawClaims.policy_number.wrongSource>0);assert.equal(score.rawClaims.policy_number.wrongValue,0);
});
test('A uses unchanged production raw context; B uses only current text/occurrences and cannot leak expected annotations',()=>{
  const {selectContext}=require('../services/learningContext'),refs=training.map(c=>({id:c.id,metadata:c.expected,content_preview:c.content.slice(0,500)}));
  for(const fixture of cases.filter(c=>c.split!=='training')){
    const a=input(fixture,'A'),b=input(fixture,'B');if(!a.guard)assert.equal(a.context,selectContext(fixture.content,refs,1500));
    assert.equal(b.selectedReferences.length,0);assert.ok(!b.system.includes('Reference classification data'));
    if(!b.guard){const request=JSON.parse(b.prompt);assert.equal(request.document,fixture.content);assert.deepEqual(Object.keys(request),['document','occurrences']);assert.deepEqual(request.occurrences,enumerate(fixture.content).candidates);}
  }
  const fixture=cases.find(c=>c.split==='development'),altered={...fixture,expected:{},goldSpans:[],annotation:{},id:'hidden'};assert.deepEqual(inputFor(altered.content,training,'B'),input(fixture,'B'));
  const original=JSON.stringify(fixture.expected);validateArm(goldResponse(fixture,input(fixture,'B')),input(fixture,'B'),'B',fixture.content);assert.equal(JSON.stringify(fixture.expected),original);
  const baseline=structuredClone(fixture.expected),before=structuredClone(baseline),checked=validateArm(baseline,input(fixture,'A'),'A',fixture.content);scoreRow(baseline,checked,input(fixture,'A'),fixture,training,'A');assert.deepEqual(baseline,before,'AI metadata including language/correspondent passes through without mutation');
  assert.ok(Object.keys(checked.accepted).every(field=>ids.includes(field)),'identifier result cannot replace standard metadata');
});
test('frozen gates cannot qualify wrong sources, wrong values, coverage collapse or protocol errors',()=>{
  const summary=(correct=8,wrong=0)=>({failedAttempts:0,wrongAcceptedSources:0,fields:{invoice_number:{present:10,correctPresent:correct,wrongAccepted:wrong}}});
  const groups={};for(const seed of [42,43]){groups[`A/confirmation/${seed}`]=summary();groups[`B/confirmation/${seed}`]=summary();}assert.ok(Object.values(qualify(groups,protocol)).every(q=>q.passed));
  const b=groups['B/confirmation/42'];b.wrongAcceptedSources=1;assert.ok(qualify(groups,protocol)[42].reasons.includes('wrong_source'));b.wrongAcceptedSources=0;b.fields.invoice_number.wrongAccepted=1;assert.ok(qualify(groups,protocol)[42].reasons.includes('wrong_identifier'));
  b.fields.invoice_number.wrongAccepted=0;b.fields.invoice_number.correctPresent=7;assert.ok(qualify(groups,protocol)[42].reasons.includes('positive_coverage'));assert.ok(qualify(groups,protocol)[42].reasons.includes('coverage_decline'));b.fields.invoice_number.correctPresent=8;groups['A/confirmation/42'].failedAttempts=1;assert.ok(qualify(groups,protocol)[42].reasons.includes('protocol_failure'));
});
function writeReport(dir,arm,split,seed){
  const rows=cases.filter(c=>c.split===split).map(fixture=>{
    const prepared=input(fixture,arm),actual=arm==='A'?fixture.expected:goldResponse(fixture,prepared),validation=validateArm(actual,prepared,arm,fixture.content),request={model:protocol.model,system:prepared.system,prompt:prepared.prompt,stream:false,format:prepared.format,options:{...protocol.options,seed}};
    return {id:fixture.id,input:prepared,inputDigest:hash(JSON.stringify(prepared)),request,actual,response:{done:true,eval_count:1,prompt_eval_count:1,response:JSON.stringify(actual)},validation,scores:scoreRow(actual,validation,prepared,fixture,training,arm),terminal:true,durationMs:1};
  });
  const report={revision:protocol.revision,model:protocol.model,modelDigest:protocol.modelDigest,ollamaVersion:protocol.ollamaVersion,arm,split,seed,origin:'http://127.0.0.1:11434',attempt:1,run:'fixture-only',commit:'not-inference',fixtureOnly:true,complete:true,requestCount:30,options:{...protocol.options,seed},manifest,sourceDigests:sourceDigests(),rows,summary:summarize(rows,cases)};
  for(const [key,property,values]of [['summaryByLanguage','language',['en','de']],['summaryByCohort','cohort',['present','missing','inapplicable']]])report[key]=Object.fromEntries(values.map(value=>[value,summarize(rows.filter(r=>cases.find(c=>c.id===r.id)[property]===value),cases)]));
  const file=path.join(dir,`identifier-roles-${arm}-${split}-${seed}.json`);fs.writeFileSync(file,JSON.stringify(report));return file;
}
test('aggregation reconstructs all180 inputs and rejects fixture evidence, tampering and missing batches',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'identifier-roles-aggregate-'));
  try{
    for(const arm of ['A','B'])for(const split of ['development','confirmation'])for(const seed of protocol.seeds[split])writeReport(dir,arm,split,seed);
    const result=aggregate(dir,{fixtureOnly:true});assert.equal(result.attempts,180);assert.equal(result.groups['A/confirmation/42'].wrongAcceptedSources,null);assert.equal(result.groups['A/confirmation/42'].sourceEvaluation,'not_available');assert.equal(result.qualifiedForLaterProposal,false);assert.ok(result.qualification[42].reasons.includes('coverage_decline'),'guard and lexical gaps stay in denominator');assert.throws(()=>aggregate(dir));
    const file=path.join(dir,'identifier-roles-B-confirmation-43.json'),original=fs.readFileSync(file),changed=JSON.parse(original);changed.rows[0].request.prompt+=' expected answer';fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>aggregate(dir,{fixtureOnly:true}));fs.writeFileSync(file,original);fs.unlinkSync(file);assert.throws(()=>aggregate(dir,{fixtureOnly:true}),/all six/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual HTTP runner accounts30 attempts, errors and redirect refusal without model retries',async()=>{
  const http=require('node:http'),{spawn}=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'identifier-roles-http-')),file=path.join(dir,'out.json'),requests=[];
  const fixtures=cases.filter(c=>c.split==='development'),prompts=new Map(fixtures.map(c=>[input(c,'B').prompt,c]));
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/api/version'){res.end(JSON.stringify({version:protocol.ollamaVersion}));return;}
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:protocol.model,digest:protocol.modelDigest}]}));return;}
    assert.equal(req.url,'/api/generate');let body='';for await(const data of req)body+=data;const sent=JSON.parse(body),fixture=prompts.get(sent.prompt);assert.ok(fixture);assert.deepEqual(sent.options,{...protocol.options,seed:42});assert.deepEqual(sent.format,input(fixture,'B').format);requests.push(fixture.id);
    if(requests.length===1){res.statusCode=503;res.end('synthetic unavailable');return;}if(requests.length===3){res.writeHead(307,{Location:'/not-authorized'});res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done:true,eval_count:10,prompt_eval_count:20,response:requests.length===2?'invalid JSON':JSON.stringify(goldResponse(fixture,input(fixture,'B')))}));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const run=attempt=>new Promise(resolve=>{const child=spawn(process.execPath,['tests/identifier-roles/run.js'],{env:{...process.env,IDENTIFIER_ROLES_ARM:'B',IDENTIFIER_ROLES_SPLIT:'development',IDENTIFIER_ROLES_SEED:'42',IDENTIFIER_ROLES_OUTPUT:file,IDENTIFIER_ROLES_ORIGIN:`http://127.0.0.1:${server.address().port}`,IDENTIFIER_ROLES_FIXTURE_TEST:'1',GITHUB_RUN_ATTEMPT:String(attempt),GITHUB_RUN_ID:'fixture-only',GITHUB_SHA:'fixture-only'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});child.on('exit',code=>resolve({code,output}));});
  try{const done=await run(1);assert.equal(done.code,0,done.output.slice(-1200));const report=JSON.parse(fs.readFileSync(file));assert.equal(report.fixtureOnly,true);assert.equal(report.complete,true);assert.equal(report.requestCount,30);assert.equal(report.summary.failedAttempts,3);assert.equal(new Set(requests).size,30);assert.ok(report.rows.every(r=>r.request&&r.terminal));assert.equal((await run(2)).code,1);assert.equal(requests.length,30);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
test('new workflow is manual/read-only/six groups and old measurement source lock stays immutable',()=>{
  const workflow=fs.readFileSync('.github/workflows/classification-evaluation.yml','utf8'),section=workflow.slice(workflow.indexOf('  identifier-roles-measure:'),workflow.indexOf('  identifier-roles-replay:'));
  assert.equal((section.match(/- \{arm:/g)||[]).length,6);assert.ok(section.includes("inputs.extraction_stage == 'identifier-roles'"));assert.ok(section.includes('max-parallel: 2'));assert.ok(section.includes('test "$GITHUB_RUN_ATTEMPT" = 1'));assert.ok(!section.includes('secrets.'));assert.ok(workflow.includes('permissions:\n  contents: read'));
  assert.equal(hash(fs.readFileSync('tests/context-projection/measurement-lock.json')),'974263ea1df81f7f1551b063d9ddb6dfa678f5680a29860788f6b6c3e06f0930');
  assert.ok(ids.every(field=>protocol.baselineSchema.properties.custom_fields.properties[field]));
});
