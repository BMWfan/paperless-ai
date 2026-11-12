'use strict';
// Read-only audit of existing synthetic reports; never runs a model or edits scores.
const fs=require('node:fs');const path=require('node:path');
const root=process.argv[2];if(!root)throw new Error('Provide an existing report directory');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?files(path.join(dir,row.name)):[path.join(dir,row.name)]);}
for(const file of files(root).filter(f=>f.endsWith('.json'))){
  const report=JSON.parse(fs.readFileSync(file,'utf8'));if(!report.rows)continue;
  console.log('REPORT_IDENTITY',JSON.stringify({model:report.model,digest:report.modelDigest,seed:report.seed,commit:report.commit,complete:report.complete}));
  for(const arm of ['none','current','selective']){
    for(const field of ['correspondent','amount','contract_number','due_date']){
      const rows=report.rows.filter(r=>r.split==='evaluation'&&r.arm===arm&&r.scores.fields[field]!=='correct').slice(0,4);
      for(const row of rows)console.log('RAW_AUDIT',JSON.stringify({arm,id:row.id,field,expected:field==='correspondent'?row.expected[field]:row.expected.custom_fields[field],actual:field==='correspondent'?row.actual[field]:row.actual.custom_fields?.[field],error:row.scores.errors[field]||row.scores.fields[field],rejected:row.scores.rejected?.[field]}));
    }
  }
}
