'use strict';
// Diagnostic only. Fixed vocabulary; never imported by production providers/writers.
const {normalizeValue}=require('../../services/customFieldUpdates');
const definitions={
  invoice_number:{type:'string',labels:['Invoice number','Rechnungsnummer']},
  contract_number:{type:'string',labels:['Contract number','Vertragsnummer']},
  policy_number:{type:'string',labels:['Policy number','Versicherungsnummer']},
  amount:{type:'monetary',labels:['Amount','Betrag']},
  due_date:{type:'date',labels:['Due date','Fällig am']},
  end_date:{type:'date',labels:['End date','Enddatum']}
};
const history=/\b(?:historical|previous|earlier|old contract|historisch\p{L}*|Altvertrag\p{L}*|vorherig\p{L}*|früher\p{L}*)\b/iu;
function typed(value,definition){
  const normalized=normalizeValue(value,{data_type:definition.type});
  return definition.type==='monetary'&&!(typeof normalized==='string'&&/^EUR\d+\.\d{2}$/.test(normalized))?undefined:normalized;
}
function fieldEvidence(content,proposed={}) {
  const accepted={},rejected=Object.create(null),evidence={};
  const text=typeof content==='string'?content.normalize('NFC'):'';
  const lines=text.split(/\r?\n/);
  const unsafe=history.test(text)||lines.some(line=>/^\s*(?:>|```|~~~)/.test(line));
  if(!proposed||typeof proposed!=='object'||Array.isArray(proposed))return {accepted,rejected,evidence};
  for(const [field,value]of Object.entries(proposed)){
    if(value===null||value===undefined||value==='')continue;
    const definition=Object.hasOwn(definitions,field)?definitions[field]:null;
    let reason;
    if(!definition)reason='unknown_field';
    else if(!text)reason='missing_content';
    else if(unsafe)reason='historical_or_quoted_document';
    else {
      const normalized=typed(value,definition);
      const matches=lines.flatMap((line,index)=>{
        const parts=/^\s*([^:]+?)\s*:\s*(.*?)\s*$/.exec(line);
        return parts&&definition.labels.some(label=>label.toLowerCase()===parts[1].toLowerCase())?
          [{line:index+1,label:parts[1],text:line,value:typed(parts[2],definition)}]:[];
      });
      if(normalized===undefined)reason='invalid_value';
      else if(!matches.length)reason='missing_field_label';
      else if(matches.length!==1)reason='ambiguous_field_label';
      else if(matches[0].value!==normalized)reason='field_value_mismatch';
      else {accepted[field]=normalized;evidence[field]=matches[0];}
    }
    if(reason)rejected[field]={value,reason};
  }
  return {accepted,rejected,evidence};
}
module.exports={fieldEvidence,revision:'field-evidence-v1'};
