'use strict';
const ENVIRONMENT = 'ghcr-release';
const WORKFLOW = '.github/workflows/learning-e2e.yml';
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function validate(input, evidence) {
  requireCondition(input.enabled === 'true', 'Publishing is disabled until separately configured.');
  requireCondition(input.event === 'workflow_dispatch' && input.ref === 'refs/heads/main', 'Dispatch only from main.');
  requireCondition(/^[0-9a-f]{40}$/.test(input.sha || ''), 'A full lowercase commit SHA is required.');
  requireCondition(/^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/.test(input.tag || ''), 'An existing version tag is required.');
  requireCondition(typeof input.latest === 'boolean', 'latest must be an explicit boolean.');
  requireCondition(evidence.tagSha === input.sha && evidence.onMain === true, 'Tag must resolve to the selected commit on main.');
  const env = evidence.environment;
  requireCondition(env?.name === ENVIRONMENT, 'The release environment must already exist.');
  const reviewers = env.protection_rules?.find(rule => rule.type === 'required_reviewers')?.reviewers || [];
  requireCondition(reviewers.length === 1 && reviewers[0].type === 'User' &&
    reviewers[0].reviewer?.login?.toLowerCase() === input.owner.toLowerCase(), 'Only the repository owner may approve publication.');
  requireCondition(env.deployment_branch_policy?.custom_branch_policies === true &&
    env.deployment_branch_policy?.protected_branches === false &&
    evidence.policies?.length === 1 && evidence.policies[0].name === 'main' && evidence.policies[0].type === 'branch',
  'Release environment must allow only the main branch.');
  requireCondition(evidence.runs?.some(run => run.head_sha === input.sha && run.event === 'push' &&
    run.head_branch === 'main' && run.path === WORKFLOW && run.status === 'completed' && run.conclusion === 'success'),
  'The exact commit needs a successful Learning engine validation push run on main.');
  return { sha: input.sha, tag: input.tag, latest: input.latest };
}
async function preflight({github, context, core}) {
  const input = {enabled:process.env.PUBLISH_ENABLED, event:context.eventName, ref:context.ref,
    owner:context.repo.owner, ...context.payload.inputs};
  input.latest = input.latest === 'true' ? true : input.latest === 'false' ? false : undefined;
  // Reject malformed/disabled requests before any protected API lookup.
  requireCondition(input.enabled === 'true', 'Publishing is disabled until separately configured.');
  requireCondition(input.event === 'workflow_dispatch' && input.ref === 'refs/heads/main', 'Dispatch only from main.');
  requireCondition(/^[0-9a-f]{40}$/.test(input.sha || '') && /^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/.test(input.tag || ''), 'Invalid commit or version tag.');
  const repo = context.repo;
  let object = (await github.rest.git.getRef({...repo, ref:`tags/${input.tag}`})).data.object;
  for (let depth=0; object.type === 'tag' && depth<8; depth++) object = (await github.rest.git.getTag({...repo,tag_sha:object.sha})).data.object;
  requireCondition(object.type === 'commit', 'Tag must resolve to a commit.');
  const comparison = (await github.rest.repos.compareCommitsWithBasehead({...repo,basehead:`${input.sha}...main`})).data;
  const environment = (await github.rest.repos.getEnvironment({...repo, environment_name:ENVIRONMENT})).data;
  const policies = await github.paginate(github.rest.repos.listDeploymentBranchPolicies, {...repo,environment_name:ENVIRONMENT,per_page:100});
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {...repo,workflow_id:'learning-e2e.yml',head_sha:input.sha,event:'push',per_page:100});
  const selected = validate(input, {tagSha:object.sha,onMain:['ahead','identical'].includes(comparison.status),environment,policies,runs});
  core.setOutput('sha',selected.sha); core.setOutput('tag',selected.tag);
}
module.exports = { validate, preflight };
