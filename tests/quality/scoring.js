'use strict';
const {fieldTypes}=require('./corpus');
const normalize=value=>typeof value==='string'?value.normalize('NFC').trim().toLowerCase():value;
function score(value,expected) {
  if(expected===null)return value===null||value===undefined||value===''?'correct':'wrong';
  if(value===null||value===undefined||value==='')return 'missing';
  if(Array.isArray(expected))return Array.isArray(value)&&JSON.stringify([...new Set(value.map(normalize))].sort())===JSON.stringify([...expected.map(normalize)].sort())?'correct':'wrong';
  return normalize(value)===normalize(expected)?'correct':'wrong';
}
function failureMode(value,expected,field,fixture,training) {
  if(score(value,expected)==='correct')return null;
  if(value===null||value===undefined||value==='')return 'missing';
  if(training.some(row=>Object.values(row.expected.custom_fields).some(v=>v!==null&&normalize(v)===normalize(value))))return 'training_value_copy';
  if(fixture.forbiddenCurrentIdentifiers.some(v=>normalize(v)===normalize(value)))return 'historical_value_copy';
  if(expected===null)return 'invented_absent_value';
  if(Object.entries(fixture.expected.custom_fields).some(([key,v])=>key!==field&&v!==null&&normalize(v)===normalize(value)))return 'wrong_current_field';
  return 'wrong_value';
}
// Conservative source support, never compares against expected ground truth.
// Presence is not proof of the correct semantic field; raw scoring remains separate.
function supportedFields(content,proposed={}) {
  const text=String(content).normalize('NFC');const supported={};const rejected={};
  for(const [field,type] of Object.entries(fieldTypes)) {
    const value=proposed[field];if(value===null||value===undefined||value==='')continue;
    let present=false;
    if(type==='string'&&typeof value==='string') {
      const literal=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      present=!!value.trim()&&new RegExp(`(?:^|[^\\p{L}\\p{N}_/-])${literal}(?=$|[^\\p{L}\\p{N}_/-])`,'u').test(text);
    }
    if(type==='date')present=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&text.includes(value);
    if(type==='monetary') {
      const match=typeof value==='string'&&/^EUR(\d+\.\d{2})$/.exec(value);
      present=!!match&&[...text.matchAll(/EUR\s*(\d+[.,]\d{2})(?!\d)/g)].some(m=>m[1].replace(',','.')===match[1]);
    }
    if(present)supported[field]=value;else rejected[field]=value;
  }
  return {supported,rejected};
}
function evaluate(actual,fixture,training) {
  const fields={};const errors={};
  for(const field of ['document_type','tags','correspondent','language'])fields[field]=score(actual[field],fixture.expected[field]);
  const raw=actual.custom_fields&&typeof actual.custom_fields==='object'&&!Array.isArray(actual.custom_fields)?actual.custom_fields:{};
  const {supported,rejected}=supportedFields(fixture.content,raw);
  const accepted={};
  for(const field of Object.keys(fieldTypes)) {
    fields[field]=score(raw[field],fixture.expected.custom_fields[field]);
    accepted[field]=score(supported[field],fixture.expected.custom_fields[field]);
    errors[field]=failureMode(raw[field],fixture.expected.custom_fields[field],field,fixture,training);
  }
  return {fields,errors,sourceSupported:accepted,rejected};
}
module.exports={score,failureMode,supportedFields,evaluate};
