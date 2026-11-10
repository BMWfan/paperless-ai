# Learning Engine v2 validation

## Compact Paperless-ngx 3.4.2 qualification

Tested source: `7f9db35ac98ded5e18dc79626f21b7067b54afb9`, on the existing
`test/paperless-ngx-3.4.2` branch and Draft PR #11. No runtime code was changed
for this follow-up. Commands used the existing compact helper and only the
`paperless-ai-e2e` project:

```sh
python3 tests/e2e/cloud-test.py prepare
# Expected abort with the old 3.4.1 program volume and no versioned 3.4.2 image.
python3 tests/e2e/cloud-test.py stop
docker --host=unix:///var/run/docker.sock volume rm paperless-ai-e2e_paperless-runtime
docker --host=unix:///var/run/docker.sock image rm paperless-ai-e2e-cloud-paperless:local
TEST_CA_BUNDLE=.e2e-cache/ca-certificates.crt python3 tests/e2e/cloud-test.py test
```

Before replacing the program volume, its only referencing container was verified
to belong to this test project. Database, document and app volumes were retained;
no global prune or storage-driver change occurred. Remote source was resolved to
`ghcr.io/paperless-ngx/paperless-ngx:3.4.2@sha256:1856adaeccf1a3bfc58722767321888ee6ecbeeb7807ae5b0836d0f0a4ce3f25`.
The running Python package reported version `3.4.2`.

The complete helper run passed, and passed again after the Cloud runtime was
restored and the test services restarted:

- 30 Node unit/API/SQLite regressions; 0 failed.
- 3 Python setup-safety tests; ESLint passed.
- 2 real Paperless integration scenarios; 0 failed.
- Offline-edit restart detection passed.
- Approximately 2.48 GiB free on the 7.9 GiB filesystem with the `vfs` driver.

A witness recorded before the 3.4.1 program volume was replaced remained
unchanged after the upgrade and runtime restoration: synthetic document ID 10,
title `Synthetic cloud upgrade witness 1794257708845`, confirmed event ID 30,
active example. These are synthetic fixture values, not production data. The
pre-upgrade temporary log was not retained by the runtime restoration; the
earlier execution record and the fresh post-upgrade API check are separate
evidence. Ignored local logs are under `.e2e-cache/review-2026-11-10/`; they are
not committed or advertised as GitHub CI artifacts.

The existing [standard CI at this source](https://github.com/BMWfan/paperless-ai/actions/runs/42479811963)
already covers Chromium, a fresh 3.4.2 stack and the standard 3.4.1 → 3.4.2
upgrade. Those checks were not rerun locally as part of this compact follow-up.
Real models, native-AI coexistence and production compatibility are separate
claims; native AI stayed disabled in this baseline. No merge, publication,
deployment or reusable environment-template change was performed.

## Browser and real-model follow-up, 2026-11-02

The remaining local validations use only `docker-compose.test.yml`, including
the optional `extended` profile. Runtime services remain on the internal network,
with no published ports, production credentials or real documents.

- 29 Node tests pass, including a new regression proving Ollama counts system
  instructions, reviewed references and playground document content when reserving
  its context window. The previous calculation omitted these parts.
- Both real Paperless integration scenarios, all 3 Python setup safety contracts,
  ESLint and offline-edit restart detection pass.
- Chromium exercises anonymous redirection, authenticated review, rejection,
  revocation, history, settings and theme persistence. Light/dark desktop/mobile
  screenshots were visually inspected. Mobile navigation now spans the viewport;
  metadata comparisons use readable before/after pairs on narrow screens.
- CI now runs Node, Python, lint and browser checks inside the Compose services.
  It uploads browser screenshots. Real inference remains an optional local check.

Ollama 0.12.6 ran `qwen2.5:0.5b` on CPU. Its model digest was
`a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67`.
Ten separately ingested English/German evaluation documents were each classified
with learning disabled, then with five independently ingested and explicitly
reviewed references. Actual inference token counts, schema-constrained JSON and
reference context sent in requests were verified for all 20 calls. Training
references were revoked and previous settings restored after the run.

| Measurement | Disabled baseline | With reviewed references |
| --- | --- | --- |
| Nonempty title and document type | 9/10 | 10/10 |
| Exact document-type match | 4/10 | 5/10 |
| Exact language match | 3/10 | 1/10 |

The integration completed, but this tiny model produced incorrect metadata and
copied placeholder values. The sample does **not** demonstrate a dependable
quality improvement. Completeness is a separate measurement from correctness;
all predictions and timings are exported in `real-model-evaluation.json`.
The first exploratory runs stopped on empty-title quality failures; the final
evaluation reports quality separately from transport/schema assertions rather
than treating a successful response as accurate classification.

Actual hosted OpenAI/Azure model quality and the optional full Python RAG runtime
remain outside this local evaluation. Their existing protocol/contract checks
remain in place. No merge or production deployment is performed.

## Local Docker Desktop validation, 2026-11-01

Validated source commit `11ac874` on `feature/learning-engine-v2` using Docker
Desktop 4.97.0, Engine 29.9.2 and Compose 5.6.1 through Ubuntu WSL 2. Only
`docker-compose.test.yml` and its local `paperless-ai-e2e` project were used;
no production configuration, credentials or documents were imported.

- 28 Node unit/API/SQLite regression tests passed in the Node 22 runner image.
- Both real Paperless integration scenarios passed (2 passed, 0 failed).
- All 3 Python setup safety tests passed in the isolated Paperless container;
  the test helpers were copied to its temporary directory for this check.
- ESLint passed inside the app container.
- The restart helper stopped the app, edited a synthetic document and confirmed
  pending/unknown detection after restart. The helper ran in WSL and used only
  the local Docker socket to orchestrate the test containers.

The initial build hit Bake's external CA-file entitlement check despite
`COMPOSE_BAKE=false`. Copying the trusted CA bundle to the ignored `.e2e-cache`
directory and setting `TEST_CA_BUNDLE` resolved it without a new filesystem grant
or disabling certificate verification. See `test-environment.md` for the commands.
The stack was stopped after validation, preserving its synthetic data volumes.
Existing limitations concerning real model quality, optional Python RAG execution,
browser screenshot validation and the final external-write race still apply.


## Full requirement acceptance, 2026-11-01

The complete request was audited against the actual source, not inferred from the
original 16 green tests. Findings and completion evidence are mapped in
[learning-v2-acceptance.md](learning-v2-acceptance.md).

Executed directly in the managed 8 GB Codex Cloud runtime:

- **28 Node tests passed**, including actual legacy-model migration/upsert and
  revocation, old-schema reopen, all learning modes, JWT/API-key authentication,
  stale live approval, paginated events/history, monitor concurrency/revisions,
  provider context/name resolution, outage fallback and Python RAG contract.
- **3 Python setup safety tests passed**: verified helper checksum, refusal to
  overwrite an unpaired program volume and cleanup restricted to newly created
  cache IDs. ESLint for learning modules, routes, dashboard and tests passed.
- **2 real Paperless scenarios passed**: upload/consumption and held-out provider
  context; direct multi-field correction, protection, live stale-review rejection,
  legacy revocation and actual Manual-route behavior in all four modes.
- **Offline-edit restart check passed**: stop only the app, mutate a synthetic
  document through the real Paperless API, restart with existing SQLite data and
  verify the change is pending with unknown provenance. No automatic trust.
- Full setup was rebuilt after removing all four compact test images, all synthetic
  data volumes and the external program volume. The default `cloud-test.py test`
  command downloaded and checksum-verified crane, installed dependencies and
  prepared the complete stack. A changed-source run also rebuilt the app through
  the fingerprint mechanism.
- The running stack used approximately 4.9 GiB, with **2.55–2.57 GiB free**. No managed
  storage-driver/network-policy changes or broad Docker cleanup were needed in
  this fresh runtime. Reset/stop/prepare/test commands are documented.

Paperless 3.4.1 was rechecked through its GitHub latest-release API on 2026-11-01
and remained the latest stable release (published 2026-10-31). CI runs the same
unit, setup-safety, lint, real integration and restart checks. Current results
are available on the existing PR #1.

Limits are explicit: provider fixtures do not establish real model quality; the
full optional Python RAG/model runtime was not launched; no browser screenshot
validation is claimed; a remote writer can still race the final PATCH because
this integration has no server-side compare-and-set. The saved Cloud template
still reports `main` and must be reviewed/republished in its editor using the
concrete settings in `test-environment.md`; this task has no configuration-write
or publish tool. No merge or production deployment was performed.

## Follow-up: direct 8 GB Codex Cloud validation, 2026-11-01

The compact setup in `docker-compose.test-cloud.yml` passed directly in the
managed 8 GB runtime using Docker's existing `vfs` driver:

- All 16 Node 22 unit/SQLite/regression tests and the workflow's ESLint command passed.
- Real Paperless integration passed before and after deleting this stack's test
  containers and data volumes, rebuilding its data from scratch and waiting for
  all services to become healthy.
- With PostgreSQL, Redis, Paperless and the app running, disk use was approximately
  4.9 GB, leaving 2.7 GB available.

The Cloud override uses single-layer local images, stores the complete Paperless
`/usr` tree once in a dedicated program volume, and runs initialization, app,
protocol mock and test processes in one app container. All Paperless files and
OCR languages remain present. PostgreSQL and Redis use pinned Alpine variants.
No managed storage driver, network policy or production service was changed.

Earlier failed operations left unreferenced vfs directories behind. Their exact
paths were checked against current Docker image/container layer references before
targeted cleanup. A broad Docker prune was rejected and was not performed. Do not
automate raw Docker storage cleanup or prune unrelated workloads.

The optional program volume survives ordinary test-data resets and must stay
paired with its compact image. See `docs/test-environment.md` for preparation,
start, execution and reset commands. These are development images, not release
artifacts. Deterministic provider fixtures still do not measure real model quality;
the optional Python RAG/model service remains untested.

## Original validation record

Executed in the managed cloud Docker environment on `feature/learning-engine-v2`:

- Node 22 unit, SQLite migration and regression suite: **16 passed, 0 failed**.
- Real Paperless-ngx 3.4.1 integration scenario: **1 passed, 0 failed**, repeated
  after deleting this stack's containers, network and all test volumes.
- ESLint for the new engine modules, learning router, dashboard JavaScript and
  new tests: passed. `git diff --check`: passed.
- Authenticated dashboard HTML rendering: passed. Unauthenticated learning API
  access: rejected with HTTP 401 as expected.

The integration scenario verifies upload/consumption, protocol-mock classification,
Paperless metadata updates, application polling, unknown provenance, confirmation,
retrieval for a separate held-out upload in Ollama/OpenAI/Azure protocols despite
custom prompt overrides, overwrite protection, explicit tag removal, immutable
caller input, rejection and example revocation. Deleting an old event preserves a
newer confirmed correction. No production documents or services were used.

The migration test opens an old schema twice and verifies legacy feedback and
snapshots survive. Other tests cover metadata normalization, multiple fields,
reopen persistence, stale review rejection, stabilization, all learning modes,
scans beyond 100 documents, connection failures and context selection/budget.

Not established by these checks:

- Real model classification quality. All provider responses were deterministic
  protocol fixtures; no paid external APIs or actual Ollama model were used.
- Execution of the optional Python RAG/model service. Its Python response contract
  was inspected and the JavaScript adapter updated accordingly.
- GitHub Actions run results or an opened PR: the GitHub API proxy CONNECT returned
  HTTP 403. The workflow and PR description are prepared, but CI status is unknown.
- Atomic protection from simultaneous external writes: preflight comparison and
  local write exclusion reduce races, but the integration has no server-side CAS.

Host Node 24 aborted in native better-sqlite3 cleanup in the expanded unit suite.
The pinned Node 22 test image passed. Use the documented Docker commands.

The install script, startup instructions and required `api.github.com` domain were
saved as an environment draft. Draft persistence does not publish an environment
or establish restoration in a new task. Review/save/publish through environment
settings is still required.
