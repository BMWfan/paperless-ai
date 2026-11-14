'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {derivePatterns,matchPatterns}=require('../../../services/learnedFieldHints');
function diagnostic(){
  const raw=fs.readFileSync(path.join(__dirname,'cases.json'));
  const manifest=require('./manifest.json');
  if(createHash('sha256').update(raw).digest('hex')!==manifest.casesSha256)throw Error('Frozen cases changed');
  const groups={},rows=[];
  for(const item of JSON.parse(raw)){
    const source={document_id:1,event_id:1,content_preview:item.training,metadata:{correspondent:5,document_type:7,custom_fields:[{field:1,value:'TRAIN-001'}]},
      changes:{custom_fields:{before:[],after:[{field:1,value:'TRAIN-001'}]}}};
    const patterns=derivePatterns([source],{id:99,...item.scope});
    const {candidates}=matchPatterns(patterns,item.current);
    const actual=candidates[0]?.value??null,correct=actual!==null&&actual===item.expected,wrong=actual!==null&&!correct;
    const result={id:item.id,expected:item.expected,actual,correct,wrong};rows.push(result);
    for(const key of [item.split,`${item.split}/${item.language}`]){
      const group=groups[key]||(groups[key]={positive:0,correctPositive:0,negative:0,negativeWithSuggestion:0,wrongSuggestions:0,abstentions:0,historicalRoleErrors:0});
      group.positive+=item.expected!==null;group.negative+=item.expected===null;group.correctPositive+=correct;
      group.negativeWithSuggestion+=wrong&&item.expected===null;group.wrongSuggestions+=wrong;group.abstentions+=actual===null;
      group.historicalRoleErrors+=wrong&&item.cohort==='historical';
    }
  }
  return {revision:manifest.revision,cases:rows.length,groups,rows,automaticQualification:false,
    limitation:'Literal labels do not establish current-document ownership. Manual review only; no model inference.'};
}
if(require.main===module)process.stdout.write(JSON.stringify(diagnostic(),null,2)+'\n');
module.exports={diagnostic};
