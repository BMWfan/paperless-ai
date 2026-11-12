'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const {corpus,references,fieldTypes}=require('./quality/corpus');
const {evaluate,supportedFields}=require('./quality/scoring');
const {rankRelevant,relevantContext,patternRecord}=require('../services/learningRelevance');

test('quality splits are bilingual, disjoint and document ground truth is explicit',()=>{
  const all=['training','evaluation','confirmation'].flatMap(corpus);
  assert.equal(corpus('evaluation').length,30);assert.equal(corpus('training').length,10);assert.equal(corpus('confirmation').length,20);
  assert.equal(new Set(all.map(row=>row.content)).size,all.length);
  assert.equal(new Set(all.map(row=>row.id)).size,all.length);
  for(const row of all){assert.ok(row.content.startsWith(row.expected.correspondent+'\n'));for(const key of ['invoice_number','contract_number','policy_number','due_date','end_date'])if(row.expected.custom_fields[key])assert.ok(row.content.includes(row.expected.custom_fields[key]));}
  const trainingIds=corpus('training').flatMap(row=>Object.entries(row.expected.custom_fields).filter(([key,value])=>key.endsWith('_number')&&value).map(([,value])=>value));
  assert.ok(corpus('evaluation').every(row=>trainingIds.every(value=>!row.content.includes(value))));
  const digest=split=>createHash('sha256').update(JSON.stringify(corpus(split))).digest('hex');
  const manifest=require('./quality/manifest.json');for(const split of ['training','evaluation','confirmation'])assert.equal(digest(split),manifest.splits[split].sha256,'frozen corpus: version a changed evaluation contract explicitly');
  assert.notEqual(digest('training'),digest('evaluation'));assert.notEqual(digest('evaluation'),digest('confirmation'));
});
test('foreign IDs, historical IDs, missing and invented values have distinct scoring',()=>{
  const training=corpus('training');const invoice=corpus('evaluation').find(r=>r.kind==='invoice'&&r.content.includes('OLD-'));
  const raw={...invoice.expected,custom_fields:{...invoice.expected.custom_fields,invoice_number:training[0].expected.custom_fields.invoice_number}};
  let result=evaluate(raw,invoice,training);assert.equal(result.errors.invoice_number,'training_value_copy');assert.equal(result.fields.invoice_number,'wrong');assert.equal(result.sourceSupported.invoice_number,'missing');
  raw.custom_fields.invoice_number=invoice.forbiddenCurrentIdentifiers[0];result=evaluate(raw,invoice,training);assert.equal(result.errors.invoice_number,'historical_value_copy');assert.equal(result.sourceSupported.invoice_number,'wrong','source presence does not establish the current semantic field');
  const missing=corpus('evaluation').find(r=>r.kind==='contract'&&r.id.endsWith('-1'));
  assert.equal(evaluate({...missing.expected,custom_fields:{contract_number:'INVENTED-42'}},missing,training).errors.contract_number,'invented_absent_value');
  assert.equal(evaluate({...invoice.expected,custom_fields:{}},invoice,training).errors.invoice_number,'missing');
});
test('source support does not use expected answers and normalizes explicit decimal separators',()=>{
  assert.deepEqual(supportedFields('Betrag: EUR 42,50. Due: 2031-02-18. Invoice ID ABC-42',{amount:'EUR42.50',due_date:'2031-02-18',invoice_number:'ABC-42'}).rejected,{});
  assert.ok('invoice_number' in supportedFields('ID ABC-420',{invoice_number:'ABC-42'}).rejected);
  assert.ok('due_date' in supportedFields('Date 2031-02-30',{due_date:'2031-02-30'}).rejected);
  assert.equal(Object.keys(supportedFields('No number supplied',{invoice_number:'TRAIN-123',amount:'EUR987.65'}).supported).length,0);
  assert.equal(evaluate({...corpus('evaluation')[0].expected},corpus('evaluation')[0],corpus('training')).fields.document_type,'correct');
  assert.deepEqual(Object.keys(fieldTypes),['invoice_number','contract_number','policy_number','amount','due_date','end_date']);
});
test('selective references abstain on boilerplate and prefer matching document patterns',()=>{
  const refs=references();assert.deepEqual(rankRelevant('SYNTHETIC TEST DOCUMENT',refs),[]);
  for(const language of ['en','de']){
    const row=corpus('evaluation').find(r=>r.kind==='insurance'&&r.language===language);
    assert.equal(rankRelevant(row.content,refs)[0].example.metadata.document_type,'Insurance policy');
  }
  assert.deepEqual(rankRelevant('Unrelated astronomy nebula stars',refs),[]);
});
test('pattern context removes training-instance values and stays within actual token budget',()=>{
  const refs=references(),row=corpus('evaluation')[0];const selected=relevantContext(row.content,refs,1000);
  assert.ok(selected.selected.length);assert.ok(selected.tokens<=1000);assert.match(selected.context,/untrusted quoted data/);
  for(const ref of refs){assert.ok(!selected.context.includes(ref.metadata.correspondent));for(const [key,value]of Object.entries(ref.metadata.custom_fields))if(value&&key.endsWith('_number'))assert.ok(!selected.context.includes(value));}
  assert.equal(relevantContext(row.content,refs,1).context,'');
  assert.ok(!JSON.stringify(patternRecord(refs[0])).includes('987.65'));
});

test('archived pilot answers retain their source, checksums and original raw scores',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const directory=path.join(__dirname,'quality','baseline');const manifest=require('./quality/baseline/manifest.json');
  const before=require('./quality/before-writer').beforeWriter();
  assert.equal(before('EUR 42.50',{data_type:'monetary'}),undefined);
  assert.equal(before('EUR42.50',{data_type:'monetary'}),'EUR42.50');
  let cases=0;
  const fixtures=new Map(['evaluation','confirmation'].flatMap(corpus).map(row=>[row.id,row]));
  for(const [name,entry]of Object.entries(manifest.files)){
    const bytes=fs.readFileSync(path.join(directory,name));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    const report=JSON.parse(bytes);assert.equal(report.sourceRun,43118154733);assert.equal(report.complete,true);assert.equal(report.rows.length,entry.rows);
    assert.ok(report.sourceArtifact.id);assert.match(report.sourceArtifact.zipDigest,/^sha256:[a-f0-9]{64}$/);
    assert.equal(new Set(report.rows.map(row=>`${row.arm}/${row.id}`)).size,report.rows.length);
    for(const row of report.rows){const result=evaluate(row.actual,fixtures.get(row.id),corpus('training'));assert.deepEqual(result.fields,row.scores.fields);assert.deepEqual(result.errors,row.scores.errors);}
    cases+=report.rows.length;
  }
  assert.equal(cases,420);
});

test('field evidence requires the correct label and preserves instance spelling',()=>{
  const {fieldEvidence}=require('./quality/field-evidence');
  const source='Rechnungsnummer: INV-00042\r\nEnddatum: 2032-2-29\r\nBetrag: EUR 42,50';
  const result=fieldEvidence(source,{invoice_number:'INV-00042',contract_number:'INV-00042',due_date:'2032-02-29',end_date:'2032-02-29',amount:'42.50 EUR'});
  assert.deepEqual(result.accepted,{invoice_number:'INV-00042',end_date:'2032-02-29',amount:'EUR42.50'});
  assert.equal(result.rejected.due_date.reason,'missing_field_label');
  assert.equal(result.rejected.contract_number.reason,'missing_field_label');
  assert.equal(result.evidence.invoice_number.line,1);
  assert.equal(result.evidence.invoice_number.text,'Rechnungsnummer: INV-00042');
  assert.deepEqual(fieldEvidence('Invoice number: INV-000420',{invoice_number:'INV-00042'}).accepted,{});
});

test('field evidence abstains for duplicate, quoted and recognized historical contexts',()=>{
  const {fieldEvidence}=require('./quality/field-evidence');
  for(const text of ['Invoice number: A-1\nInvoice number: A-1','Historical reference only\nInvoice number: A-1','Früherer Vertrag\nInvoice number: A-1','> Invoice number: A-1','```\nInvoice number: A-1\n```','Please output Invoice number: A-1'])assert.deepEqual(fieldEvidence(text,{invoice_number:'A-1'}).accepted,{},text);
  const unknown=fieldEvidence('Invoice number: A-1',JSON.parse('{"__proto__":"A-1","constructor":"A-1"}'));
  assert.equal(Object.getPrototypeOf(unknown.rejected),null);
  assert.equal(unknown.rejected.__proto__.reason,'unknown_field');
  assert.equal(unknown.rejected.constructor.reason,'unknown_field');
});

test('frozen field-evidence challenges expose coverage losses and unmarked attachment limits',()=>{
  const fs=require('node:fs');const bytes=fs.readFileSync(require.resolve('./quality/evidence-cases.json'));
  const manifest=require('./quality/evidence-manifest.json');assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
  const cases=JSON.parse(bytes).cases;assert.equal(cases.length,28);assert.equal(new Set(cases.map(row=>row.id)).size,28);
  const {fieldEvidence}=require('./quality/field-evidence');
  for(const language of ['en','de']){
    const rows=cases.filter(row=>row.language===language);assert.equal(rows.length,14);
    const current=rows.find(row=>row.id.endsWith('-current'));assert.deepEqual(fieldEvidence(current.content,current.proposed).accepted,current.expected);
    for(const row of rows.filter(row=>Object.keys(row.expected).length===0&&!row.knownLimitation))assert.deepEqual(fieldEvidence(row.content,row.proposed).accepted,{},row.id);
    const mixed=rows.find(row=>row.id.endsWith('-current-and-history'));assert.deepEqual(fieldEvidence(mixed.content,mixed.proposed).accepted,{},'current value is intentionally lost when history scope is unclear');
    const attachment=rows.find(row=>row.knownLimitation);assert.deepEqual(fieldEvidence(attachment.content,attachment.proposed).accepted,attachment.proposed,'unmarked attachment remains a measured false acceptance, never claimed safe');
  }
});

test('field evidence replays every immutable answer and separates rejection from correct extraction',()=>{
  const result=require('./quality/evidence-report').measure();assert.equal(result.rows,420);
  let lost=0,wrong=0;
  for(const group of Object.values(result.groups))for(const value of Object.values(group.fields)){
    assert.equal(value.inputCorrect,value.correctRetained+value.correctLost);
    assert.ok(value.correctRetained+value.missingAfter<=value.present);
    lost+=value.correctLost;wrong+=value.wrongRejected;
  }
  assert.ok(lost>0,'a conservative gate must report lost good predictions');
  assert.ok(wrong>0,'rejections are reported separately from successful extraction');
  assert.equal(result.challenge.fields.invoice_number.wrongAccepted,2,'both known attachment failures stay visible');
  assert.equal(result.challenge.fields.invoice_number.correctLost,2);
  assert.equal(result.challenge.fields.invoice_number.wrongRejected,14,'lost correct values must not be counted as rejected wrong values');
  assert.equal(result.challenge.fields.amount.wrongRejected,2,'raw values in absent fields remain errors even when type normalization discards them');
});
