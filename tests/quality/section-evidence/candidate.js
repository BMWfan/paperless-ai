'use strict';
// Diagnostic only: explicit headings are a text convention, not ownership proof.
const {fieldEvidence}=require('../field-evidence');
function sectionEvidence(content,proposed={}){
  const lines=(typeof content==='string'?content.normalize('NFC'):'').split(/\r?\n/);
  const sections=[];let active=null;
  for(let index=0;index<lines.length;index++){
    const heading=/^\s*\[([^\]\r\n]+)\]\s*$/.exec(lines[index]);
    if(heading){
      active=null;
      if(/^(?:Current document|Aktuelles Dokument)$/i.test(heading[1])){
        active={start:index+2,lines:[]};sections.push(active);
      }
    }else if(active)active.lines.push(lines[index]);
  }
  if(sections.length!==1){
    const rejected=Object.create(null);
    if(proposed&&typeof proposed==='object'&&!Array.isArray(proposed)){
      for(const [field,value]of Object.entries(proposed))if(value!==null&&value!==undefined&&value!==''){
        rejected[field]={value,reason:sections.length?'ambiguous_current_section':'missing_current_section'};
      }
    }
    return {accepted:{},rejected,evidence:{}};
  }
  const section=sections[0],result=fieldEvidence(section.lines.join('\n'),proposed);
  for(const item of Object.values(result.evidence))item.line+=section.start-1;
  return result;
}
module.exports={sectionEvidence,revision:'section-evidence-v1'};
