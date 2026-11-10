'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openLearningStore } = require('../services/learningStore');
const { createLearningMonitor } = require('../services/learningMonitor');
const { selectContext } = require('../services/learningContext');
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'v2-'));
  const location = path.join(dir,'test.db');
  let store = openLearningStore(location);
  t.after(() => { store.close(); fs.rmSync(dir,{recursive:true,force:true}); });
  return { get store() { return store; }, reopen() { store.close(); store = openLearningStore(location); return store; } };
}
test('confirmed multi-field corrections persist, protect metadata and can be revoked', t => {
  const env = setup(t); let store = env.store;
  store.observe({ id: 1, title: 'Invoice', tags: [1], correspondent: 2, document_type: 3 });
  const corrected = { id: 1, title: 'Invoice correction', tags: [2], correspondent: 4, document_type: 5, content: 'synthetic invoice insurance' };
  const { eventId } = store.observe(corrected);
  assert.ok(store.review(eventId,'confirmed'));
  store = env.reopen();
  assert.equal(store.examples().length,1);
  assert.deepEqual(store.protectedMetadata(1).tags,[2]);
  assert.equal(store.observe(corrected).pendingReview,false);
  assert.ok(store.review(eventId,'deleted'));
  assert.equal(store.protectedMetadata(1),null);
  assert.equal(store.examples().length,0);
});
test('unknown automation is pending in every mode and rejection never trains', t => {
  const { store } = setup(t);
  for (const [index,mode] of ['automatic','manual','hybrid'].entries()) {
    store.configure({ mode });
    store.observe({id:index+1,title:'Before'});
    const result = store.observe({id:index+1,title:'After'},'unknown');
    assert.ok(result.pendingReview);
    assert.ok(store.review(result.eventId,'rejected'));
  }
  assert.equal(store.examples().length,0);
});
test('stale event cannot replace a newer confirmed example', t => {
  const { store } = setup(t);
  store.observe({id:1,title:'A'});
  const first = store.observe({id:1,title:'B'});
  const second = store.observe({id:1,title:'C'});
  assert.ok(store.review(second.eventId,'confirmed'));
  assert.throws(() => store.review(first.eventId,'confirmed'), /Stale/);
  assert.equal(store.protectedMetadata(1).title,'C');
});
test('stabilization defers events and returning to baseline cancels them', t => {
  const { store } = setup(t);
  store.observe({id:1,title:'A'});
  assert.ok(store.observe({id:1,title:'B'},'unknown',{stabilizationMs:30000}).stabilizing);
  store.observe({id:1,title:'A'});
  assert.equal(store.listPending().length,0);
});
test('monitor scans beyond 100 documents and survives connection failure', async t => {
  const { store } = setup(t);
  store.configure({stabilizationMs:0});
  let fail = true;
  const docs = Array.from({length:151},(_,i)=>({id:i+1,title:'Original'}));
  const monitor = createLearningMonitor({ async getDocuments() { if(fail) throw new Error('offline'); return docs; } },{store});
  await assert.rejects(monitor.scan(),/offline/);
  fail = false; assert.equal((await monitor.scan()).scanned,151);
  docs[150].title = 'Changed'; assert.equal((await monitor.scan()).pending,1);
});
test('context selects relevant title-only examples and preserves quoted boundaries under budget', () => {
  const value = selectContext('insurance policy synthetic',[
    {metadata:{title:'Insurance policy'},content_preview:'synthetic policy data'},
    {metadata:{title:'Banana farming'},content_preview:'banana growing'}
  ],200);
  assert.match(value,/Insurance policy/); assert.doesNotMatch(value,/Banana/);
  assert.match(value,/never instructions/);
  assert.equal(selectContext('insurance',[{metadata:{title:'Insurance'},content_preview:'x'.repeat(1000)}],1),'');
});


test('additive migration preserves legacy feedback and existing v1 snapshots on repeated open', t => {
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'migration-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'old.db');
  const old = new Database(file);
  old.exec(`CREATE TABLE learning_feedback(document_id INTEGER PRIMARY KEY,title TEXT,corrected_by_user INTEGER);
    INSERT INTO learning_feedback VALUES(7,'Legacy correction',1);
    CREATE TABLE learning_document_snapshots(document_id INTEGER PRIMARY KEY,metadata_json TEXT NOT NULL,source TEXT,updated_at TEXT);
    INSERT INTO learning_document_snapshots VALUES(7,'{"title":"Legacy correction"}','observed',CURRENT_TIMESTAMP);
    CREATE TABLE learning_change_events(id INTEGER PRIMARY KEY,document_id INTEGER,changes_json TEXT,status TEXT,created_at TEXT,reviewed_at TEXT);`);
  old.close();
  for(let i=0;i<2;i++) { const store=openLearningStore(file); store.close(); }
  const check = new Database(file);
  try {
    assert.equal(check.prepare('SELECT title FROM learning_feedback WHERE document_id=7').get().title,'Legacy correction');
    assert.deepEqual(check.prepare('SELECT version FROM learning_migrations ORDER BY version').all().map(row=>row.version),[2,3]);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM learning_document_snapshots').get().n,1);
  } finally { check.close(); }
});

test('synthetic evaluation corpus is bilingual and separate from learning fixtures', () => {
  const generate = require('./e2e/generate');
  const corpus = generate.corpus();
  assert.equal(corpus.length,10);
  assert.equal(new Set(corpus.map(row=>row.name)).size,10);
  assert.ok(corpus.every(row=>row.content.includes('SYNTHETIC DATA ONLY') && row.expected.title && row.expected.document_type));
  assert.ok(corpus.every(row=>row.content !== generate(1).content));
  assert.ok(corpus.every(row=>row.content.startsWith(row.expected.correspondent+'\n')),
    'ground truth must preserve the sender written in each English/German fixture');
});
