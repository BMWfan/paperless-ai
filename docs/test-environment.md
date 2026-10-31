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

The GitHub workflow sets `COMPOSE_BAKE=false` to use Compose's regular BuildKit
build. Current Bake versions otherwise reject the CA secret outside the checkout
with an `fs.read` entitlement error. If this occurs locally, prefix the Compose
commands with `COMPOSE_BAKE=false`; keep the CA mount and TLS verification enabled.

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

### Cloud disk capacity

The Node test image uses Debian slim and removes npm's download cache after
installation. On 2026-10-31 this image built successfully in a fresh Codex Cloud
runtime and passed all 16 unit/SQLite/regression tests and the workflow's ESLint
command directly in that runtime.

This runtime has an approximately 8 GB root filesystem and Docker uses `vfs`.
With this driver, image layers and container filesystems require full copies;
the sizes reported by `docker image ls` understate actual disk use. Pulling the
Paperless image failed with `no space left on device`. Building the slim Node
image also exhausted disk while unused database images remained. Removing those
unused test images and build cache freed enough space for the Node test suite.
The full Paperless integration stack has not passed in this 8 GB runtime; it
requires a runtime with more disk capacity. Do not change the managed storage
driver or delete unrelated Docker images/volumes to work around this limit.
