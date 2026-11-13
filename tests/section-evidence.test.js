'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sectionEvidence}=require('./quality/section-evidence/candidate');
const {loadCases,measure}=require('./quality/section-evidence/report');
const {corpus}=require('./quality/corpus');

test('frozen section diagnostics are focused, bilingual and split-disjoint',()=>{
  const {cases,manifest}=loadCases();
  assert.equal(cases.length,40);assert.deepEqual(manifest.threshold,{wrongAccepted:0,correctRetainedAtLeast:8});
  assert.equal(new Set(cases.map(row=>row.id)).size,40);assert.equal(new Set(cases.map(row=>row.content)).size,40);
  const sets={};
  for(const split of ['development','confirmation']){
    const rows=cases.filter(row=>row.split===split);assert.equal(rows.length,20);
    assert.equal(rows.filter(row=>row.expected!==null).length,10);
    for(const language of ['en','de'])assert.equal(rows.filter(row=>row.language===language).length,10);
    sets[split]=new Set(rows.map(row=>row.family));
    for(const row of rows){assert.equal(typeof row.proposed,'string');assert.ok(row.family);assert.ok(row.content);}
  }
  assert.ok([...sets.development].every(family=>!sets.confirmation.has(family)));
  const identifiers=cases.filter(row=>row.split==='development'&&row.field.endsWith('_number')&&row.expected!==null).map(row=>row.expected);
  assert.ok(cases.filter(row=>row.split==='confirmation').every(row=>identifiers.every(value=>!row.content.includes(value))));
  const legacy=['training','evaluation','confirmation'].flatMap(corpus);
  assert.ok(cases.every(row=>legacy.every(old=>row.id!==old.id&&row.content!==old.content)));
});

test('section scope retains current values, stops at any heading and preserves source line numbers',()=>{
  const content='[Attachment]\nInvoice number: ATT-8\n[CURRENT DOCUMENT]\nContract number: CURRENT-07\nEnd date: 2034-02-28\n[Other section]\nInvoice number: EXTRA-9';
  const result=sectionEvidence(content,{contract_number:'CURRENT-07',invoice_number:'EXTRA-9',end_date:'2034-02-28',due_date:'2034-02-28'});
  assert.deepEqual(result.accepted,{contract_number:'CURRENT-07',end_date:'2034-02-28'});
  assert.equal(result.evidence.contract_number.line,4);assert.equal(content.split('\n')[result.evidence.end_date.line-1],result.evidence.end_date.text);
  assert.equal(result.rejected.invoice_number.reason,'missing_field_label');assert.equal(result.rejected.due_date.reason,'missing_field_label');
  assert.equal(Object.keys(sectionEvidence('[Current document]\nInvoice number: A\n[Current document]\nInvoice number: B',{invoice_number:'A'}).accepted).length,0);
  assert.equal(Object.keys(sectionEvidence('> [Current document]\n> Invoice number: A',{invoice_number:'A'}).accepted).length,0);
});

test('unmarked ownership remains an explicit failure, never hidden with scoring annotations',()=>{
  const row=loadCases().cases.find(row=>row.kind==='unmarked-attachment');
  assert.equal(row.expected,null);
  const input=Object.freeze({[row.field]:row.proposed});
  const result=sectionEvidence(row.content,input);
  assert.equal(result.accepted[row.field],row.proposed,'heading alone cannot prove ownership');
  const changed={...row,expected:'DIFFERENT',annotation:'pretend safe',family:'other'};
  assert.deepEqual(sectionEvidence(changed.content,input),result,'scoring-only metadata is not an input');
});

test('complete immutable replay reports rejection and lost coverage separately and fails the frozen gate',()=>{
  const report=measure();assert.equal(report.archivedRows,420);assert.equal(report.oldChallenges,28);assert.equal(report.newCases,40);
  assert.equal(report.confirmation.productionActivation,false);assert.equal(report.confirmation.qualifiedForLaterProposal,false);
  assert.equal(report.confirmation.wrongAccepted,2);assert.equal(report.confirmation.correctRetained,10);
  const sum=(group,gate,key)=>Object.values(report.groups[group][gate]).reduce((total,s)=>total+s[key],0);
  assert.equal(sum('new/confirmation','baseline','correctRetained'),4);
  assert.equal(sum('new/confirmation','candidate','absentFalsePositive'),2);
  assert.equal(sum('old-challenges','candidate','correctLost'),14,'missing explicit headings must be reported as coverage loss');
  const archives=Object.entries(report.groups).filter(([key])=>key.startsWith('archive/'));
  assert.ok(archives.length);
  assert.ok(archives.every(([,group])=>Object.values(group.candidate).every(s=>s.correctRetained===0)),'old unheaded corpus cannot qualify this heading grammar');
});
