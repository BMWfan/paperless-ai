'use strict';
const {normalizeValue}=require('./customFieldUpdates');
const {previewCustomFields}=require('./customFieldPreview');
const {snapshotDigest}=require('./customFieldReview');
const positive=value=>Number.isSafeInteger(value)&&value>0;
const boundedText=(text,limit)=>{const value=String(text||'').slice(0,limit);return value.length===limit?value.slice(0,Math.max(0,value.lastIndexOf('\n'))):value;};
function lines(text){
  const result=[];
  for(const [index,line] of String(text||'').split(/\r?\n/).entries()){
    const match=/^\s*([^:=]{1,80}[:=])[\t ]*(.*?)\s*$/u.exec(line);
    if(!match)continue;
    const label=match[1].trim().normalize('NFC');
    if(!/^[\p{L}\p{M}\t ()[\]./#_-]+[:=]$/u.test(label)||[...label.matchAll(/\p{L}/gu)].length<3)continue;
    result.push({label,value:match[2],line:index+1});
  }
  return result;
}
function derivePatterns(sources,document){
  if(!positive(document.correspondent)||!positive(document.document_type))return [];
  const patterns=new Map(),fields=new Set();
  for(const source of sources.slice(0,500)){
    const metadata=source.metadata||{},change=source.changes?.custom_fields;
    if(source.document_id===document.id||!positive(source.document_id)||!positive(source.event_id)||
      metadata.correspondent!==document.correspondent||metadata.document_type!==document.document_type||!change)continue;
    const before=new Map((change.before||[]).map(row=>[row.field,row.value]));
    const current=new Map((metadata.custom_fields||[]).map(row=>[row.field,row.value]));
    const text=boundedText(source.content_preview,2000);
    const parsed=lines(text);
    for(const row of (change.after||[]).slice(0,50)){
      const value=normalizeValue(row.value,{data_type:'string'});
      if(!positive(row.field)||value===undefined||row.value!==value||before.get(row.field)===value||current.get(row.field)!==value)continue;
      if(!fields.has(row.field)&&fields.size>=50)continue;
      const matches=parsed.filter(line=>line.value===value);
      if(matches.length!==1||matches[0].label.toLowerCase().includes(value.normalize('NFC').toLowerCase()))continue;
      fields.add(row.field);
      const label=matches[0].label,key=JSON.stringify([row.field,label]);
      if(!patterns.has(key))patterns.set(key,{field:row.field,label,sources:[]});
      const refs=patterns.get(key).sources;
      if(refs.length<3&&!refs.some(ref=>ref.eventId===source.event_id))refs.push({documentId:source.document_id,eventId:source.event_id});
    }
  }
  return [...patterns.values()];
}
function matchPatterns(patterns,content){
  const index=new Map(),fields=new Map();
  for(const line of lines(boundedText(content,50000))){
    if(!index.has(line.label))index.set(line.label,[]);
    if(index.get(line.label).length<2)index.get(line.label).push(line);
  }
  for(const pattern of patterns){
    const matches=index.get(pattern.label)||[];if(!matches.length)continue;
    if(!fields.has(pattern.field))fields.set(pattern.field,{field:pattern.field,matches:new Map(),ambiguous:false,sources:[]});
    const field=fields.get(pattern.field);
    if(matches.length!==1){field.ambiguous=true;continue;}
    field.matches.set(matches[0].line,matches[0]);
    for(const ref of pattern.sources)if(field.sources.length<3&&!field.sources.some(item=>item.eventId===ref.eventId))field.sources.push(ref);
  }
  const candidates=[];let ambiguous=0;
  for(const field of fields.values()){
    if(field.ambiguous||field.matches.size!==1){ambiguous++;continue;}
    const match=[...field.matches.values()][0],value=normalizeValue(match.value,{data_type:'string'});
    if(value===undefined)continue;
    candidates.push({field:field.field,value,label:match.label,line:match.line,sources:field.sources});
    if(candidates.length>=50)break;
  }
  return {candidates,ambiguous};
}
async function learnedFieldPreview(paperless,store,documentId,content){
  const document=await paperless.getDocument(documentId);
  if(typeof document.content!=='string'||content!==document.content.slice(0,50000)){
    const error=new Error('Document text changed. Reload before finding suggestions.');error.status=409;throw error;
  }
  const patterns=store.settings().mode==='disabled'?[]:derivePatterns(store.fieldCorrections(),{...document,id:documentId});
  const {candidates,ambiguous}=matchPatterns(patterns,content),suggestions=[],origins=[],definitions=[];
  for(const candidate of candidates){
    let definition;
    try{definition=await paperless.getCustomFieldDefinition(candidate.field);}catch(error){if(error.response?.status===404)continue;throw error;}
    if(definition?.id!==candidate.field||definition.data_type!=='string'||typeof definition.name!=='string')continue;
    const matches=await paperless.getCustomFieldDefinitionMatches(definition.name);
    if(matches.count!==1||matches.results?.[0]?.id!==candidate.field||matches.results[0].data_type!=='string')continue;
    suggestions.push({field_name:definition.name,value:candidate.value});origins.push(candidate);definitions.push(matches.results[0]);
  }
  const result=await previewCustomFields(paperless,documentId,content,suggestions);
  if(result.snapshotDigest!==snapshotDigest(documentId,document,definitions)){
    const error=new Error('Document or fields changed. Reload before finding suggestions.');error.status=409;throw error;
  }
  // Re-resolved names must still identify the same supported field. Do not retarget a pattern.
  result.rows.forEach((row,i)=>{
    const origin=origins[i];
    if(row.fieldId!==origin.field||row.type!=='string'){row.canApply=false;row.canEdit=false;row.flags.push('pattern_definition_changed');}
    row.origin={kind:'learned_pattern',fieldId:origin.field,label:origin.label,line:origin.line,sources:origin.sources};
  });
  return {...result,suggestionSource:'learned_pattern',ambiguousPatterns:ambiguous,
    emptyMessage:'No learned field suggestions. Missing, conflicting or ineligible patterns are skipped; no model was called.'};
}
module.exports={derivePatterns,matchPatterns,learnedFieldPreview};
