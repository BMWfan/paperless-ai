# Build, merge and publication policy

SPEC [#9](https://github.com/BMWfan/paperless-ai/issues/9), EPIC #6.
This policy implements the approved GHCR-only and Discord-disabled decisions.
Code changes do not configure GitHub protection, approve merges or authorize a
release, registry push or deployment. Existing Git tags and images are retained.

## Event matrix

| Event | Allowed effect |
| --- | --- |
| Pull request | Learning/integration tests, offline policy tests and a container build when its build inputs change. No registry login or push. |
| Push to main | Learning/integration tests for the actual commit, offline policy checks and relevant build checks. No publishing. |
| Schedule | No image publishing. The unrelated existing stale workflow is unchanged. |
| Published GitHub release | No image push or Discord webhook. |
| Manual publication | Existing version tag + full tested main commit; explicitly selected latest flag; preflight then owner-approved protected environment. GHCR only. |

`docker-build-push.yml` now builds linux/amd64 without pushing. It does not
qualify ARM64 execution. The manual publishing build still targets amd64/arm64;
no multiarchitecture publication was executed to validate this policy.
The application and Learning Engine behavior are unchanged.

## Fail-closed publication path

`manualPush.yml` only accepts dispatches from main. `tag` is an existing version
tag such as `v1.2.3` (optional prerelease suffix), not an arbitrary Docker tag;
`sha` must be a full lowercase commit SHA. Annotated tags are resolved to commits.
The tag must resolve to exactly that SHA, reachable from main. Tags are never
created or moved. A successful **push-on-main** run of `learning-e2e.yml` must
exist for that exact SHA; a green PR merge-ref run or an older commit is insufficient.
Historical commits without that push evidence cannot be published by this path.

Publishing defaults to disabled. Even after separate setup approval, a missing
or unreadable prerequisite aborts. Preflight verifies the pre-existing
`ghcr-release` environment, exactly one required reviewer (the repository owner),
and exactly one custom deployment policy allowing the main branch (not tags).
Only then can the environment job wait for owner approval. The checks run again
after approval, before registry login. Policy code comes from the workflow's main
commit; the image build checks out the approved SHA with credentials persistence
disabled. Version and SHA image tags must be absent in GHCR. Authentication,
network and ambiguous registry errors abort; they are not interpreted as absence.
`latest` is the sole intentionally mutable image tag and defaults to false.
The publish concurrency group serializes this workflow; external registry writers
can still race the absence check. Repository/package administrators remain part
of the trust boundary and must control external writers.

## Proposed GitHub setup — separate owner approval required

No step below has been applied by this change.

1. Require a pull request to main and successful `integration`, `policy` and
   relevant container `build` checks, with rules matched to actual workflow
   contexts. Because the build uses path filters, do not make it an unconditional
   required check unless the filter is removed or a non-skipping wrapper added.
   No force push/deletion; enforce protections for administrators as supported.
   Do not require an impossible self-review from the single repository owner.
   Record approval of the exact PR head separately before each merge.
2. Create `ghcr-release` explicitly. Set the repository owner as sole required
   reviewer. For a single owner who dispatches and approves, do not prohibit
   self-review; this is an explicit approval gate, not a four-eyes guarantee.
   Disable administrator bypass where supported. Configure custom deployment
   branch policies with only `main` of type `branch`, no tag policies.
3. Verify that the workflow token can read the environment and deployment branch
   policies. GitHub plans/token permissions can limit these APIs. If it cannot,
   publication stays blocked. Do not add a broad PAT or weaken checks to bypass
   that limitation; resolve a least-privilege setup in a separately approved step.
4. Only after reviewing the setup, set repository variable
   `GHCR_PUBLISH_ENABLED=true`. No Docker Hub or GHCR PAT secret is required by
   these workflows; publishing uses the job-scoped GITHUB_TOKEN. Existing secrets
   are not read, removed or rotated by this change.
5. Publication still requires its own approval for a concrete tag/SHA and latest
   choice. Inspect the successful main CI and approve only the matching queued
   environment deployment. No tag, release or image was created during this work.

A named environment alone is insufficient: GitHub can otherwise create it
without protection. The read-only preflight intentionally precedes the job that
references that environment. There remains an administrator configuration race;
GitHub settings and access governance are not controlled by this code.

## Verification and rollback

```sh
node --test tests/release/*.test.js
python3 -m unittest discover -s tests/release -p 'test_*.py'
```

Node 22 and Python with PyYAML 6.0.3 are used by the policy workflow. Negative
fixtures cover other events, disabled/missing setup, wrong tag/SHA/ref, absent or
unprotected environment, other reviewers/branches, missing/incorrect CI evidence,
existing image tags and registry failures. The Python suite parses actual YAML
and verifies trigger, privilege, approval-order and removed-webhook contracts.
These are offline tests; they do not prove live environment permissions, a
registry publication, multiarchitecture runtime correctness or an administrator
protection setting. Real learning/ngx regression CI remains separate.

To disable publishing, remove/set false `GHCR_PUBLISH_ENABLED` and cancel pending
publication jobs (variable changes alone do not cancel a running push). A rollback
PR can remove the manual workflow while retaining read-only checks. Do not restore
automatic Nightly/release pushes or Discord as an incidental rollback. Existing
images/tags remain untouched. Stale automation is a separately pending decision.
