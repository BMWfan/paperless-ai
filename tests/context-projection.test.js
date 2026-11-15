'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {load,referenceInput,sourceDigests,validate,scores,summarize,provenance,hash}=require('./context-projection/core');
const {cases,protocol,manifest}=load(),training=cases.filter(row=>row.split==='training');
const {aggregate}=require('./context-projection/report');
const inputs=new Map();const input=fixture=>{if(!inputs.has(fixture.id))inputs.set(fixture.id,referenceInput(fixture,training));return inputs.get(fixture.id);};

test('projection freeze has new bilingual disjoint roles and180 bounded attempts',()=>{
  const old=require('./quality/extraction/cases.json').cases,oldText=new Set(old.map(row=>row.content));
  assert.equal(cases.length,70);assert.equal(new Set(cases.map(row=>row.id)).size,70);assert.equal(new Set(cases.map(row=>row.content)).size,70);
  for(const row of cases)assert.ok(!oldText.has(row.content));
  const ids=rows=>new Set(rows.flatMap(row=>Object.entries(row.expected.custom_fields).filter(([key,value])=>key.endsWith('_number')&&value!==null).map(([,value])=>value)));
  const sourceIds=ids(training);
  for(const split of ['development','confirmation']){
    const rows=cases.filter(row=>row.split===split);assert.equal(rows.length,30);
    for(const language of ['en','de'])assert.equal(rows.filter(row=>row.language===language).length,15);
    for(const cohort of ['present','missing','inapplicable'])assert.equal(rows.filter(row=>row.cohort===cohort).length,10);
    for(const id of ids(rows))assert.ok(!sourceIds.has(id));
    for(const row of rows){assert.ok(row.forbiddenCurrentIdentifiers.every(id=>row.content.includes(id)));for(const [field,value] of Object.entries(row.expected.custom_fields))if(value!==null)assert.ok(row.content.includes(field==='amount'?value.replace('EUR','EUR '):value));}
  }
  for(const id of ids(cases.filter(row=>row.split==='development')))assert.ok(!ids(cases.filter(row=>row.split==='confirmation')).has(id));
  assert.equal(protocol.maxRequests,180);assert.equal(protocol.maxParallelJobs,2);assert.equal(protocol.requestTimeoutMs,180000);
  assert.deepEqual(protocol.baselineSystem,require('./quality/protocol').system);assert.deepEqual(protocol.baselineSchema,require('./quality/protocol').schema);
  assert.deepEqual(sourceDigests(),require('./context-projection/harness-lock.json'));
});
test('projection keeps exactly the production-selected references and never fills its shorter budget',()=>{
  const {selectContext}=require('../services/learningContext');
  const refs=training.map(row=>({id:row.id,metadata:row.expected,content_preview:row.content.slice(0,500)}));
  for(const fixture of cases.filter(row=>row.split!=='training')){
    const value=input(fixture);assert.equal(value.contexts.A,selectContext(fixture.content,refs,1500));
    assert.ok(value.selectedIds.length>0&&value.selectedIds.length<=8);assert.ok(value.tokens.A<=1500&&value.tokens.B<=1500);assert.ok(value.tokens.B<value.tokens.A);
    const end=value.contexts.A.lastIndexOf('\n')+1;assert.equal(value.contexts.A.slice(0,end),value.contexts.B.slice(0,end));
    const projected=JSON.parse(value.contexts.B.slice(end));assert.equal(projected.length,value.selectedIds.length);
    assert.ok(projected.every(row=>Object.keys(row).join(',')==='metadata'&&Object.keys(row.metadata).join(',')==='document_type,tags,correspondent'));
    assert.ok(!value.contexts.B.includes('RCP-T-'),'source IDs in titles/custom fields never enter categorical context');
    for(const source of training)for(const valueToExclude of Object.values(source.expected.custom_fields))if(valueToExclude!==null)assert.ok(!value.contexts.B.includes(valueToExclude));
  }
  const fixture=cases.find(row=>row.split==='development');
  assert.deepEqual(referenceInput({...fixture,id:'changed',expected:{},cohort:'secret',annotation:'hidden answer'},training),input(fixture));
});
test('raw/type errors and source provenance remain separate without relaxing old scoring',()=>{
  const fixture=cases.find(row=>row.cohort==='missing'),value=structuredClone(fixture.expected);value.custom_fields.invoice_number=training[0].expected.custom_fields.invoice_number;
  const checked=validate(value,fixture.content,protocol),scored=scores(value,checked.accepted,fixture,training);
  assert.equal(scored.validated.invoice_number,'wrong');assert.equal(scored.errors.invoice_number,'training_value_copy');
  const note=training.find(row=>row.kind==='letter');value.custom_fields.invoice_number=note.expected.title.match(/RCP-T-NOTE-\d+/)[0];
  assert.equal(provenance(value,fixture,training).invoice_number,'training_literal_copy','source-title copy is audited even outside native source fields');
  value.custom_fields.invoice_number=fixture.forbiddenCurrentIdentifiers[0];assert.equal(provenance(value,fixture,training).invoice_number,'historical_literal_copy');
  value.custom_fields.invoice_number='x'.repeat(129);const rejected=validate(value,fixture.content,protocol);
  assert.equal(rejected.rejected.invoice_number,'invalid_type');assert.equal(scores(value,rejected.accepted,fixture,training).raw.invoice_number,'wrong');
});
function writeReport(dir,arm,split,seed){
  const rows=cases.filter(row=>row.split===split).map(fixture=>{
    const value=input(fixture),context=value.contexts[arm],prompt=`CURRENT DOCUMENT:\n${fixture.content}`,system=protocol.baselineSystem+context,actual=structuredClone(fixture.expected),checked=validate(actual,fixture.content,protocol);
    return {id:fixture.id,context,contextDigest:hash(context),controlContextDigest:hash(value.contexts.A),selectedReferences:value.selectedIds,rankedReferences:value.rankedIds,referenceTokens:value.tokens,prompt,systemDigest:hash(system),durationMs:1,terminal:true,
      actual,response:{done:true,eval_count:1,prompt_eval_count:1,response:JSON.stringify(actual)},request:{model:protocol.model,prompt,system,stream:false,format:protocol.baselineSchema,options:{...protocol.options,seed}},validation:checked,scores:scores(actual,checked.accepted,fixture,training),provenance:provenance(actual,fixture,training)};
  });
  const report={revision:protocol.revision,arm,split,seed,model:protocol.model,modelDigest:protocol.modelDigest,ollamaVersion:protocol.ollamaVersion,origin:'http://127.0.0.1:11434',attempt:1,complete:true,requestCount:30,options:{...protocol.options,seed},manifest,sourceDigests:require('./context-projection/measurement-lock.json'),run:'fixture-only',commit:'not-model-evidence',fixtureOnly:true,rows,
    summary:summarize(rows,cases),summaryByLanguage:Object.fromEntries(['en','de'].map(language=>[language,summarize(rows.filter(row=>cases.find(item=>item.id===row.id).language===language),cases)]))};
  const file=path.join(dir,`projection-${arm}-${split}-${seed}.json`);fs.writeFileSync(file,JSON.stringify(report));return file;
}
test('aggregation recomputes all180 rows, rejects input tampering and never qualifies fixture evidence',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'projection-aggregate-'));
  try{
    for(const arm of ['A','B'])for(const split of ['development','confirmation'])for(const seed of protocol.seeds[split])writeReport(dir,arm,split,seed);
    const result=aggregate(dir,{fixtureOnly:true});assert.equal(result.attempts,180);assert.equal(result.qualification[42].passed,true);assert.equal(result.qualification[43].passed,true);assert.equal(result.qualifiedForLaterProposal,false);
    assert.throws(()=>aggregate(dir));
    const file=path.join(dir,'projection-B-confirmation-43.json'),original=fs.readFileSync(file),changed=JSON.parse(original);
    changed.rows[0].request.system+=' hidden expected answer';fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>aggregate(dir,{fixtureOnly:true}));
    fs.writeFileSync(file,original);changed.rows[0].request.system=JSON.parse(original).rows[0].request.system;changed.rows[0].selectedReferences.push('extra');fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>aggregate(dir,{fixtureOnly:true}));
    fs.unlinkSync(file);assert.throws(()=>aggregate(dir,{fixtureOnly:true}),/all six/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual runner sends each fixture once, archives failed requests, refuses reruns and follows no redirects',async()=>{
  const http=require('node:http'),{spawn}=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'projection-runner-')),file=path.join(dir,'out.json'),requests=[];
  const fixtures=cases.filter(row=>row.split==='development');
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/api/version'){res.end(JSON.stringify({version:protocol.ollamaVersion}));return;}
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:protocol.model,digest:protocol.modelDigest}]}));return;}
    assert.equal(req.url,'/api/generate');let body='';for await(const part of req)body+=part;const sent=JSON.parse(body);
    assert.deepEqual(sent.options,{...protocol.options,seed:42});assert.deepEqual(sent.format,protocol.baselineSchema);
    const fixture=fixtures.find(row=>sent.prompt===`CURRENT DOCUMENT:\n${row.content}`);assert.ok(fixture);assert.equal(sent.system,protocol.baselineSystem+input(fixture).contexts.B);requests.push(fixture.id);
    if(requests.length===1){res.statusCode=503;res.end('synthetic unavailable');return;}
    if(requests.length===3){res.writeHead(307,{Location:'/would-exceed-budget'});res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done:true,eval_count:10,prompt_eval_count:20,response:requests.length===2?'invalid JSON':JSON.stringify(fixture.expected)}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const run=attempt=>new Promise(resolve=>{
    const child=spawn(process.execPath,['tests/context-projection/run.js'],{env:{...process.env,PROJECTION_ARM:'B',PROJECTION_SPLIT:'development',PROJECTION_SEED:'42',PROJECTION_OUTPUT:file,PROJECTION_ORIGIN:`http://127.0.0.1:${server.address().port}`,PROJECTION_FIXTURE_TEST:'1',GITHUB_RUN_ATTEMPT:String(attempt),GITHUB_RUN_ID:'test-only-projection',GITHUB_SHA:'fixture-only'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});child.on('exit',code=>resolve({code,output}));
  });
  try{
    const done=await run(1);assert.equal(done.code,0,done.output.slice(-1200));const report=JSON.parse(fs.readFileSync(file));
    assert.equal(report.fixtureOnly,true);assert.equal(report.complete,true);assert.equal(report.requestCount,30);assert.equal(report.rows.length,30);assert.equal(report.summary.failedAttempts,3);
    assert.equal(new Set(requests).size,30);assert.deepEqual(requests,fixtures.map(row=>row.id));assert.ok(report.rows.every(row=>row.request&&row.terminal));
    assert.equal((await run(2)).code,1);assert.equal(requests.length,30);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
test('manual workflow profile is read-only and schedules exactly six projection groups',()=>{
  const text=fs.readFileSync('.github/workflows/classification-evaluation.yml','utf8');
  const section=text.slice(text.indexOf('  projection-measure:'),text.indexOf('  projection-replay:'));
  assert.equal((section.match(/- \{arm:/g)||[]).length,6);assert.ok(section.includes("inputs.extraction_stage == 'projection'"));assert.ok(section.includes('max-parallel: 2'));
  assert.ok(text.includes('permissions:\n  contents: read'));assert.ok(section.includes('test "$GITHUB_RUN_ATTEMPT" = 1'));assert.ok(section.includes('ollama/ollama:0.12.6'));
  assert.ok(!section.includes('secrets.'));assert.ok(!section.includes('NO_proxy'));assert.ok(section.includes('artifact-sources.json'));
});

test('native replay wraps transport only and preserves the original measurement source lock',()=>{
  const {wrapSyntheticText}=require('./context-projection/ingestion');
  const source=cases.find(row=>row.split==='development').content;assert.ok(source.startsWith('From:'));
  const wrapped=wrapSyntheticText(source);assert.equal(wrapped,'Paperless-AI synthetic replay fixture.\n\n'+source);assert.ok(!wrapped.startsWith('From:'));
  assert.equal(hash(fs.readFileSync('tests/context-projection/measurement-lock.json')),'974263ea1df81f7f1551b063d9ddb6dfa678f5680a29860788f6b6c3e06f0930');
  assert.equal(require('./context-projection/measurement-lock.json')['run.js'],hash(fs.readFileSync('tests/context-projection/run.js')),'model runner remains unchanged');
});
