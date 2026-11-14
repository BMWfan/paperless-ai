'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Database=require('better-sqlite3');
const {openLearningStore}=require('../services/learningStore');
const base=(id=1)=>({id,title:'Initial',tags:[],correspondent:5,document_type:7,content:'Number: A',custom_fields:[{field:1,value:'Old'},{field:2,value:'Other'}]});
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'field-continuity-')),file=path.join(dir,'db.sqlite');
  let store=openLearningStore(file);store.configure({mode:'manual'});
  t.after(()=>{if(store)store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {file,get store(){return store;},reopen(){if(store)store.close();store=null;store=openLearningStore(file);return store;}};
}
function correction(store,document,value,field=1,source='confirmed_ui'){
  const before=document.custom_fields.find(row=>row.field===field);
  if(before)before.value=value;else document.custom_fields.push({field,value});
  document.content=`Number: ${value}`;
  return store.observe(document,source,{actor:'user:42'}).eventId;
}
const sources=store=>store.fieldCorrections().map(row=>({event:row.event_id,document:row.document_id,fields:row.changes.custom_fields.after.map(field=>field.field)}));
function raw(file,callback){const db=new Database(file);try{return callback(db);}finally{db.close();}}
function dump(db){
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'learning_%' ORDER BY name").all().map(row=>row.name);
  return Object.fromEntries(names.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
}

test('independent title/tag changes retain original field event without creating field proof',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);
  const first=correction(f.store,doc,'A');f.store.review(first,'confirmed','user:42');
  doc.title='Unknown title';doc.tags=[9];const title=f.store.observe(doc,'unknown').eventId;
  assert.deepEqual(sources(f.store),[{event:first,document:1,fields:[1]}]);
  assert.equal(f.store.examples().length,0,'document examples still use complete-metadata freshness');
  f.store.review(title,'confirmed','user:42');
  assert.equal(f.store.examples()[0].event_id,title);assert.deepEqual(sources(f.store),[{event:first,document:1,fields:[1]}]);
  const second=correction(f.store,doc,'B',2,'unknown');
  assert.deepEqual(sources(f.store),[{event:first,document:1,fields:[1]}],'pending other field does not revoke unchanged field');
  f.store.review(second,'confirmed','user:42');
  assert.deepEqual(sources(f.store),[{event:second,document:1,fields:[2]},{event:first,document:1,fields:[1]}]);
  assert.equal(f.store.fieldCorrections()[0].changes.custom_fields.after.length,1,'new event cannot claim its unchanged neighbour');
});
test('A to B to A cannot restore a source or confirm an older equal-valued pending event',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);
  const pending=correction(f.store,doc,'A');correction(f.store,doc,'B');const current=correction(f.store,doc,'A');
  assert.deepEqual(sources(f.store),[]);
  assert.throws(()=>f.store.review(pending,'confirmed','user:42'),/Stale field correction/);
  assert.equal(f.store.event(pending).status,'pending');f.store.review(current,'confirmed','user:42');
  assert.equal(sources(f.store)[0].event,current);
  correction(f.store,doc,'B',1,'unknown');const returned=correction(f.store,doc,'A',1,'unknown');
  assert.deepEqual(sources(f.store),[],'matching old value does not revive the earlier approval');
  f.store.review(returned,'confirmed','user:42');assert.equal(sources(f.store)[0].event,returned);
});
test('self-write and disabled observations invalidate sources even without events',t=>{
  const f=fixture(t);
  for(const [index,source] of ['self_write','unknown','disabled'].entries()){
    f.store.configure({mode:'manual'});const doc=base(index+1);f.store.observe(doc);
    const event=correction(f.store,doc,'A');f.store.review(event,'confirmed','user:42');
    if(source==='disabled')f.store.configure({mode:'disabled'});
    correction(f.store,doc,'B',1,source==='disabled'?'unknown':source);correction(f.store,doc,'A',1,source==='disabled'?'unknown':source);
    f.store.configure({mode:'manual'});assert.ok(!sources(f.store).some(row=>row.document===doc.id));
  }
  f.reopen();assert.deepEqual(sources(f.store),[]);
});
test('removal, null presence and scope changes cannot recreate a field binding',t=>{
  const f=fixture(t);
  const changes=[doc=>{doc.custom_fields=doc.custom_fields.filter(row=>row.field!==1);},doc=>{doc.custom_fields[0].value=null;},
    doc=>{doc.correspondent=8;},doc=>{doc.document_type=9;},doc=>{doc.correspondent=null;}];
  for(const [index,mutate] of changes.entries()){
    const doc=base(index+1);f.store.observe(doc);const event=correction(f.store,doc,'A');f.store.review(event,'confirmed','user:42');
    const original=structuredClone(doc);mutate(doc);f.store.observe(doc,'unknown');f.store.observe(original,'unknown');
    assert.ok(!sources(f.store).some(row=>row.document===doc.id));
  }
});
test('revoking a later title example clears old field sources and blocks pre-revoke pending approval',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);
  const field=correction(f.store,doc,'A');f.store.review(field,'confirmed','user:42');
  doc.title='New title';const title=f.store.observe(doc,'confirmed_ui').eventId;f.store.review(title,'confirmed','user:42');
  const pending=correction(f.store,doc,'C',2,'unknown');
  f.store.review(title,'deleted','user:99');assert.deepEqual(sources(f.store),[]);
  assert.equal(f.store.event(field).status,'confirmed','historical field review is not deleted');
  assert.throws(()=>f.store.review(pending,'confirmed','user:42'),/Stale field correction/);
  const fresh=correction(f.store,doc,'D',2);f.store.review(fresh,'confirmed','user:42');
  assert.deepEqual(sources(f.store),[{event:fresh,document:1,fields:[2]}]);
  assert.ok(f.store.history(1).some(row=>row.event_id===title&&row.decision==='deleted'&&row.actor==='user:99'));
});
test('stabilizing and skipped revisions do not mutate committed field trust',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);
  const event=correction(f.store,doc,'A');f.store.review(event,'confirmed','user:42');
  doc.custom_fields[0].value='B';const revision=f.store.snapshotRevision(1);
  const before=raw(f.file,db=>dump(db));
  assert.equal(f.store.observe(doc,'unknown',{expectedRevision:revision-1}).skipped,true);
  assert.deepEqual(raw(f.file,db=>dump(db)),before);
  assert.equal(f.store.observe(doc,'unknown',{stabilizationMs:100000}).stabilizing,true);
  assert.equal(sources(f.store)[0].event,event);assert.equal(f.store.snapshotRevision(1),revision);
  f.store.observe(doc,'unknown',{stabilizationMs:0});assert.deepEqual(sources(f.store),[]);
});
test('zero, false and canonical object values retain their typed state',t=>{
  const f=fixture(t),doc=base();f.store.configure({mode:'automatic'});f.store.observe(doc);
  correction(f.store,doc,0);correction(f.store,doc,false,2);
  assert.equal(f.store.fieldCorrections().find(row=>row.changes.custom_fields.after[0].field===1).changes.custom_fields.after[0].value,0);
  assert.equal(f.store.fieldCorrections().find(row=>row.changes.custom_fields.after[0].field===2).changes.custom_fields.after[0].value,false);
  const object=correction(f.store,doc,{b:2,a:1});doc.custom_fields[0].value={a:1,b:2};doc.title='Independent title';f.store.observe(doc,'self_write');
  assert.equal(sources(f.store).find(row=>row.fields.includes(1)).event,object);
});
// Strip only disposable fixture tables to model the exact pre-v4 on-disk shape.
function asV3(file){raw(file,db=>db.exec(`DROP TABLE learning_field_sources; DROP TABLE learning_event_fields;
  DROP TABLE learning_field_state; DELETE FROM learning_migrations WHERE version=4;`));}
test('v3 migration conservatively backfills active changed fields, preserves old rows and does not rerun',t=>{
  const f=fixture(t);
  const active=base(1);f.store.observe(active);const activeEvent=correction(f.store,active,'A');f.store.review(activeEvent,'confirmed','user:42');
  const stale=base(2);f.store.observe(stale);const staleEvent=correction(f.store,stale,'A');f.store.review(staleEvent,'confirmed','user:42');correction(f.store,stale,'B',1,'unknown');
  const pending=base(3);f.store.observe(pending);const pendingEvent=correction(f.store,pending,'A');
  const titleOnly=base(4);f.store.observe(titleOnly);titleOnly.title='Title correction';const title=f.store.observe(titleOnly,'confirmed_ui').eventId;f.store.review(title,'confirmed','user:42');
  raw(f.file,db=>db.exec(`CREATE TABLE learning_feedback(document_id INTEGER,title TEXT,tags TEXT,correspondent TEXT,document_type TEXT,content_preview TEXT,corrected_by_user INTEGER);
    INSERT INTO learning_feedback VALUES(99,'Legacy','[]','','','Legacy field',1);`));
  asV3(f.file);const before=raw(f.file,db=>dump(db));f.reopen();
  assert.deepEqual(sources(f.store),[{event:activeEvent,document:1,fields:[1]}]);
  const after=raw(f.file,db=>dump(db));
  for(const name of Object.keys(before))if(name!=='learning_migrations')assert.deepEqual(after[name],before[name],name);
  assert.deepEqual(after.learning_migrations.map(row=>row.version),[2,3,4]);assert.equal(f.store.legacyExamples().length,1);
  f.store.review(pendingEvent,'confirmed','user:42');assert.ok(!sources(f.store).some(row=>row.document===3),'old pending confirmation has no field generation proof');
  const stable=raw(f.file,db=>dump(db));f.reopen();assert.deepEqual(raw(f.file,db=>dump(db)),stable);
  f.store.review(activeEvent,'deleted','user:42');f.reopen();assert.deepEqual(sources(f.store),[],'reopening does not repeat backfill');
});
test('migration failure rolls back tables/backfill and leaves the v3 database reopenable',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);const event=correction(f.store,doc,'A');f.store.review(event,'confirmed','user:42');
  asV3(f.file);raw(f.file,db=>db.exec(`CREATE TRIGGER fail_migration BEFORE INSERT ON learning_migrations WHEN NEW.version=4
    BEGIN SELECT RAISE(ABORT,'abort migration4'); END;`));
  const before=raw(f.file,db=>dump(db));assert.throws(()=>f.reopen(),/abort migration4/);
  assert.deepEqual(raw(f.file,db=>dump(db)),before,'no partial schema marker or backfill');
  raw(f.file,db=>db.exec('DROP TRIGGER fail_migration'));f.reopen();assert.equal(sources(f.store)[0].event,event);
});
test('an unknown version4 marker without the required tables fails closed without rewriting it',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);asV3(f.file);
  raw(f.file,db=>db.exec(`INSERT INTO learning_migrations VALUES(4);
    CREATE TABLE learning_document_availability(document_id INTEGER PRIMARY KEY); INSERT INTO learning_document_availability VALUES(99);`));
  const before=raw(f.file,db=>dump(db));
  assert.throws(()=>f.reopen(),/no such table: learning_field_state/);
  assert.deepEqual(raw(f.file,db=>dump(db)),before,'unknown lineage is not overwritten or adopted');
});
test('observation and review failures roll back both old and new learning state',t=>{
  const f=fixture(t),doc=base();f.store.configure({mode:'automatic'});f.store.observe(doc);
  raw(f.file,db=>db.exec(`CREATE TRIGGER fail_source BEFORE INSERT ON learning_field_sources BEGIN SELECT RAISE(ABORT,'abort source'); END;`));
  const before=raw(f.file,db=>dump(db));assert.throws(()=>correction(f.store,doc,'A'),/abort source/);
  assert.deepEqual(raw(f.file,db=>dump(db)),before);
  f.store.configure({mode:'manual'});const event=f.store.observe(doc,'unknown').eventId;
  const pending=raw(f.file,db=>dump(db));assert.throws(()=>f.store.review(event,'confirmed','user:42'),/abort source/);
  assert.deepEqual(raw(f.file,db=>dump(db)),pending);
  raw(f.file,db=>db.exec('DROP TRIGGER fail_source'));f.store.review(event,'confirmed','user:42');assert.equal(sources(f.store)[0].event,event);
});
test('reopen detects old-code revision gaps even when the final metadata returns to the same value',t=>{
  const f=fixture(t),doc=base();f.store.observe(doc);const event=correction(f.store,doc,'A');f.store.review(event,'confirmed','user:42');
  const generation=raw(f.file,db=>db.prepare('SELECT generation FROM learning_field_state WHERE document_id=1 AND field_id=1').get().generation);
  const {normalizeDocumentMetadata}=require('../services/documentSnapshotService');
  raw(f.file,db=>{
    const update=db.prepare('UPDATE learning_document_snapshots SET metadata_json=?,revision=revision+1 WHERE document_id=1');
    const other=structuredClone(doc);other.custom_fields[0].value='B';update.run(JSON.stringify(normalizeDocumentMetadata(other)));
    update.run(JSON.stringify(normalizeDocumentMetadata(doc)));
  });
  assert.deepEqual(sources(f.store),[],'reader fails closed before reconciliation');
  assert.equal(f.store.examples()[0].event_id,event,'document-level context behavior is unchanged');
  f.reopen();assert.deepEqual(sources(f.store),[]);
  const state=raw(f.file,db=>db.prepare('SELECT * FROM learning_field_state WHERE document_id=1 AND field_id=1').get());
  assert.ok(state.generation>generation);assert.equal(state.synced_revision,f.store.snapshotRevision(1));
  const fresh=correction(f.store,doc,'C');f.store.review(fresh,'confirmed','user:42');assert.equal(sources(f.store)[0].event,fresh);
  f.reopen();assert.equal(sources(f.store)[0].event,fresh);
});
