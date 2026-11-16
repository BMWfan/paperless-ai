'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const shared=require('../quality/extraction/core');
const {normalizeValue}=require('../../services/customFieldUpdates');
const {selectContext,rankExamples}=require('../../services/learningContext');
const {get_encoding}=require('tiktoken');
const ids=shared.ids,roles=['own_current','historical','other_document','unclear','not_identifier'];
const sourceFiles=['core.js','run.js','report.js','replay.js','measurement-lock.json','CONTRACT.md','manifest.json','../identifier-roles.test.js','../../.github/workflows/classification-evaluation.yml','../quality/extraction/core.js','../quality/scoring.js','../quality/corpus.js','../context-projection/ingestion.js','../../services/learningContext.js','../../services/ollamaService.js','../../services/customFieldUpdates.js'];
const sourceDigests=()=>Object.fromEntries(sourceFiles.map(file=>[file,shared.hash(fs.readFileSync(path.join(__dirname,file)))]));
function load(){
  const manifest=require('./manifest.json');
  for(const [file,digest]of Object.entries(manifest.files))assert.equal(shared.hash(fs.readFileSync(path.join(__dirname,file))),digest,`Frozen ${file} changed`);
  const cases=require('./cases.json').cases,protocol=require('./protocol.json');
  for(const [split,count]of Object.entries(manifest.splits))assert.equal(cases.filter(row=>row.split===split).length,count);
  return {cases,protocol,manifest};
}
function enumerate(content,protocol=load().protocol){
  const stopped=reason=>({status:reason,candidates:[],count:null});
  if(typeof content!=='string'||!content)return stopped('invalid_input');
  if(content.length>protocol.maximumCharacters)return stopped('character_limit');
  const spans=new Map();let tooLong=false;
  function add(start,end){
    if(start===end)return;
    if([...content.slice(start,end)].length>protocol.maximumCandidateCodepoints){tooLong=true;return;}
    spans.set(`${start}:${end}`,{start,end,value:content.slice(start,end)});
  }
  for(const line of content.matchAll(/[^\r\n]+/gu)){
    const boundary=line[0].search(/[:=]/u);
    if(boundary>=0){const suffix=line[0].slice(boundary+1),trimmed=suffix.trim();const start=line.index+boundary+1+suffix.length-suffix.trimStart().length;add(start,start+trimmed.length);}
    for(const token of line[0].matchAll(/\S+/gu)){
      if(!/\p{Nd}/u.test(token[0]))continue;
      const clean=token[0].replace(/^[.,;:!?()[\]{}"'<>]+|[.,;:!?()[\]{}"'<>]+$/gu,'');
      const start=line.index+token.index+token[0].indexOf(clean);add(start,start+clean.length);
    }
  }
  const sorted=[...spans.values()].sort((a,b)=>a.start-b.start||a.end-b.end);
  const status=tooLong?'candidate_length':sorted.length>protocol.maximumOccurrences?'occurrence_limit':'ok';
  return {status,count:sorted.length,candidates:status==='ok'?sorted.map((row,i)=>({id:i+1,...row})):[]};
}
function roleSchema(count){return {type:'object',additionalProperties:false,required:['assignments'],properties:{assignments:{type:'array',minItems:count,maxItems:count,items:{type:'object',additionalProperties:false,required:['id','role','field'],properties:{id:{type:'integer',minimum:1,maximum:Math.max(1,count)},role:{type:'string',enum:roles},field:{type:['string','null'],enum:[...ids,null]}}}}}};}
function rawReferences(content,training,budget){
  const refs=training.map(row=>({id:row.id,metadata:row.expected,content_preview:row.content.slice(0,500)}));
  const context=selectContext(content,refs,budget);if(!context)return {context:'',selectedReferences:[],rankedReferences:[]};
  const records=JSON.parse(context.slice(context.lastIndexOf('\n')+1)),catalog=new Map(refs.map(row=>[JSON.stringify({metadata:row.metadata,excerpt:row.content_preview}),row.id]));
  const selectedReferences=records.map(record=>{const id=catalog.get(JSON.stringify(record));assert.ok(id);return id;});
  return {context,selectedReferences,rankedReferences:rankExamples(content,refs).map(row=>row.id)};
}
function inputFor(content,training,arm,protocol=load().protocol){
  assert.ok(['A','B'].includes(arm));let occurrences=enumerate(content,protocol);
  let guard=typeof content!=='string'||!content?'invalid_input':content.length>protocol.maximumCharacters?'character_limit':arm==='B'&&occurrences.status!=='ok'?occurrences.status:null;
  const references=arm==='A'&&!guard?rawReferences(content,training,protocol.referenceBudget):{context:'',selectedReferences:[],rankedReferences:[]};
  const build=()=>{
    const system=arm==='A'?protocol.baselineSystem+references.context:protocol.candidateSystem;
    const prompt=guard?JSON.stringify({diagnostic:guard,documentDigest:shared.hash(String(content)),length:String(content).length,occurrences:[]}):arm==='A'?`CURRENT DOCUMENT:\n${content}`:JSON.stringify({document:content,occurrences:occurrences.candidates});
    return {system,prompt,format:arm==='A'?protocol.baselineSchema:roleSchema(guard?0:occurrences.candidates.length)};
  };
  let request=build(),encoding=get_encoding('cl100k_base'),inputTokens;
  try{inputTokens=encoding.encode(request.system+'\n'+request.prompt+'\n'+JSON.stringify(request.format)).length;}finally{encoding.free();}
  if(inputTokens>protocol.inputTokenLimit){guard='context_limit';references.context='';references.selectedReferences=[];references.rankedReferences=[];request=build();}
  if(guard)occurrences={...occurrences,candidates:[]};
  return {...request,guard,occurrences,inputTokens,...references};
}
function validateRoles(actual,input){
  const errors=shared.schemaErrors(actual,input.format),accepted={},rejected={},sources={},claims=[],blocked={};
  if(!errors.length){
    const seen=new Set();for(const row of actual.assignments){
      if(seen.has(row.id)||!input.occurrences.candidates.some(c=>c.id===row.id))errors.push('duplicate_or_unknown_occurrence');seen.add(row.id);
      if(row.role==='own_current'&&!ids.includes(row.field)||row.role==='not_identifier'&&row.field!==null)errors.push('role_field_mismatch');
    }
    if(seen.size!==input.occurrences.candidates.length)errors.push('incomplete_occurrences');
  }
  if(errors.length)return {accepted,rejected,sources,claims,blocked,protocolErrors:errors};
  if(input.guard){for(const field of ids)blocked[field]=input.guard;return {accepted,rejected,sources,claims,blocked,protocolErrors:[]};}
  for(const row of actual.assignments){
    if(row.role==='unclear')for(const field of row.field===null?ids:[row.field])blocked[field]='unclear';
    if(row.role==='own_current')claims.push({...input.occurrences.candidates.find(c=>c.id===row.id),field:row.field});
  }
  for(const field of ids){
    const own=claims.filter(row=>row.field===field);if(!own.length||blocked[field])continue;
    const normalized=own.map(row=>normalizeValue(row.value,{data_type:'string'}));
    if(normalized.some(value=>value===undefined)){rejected[field]='invalid_type';continue;}
    if(new Set(normalized).size!==1){blocked[field]='conflicting_current_values';continue;}
    accepted[field]=normalized[0];sources[field]=own.map(({id,start,end,value})=>({id,start,end,value}));
  }
  return {accepted,rejected,sources,claims,blocked,protocolErrors:[]};
}
function validateArm(actual,input,arm,content,protocol=load().protocol){
  if(arm==='B')return validateRoles(actual,input);
  const result=shared.validate(actual,content,false,protocol);
  return {accepted:input.guard?{}:Object.fromEntries(Object.entries(result.accepted).filter(([field])=>ids.includes(field))),rejected:Object.fromEntries(Object.entries(result.rejected).filter(([field])=>ids.includes(field))),protocolErrors:result.protocolErrors,sources:null,claims:null,blocked:input.guard?Object.fromEntries(ids.map(field=>[field,input.guard])):{}};
}
function scoreRow(actual,validation,input,fixture,training,arm){
  const values=arm==='A'?actual?.custom_fields||{}:validation.accepted;
  const old=shared.scores({custom_fields:values},validation.accepted,fixture,training),pick=value=>Object.fromEntries(ids.map(field=>[field,value[field]]));
  const result={raw:pick(old.raw),validated:pick(old.validated),errors:Object.fromEntries(ids.filter(field=>old.errors[field]!==undefined).map(field=>[field,old.errors[field]])),rawClaims:{},acceptedSourceCount:0,wrongAcceptedSources:0,roleConfusion:{},missingGoldCandidates:0};
  if(arm==='A')return {...result,acceptedSourceCount:null,wrongAcceptedSources:null,missingGoldCandidates:null};
  const validSource=(candidate,field)=>fixture.goldSpans.some(g=>g.start===candidate.start&&g.end===candidate.end&&g.field===field&&g.role==='own_current');
  for(const field of ids){
    const claims=(validation.claims||[]).filter(row=>row.field===field),expected=fixture.expected.custom_fields[field];
    result.rawClaims[field]={total:claims.length,wrongValue:claims.filter(c=>normalizeValue(c.value,{data_type:'string'})!==expected).length,wrongSource:claims.filter(c=>!validSource(c,field)).length};
    result.raw[field]=claims.length?(result.rawClaims[field].wrongValue?'wrong':'correct'):(expected===null?'correct':'missing');
    for(const source of validation.sources?.[field]||[]){result.acceptedSourceCount++;if(!validSource(source,field))result.wrongAcceptedSources++;}
  }
  if(!validation.protocolErrors.length)for(const row of actual?.assignments||[]){
    const c=input.occurrences.candidates.find(c=>c.id===row.id);if(!c)continue;
    const gold=fixture.goldSpans.find(g=>g.start===c.start&&g.end===c.end),role=gold?.role||'not_identifier',key=role+':'+(gold?.field||'-')+' -> '+row.role+':'+(row.field||'-');
    result.roleConfusion[key]=(result.roleConfusion[key]||0)+1;
  }
  for(const gold of fixture.goldSpans.filter(g=>g.role==='own_current'))if(!input.occurrences.candidates.some(c=>c.start===gold.start&&c.end===gold.end))result.missingGoldCandidates++;
  return result;
}
function summarize(rows,cases){
  const sourceEvaluation=rows.some(row=>row.input.format.properties.assignments)?'predicted_occurrences':'not_available';
  const result={documents:rows.length,sourceEvaluation,failedAttempts:0,fields:{},wrongAcceptedSources:sourceEvaluation==='predicted_occurrences'?0:null,acceptedSourceCount:sourceEvaluation==='predicted_occurrences'?0:null,guards:{},blocks:{},rawClaims:{},roleConfusion:{},missingGoldCandidates:sourceEvaluation==='predicted_occurrences'?0:null,durationMs:0,promptTokens:0,generatedTokens:0};
  for(const row of rows){
    const fixture=cases.find(c=>c.id===row.id);assert.ok(fixture);
    if(row.error||row.validation.protocolErrors.length)result.failedAttempts++;
    if(row.input.guard)result.guards[row.input.guard]=(result.guards[row.input.guard]||0)+1;
    for(const reason of Object.values(row.validation.blocked))result.blocks[reason]=(result.blocks[reason]||0)+1;
    if(sourceEvaluation==='predicted_occurrences'){result.wrongAcceptedSources+=row.scores.wrongAcceptedSources;result.acceptedSourceCount+=row.scores.acceptedSourceCount;result.missingGoldCandidates+=row.scores.missingGoldCandidates;}
    result.durationMs+=row.durationMs;result.promptTokens+=row.response?.prompt_eval_count||0;result.generatedTokens+=row.response?.eval_count||0;
    for(const [key,count]of Object.entries(row.scores.roleConfusion))result.roleConfusion[key]=(result.roleConfusion[key]||0)+count;
    for(const field of ids){
      const s=result.fields[field]||(result.fields[field]={present:0,absent:0,missingApplicable:0,inapplicable:0,correctPresent:0,wrongAccepted:0,raw:{correct:0,wrong:0,missing:0},validated:{correct:0,wrong:0,missing:0}}),expected=fixture.expected.custom_fields[field];
      if(expected!==null)s.present++;else {s.absent++;if(fixture.targetIdentifier===field)s.missingApplicable++;else s.inapplicable++;}
      s.raw[row.scores.raw[field]]++;s.validated[row.scores.validated[field]]++;
      if(expected!==null&&row.scores.validated[field]==='correct')s.correctPresent++;
      if(Object.hasOwn(row.validation.accepted,field)&&row.scores.validated[field]!=='correct')s.wrongAccepted++;
      const claims=row.scores.rawClaims[field];if(claims){const sum=result.rawClaims[field]||(result.rawClaims[field]={total:0,wrongValue:0,wrongSource:0});for(const key of Object.keys(sum))sum[key]+=claims[key];}
    }
  }
  return result;
}
const identifierTotals=summary=>ids.reduce((out,field)=>{const s=summary.fields[field];out.present+=s?.present||0;out.correct+=s?.correctPresent||0;out.wrong+=s?.wrongAccepted||0;return out;},{present:0,correct:0,wrong:0});
module.exports={...shared,load,enumerate,roleSchema,inputFor,validateArm,scoreRow,summarize,identifierTotals,sourceDigests,sourceFiles,roles,ids};
