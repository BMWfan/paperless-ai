# Validation on 2026-10-31

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
