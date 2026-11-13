'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {load,validate,referenceInput,scores,summarize,identifierTotals}=require('./quality/extraction/core');
const {cases,protocol}=load();
const empty=()=>Object.fromEntries(Object.keys(protocol.baselineSchema.properties.custom_fields.properties).map(field=>[field,null]));
function actual(fields={}){return {title:'Fixture',document_type:'Invoice',tags:['invoice'],correspondent:'Fixture Ltd',language:'en',custom_fields:{...empty(),...fields}};}
function evidence(value){value.field_evidence=Object.fromEntries(Object.keys(empty()).map(field=>[field,{quote:null,start_line:null,end_line:null}]));return value;}

test('extraction freeze has bounded bilingual disjoint data and exactly270 planned requests',()=>{
  for(const [split,count]of [['training',10],['development',30],['confirmation',30]])assert.equal(cases.filter(row=>row.split===split).length,count);
  assert.equal(new Set(cases.map(row=>row.id)).size,70);assert.equal(new Set(cases.map(row=>row.content)).size,70);
  const families={};
  for(const split of ['training','development','confirmation'])families[split]=new Set(cases.filter(row=>row.split===split).map(row=>row.family));
  for(const a of Object.keys(families))for(const b of Object.keys(families))if(a!==b)assert.ok([...families[a]].every(family=>!families[b].has(family)));
  for(const split of ['development','confirmation']){
    const rows=cases.filter(row=>row.split===split);for(const language of ['en','de'])assert.equal(rows.filter(row=>row.language===language).length,15);
    assert.ok(rows.filter(row=>row.targetIdentifier&&row.expected.custom_fields[row.targetIdentifier]!==null).length>=10);
    assert.ok(rows.filter(row=>row.targetIdentifier&&row.expected.custom_fields[row.targetIdentifier]===null).length>=10);
    for(const row of rows)for(const [field,value]of Object.entries(row.expected.custom_fields))if(value!==null)assert.ok(row.content.includes(field==='amount'?value.replace('EUR','EUR '):value));
  }
  assert.equal(Object.keys(protocol.arms).length*30*(protocol.seeds.development.length+protocol.seeds.confirmation.length),270);
  assert.equal(protocol.maxRequests,270);assert.equal(protocol.maxParallelJobs,2);assert.equal(protocol.requestTimeoutMs,180000);
});
test('all arms use the same existing reference context without test annotations or answers',()=>{
  const training=cases.filter(row=>row.split==='training'),fixture=cases.find(row=>row.split==='development');
  const before=referenceInput(fixture,training),changed=referenceInput({...fixture,expected:{},annotation:'secret ground truth',id:'other'},training);
  assert.deepEqual(changed,before);assert.ok(before.context.includes('untrusted quoted data'));assert.ok(!before.context.includes(fixture.expected.correspondent));
  assert.deepEqual(protocol.baselineSchema,require('./quality/protocol').schema);assert.equal(protocol.baselineSystem,require('./quality/protocol').system);
});
test('evidence validates exact positions, typed values and identifier boundaries but never semantic truth',()=>{
  const content='Invoice number: INV-0047\nAmount: EUR 64.80\nReference INV-00470';
  const value=evidence(actual({invoice_number:'INV-0047',amount:'EUR64.80'}));
  value.field_evidence.invoice_number={quote:'INV-0047',start_line:1,end_line:1};value.field_evidence.amount={quote:'EUR 64.80',start_line:2,end_line:2};
  assert.deepEqual(validate(value,content,true).accepted,{invoice_number:'INV-0047',amount:'EUR64.80'});
  const punctuation=evidence(actual({invoice_number:'INV.7'}));punctuation.field_evidence.invoice_number={quote:'INV.7',start_line:1,end_line:1};
  assert.equal(validate(punctuation,'INVx7',true).rejected.invoice_number,'evidence_value_mismatch');
  value.field_evidence.invoice_number.start_line=3;value.field_evidence.invoice_number.end_line=3;
  assert.equal(validate(value,content,true).rejected.invoice_number,'evidence_value_mismatch');
  value.field_evidence.invoice_number.start_line=0;assert.equal(validate(value,content,true).rejected.invoice_number,'invalid_evidence_range');
  value.custom_fields.invoice_number=null;assert.equal(validate(value,content,true).rejected.invoice_number,'evidence_for_null');
  value.extra='unsupported';assert.ok(validate(value,content,true).protocolErrors.length);assert.deepEqual(validate(value,content,true).accepted,{});
  const historical=evidence(actual({invoice_number:'OLD-7'}));historical.field_evidence.invoice_number={quote:'OLD-7',start_line:1,end_line:1};
  assert.equal(validate(historical,'Previous invoice OLD-7',true).accepted.invoice_number,'OLD-7','quote validation cannot prove current ownership');
});
test('raw errors, withheld values, absent IDs and protocol failures remain separate',()=>{
  const fixture=cases.find(row=>row.split==='development'&&row.kind==='invoice'&&row.expected.custom_fields.invoice_number===null),training=cases.filter(row=>row.split==='training');
  const output=actual({invoice_number:fixture.forbiddenCurrentIdentifiers[0]});
  const validation={accepted:{},rejected:{invoice_number:'invalid_evidence_range'},protocolErrors:[]};
  const row={id:fixture.id,actual:output,validation,scores:scores(output,validation.accepted,fixture,training),durationMs:1};
  assert.equal(row.scores.raw.invoice_number,'wrong');assert.equal(row.scores.errors.invoice_number,'historical_value_copy');
  assert.equal(row.scores.validated.invoice_number,'correct');
  const stats=summarize([row],cases);assert.equal(stats.fields.invoice_number.absent,1);assert.equal(stats.fields.invoice_number.correctPresent,0);assert.equal(stats.fields.invoice_number.absentFalsePositive,0);
  assert.equal(identifierTotals(stats).present,0);
  row.error={message:'timeout'};row.validation.protocolErrors=['request_or_json_failure'];assert.equal(summarize([row],cases).failedAttempts,1);
  const goodFixture=cases.find(row=>row.split==='development'&&row.expected.custom_fields.invoice_number!==null);
  const wrongCase=actual({invoice_number:goodFixture.expected.custom_fields.invoice_number.toLowerCase()});
  assert.equal(scores(wrongCase,{},goodFixture,training).raw.invoice_number,'wrong','identifier case is not silently relaxed');
  const formatted=actual({invoice_number:' '+goodFixture.expected.custom_fields.invoice_number+' '});
  const canonical=validate(formatted,goodFixture.content,false),scored=scores(formatted,canonical.accepted,goodFixture,training);
  assert.equal(scored.raw.invoice_number,'wrong');assert.equal(scored.validated.invoice_number,'correct');assert.equal(scored.errors.invoice_number,'format_variant');
});

test('aggregate requires all270 unique frozen attempts and detects report tampering',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {aggregate}=require('./quality/extraction/report'),{hash}=require('./quality/extraction/core');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'extraction-reports-'));
  try{
    const {manifest}=load(),training=cases.filter(row=>row.split==='training'),contexts=new Map();
    for(const arm of ['A','B','C'])for(const split of ['development','confirmation'])for(const seed of protocol.seeds[split]){
      const rows=cases.filter(row=>row.split===split).map(fixture=>{
        // Ideal synthetic API fixtures test the evaluator; they are not model results.
        const output=structuredClone(fixture.expected);
        if(arm==='C'){
          evidence(output);
          for(const [field,value]of Object.entries(output.custom_fields))if(value!==null){
            const quote=field==='amount'?value.replace('EUR','EUR '):value;
            const line=fixture.content.split('\n').findIndex(text=>text.includes(quote))+1;assert.ok(line>0);
            output.field_evidence[field]={quote,start_line:line,end_line:line};
          }
        }
        if(!contexts.has(fixture.id))contexts.set(fixture.id,referenceInput(fixture,training).context);
        const validation=validate(output,fixture.content,arm==='C'),context=contexts.get(fixture.id);
        return {id:fixture.id,actual:output,response:{response:JSON.stringify(output)},validation,scores:scores(output,validation.accepted,fixture,training),context,contextDigest:hash(context),durationMs:1};
      });
      const report={arm,split,seed,model:protocol.arms[arm].model,modelDigest:require('./quality/extraction/model-locks.json')[protocol.arms[arm].model],complete:true,attempt:1,manifest,options:{...protocol.options,seed},rows,summary:summarize(rows,cases)};
      fs.writeFileSync(path.join(directory,`extraction-${arm}-${split}-${seed}.json`),JSON.stringify(report));
    }
    const report=aggregate(directory);assert.equal(report.attempts,270);assert.equal(report.qualification.C.qualifiedForLaterProposal,true);assert.equal(report.productionActivation,false);
    const file=path.join(directory,'extraction-C-confirmation-43.json'),changed=JSON.parse(fs.readFileSync(file));
    changed.rows[0].context='tampered';fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>aggregate(directory));
    fs.unlinkSync(file);assert.throws(()=>aggregate(directory),/all nine/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('measurement runner archives every attempt once, including HTTP and JSON errors',async()=>{
  const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'extraction-runner-')),file=path.join(directory,'result.json'),requested=[];
  const fixtures=cases.filter(row=>row.split==='development');
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/api/version'){res.end(JSON.stringify({version:'0.12.6'}));return;}
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'qwen2.5:1.5b',digest:require('./quality/extraction/model-locks.json')['qwen2.5:1.5b']}]}));return;}
    assert.equal(req.url,'/api/generate');let body='';for await(const part of req)body+=part;
    const request=JSON.parse(body);assert.deepEqual(request.options,{...protocol.options,seed:42});assert.deepEqual(request.format,protocol.baselineSchema);
    const fixture=fixtures.find(row=>request.prompt===`CURRENT DOCUMENT:\n${row.content}`);assert.ok(fixture);requested.push(fixture.id);
    if(requested.length===1){res.statusCode=503;res.end('synthetic unavailable');return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done:true,eval_count:10,prompt_eval_count:20,response:requested.length===2?'invalid JSON':JSON.stringify(fixture.expected)}));
  });
  await new Promise(resolve=>server.listen(11434,'127.0.0.1',resolve));
  try{
    const child=spawn(process.execPath,['tests/quality/extraction/run.js'],{env:{...process.env,EXTRACTION_ARM:'A',EXTRACTION_SPLIT:'development',EXTRACTION_SEED:'42',EXTRACTION_OUTPUT:file,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'synthetic-child-test',GITHUB_RUN_ID:'test-only'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
    const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
    assert.equal(code,0,output.slice(-2000));assert.equal(requested.length,30);assert.equal(new Set(requested).size,30,'no answer retries');
    const report=JSON.parse(fs.readFileSync(file));assert.equal(report.rows.length,30);assert.equal(report.complete,true);assert.equal(report.summary.failedAttempts,2);
    assert.equal(report.rows[0].error.response,'synthetic unavailable');assert.equal(report.rows[1].response.response,'invalid JSON');assert.equal(report.commit,'synthetic-child-test');
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
