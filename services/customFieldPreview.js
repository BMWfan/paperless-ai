'use strict';
const {createHash}=require('node:crypto');
const {normalizeValue}=require('./customFieldUpdates');
const {snapshotDigest,isReviewableType}=require('./customFieldReview');
const digest=text=>createHash('sha256').update(text).digest('hex');

function occurrences(content,candidates){
  const found=new Map();
  for(const value of new Set(candidates.filter(text=>typeof text==='string'&&text.trim()).map(text=>text.trim()))){
    let start=0,index;
    while((index=content.indexOf(value,start))!==-1){
      start=index+Math.max(1,value.length);
      const before=content[index-1]||'',after=content[index+value.length]||'';
      if(/[\p{L}\p{N}_/-]/u.test(before)||/[\p{L}\p{N}_/-]/u.test(after)||
        (before==='.'&&/[\p{L}\p{N}]/u.test(content[index-2]||''))||
        (after==='.'&&/[\p{L}\p{N}]/u.test(content[index+value.length+1]||'')))continue;
      found.set(`${index}/${value.length}`,{offset:index,length:value.length});
    }
  }
  const matches=[...found.values()].sort((a,b)=>a.offset-b.offset||b.length-a.length);
  return {count:matches.length,excerpts:matches.slice(0,5).map(({offset,length})=>({
    line:content.slice(0,offset).split('\n').length,
    text:content.slice(Math.max(0,offset-90),Math.min(content.length,offset+Math.min(length,120)+90))
  }))};
}

async function previewCustomFields(paperless,documentId,content,suggestions){
  const document=await paperless.getDocument(documentId);
  const fullContent=typeof document.content==='string'?document.content:'';
  // Match the exact text submitted by the Manual screen (which caps at50k).
  if(!fullContent||content!==fullContent.slice(0,50000)){
    const error=new Error('Document text changed. Reload the document and analyze again.');error.status=409;throw error;
  }
  const names=new Map(),definitions=new Map(),rows=[];
  for(const suggestion of Object.values(suggestions)){
    const name=typeof suggestion?.field_name==='string'?suggestion.field_name.trim():'';
    if(!name||name.length>128)continue;
    const key=name.toLowerCase();
    if(!names.has(key))names.set(key,await paperless.getCustomFieldDefinitionMatches(name));
    const matches=names.get(key);
    if(!Array.isArray(matches?.results)||!Number.isSafeInteger(matches.count)||matches.count<0||
      (matches.count===1&&(!Number.isSafeInteger(matches.results[0]?.id)||matches.results[0].id<=0)))throw new Error('Invalid custom field definitions');
    const definition=matches.count===1?matches.results[0]:null;
    if(definition)definitions.set(definition.id,definition);
    const raw=suggestion.value;
    const normalized=definition&&raw!=null?normalizeValue(raw,definition):undefined;
    const flags=[];
    if(!definition)flags.push(matches.count>1?'ambiguous_field':'unknown_field');
    else if(!isReviewableType(definition.data_type))flags.push('unsupported_type');
    if(raw===null||raw===undefined||raw==='')flags.push('not_provided');
    else if(definition&&normalized===undefined)flags.push('invalid_value');
    const evidence=occurrences(content,[typeof raw==='string'?raw:typeof raw==='number'||typeof raw==='boolean'?String(raw):'',
      typeof normalized==='string'?normalized:'']);
    if(evidence.count===0)flags.push('no_exact_occurrence');
    if(evidence.count>1)flags.push('multiple_occurrences');
    rows.push({fieldId:definition?.id??null,name:definition?.name||name,type:definition?.data_type??null,
      currentValue:document.custom_fields?.find(row=>row.field===definition?.id)?.value??null,
      proposedValue:raw??null,normalizedValue:normalized??null,flags,evidence,semanticStatus:'unverified'});
  }
  const ids=rows.map(row=>row.fieldId).filter(id=>id!==null);
  for(const row of rows){
    if(row.fieldId!==null&&ids.filter(id=>id===row.fieldId).length>1)row.flags.push('multiple_proposals');
    row.canApply=row.fieldId!==null&&row.normalizedValue!==null&&
      !row.flags.some(flag=>['unknown_field','ambiguous_field','unsupported_type','not_provided','invalid_value','multiple_proposals'].includes(flag));
  }
  return {documentId,contentDigest:digest(fullContent),submittedTextDigest:digest(content),
    snapshotDigest:snapshotDigest(documentId,document,[...definitions.values()]),reviewFieldIds:[...definitions.keys()].sort((a,b)=>a-b),
    modified:document.modified??null,searchScope:'submitted_text',readOnly:true,rows};
}
module.exports={previewCustomFields,occurrences};
