'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {fieldEvidence,revision}=require('./field-evidence');
const {corpus,fieldTypes}=require('./corpus');
const {score}=require('./scoring');
const {normalizeValue}=require('../../services/customFieldUpdates');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function counter(){return {present:0,inputCorrect:0,correctRetained:0,correctLost:0,missingAfter:0,wrongAccepted:0,wrongRejected:0,absent:0,absentAfter:0};}
function count(stats,proposed,expected,accepted){
  for(const [field,data_type]of Object.entries(fieldTypes)){
    const current=stats[field]||(stats[field]=counter());
    const value=proposed[field],normalized=normalizeValue(value,{data_type});
    const hasValue=value!==null&&value!==undefined&&value!=='';
    const kept=Object.hasOwn(accepted,field);
    const correct=score(normalized,expected[field])==='correct';
    if(expected[field]!==null){
      current.present++;
      if(correct){current.inputCorrect++;if(kept)current.correctRetained++;else current.correctLost++;}
      if(!kept)current.missingAfter++;
    }else {current.absent++;if(!kept)current.absentAfter++;}
    if(kept&&score(accepted[field],expected[field])!=='correct')current.wrongAccepted++;
    if(hasValue&&(!correct||expected[field]===null)&&!kept)current.wrongRejected++;
  }
}
function measure(){
  const challengeBytes=fs.readFileSync(path.join(__dirname,'evidence-cases.json'));
  const manifest=require('./evidence-manifest.json');assert.equal(hash(challengeBytes),manifest.sha256);
  const challenges=JSON.parse(challengeBytes).cases;assert.equal(challenges.length,manifest.cases);
  const sourceDigests=Object.fromEntries(['field-evidence.js','evidence-report.js','corpus.js','scoring.js','../../services/customFieldUpdates.js','baseline/manifest.json'].map(file=>[file,hash(fs.readFileSync(path.join(__dirname,file)))]));
  const result={revision,commit:process.env.GITHUB_SHA||null,sourceDigests,challengeDigest:manifest.sha256,sourceRun:43118154733,groups:{},challenge:{fields:{},cases:[]},rows:0};
  for(const row of challenges){
    const diagnosis=fieldEvidence(row.content,row.proposed);
    const expected=Object.fromEntries(Object.keys(fieldTypes).map(field=>[field,row.expected[field]??null]));
    count(result.challenge.fields,row.proposed,expected,diagnosis.accepted);
    result.challenge.cases.push({id:row.id,knownLimitation:row.knownLimitation,...diagnosis});
  }
  const snapshots=path.join(__dirname,'baseline'),snapshotManifest=require('./baseline/manifest.json');
  const fixtures=new Map(['evaluation','confirmation'].flatMap(corpus).map(row=>[row.id,row]));
  const corpusDigest=hash(JSON.stringify(['training','evaluation','confirmation'].map(corpus)));
  for(const [name,entry]of Object.entries(snapshotManifest.files)){
    const bytes=fs.readFileSync(path.join(snapshots,name));assert.equal(hash(bytes),entry.sha256);
    const report=JSON.parse(bytes);assert.equal(report.complete,true);assert.equal(report.sourceRun,result.sourceRun);assert.equal(report.corpusDigest,corpusDigest);assert.equal(report.rows.length,entry.rows);
    for(const row of report.rows){
      const fixture=fixtures.get(row.id);assert.ok(fixture);
      const proposed=row.actual.custom_fields||{};
      const diagnosis=fieldEvidence(fixture.content,proposed);
      const key=`${report.model}/${report.seed}/${row.split}/${row.arm}`;
      const group=result.groups[key]||(result.groups[key]={documents:0,fields:{},rejections:{}});group.documents++;
      count(group.fields,proposed,fixture.expected.custom_fields,diagnosis.accepted);
      for(const {reason}of Object.values(diagnosis.rejected))group.rejections[reason]=(group.rejections[reason]||0)+1;
      result.rows++;
    }
  }
  assert.equal(result.rows,420);return result;
}
if(require.main===module){
  const output=JSON.stringify(measure(),null,2)+'\n';
  if(process.argv[2])fs.writeFileSync(process.argv[2],output);else process.stdout.write(output);
}
module.exports={measure};
