'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('real document model preserves confirmed feedback and honors cross-store revocation',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-model-'));
  const modelPath=path.resolve(__dirname,'../models/document');
  const enginePath=path.resolve(__dirname,'../services/learningEngine');
  const Database=require('better-sqlite3');
  fs.mkdirSync(path.join(directory,'data'));
  const file=path.join(directory,'data','documents.db'),old=new Database(file);
  old.exec(`CREATE TABLE learning_feedback(id INTEGER PRIMARY KEY,document_id INTEGER,title TEXT,content_preview TEXT,tags TEXT,correspondent TEXT,document_type TEXT,corrected_by_user INTEGER,created_at TEXT,updated_at TEXT);
    INSERT INTO learning_feedback VALUES(1,99,'Old confirmed correction','synthetic','[]','','',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO learning_feedback VALUES(2,99,'Newer unconfirmed prediction','synthetic','[]','','',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
  old.close();
  const script=`
    const assert=require('node:assert/strict');
    const model=require(${JSON.stringify(modelPath)});
    const engine=require(${JSON.stringify(enginePath)});
    (async()=>{
      assert.equal((await model.getConfirmedLearningFeedback(99)).title,'Old confirmed correction');
      await model.saveLearningFeedback(42,'First','synthetic',['invoice'],'Insurer','Insurance',false);
      await model.markLearningFeedbackCorrected(42,'Confirmed',['invoice'],'Insurer','synthetic');
      assert.equal(await model.saveLearningFeedback(42,'AI overwrite','synthetic',[],'','',false),false);
      assert.equal((await model.getConfirmedLearningFeedback(42)).title,'Confirmed');
      assert.equal(await model.saveLearningFeedback(7,'First','',[],'','',false),true);
      assert.equal(await model.saveLearningFeedback(7,'Second','',[],'','',false),true);
      assert.equal((await model.getLearningExamples(100)).find(row=>row.document_id===7).title,'Second');
      assert.equal(engine.store.revokeLegacy(42,'api-key'),true);
      assert.equal(await model.getConfirmedLearningFeedback(42),null);
      assert.equal((await model.getLearningExamples(100)).some(row=>row.document_id===42),false);
      assert.equal((await model.getLearningExamples(100,true)).find(row=>row.document_id===42).title,'Confirmed');
      engine.store.close();
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  try {
    const result=spawnSync(process.execPath,['-e',script],{cwd:directory,encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);
    const migrated=new Database(file,{readonly:true});
    const archived=migrated.prepare('SELECT payload_json FROM learning_feedback_archive WHERE document_id=99').all();
    assert.equal(archived.length,1);assert.equal(JSON.parse(archived[0].payload_json).title,'Newer unconfirmed prediction');
    migrated.close();
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('real Paperless writer records only successful self-writes and releases its lock after failure',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-write-'));
  const servicePath=path.resolve(__dirname,'../services/paperlessService');
  const enginePath=path.resolve(__dirname,'../services/learningEngine');
  const script=`
    const assert=require('node:assert/strict');
    const service=require(${JSON.stringify(servicePath)}),engine=require(${JSON.stringify(enginePath)});
    let current={id:1,title:'Before',tags:[]};
    service.initialize=()=>{};service.getDocument=async()=>current;
    service.client={async patch(){throw new Error('isolated offline fixture');}};
    engine.store.observe(current);
    (async()=>{
      await assert.rejects(service.updateDocument(1,{title:'Prediction'}),/isolated offline fixture/);
      assert.equal(engine.inFlight.has(1),false);
      assert.equal(engine.store.list().length,0);
      assert.equal(engine.store.needsContent(current),false);
      service.client.patch=async()=>{current={...current,title:'Applied'};return {data:current};};
      assert.equal((await service.updateDocument(1,{title:'Applied'})).title,'Applied');
      assert.equal(engine.store.list().length,0);
      engine.store.close();
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  try {
    const result=spawnSync(process.execPath,['-e',script],{cwd:directory,encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
