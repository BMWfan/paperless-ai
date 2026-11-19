# Isolated upstream4 development and integration tests

SPEC #41 migrates the fork to upstream v4.2.0. See
[the migration ledger](upstream-v4-migration.md) for current verification,
remaining gates and rollback. No production installation or document belongs in
this environment. Do not supply real model credentials to the stack.

## Local application checks

Use Node 22 and the locked dependencies:

```sh
npm ci
npm run typecheck
npm run lint
npm test -- --maxWorkers=1
node --test tests/v4/*.test.mjs
node scripts/audit-historical-evidence.mjs
npm run build
npm run test:e2e
```

Vitest and Playwright use simulated providers. They establish application/API/UI
behavior, not native Paperless compatibility or real-model accuracy. The real
PaddleOCR test remains optional and requires its separate model files.

## Disposable native counterpart

`docker-compose.test.yml` uses its own project **paperless-ai-v4-e2e**,
PostgreSQL 16.6, Redis 7.4.2, the unchanged official Paperless-ngx **3.5.1** image,
and the fork's current Dockerfile. The network is internal; no external LLM is
configured. Runtime limits keep the services within a compact 8-GB memory
budget; this does not establish an 8-GB disk requirement. Docker must have space
for image layers and builds. The managed cloud executor had only 715 MB free,
so the native stack is being qualified on fresh CI runners instead.

```sh
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml up -d --build --wait --wait-timeout 600 ai
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml run --rm --no-deps runner
```

The AI UI is bound only to `127.0.0.1:3300` (`TEST_AI_PORT` may select another
local port). Its synthetic account is `fixture-user` / `isolated-v4-password`.
These are disposable fixture credentials, never production credentials.
Runtime API tokens are generated inside named fixture volumes and never printed.
Do not upload `/fixtures/runtime.json` or the `ai-data` volume as CI artifacts.

The initializer configures only fixed internal service names. The runner rejects
substituted URLs, unmarked state, unexpected model/instance variables and
unqualified version names before making requests. It also refuses existing
non-fixture documents. The standalone safety tests include negative controls
for accidental production-URL or provider-secret injection.

Fresh fixtures also seed the actual old user/feedback/archive schemas and a
legacy .env for one synthetic native document. The built app performs the
import; source hashes, imported login, retained archives and legacy protection
are checked. An old 3.x application is not executed. Do not retrofit this seed
into an existing fixture; use fresh disposable volumes for qualification.

The native runner exercises real text ingestion, app classification through a
deterministic local protocol fixture, typed-field preview/save, preservation of
unselected values, all eight writable field types (including zero/false,
select, long text and leap-day dates), invalid integer/date rejection, explicit
selected-value clearing, stale-snapshot rejection,
unverified API edits, explicit session review, protected correction replay,
external metadata detection and current-document extraction from learned label
patterns. The native runner also creates a deterministic updated-document assignment
workflow restricted to its fresh synthetic tag. An authenticated app save
triggers the actual native title action. The runner waits for execution, asserts
unknown/pending provenance and no active learned workflow value, retains a
foreign custom field, verifies no model call and disables only that workflow in
finally. Both synchronous and asynchronous native responses are accepted;
workflow-written metadata must never become human-confirmed feedback.
This does not qualify native AI provider integration, scheduled/date triggers
or custom-field title templates.

### Restart without reinitializing data

```sh
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml restart ai
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml up -d --wait --wait-timeout 120 --no-deps ai
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml run --rm --no-deps runner node /fixture/native.mjs restart
```

Stop while preserving synthetic data:

```sh
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml stop
```

Reset **only this disposable project** when explicitly wanted:

```sh
docker compose -p paperless-ai-v4-e2e -f docker-compose.test.yml down -v --remove-orphans
```

Never prune Docker globally, change the managed storage driver, or reset the
older `paperless-ai-e2e` stack using this branch.

## CI qualification and version upgrades

`learning-e2e.yml` checks an unchanged 3.5.1 image and a separate 3.4.2 fixture
upgraded to 3.5.1 with its own database/media volumes retained. It restarts the
real app to check persisted pending/confirmed learning. The workflow uses no
external model secrets and cannot publish images. The baseline passed at `baa6628` in [run 44465414428](https://github.com/BMWfan/paperless-ai/actions/runs/44465414428);
subsequent runtime changes require fresh qualification. This does not establish
real-model accuracy or configured native workflow execution.

The ordinary `ci.yml` checks TypeScript, lint, application tests, historical
hashes, build and simulated browser flows. Release-policy tests still enforce
manual-only GHCR publishing and no Discord notification. Main merge, release,
publication and deployment need their existing separate owner approvals.

## Historical 3.x tools

The old `tests/e2e/cloud-test.py`, old browser/model Dockerfiles and archived
quality experiments belong to their recorded 3.x commits. They are not valid
4.x startup/reset/quality commands. Reproduce a historical result using its
recorded source and hashes; never relabel it as a current run. Automatic legacy
model experiments are disabled on 4.x; manual historical workflows check for
the legacy runtime before any model step. Real-model quality is a separate,
explicitly bounded experiment, not part of this native protocol fixture.


## CI action runtime maintenance (SPEC #46)

GitHub Actions execute their own JavaScript runtime independently of the app's
Node version. Validation actions now use Node24-based releases: checkout7,
setup-node7, setup-python6, upload-artifact7, download-artifact8 and Docker
setup/login4/build-push7. The manual policy path uses github-script8. App tests
and builds still explicitly use Node22. GitHub-hosted runners support the new
action runtime; self-hosted runners would need compatible runner versions.

Checkout7 blocks unsafe fork checkouts in privileged pull_request_target and
workflow_run contexts; these workflows use neither trigger. setup-node7's ESM
change does not change our selected app runtime or introduce registry auth.
Artifact uploads keep the default archive format/names; download-artifact8
fails on digest mismatch instead of merely warning. This is intentional.
The manual github-script action still loads local CommonJS policy modules.
No workflow trigger, permission, publication gate or legacy model guard changes.
The unrelated stale-bot action/authentication remains tracked in #39/PR#40.
Manual-only legacy experiments and publication are statically checked, never
dispatched to validate this update. Revert the isolated maintenance commit to
roll back action references. Current PR CI provides execution evidence; offline
policy tests alone do not establish hosted-action compatibility.
