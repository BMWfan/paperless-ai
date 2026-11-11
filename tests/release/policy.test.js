'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {validate,preflight} = require('../../.github/scripts/release-policy');
const {requireAbsent} = require('../../.github/scripts/registry-tags');
function fixture() {
  const input={enabled:'true',event:'workflow_dispatch',ref:'refs/heads/main',owner:'BMWfan',sha:'a'.repeat(40),tag:'v1.2.3',latest:false};
  return {input,evidence:{tagSha:input.sha,onMain:true,
    environment:{name:'ghcr-release',protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{login:'BMWfan'}}]}],deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}},
    policies:[{name:'main',type:'branch'}],runs:[{head_sha:input.sha,event:'push',head_branch:'main',path:'.github/workflows/learning-e2e.yml',status:'completed',conclusion:'success'}]}};
}
test('exact tested version may be proposed without defaulting to latest',()=>{
  const {input,evidence}=fixture();assert.deepEqual(validate(input,evidence),{sha:input.sha,tag:input.tag,latest:false});
  input.latest=true;assert.equal(validate(input,evidence).latest,true);
});
for(const event of ['pull_request','push','schedule','release']) test(`${event} cannot publish`,()=>{
  const {input,evidence}=fixture();input.event=event;assert.throws(()=>validate(input,evidence),/Dispatch/);
});
for(const [name,mutate] of [
  ['missing setup',({input})=>{input.enabled=undefined;}],
  ['non-main dispatch',({input})=>{input.ref='refs/heads/feature';}],
  ['short SHA',({input})=>{input.sha='abc123';}],
  ['injection in tag',({input})=>{input.tag='v1.2.3;echo nope';}],
  ['implicit latest',({input})=>{delete input.latest;}],
  ['tag moved',({evidence})=>{evidence.tagSha='b'.repeat(40);}],
  ['unmerged commit',({evidence})=>{evidence.onMain=false;}],
  ['missing environment',({evidence})=>{delete evidence.environment;}],
  ['unprotected environment',({evidence})=>{evidence.environment.protection_rules=[];}],
  ['additional approver',({evidence})=>{evidence.environment.protection_rules[0].reviewers.push({type:'User',reviewer:{login:'other'}});}],
  ['wildcard branch',({evidence})=>{evidence.policies[0].name='*';}],
  ['tag deployment policy',({evidence})=>{evidence.policies[0].type='tag';}],
  ['missing policies',({evidence})=>{delete evidence.policies;}],
  ['older tested commit',({evidence})=>{evidence.runs[0].head_sha='b'.repeat(40);}],
  ['PR-only green test',({evidence})=>{evidence.runs[0].event='pull_request';}],
  ['failed CI',({evidence})=>{evidence.runs[0].conclusion='failure';}],
  ['wrong workflow',({evidence})=>{evidence.runs[0].path='.github/workflows/other.yml';}]
]) test(`${name} fails closed`,()=>{const f=fixture();mutate(f);assert.throws(()=>validate(f.input,f.evidence));});
test('disabled dispatch performs no API requests',async()=>{
  const saved=process.env.PUBLISH_ENABLED;delete process.env.PUBLISH_ENABLED;
  try{await assert.rejects(preflight({github:{},context:{eventName:'workflow_dispatch',ref:'refs/heads/main',repo:{owner:'BMWfan'},payload:{inputs:{}}},core:{}}),/disabled/);}
  finally{if(saved===undefined)delete process.env.PUBLISH_ENABLED;else process.env.PUBLISH_ENABLED=saved;}
});
test('version and commit tags must both be absent; no network fixture publishes',async()=>{
  const calls=[];await requireAbsent('bmwfan/paperless-ai',['v1.2.3','sha-abc'],'fixture:only',async(url,options)=>{
    calls.push({url,method:options.method||'GET'});return url.includes('/token?')?{ok:true,json:async()=>({token:'fixture'})}:{status:404};
  });assert.equal(calls.length,3);assert.ok(calls.every(x=>['GET','HEAD'].includes(x.method)));
});
for(const status of [200,401,403,429,500])test(`registry ${status} refuses publishing`,async()=>{
  await assert.rejects(requireAbsent('bmwfan/paperless-ai',['v1.2.3'],'fixture:only',async url=>url.includes('/token?')?{ok:true,json:async()=>({token:'fixture'})}:{status}));
});
test('registry timeout/auth failure/missing token fail closed',async()=>{
  for(const request of [async()=>{throw new Error('timeout');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({})})]) {
    await assert.rejects(requireAbsent('bmwfan/paperless-ai',['v1.2.3'],'fixture:only',request));
  }
});
test('preflight resolves annotated tags and exports only the verified SHA/tag',async()=>{
  const {input,evidence}=fixture();const outputs={};
  const methods={getRef:()=>{},getTag:()=>{},compareCommitsWithBasehead:()=>{},getEnvironment:()=>{},listDeploymentBranchPolicies:()=>{},listWorkflowRuns:()=>{}};
  const github={rest:{git:{getRef:async()=>({data:{object:{type:'tag',sha:'annotation'}}}),getTag:async()=>({data:{object:{type:'commit',sha:input.sha}}})},repos:{
    compareCommitsWithBasehead:async()=>({data:{status:'ahead'}}),getEnvironment:async()=>({data:evidence.environment}),listDeploymentBranchPolicies:methods.listDeploymentBranchPolicies},actions:{listWorkflowRuns:methods.listWorkflowRuns}},
    paginate:async method=>method===methods.listDeploymentBranchPolicies?evidence.policies:evidence.runs};
  const saved=process.env.PUBLISH_ENABLED;process.env.PUBLISH_ENABLED='true';
  try{await preflight({github,context:{eventName:input.event,ref:input.ref,repo:{owner:input.owner,repo:'paperless-ai'},payload:{inputs:{sha:input.sha,tag:input.tag,latest:'false'}}},core:{setOutput:(k,v)=>{outputs[k]=v;}}});
    assert.deepEqual(outputs,{sha:input.sha,tag:input.tag});}
  finally{if(saved===undefined)delete process.env.PUBLISH_ENABLED;else process.env.PUBLISH_ENABLED=saved;}
});
test('unreadable environment aborts without outputs or automatic creation',async()=>{
  const {input}=fixture();let exported=false;
  const github={rest:{git:{getRef:async()=>({data:{object:{type:'commit',sha:input.sha}}})},repos:{compareCommitsWithBasehead:async()=>({data:{status:'identical'}}),getEnvironment:async()=>{throw new Error('403');}}}};
  const saved=process.env.PUBLISH_ENABLED;process.env.PUBLISH_ENABLED='true';
  try{await assert.rejects(preflight({github,context:{eventName:input.event,ref:input.ref,repo:{owner:input.owner},payload:{inputs:{sha:input.sha,tag:input.tag,latest:'false'}}},core:{setOutput:()=>{exported=true;}}}),/403/);assert.equal(exported,false);}
  finally{if(saved===undefined)delete process.env.PUBLISH_ENABLED;else process.env.PUBLISH_ENABLED=saved;}
});
