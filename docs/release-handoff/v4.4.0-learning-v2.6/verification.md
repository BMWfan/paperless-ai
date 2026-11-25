# Release verification for v4.4.0-learning-v2.6

Run on 24 November 2026 against
`6ceafca36419f877aea52c4342686d05c0dc621d`. The checkout's feature branch and
working files were preserved. Build contexts were extracted from the exact
candidate and previous Git commits.

## Repository and release policy

- `origin/main` matches the candidate. PR #56 is its merge commit. The
  [CI run](https://github.com/BMWfan/paperless-ai/actions/runs/45339922946)
  and [Learning integration run](https://github.com/BMWfan/paperless-ai/actions/runs/45339923068)
  are successful push runs on main at this SHA.
- The annotated tag `v4.4.0-learning-v2.6` resolves locally to the candidate.
  The remote tag lookup returned no matching ref.
- The publication workflow is manual, with the explicit existing tag, full SHA,
  successful Learning push evidence, owner approval through the protected
  environment, and registry tag checks. `latest` defaults to false. Live
  environment settings could not be confirmed from this session because the
  GitHub API request returned `Forbidden`.
- Offline policy and fixture tests reported 43 passed with five intentionally
  gated HTTP tests skipped. All five configured setup HTTP tests passed when
  enabled in the isolated Docker stack. Five Python policy tests passed.

## Installation, migration and restore

- The AMD64 candidate image booted from an empty data volume on an isolated
  network and reported `not_configured` and `setupRequired`. The internal app
  version reported by health is 4.4.0.
- The exact predecessor `v4.4.0-learning-v2.5` at
  `c1849bacc2961c35663c2c74fb147d672bdbde1d` provided the integration baseline.
  GHCR returned `manifest unknown` for that version tag. The baseline image
  was built locally from the exact source tag.
- On the repository's internal Compose network with official Paperless-ngx
  3.5.1, the v2.5 image imported its seeded legacy records and passed native
  document classification, provenance and typed field tests. After switching
  only Paperless-AI to v2.6, the app started on the same volume, preserved
  pending and confirmed learning and made no extra model requests. The new
  inventory endpoint responded as expected to an unauthenticated request.
- The stopped v2.5 data volume was archived in full, gzip and SHA-256 checks
  passed, and extraction into a fresh volume reproduced the archive's file
  list. Starting v2.5 on the restored volume preserved learning and its mode.
  Both restored SQLite databases passed `PRAGMA quick_check` using temporary
  writable copies. The restored configuration parsed successfully. A direct
  read-only volume check had failed to open the WAL-backed database.
- 29 targeted Vitest tests passed. The setup and inventory Playwright tests
  passed together. The first inventory-only attempt stopped at sign-in because
  the suite's preceding setup scenario had been filtered out.
- The Compose upgrade overlay rendered against the repository's baseline.
  Except for the image, removal of the local build, and explicit pull policy,
  the rendered settings were identical. The actual deployment configuration
  was not supplied or applied.

## CPU multiarchitecture build

The AMD64 image was built and run locally. The ARM64 image was built using
BuildKit emulation on the AMD64 executor. The first combined attempt needed
the Cloud proxy and CA in the dedicated builder. The proxy-enabled parallel
attempt was stopped to protect free storage. Separate architecture builds
succeeded, and their manifests were assembled into one local OCI index.
The temporary Dockerfile mounted the Cloud CA for npm without changing the
tracked Dockerfile or disabling TLS checks.

The index contains Linux AMD64 and ARM64. The Node executable and SQLite addon
were checked for the expected ELF machine on both architectures. Image config,
manifest and layer SHA-256 references were verified. This validates the ARM64
build and artifact properties. Runtime on native ARM64 hardware and CUDA were
outside this run.

- AMD64 manifest `sha256:5e8d44ac786b610d3790452cb3ba0cd4202cb9c23c9e1170eed03c8d6b4f03d9`
- ARM64 manifest `sha256:42dd836ebc164f0eda1634559736765eadde711216e3b84f00f866823e99df1c`
- Local OCI index `sha256:9a0aca52819f901cfb75e5a1815bbffb9566c489bd99912cf85106992b9f1ebf`

## Recommendation

**Go for owner review as a technical prerelease candidate.** The exact main
revision has green CI and successful local build, upgrade and recovery evidence.

**No-Go for publication or production cutover at this point.** Confirm the live
GHCR preflight permissions and tag availability under the approved workflow,
then obtain the separate publication approval. Before any production cutover,
confirm the project's actual Compose configuration, the deployed source image
and rollback digest, and the production-specific backup and restore rehearsal.
The repository README retains a deployment-readiness gate.

The local tag and CPU OCI archive were prepared without publishing a Git tag,
GitHub release or image. No production deployment, merge or real-model request
was performed. Tests used only synthetic documents and the fixture provider.
