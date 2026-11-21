'use strict';
const {normalizeDocumentMetadata}=require('./documentSnapshotService.cjs');
const values=rows=>new Map(normalizeDocumentMetadata({custom_fields:rows}).custom_fields.map(row=>[row.field,JSON.stringify(row.value)]));
function changedFields(changes){
  const change=changes?.custom_fields;
  if(!Array.isArray(change?.before)||!Array.isArray(change?.after))return [];
  const before=values(change.before),after=values(change.after);
  return [...new Set([...before.keys(),...after.keys()])].filter(id=>before.get(id)!==after.get(id));
}
// Called inside the store's existing schema transaction. All methods below run
// inside its Observe/Review transactions; this helper never commits on its own.
function initializeFieldSources(db){
  const migrated=!!db.prepare('SELECT 1 FROM learning_migrations WHERE version=4').get();
  if(!migrated)db.exec(`CREATE TABLE IF NOT EXISTS learning_field_state(
    document_id INTEGER NOT NULL,field_id INTEGER NOT NULL CHECK(field_id>0),
    value_json TEXT NOT NULL,present INTEGER NOT NULL CHECK(present IN(0,1)),scope_json TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK(generation>0),synced_revision INTEGER NOT NULL,
    PRIMARY KEY(document_id,field_id));
    CREATE TABLE IF NOT EXISTS learning_event_fields(
    event_id INTEGER NOT NULL,field_id INTEGER NOT NULL,document_id INTEGER NOT NULL,generation INTEGER NOT NULL,
    PRIMARY KEY(event_id,field_id));
    CREATE TABLE IF NOT EXISTS learning_field_sources(
    document_id INTEGER NOT NULL,field_id INTEGER NOT NULL,event_id INTEGER NOT NULL,generation INTEGER NOT NULL,
    PRIMARY KEY(document_id,field_id));
    CREATE INDEX IF NOT EXISTS idx_learning_field_sources_event ON learning_field_sources(event_id);`);
  const states=db.prepare('SELECT * FROM learning_field_state WHERE document_id=?');
  const state=db.prepare('SELECT * FROM learning_field_state WHERE document_id=? AND field_id=?');
  const putState=db.prepare(`INSERT INTO learning_field_state VALUES(@document_id,@field_id,@value_json,@present,@scope_json,@generation,@synced_revision)
    ON CONFLICT(document_id,field_id) DO UPDATE SET value_json=excluded.value_json,present=excluded.present,
    scope_json=excluded.scope_json,generation=excluded.generation,synced_revision=excluded.synced_revision`);
  const removeSource=db.prepare('DELETE FROM learning_field_sources WHERE document_id=? AND field_id=?');
  const advanceRevision=db.prepare('UPDATE learning_field_state SET synced_revision=? WHERE document_id=? AND synced_revision!=?');
  const snapshotRevision=db.prepare('SELECT revision FROM learning_document_snapshots WHERE document_id=?');
  const mapEvent=db.prepare('INSERT OR IGNORE INTO learning_event_fields VALUES(?,?,?,?)');
  const mappings=db.prepare('SELECT * FROM learning_event_fields WHERE event_id=?');
  const putSource=db.prepare(`INSERT INTO learning_field_sources VALUES(?,?,?,?)
    ON CONFLICT(document_id,field_id) DO UPDATE SET event_id=excluded.event_id,generation=excluded.generation`);
  function synchronize(documentId,metadata,previousRevision,revision){
    const normalized=normalizeDocumentMetadata(metadata),current=values(normalized.custom_fields),old=states.all(documentId);
    const byId=new Map(old.map(row=>[row.field_id,row])),scope=JSON.stringify([normalized.correspondent,normalized.document_type]);
    const gap=old.some(row=>row.synced_revision!==previousRevision);
    for(const id of new Set([...byId.keys(),...current.keys()])){
      const prior=byId.get(id),present=Number(current.has(id)),json=current.get(id)??'null';
      const changed=!prior||gap||prior.present!==present||prior.value_json!==json||prior.scope_json!==scope;
      if(changed){
        removeSource.run(documentId,id);
        putState.run({document_id:documentId,field_id:id,value_json:json,present,scope_json:scope,
          generation:prior?prior.generation+1:1,synced_revision:revision});
      }
    }
    advanceRevision.run(revision,documentId,revision);
  }
  function capture(event){
    const changes=JSON.parse(event.changes_json),metadata=JSON.parse(event.metadata_json);
    const after=values(changes.custom_fields?.after),current=values(metadata.custom_fields);
    for(const id of changedFields(changes)){
      const row=state.get(event.document_id,id);
      if(row&&after.get(id)===current.get(id)&&row.present===Number(current.has(id))&&row.value_json===(current.get(id)??'null')){
        mapEvent.run(event.id,id,event.document_id,row.generation);
      }
    }
  }
  function assertCurrent(event){
    for(const mapping of mappings.all(event.id)){
      const row=state.get(mapping.document_id,mapping.field_id);
      const snapshot=snapshotRevision.get(mapping.document_id);
      if(!row||row.generation!==mapping.generation||row.synced_revision!==snapshot?.revision){
        throw new Error('Stale field correction; review a newer event or record a new field correction');
      }
    }
  }
  function confirm(event){
    assertCurrent(event);
    for(const mapping of mappings.all(event.id)){
      const row=state.get(mapping.document_id,mapping.field_id);
      if(row.present&&row.value_json!=='null'&&row.value_json!=='""')putSource.run(mapping.document_id,mapping.field_id,event.id,mapping.generation);
    }
  }
  function revoke(documentId){
    db.prepare('DELETE FROM learning_field_sources WHERE document_id=?').run(documentId);
    db.prepare('UPDATE learning_field_state SET generation=generation+1 WHERE document_id=?').run(documentId);
  }
  // Materialize a bounded page before writing: better-sqlite3 deliberately
  // forbids writes while a live iterator holds the same connection busy.
  function batches(statement,key,consume){
    let last=null;
    for(;;){
      const rows=statement.all(last,last);if(!rows.length)return;
      for(const row of rows)consume(row);
      last=rows[rows.length-1][key];
    }
  }
  // On reopen, do not trust snapshots written by a version unaware of this ledger.
  batches(db.prepare(`SELECT * FROM learning_document_snapshots
    WHERE (? IS NULL OR document_id>?) ORDER BY document_id LIMIT 64`),'document_id',snapshot=>{
    synchronize(snapshot.document_id,JSON.parse(snapshot.metadata_json),snapshot.revision,snapshot.revision);
  });
  if(!migrated){
    const events=db.prepare(`SELECT c.* FROM learning_examples e
      JOIN learning_change_events c ON c.id=e.event_id AND c.document_id=e.document_id AND c.status='confirmed'
      JOIN learning_document_snapshots s ON s.document_id=e.document_id
      WHERE e.metadata_json=s.metadata_json AND c.metadata_json=e.metadata_json
        AND (? IS NULL OR c.id>?) ORDER BY c.id LIMIT 64`);
    batches(events,'id',event=>{capture(event);confirm(event);});
    db.prepare('INSERT INTO learning_migrations VALUES(4)').run();
  }
  function corrections(){
    return db.prepare(`SELECT c.id AS event_id,c.document_id,c.metadata_json,c.changes_json,c.content_preview,
      group_concat(f.field_id) AS eligible_fields
      FROM learning_field_sources f
      JOIN learning_field_state s ON s.document_id=f.document_id AND s.field_id=f.field_id
        AND s.generation=f.generation AND s.present=1
      JOIN learning_document_snapshots d ON d.document_id=s.document_id AND d.revision=s.synced_revision
      JOIN learning_change_events c ON c.id=f.event_id AND c.document_id=f.document_id AND c.status='confirmed'
      JOIN learning_event_fields m ON m.event_id=c.id AND m.document_id=f.document_id
        AND m.field_id=f.field_id AND m.generation=f.generation
      GROUP BY c.id ORDER BY c.id DESC LIMIT 500`).all().map(row=>{
      const allowed=new Set(row.eligible_fields.split(',').map(Number)),changes=JSON.parse(row.changes_json);
      return {...row,metadata:JSON.parse(row.metadata_json),changes:{custom_fields:{
        before:(changes.custom_fields?.before||[]).filter(field=>allowed.has(field.field)),
        after:(changes.custom_fields?.after||[]).filter(field=>allowed.has(field.field))}}};
    });
  }
  return {synchronize,capture,assertCurrent,confirm,revoke,corrections};
}
module.exports={initializeFieldSources};
