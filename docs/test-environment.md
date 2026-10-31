# Isolated development environment

Use only branch `feature/learning-engine-v2`. Docker Engine with Compose v2 is
required. No production configuration, files or environment values are imported.
The test stack publishes no ports and its network is internal. Password literals
in Compose are public disposable fixture values, not production secrets.

```sh
docker compose -f docker-compose.test.yml up -d --build ai
docker compose -f docker-compose.test.yml run --rm runner
# Delete only the disposable test stack and its data:
docker compose -f docker-compose.test.yml down -v --remove-orphans
```

Paperless-ngx 3.4.1 was the newest stable GitHub release when checked on
2026-10-31. PostgreSQL, Redis and Node versions are pinned. The initializer obtains
a test API token inside the isolated network and writes the app configuration to
a dedicated volume. Health checks gate initialization, app startup and tests.
The test-specific Node image excludes optional Python RAG/model downloads.

On Codex Cloud, use the managed local Docker socket. Keep the platform Docker
proxy configuration. Set `TEST_CA_BUNDLE` to a combined trusted certificate bundle
if the platform needs a custom CA; it is mounted as a BuildKit secret only.
No TLS verification is disabled. Runtime requests to test services use NO_PROXY;
these hosts are confined to the internal test network.

`node --test tests/*.test.js` runs the existing unit/SQLite regression suite.
`npm test` starts a development server and is not a test suite.
The GitHub workflow `learning-e2e.yml` executes the same disposable stack.

`tests/e2e/generate.js` generates English/German synthetic invoices and expected
metadata. Evaluation fixtures are generated separately from learning examples.
The protocol mock is deterministic and incurs no API costs. Passing mock tests
cannot establish real model classification quality.

The integration test covers actual ingestion, deterministic classification, direct
API correction, application monitor detection, authenticated review, confirmed
example retrieval by all three provider protocols, overwrite protection,
rejection/deletion and unauthenticated access denial. The unit suite additionally
covers SQLite reopen/migration, stabilization and pagination beyond 100 documents.
The synthetic corpus contains bilingual invoices, insurance documents, contracts,
letters and payment confirmations. It is available for future real-model quality
evaluation; only the deterministic integration scenario has been evaluated here.

Use the pinned Node 22 image for tests. The host Node 24 runtime exhibited a native
better-sqlite3 cleanup assertion in the expanded test suite; do not treat a host
runtime abort as a passing test. To run unit tests in the prepared image:

```sh
docker compose -f docker-compose.test.yml run --rm --no-deps runner sh -c 'node --test tests/*.test.js'
```
