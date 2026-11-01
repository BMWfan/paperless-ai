# Learning Engine v2 validation


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
