'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {normalizeValue}=require('../../../services/customFieldUpdates');
const {selectContext,rankExamples}=require('../../../services/learningContext');
const {fieldTypes}=require('../corpus');
const {score}=require('../scoring');
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids=['invoice_number','contract_number','policy_number'];
function load(){
  const manifest=require('./manifest.json');
  for(const [name,digest]of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,`Frozen ${name} changed`);
  const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'cases.json'))).cases,protocol=require('./protocol.json');
  for(const [split,count]of Object.entries(manifest.splits))assert.equal(cases.filter(row=>row.split===split).length,count);
  return {cases,protocol,manifest};
}
function schemaErrors(value,schema,location='$'){
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const type=value===null?'null':Array.isArray(value)?'array':typeof value==='number'&&Number.isInteger(value)?'integer':typeof value;
  if(!types.includes(type)&&!(type==='integer'&&types.includes('number')))return [location+':type'];
  if(typeof value==='number'&&!Number.isFinite(value))return [location+':finite'];
  if(schema.enum&&!schema.enum.includes(value))return [location+':enum'];
  if(value===null)return [];
  let errors=[];
  if(type==='object'){
    for(const key of schema.required||[])if(!Object.hasOwn(value,key))errors.push(location+'.'+key+':required');
    for(const [key,item]of Object.entries(value)){
      if(!Object.hasOwn(schema.properties||{},key)){if(schema.additionalProperties===false)errors.push(location+'.'+key+':extra');}
      else errors.push(...schemaErrors(item,schema.properties[key],location+'.'+key));
    }
  }else if(type==='array'){
    if(schema.maxItems!==undefined&&value.length>schema.maxItems)errors.push(location+':maxItems');
    value.forEach((item,index)=>errors.push(...schemaErrors(item,schema.items,location+'['+index+']')));
  }
  return errors;
}
function validate(actual,content,evidence,protocol=load().protocol){
  const errors=schemaErrors(actual,evidence?protocol.evidenceSchema:protocol.baselineSchema),accepted={},rejected={};
  if(errors.length)return {accepted,rejected,protocolErrors:errors};
  const lines=content.split('\n');
  for(const [field,data_type]of Object.entries(fieldTypes)){
    const value=actual.custom_fields[field],proof=evidence?actual.field_evidence[field]:null;
    if(value===null){
      if(evidence&&(proof.quote!==null||proof.start_line!==null||proof.end_line!==null))rejected[field]='evidence_for_null';
      continue;
    }
    const typed=normalizeValue(value,{data_type});
    if(typed===undefined){rejected[field]='invalid_type';continue;}
    if(evidence){
      const {quote,start_line:start,end_line:end}=proof;
      if(typeof quote!=='string'||!quote||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>lines.length||end-start>=5){rejected[field]='invalid_evidence_range';continue;}
      const span=lines.slice(start-1,end).join('\n');
      const escaped=quote.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const exact=ids.includes(field)?new RegExp(`(?<![\\p{L}\\p{N}_/-])${escaped}(?![\\p{L}\\p{N}_/-])`,'u').test(span):span.includes(quote);
      if(!exact||normalizeValue(quote,{data_type})!==typed){rejected[field]='evidence_value_mismatch';continue;}
    }
    accepted[field]=typed;
  }
  return {accepted,rejected,protocolErrors:errors};
}
function referenceInput(fixture,training){
  const refs=training.map(row=>({id:row.id,metadata:{...row.expected,title:`Reviewed ${row.kind} ${row.language}`},content_preview:row.content.slice(0,500)}));
  const context=selectContext(fixture.content,refs,1500);
  return {context,ranked:rankExamples(fixture.content,refs).map(row=>row.id)};
}
function scores(actual,accepted,fixture,training){
  const raw={},validated={},errors={};
  const values=actual&&typeof actual.custom_fields==='object'&&!Array.isArray(actual.custom_fields)?actual.custom_fields||{}:{};
  const classify=(value,expected)=>expected==null?(value==null||value===''?'correct':'wrong'):value==null||value===''?'missing':value===expected?'correct':'wrong';
  for(const field of Object.keys(fieldTypes)){
    const expected=fixture.expected.custom_fields[field],value=values[field];
    raw[field]=classify(value,expected);validated[field]=classify(accepted[field],expected);
    if(raw[field]!=='correct'&&value!=null&&value!==''){
      const normalized=normalizeValue(value,{data_type:fieldTypes[field]});
      if(expected!==null&&normalized===expected)errors[field]='format_variant';
      else if(ids.includes(field)&&training.some(row=>ids.some(key=>row.expected.custom_fields[key]===normalized)))errors[field]='training_value_copy';
      else if(fixture.forbiddenCurrentIdentifiers.includes(normalized))errors[field]='historical_value_copy';
      else if(field.endsWith('_date')&&Object.entries(fixture.expected.custom_fields).some(([key,v])=>key!==field&&key.endsWith('_date')&&v===normalized))errors[field]='wrong_date_role';
      else errors[field]=expected===null?'invented_absent_value':'wrong_value';
    }
  }
  const metadata=Object.fromEntries(['document_type','tags','correspondent','language'].map(key=>[key,score(actual?.[key],fixture.expected[key])]));
  return {raw,validated,errors,metadata};
}
function summarize(rows,cases){
  const totals={documents:rows.length,failedAttempts:0,fields:{},metadata:{},rejections:{},durationMs:0,promptTokens:0,generatedTokens:0};
  for(const row of rows){
    const fixture=cases.find(item=>item.id===row.id);assert.ok(fixture);
    if(row.error||row.validation.protocolErrors.length)totals.failedAttempts++;
    totals.durationMs+=row.durationMs||0;totals.promptTokens+=row.response?.prompt_eval_count||0;totals.generatedTokens+=row.response?.eval_count||0;
    for(const [field,expected]of Object.entries(fixture.expected.custom_fields)){
      const s=totals.fields[field]||(totals.fields[field]={present:0,absent:0,missingTarget:0,inapplicable:0,raw:{correct:0,wrong:0,missing:0},validated:{correct:0,wrong:0,missing:0},correctPresent:0,wrongAccepted:0,absentFalsePositive:0,errors:{}});
      if(expected!==null)s.present++;else {s.absent++;const applicable=ids.includes(field)?fixture.targetIdentifier===field:field==='amount'?['invoice','contract','insurance'].includes(fixture.kind):field==='due_date'?fixture.kind==='invoice':['contract','insurance'].includes(fixture.kind);if(applicable)s.missingTarget++;else s.inapplicable++;}
      s.raw[row.scores.raw[field]]++;s.validated[row.scores.validated[field]]++;
      if(expected!==null&&row.scores.validated[field]==='correct')s.correctPresent++;
      if(Object.hasOwn(row.validation.accepted,field)&&row.scores.validated[field]!=='correct'){s.wrongAccepted++;if(expected===null)s.absentFalsePositive++;}
      const error=row.scores.errors[field];if(error)s.errors[error]=(s.errors[error]||0)+1;
    }
    for(const [field,status]of Object.entries(row.scores.metadata)){const s=totals.metadata[field]||(totals.metadata[field]={correct:0,wrong:0,missing:0});s[status]++;}
    for(const reason of Object.values(row.validation.rejected))totals.rejections[reason]=(totals.rejections[reason]||0)+1;
  }
  return totals;
}
function identifierTotals(summary){return ids.reduce((out,key)=>{const s=summary.fields[key];out.present+=s?.present||0;out.correct+=s?.correctPresent||0;out.wrong+=s?.wrongAccepted||0;return out;},{present:0,correct:0,wrong:0});}
module.exports={load,hash,schemaErrors,validate,referenceInput,scores,summarize,identifierTotals,ids};
