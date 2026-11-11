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
