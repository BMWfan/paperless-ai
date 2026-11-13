'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {sectionEvidence,revision}=require('./candidate');
const {fieldEvidence}=require('../field-evidence');
const {normalizeValue}=require('../../../services/customFieldUpdates');
const {corpus,fieldTypes}=require('../corpus');
const {score}=require('../scoring');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function stats(){return {present:0,inputCorrect:0,correctRetained:0,correctLost:0,missingAfter:0,wrongAccepted:0,wrongRejected:0,absent:0,absentAfter:0,absentFalsePositive:0,abstentions:0};}
function count(target,proposed,expected,accepted,fields){
  for(const field of fields){
    const s=target[field]||(target[field]=stats());
    const input=proposed[field],value=normalizeValue(input,{data_type:fieldTypes[field]});
    const has=input!==null&&input!==undefined&&input!=='';
    const kept=Object.hasOwn(accepted,field),correct=has&&expected[field]!=null&&score(value,expected[field])==='correct';
    if(expected[field]!=null){s.present++;if(correct){s.inputCorrect++;if(kept)s.correctRetained++;else s.correctLost++;}if(!kept)s.missingAfter++;}
    else {s.absent++;if(!kept)s.absentAfter++;else s.absentFalsePositive++;}
    if(kept&&score(accepted[field],expected[field]??null)!=='correct')s.wrongAccepted++;
    if(has&&!correct&&!kept)s.wrongRejected++;
    if(!kept)s.abstentions++;
  }
}
function verified(file,sha){const bytes=fs.readFileSync(file);assert.equal(hash(bytes),sha,`Frozen input changed: ${path.basename(file)}`);return JSON.parse(bytes);}
function loadCases(){
  const manifest=require('./manifest.json'),data=verified(path.join(__dirname,'cases.json'),manifest.sha256);
  assert.equal(data.cases.length,manifest.cases);return {manifest,cases:data.cases};
}
function measure(){
  const {manifest,cases}=loadCases();
  const root=path.join(__dirname,'..');
  const sourceFiles=['candidate.js','report.js','contract.md','manifest.json','../evidence-manifest.json','../field-evidence.js','../corpus.js','../scoring.js','../../../services/customFieldUpdates.js','../baseline/manifest.json'];
  const result={revision,commit:process.env.GITHUB_SHA||null,freezeCommit:'b15c8c5',sourceRun:43118154733,
    sourceDigests:Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(__dirname,file)))])),
    dataDigest:manifest.sha256,newCases:cases.length,archivedRows:0,oldChallenges:0,groups:{},cases:[]};
  function evaluate(group,content,proposed,expected,fields,details){
    const bucket=result.groups[group]||(result.groups[group]={baseline:{},candidate:{},rejections:{}});
    const before=fieldEvidence(content,proposed),after=sectionEvidence(content,proposed);
    count(bucket.baseline,proposed,expected,before.accepted,fields);count(bucket.candidate,proposed,expected,after.accepted,fields);
    for(const {reason}of Object.values(after.rejected))bucket.rejections[reason]=(bucket.rejections[reason]||0)+1;
    if(details)result.cases.push({...details,baseline:before,candidate:after});
  }
  for(const row of cases){
    const proposed={[row.field]:row.proposed},expected={[row.field]:row.expected};
    for(const suffix of ['',`/${row.language}`,`/${row.language}/${row.field}`])evaluate(`new/${row.split}${suffix}`,row.content,proposed,expected,[row.field],suffix?null:{id:row.id,split:row.split,kind:row.kind});
  }
  const oldManifest=require('../evidence-manifest.json');
  for(const row of verified(path.join(root,'evidence-cases.json'),oldManifest.sha256).cases){
    evaluate('old-challenges',row.content,row.proposed,row.expected,Object.keys(fieldTypes),{id:row.id,split:'old-challenges'});
    evaluate(`old-challenges/${row.language}`,row.content,row.proposed,row.expected,Object.keys(fieldTypes));result.oldChallenges++;
  }
  const archiveManifest=require('../baseline/manifest.json');
  const fixtures=new Map(['evaluation','confirmation'].flatMap(corpus).map(row=>[row.id,row]));
  const corpusDigest=hash(JSON.stringify(['training','evaluation','confirmation'].map(corpus)));
  for(const [name,entry]of Object.entries(archiveManifest.files)){
    const archive=verified(path.join(root,'baseline',name),entry.sha256);
    assert.equal(archive.complete,true);assert.equal(archive.sourceRun,result.sourceRun);assert.equal(archive.corpusDigest,corpusDigest);assert.equal(archive.rows.length,entry.rows);
    for(const row of archive.rows){
      const fixture=fixtures.get(row.id);assert.ok(fixture);
      const group=`archive/${archive.model}/${archive.seed}/${row.split}/${row.arm}`;
      for(const suffix of ['',`/${fixture.language}`])evaluate(group+suffix,fixture.content,row.actual.custom_fields||{},fixture.expected.custom_fields,Object.keys(fieldTypes));result.archivedRows++;
    }
  }
  assert.equal(result.archivedRows,420);assert.equal(result.oldChallenges,28);
  const sum=Object.values(result.groups['new/confirmation'].candidate).reduce((total,s)=>({wrongAccepted:total.wrongAccepted+s.wrongAccepted,correctRetained:total.correctRetained+s.correctRetained}),{wrongAccepted:0,correctRetained:0});
  result.confirmation={...sum,threshold:manifest.threshold,qualifiedForLaterProposal:sum.wrongAccepted<=manifest.threshold.wrongAccepted&&sum.correctRetained>=manifest.threshold.correctRetainedAtLeast,productionActivation:false};
  return result;
}
if(require.main===module){const output=JSON.stringify(measure(),null,2)+'\n';if(process.argv[2])fs.writeFileSync(process.argv[2],output);else process.stdout.write(output);}
module.exports={measure,loadCases};
