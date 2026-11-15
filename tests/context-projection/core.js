'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const shared=require('../quality/extraction/core');
const {selectContext,rankExamples}=require('../../services/learningContext');
const {get_encoding}=require('tiktoken');
const sourceFiles=['core.js','run.js','report.js','replay.js','ingestion.js','measurement-lock.json','../context-projection.test.js','../../.github/workflows/classification-evaluation.yml','CONTRACT.md','manifest.json','../quality/extraction/core.js','../quality/scoring.js','../quality/corpus.js','../../services/learningContext.js','../../services/ollamaService.js','../../services/customFieldUpdates.js'];
const sourceDigests=()=>Object.fromEntries(sourceFiles.map(file=>[file,shared.hash(fs.readFileSync(path.join(__dirname,file)))]));
function load(){
  const manifest=require('./manifest.json');
  for(const [file,digest] of Object.entries(manifest.files))assert.equal(shared.hash(fs.readFileSync(path.join(__dirname,file))),digest,`Frozen ${file} changed`);
  const cases=require('./cases.json').cases,protocol=require('./protocol.json');
  for(const [split,count] of Object.entries(manifest.splits))assert.equal(cases.filter(row=>row.split===split).length,count);
  return {cases,protocol,manifest};
}
function referenceInput(fixture,training){
  const refs=training.map(row=>({id:row.id,metadata:row.expected,content_preview:row.content.slice(0,500)}));
  const raw=selectContext(fixture.content,refs,1500),rankedIds=rankExamples(fixture.content,refs).map(row=>row.id);
  if(!raw)return {contexts:{A:'',B:''},selectedIds:[],rankedIds,tokens:{A:0,B:0}};
  const end=raw.lastIndexOf('\n')+1,prefix=raw.slice(0,end),records=JSON.parse(raw.slice(end));
  const catalog=new Map(refs.map(row=>[JSON.stringify({metadata:row.metadata,excerpt:row.content_preview}),row.id]));
  assert.equal(catalog.size,refs.length,'reference IDs must resolve uniquely');
  const selectedIds=records.map(record=>{const id=catalog.get(JSON.stringify(record));assert.ok(id);return id;});
  const projected=records.map(record=>({metadata:{document_type:record.metadata.document_type,tags:record.metadata.tags,correspondent:record.metadata.correspondent}}));
  const contexts={A:raw,B:prefix+JSON.stringify(projected)},encoding=get_encoding('cl100k_base');
  try{
    const tokens=Object.fromEntries(Object.entries(contexts).map(([arm,context])=>[arm,encoding.encode(context).length]));
    assert.ok(tokens.A<=1500&&tokens.B<=1500);return {contexts,selectedIds,rankedIds,tokens};
  }finally{encoding.free();}
}
const validate=(actual,content,protocol)=>shared.validate(actual,content,false,protocol);
function provenance(actual,fixture,training){
  // Additional source audit, not a replacement for frozen primary scoring.
  const result={};
  for(const field of shared.ids){
    const value=actual?.custom_fields?.[field];if(typeof value!=='string'||!value.trim()||value.trim()===fixture.expected.custom_fields[field])continue;
    const quoted=value.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const exact=new RegExp(`(?<![\\p{L}\\p{N}_/-])${quoted}(?![\\p{L}\\p{N}_/-])`,'u');
    if(training.some(row=>exact.test(JSON.stringify({metadata:row.expected,excerpt:row.content.slice(0,500)}))))result[field]='training_literal_copy';
    else if(fixture.forbiddenCurrentIdentifiers.includes(value.trim()))result[field]='historical_literal_copy';
  }
  return result;
}
module.exports={...shared,load,referenceInput,validate,provenance,sourceDigests,sourceFiles};
