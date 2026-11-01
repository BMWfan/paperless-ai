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
For the vfs driver, use the compact-image procedure below before concluding that
more disk capacity is needed. Do not change the managed storage driver or delete
unrelated Docker images/volumes to work around this limit.

### Compact images for small Codex Cloud runtimes

`docker-compose.test-cloud.yml` retains the same real Paperless service, synthetic
documents, isolated network, healthchecks, and persistent test volumes. It runs
the initializer and protocol mock alongside the app in one container. Tests run
as a separate process with `compose exec`, avoiding extra vfs container copies.
PostgreSQL and Redis use pinned Alpine variants.
The optional `tests/e2e/compact-image.py` imports each filesystem as a single layer
so vfs does not store a full copy for every original image layer. It preserves
entrypoint, command, environment, working directory, user, exposed ports, volumes,
and stop signal. All Paperless files, including OCR languages, are retained. Its
`/usr` tree is stored once in the dedicated `paperless-ai-e2e_paperless-runtime`
volume, avoiding a second full copy when the container is created. Compose
supplies the healthchecks. Images are local and disposable;
no registry pushes or Docker daemon changes occur.

Install the official `crane` CLI (tested with go-containerregistry v0.22.1) from
https://github.com/google/go-containerregistry/releases. Keep inherited proxy and
CA settings. The commands below assume an amd64 runtime, Compose 2.24.4+
(`!override` support), and `crane` on PATH:

```sh
# Build the current application, then compact it before importing the large services.
COMPOSE_BAKE=false docker compose -f docker-compose.test.yml build ai
python3 tests/e2e/compact-image.py paperless-ai-e2e-ai paperless-ai-e2e-cloud-app:local
# Remove only the now-redundant test image/cache created by this build when needed.
# Do not prune unrelated workloads on a shared Docker daemon.
python3 tests/e2e/compact-image.py --remote --usr-volume paperless-ai-e2e_paperless-runtime ghcr.io/paperless-ngx/paperless-ngx:3.4.1 paperless-ai-e2e-cloud-paperless:local
python3 tests/e2e/compact-image.py --remote registry-1.docker.io/library/postgres:16.6-alpine paperless-ai-e2e-cloud-db:local
python3 tests/e2e/compact-image.py --remote registry-1.docker.io/library/redis:7.4.2-alpine paperless-ai-e2e-cloud-redis:local

docker compose -f docker-compose.test.yml -f docker-compose.test-cloud.yml up -d --no-build --pull never ai
docker compose -f docker-compose.test.yml -f docker-compose.test-cloud.yml exec -T ai node --test tests/e2e/paperless.test.js
# Run unit tests in the same compact image:
docker compose -f docker-compose.test.yml -f docker-compose.test-cloud.yml exec -T ai sh -c 'node --test tests/*.test.js'
# Reset only this disposable stack:
docker compose -f docker-compose.test.yml -f docker-compose.test-cloud.yml down -v --remove-orphans
```

Remote tags are resolved to a digest before reading configuration and filesystem.
No intermediate root filesystem tarball is stored: crane streams directly into
Docker import and, for Paperless, into its program volume. The helper refuses
to overwrite an existing program volume. This external volume survives a test
data reset; keep it paired with its compact image. To recreate both, first stop
the stack, then explicitly remove `paperless-ai-e2e_paperless-runtime` and
`paperless-ai-e2e-cloud-paperless:local` before preparing them again. Rebuild and compact the application after source
changes; do not reuse a stale compact image. Importing changes the local image digest and removes
its original build history, so use these images only for disposable development
tests, not release publication.
