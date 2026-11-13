'use strict';
const {createHash}=require('node:crypto');
const {normalizeDocumentMetadata}=require('./documentSnapshotService');
const {normalizeValue}=require('./customFieldUpdates');
const types=new Set(['string','longtext','integer','float','boolean','select','date','monetary']);
const positiveId=value=>Number.isSafeInteger(value)&&value>0;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function reviewError(status,message){const error=new Error(message);error.status=status;return error;}
function snapshotDigest(documentId,document,definitions=[]){
  const fields=definitions.map(field=>({id:field.id,name:field.name,data_type:field.data_type,
    extra_data:field.extra_data??null,default_currency:field.default_currency??null})).sort((a,b)=>a.id-b.id);
  const contentDigest=createHash('sha256').update(typeof document.content==='string'?document.content:'').digest('hex');
  return createHash('sha256').update(JSON.stringify(canonical({documentId,
    contentDigest,modified:document.modified??null,
    metadata:normalizeDocumentMetadata(document),fields}))).digest('hex');
}
function validateReviewRequest(body={}){
  if(!body||typeof body!=='object'||Array.isArray(body))throw reviewError(400,'A review request object is required');
  const {documentId,snapshotDigest:expected,reviewFieldIds,fields}=body;
  const id=Number(documentId);
  if(!['string','number'].includes(typeof documentId)||!positiveId(id)||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||
    !Array.isArray(reviewFieldIds)||!reviewFieldIds.length||reviewFieldIds.length>50||!reviewFieldIds.every(positiveId)||new Set(reviewFieldIds).size!==reviewFieldIds.length||
    !Array.isArray(fields)||!fields.length||fields.length>50||fields.some(row=>!row||Array.isArray(row)||!positiveId(row.field)||!reviewFieldIds.includes(row.field)||
      row.value===null||!['string','number','boolean'].includes(typeof row.value))||new Set(fields.map(row=>row.field)).size!==fields.length){
    throw reviewError(400,'A valid snapshot and 1–50 unique selected fields are required');
  }
  return {documentId:id,snapshotDigest:expected,reviewFieldIds:[...reviewFieldIds].sort((a,b)=>a-b),
    fields:fields.map(({field,value})=>({field,value}))};
}
async function freshDefinitions(paperless,ids){
  const definitions=[];
  for(const id of ids){
    let field;
    try{field=await paperless.getCustomFieldDefinition(id);}catch(error){
      if(error.response?.status===404)throw reviewError(409,'Field definitions changed. Analyze again before saving.');
      throw error;
    }
    if(!field||field.id!==id||typeof field.name!=='string')throw new Error('Invalid field definition response');
    const matches=await paperless.getCustomFieldDefinitionMatches(field.name);
    if(!Array.isArray(matches?.results)||!Number.isSafeInteger(matches.count)||matches.count<0||
      (matches.count>0&&!matches.results.length))throw new Error('Invalid field definition response');
    if(matches?.count!==1||matches.results?.[0]?.id!==id)throw reviewError(409,'Field definitions changed. Analyze again before saving.');
    definitions.push(matches.results[0]);
  }
  return definitions;
}
// Called only by the existing writer, while its document lock is held.
async function prepareReviewedFields(paperless,documentId,document,request){
  const review=validateReviewRequest(request);
  if(review.documentId!==Number(documentId))throw reviewError(400,'Document does not match the reviewed snapshot');
  const definitions=await freshDefinitions(paperless,review.reviewFieldIds);
  if(snapshotDigest(Number(documentId),document,definitions)!==review.snapshotDigest)throw reviewError(409,'Document or fields changed. Analyze again before saving.');
  const values=new Map();
  for(const selected of review.fields){
    const definition=definitions.find(field=>field.id===selected.field);
    if(!definition||!types.has(definition.data_type))throw reviewError(400,'Selected field type is not supported');
    const value=normalizeValue(selected.value,definition);
    if(value===undefined)throw reviewError(400,'Selected value is invalid for its field type');
    values.set(selected.field,{field:selected.field,value});
  }
  // Preserve every unselected native value, including types this editor cannot write.
  return {custom_fields:[...values.values(),...(document.custom_fields||[]).filter(row=>!values.has(row.field))]};
}
module.exports={snapshotDigest,validateReviewRequest,prepareReviewedFields,reviewError,isReviewableType:type=>types.has(type)};
