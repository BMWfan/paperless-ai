# Isolated development environment

## Codex Cloud quick start

From the isolated checkout on the approved development branch:

```sh
python3 tests/e2e/cloud-test.py test
```

This command prepares the current source, downloads and verifies pinned crane
when needed, installs Node dependencies in the test image, prepares all real
services, waits for health, then runs unit/API/migration tests, ESLint, Python setup
safety tests, both real integration scenarios and offline-edit restart detection.
It checks a source fingerprint and rebuilds changed app sources automatically.
Its `.e2e-cache` tooling/manifest directory is excluded from Git and Docker builds.

Other actions are `prepare`, `start`, `status`, `stop`, and `reset`. Reset removes
only this fixed project's containers and synthetic data volumes; the external
Paperless program volume and prepared images remain reusable. Docker's local
socket and project name `paperless-ai-e2e` are explicit, so inherited Docker
contexts/project names cannot redirect a reset to another installation. Existing
registry credentials, proxies and CA trust are preserved. Build-cache cleanup is
restricted to the exact cache IDs created by this preparation, not all unused data.

For a full rebuild, run `reset`, then remove only this project's compact images
`paperless-ai-e2e-cloud-{app,db,redis}:local`,
`paperless-ai-e2e-cloud-paperless:3.4.2` and the
`paperless-ai-e2e_paperless-runtime` program volume before running `test` again.
An older 3.4.1 setup uses `paperless-ai-e2e-cloud-paperless:local`; remove that
specific old image when replacing its program volume. Never force removal of
images still referenced by other containers. Ordinary upgrades preserve the
synthetic database, document and app volumes; do not run `reset` for that case.

### Saved Codex environment settings

Select repository `BMWfan/paperless-ai` with the approved branch containing the
version under test. Until the 3.4.2 qualification PR is integrated, its branch is
`test/paperless-ngx-3.4.2`; the older learning branch alone does not contain this
upgrade. Use this install command:

```sh
cd /workspace/paperless-ai
python3 tests/e2e/cloud-test.py prepare
```

Startup/development instructions should run `python3 tests/e2e/cloud-test.py test`
from that same directory and preserve existing allowed domains, proxies and
credentials. Review and republish the saved environment through its settings.
The saved environment list still reported ref `main` on 2026-11-01. This coding
task has read-only environment inspection and cannot edit/publish that template;
the commands above are the concrete setup to apply in the environment editor.

### Verified compact 3.4.2 qualification

Source `7f9db35ac98ded5e18dc79626f21b7067b54afb9` passed the real compact
Cloud workflow on the approximately 8 GB filesystem with Docker's `vfs` driver.
The actual runtime reported Paperless-ngx 3.4.2. All 30 Node tests, 3 Python
setup-safety tests, ESLint, both real Paperless scenarios and offline-edit restart
detection passed; approximately 2.48 GiB remained free.

The old 3.4.1 program-volume/image pairing first caused the expected safe abort
before a build. After stopping only this project, its named program volume and
old compact Paperless image were explicitly replaced. Existing synthetic
database, document and app volumes were retained. A synthetic witness document
kept its ID, exact title and the same active confirmed learning event across the
upgrade and a subsequent Cloud-runtime restoration. This is a retained-data
check, not a claim that those existing test volumes were empty.

Use `TEST_CA_BUNDLE=.e2e-cache/ca-certificates.crt python3 tests/e2e/cloud-test.py test`
after copying the trusted system CA bundle into that ignored path when needed.
Check the actual version with:

```sh
docker compose -f docker-compose.test.yml -f docker-compose.test-cloud.yml exec -T paperless \
  python3 -c 'import paperless.version; print(paperless.version.__full_version_str__)'
```

Native AI remains disabled in this baseline. Chromium and real-model evaluation
were not rerun in the compact environment; the existing standard CI provides
the separate browser and fresh-stack upgrade evidence. See
[the validation record](learning-v2-validation.md#compact-paperless-ngx-342-qualification).

## Standard local/CI stack

Use the approved development branch. Docker Engine with Compose v2 is
required. No production configuration, files or environment values are imported.
The test stack publishes no ports and its network is internal. Password literals
in Compose are public disposable fixture values, not production secrets.

```sh
docker compose -f docker-compose.test.yml up -d --build ai
docker compose -f docker-compose.test.yml run --rm runner
# Delete only the disposable test stack and its data:
docker compose -f docker-compose.test.yml down -v --remove-orphans
```

The stack defaults to Paperless-ngx 3.4.2. PostgreSQL, Redis and Node versions
are pinned. The initializer obtains
a test API token inside the isolated network and writes the app configuration to
a dedicated volume. Health checks gate initialization, app startup and tests.
The test-specific Node image excludes optional Python RAG/model downloads.

On Codex Cloud, use the managed local Docker socket. Keep the platform Docker
proxy configuration. Set `TEST_CA_BUNDLE` to a combined trusted certificate bundle
if the platform needs a custom CA; it is mounted as a BuildKit secret only.
No TLS verification is disabled. Runtime requests to test services use NO_PROXY;
these hosts are confined to the internal test network.

The GitHub workflow sets `TEST_CA_BUNDLE` to a copy of the runner's trusted CA
bundle within the ignored `.e2e-cache` directory. This keeps the path within
Bake's read boundary while retaining TLS verification.

`node --test tests/*.test.js` runs the existing unit/SQLite regression suite.
`npm test` starts a development server and is not a test suite.
The GitHub workflow `learning-e2e.yml` executes the same disposable stack.

### Paperless-ngx upgrade check

After validating a fresh 3.4.2 stack, CI resets its disposable project and starts
3.4.1 using `TEST_PAPERLESS_VERSION=3.4.1`. It runs
`docker compose -f docker-compose.test.yml exec -T ai node tests/e2e/upgrade-probe.js seed`
to ingest a synthetic document and confirm a correction. CI stops the stack
with `down --remove-orphans`, keeping the volumes, unsets the version override,
and starts 3.4.2. The `verify` action checks the same document ID, title and
confirmed learning example. To return to 3.4.1, use fresh disposable volumes or
restore a synthetic backup taken before the upgrade.

### Docker Desktop on Windows with WSL 2

Start Docker Desktop with Linux containers and enable integration for the WSL
distribution used for development. Run the commands below in that distribution,
from this checkout. Verify that `docker --host unix:///var/run/docker.sock version`
reports a Linux server and that `docker compose version` succeeds.

Compose 5.6.1 uses Bake even with `COMPOSE_BAKE=false`. It can reject the default
CA secret outside the checkout with an `fs.read` entitlement error. Keep a copy of
the distribution's trusted public CA bundle in the ignored test cache instead:

```sh
mkdir -p .e2e-cache
cp /etc/ssl/certs/ca-certificates.crt .e2e-cache/ca-certificates.crt
export TEST_CA_BUNDLE=.e2e-cache/ca-certificates.crt
docker --host unix:///var/run/docker.sock compose --project-name paperless-ai-e2e -f docker-compose.test.yml up -d --build ai
docker --host unix:///var/run/docker.sock compose --project-name paperless-ai-e2e -f docker-compose.test.yml run --rm runner
python3 -B tests/e2e/restart-check.py
```

Use the approved combined CA bundle if your network requires additional trust.
The cache is excluded from Git and the image build context; the bundle is mounted
only as a build secret. No filesystem entitlement or TLS bypass is needed. The
restart helper uses the local WSL Docker socket and only this test project.

### Optional browser and real-model validation

The `extended` profile adds test-only Chromium and Ollama services to this same
Compose file. They publish no ports and use the same internal network. They are
not part of the compact 8 GB Cloud quick start; allow additional disk space for
the browser and model images. Public software and model weights are fetched at
build time. No hosted-model credentials, account login or API charges are needed.

```sh
# Keep TEST_CA_BUNDLE set as above when Bake requires an in-checkout CA path.
docker compose -f docker-compose.test.yml --profile extended run --build --name paperless-ai-e2e-browser browser
docker cp paperless-ai-e2e-browser:/artifacts ../browser-artifacts
# Remove only this completed one-off container before reusing the same name:
docker rm paperless-ai-e2e-browser

docker compose -f docker-compose.test.yml --profile extended run --rm --build model-check
docker compose -f docker-compose.test.yml cp ai:/app/data/real-model-evaluation.json ../real-model-evaluation.json
docker compose -f docker-compose.test.yml --profile extended stop
```

Keep exported reports outside the checkout or in an ignored scratch directory.
The browser test exercises authenticated API-key access, anonymous login/setup
redirection, actual review/revoke/reject actions, settings, saved themes and mobile
layout. Screenshots are generated in the dedicated `browser-artifacts` volume.
CI runs this check and uploads its screenshots.

The CPU model test uses pinned Ollama 0.12.6 and `qwen2.5:0.5b`; the evaluation
report records the downloaded model digest. Ten separately ingested English/German
documents are classified before and after five independent training documents
receive explicit review. Confirmed test references are revoked afterward and the
previous learning settings restored. The report contains actual predictions,
completeness, type/language counts and timing. Empty fields and inaccurate labels
are recorded as quality failures rather than hidden by an aggregate pass result.
The integration assertions cover schema-constrained JSON, actual inference tokens
and reference context sent to the model. This small evaluation is not a general
model-quality guarantee or an actual hosted OpenAI/Azure model evaluation.

Expected correspondent names must match the sender written in the fixture, even
when its body is German. Proper names are not translated for scoring. A corpus
regression checks that each expected sender occurs as the first line. Earlier
reports expecting `Fiktives Beispiel` in documents headed `Fictional Example`
have invalid correspondent scores for those German cases; use a new report and
corpus digest after this correction. Other field scores remain descriptive,
not evidence of a reliable learning improvement.

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

### Compact images for small Codex Cloud runtimes (advanced manual steps)

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
python3 tests/e2e/compact-image.py --remote registry-1.docker.io/library/redis:7.4.2-alpine paperless-ai-e2e-cloud-redis:local
python3 tests/e2e/compact-image.py --remote registry-1.docker.io/library/postgres:16.6-alpine paperless-ai-e2e-cloud-db:local
python3 tests/e2e/compact-image.py --remote --usr-volume paperless-ai-e2e_paperless-runtime ghcr.io/paperless-ngx/paperless-ngx:3.4.2 paperless-ai-e2e-cloud-paperless:3.4.2

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
the stack, then explicitly remove `paperless-ai-e2e_paperless-runtime` and its
paired compact Paperless image before preparing them again. The old 3.4.1
compact image uses the `:local` tag. The new image uses `:3.4.2`. When migrating,
remove only that old program volume and image, keeping the synthetic database,
document and app volumes for the upgrade. Rebuild and compact the application after source
changes; do not reuse a stale compact image. Importing changes the local image digest and removes
its original build history, so use these images only for disposable development
tests, not release publication.
