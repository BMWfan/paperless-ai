# Prepared upgrade for an existing Paperless-AI 4.x Compose project

The candidate is `v4.4.0-learning-v2.6` at
`6ceafca36419f877aea52c4342686d05c0dc621d`. The accompanying overlay is intended
for an existing service named `paperless-ai` and a Compose version that supports
`!reset` (validated with 2.40.3). It preserves the project's
networks, environment, volumes, port mappings and security options. Render it
with the actual base files and project name after deployment is separately
approved. Compare the rendered service with the running configuration.
Keep the rendered configuration private if it contains interpolated secrets.

## Prepare the inputs

- Obtain the released CPU image's approved multiarch index digest. Set
  `PAPERLESS_AI_UPGRADE_IMAGE` to
  `ghcr.io/bmwfan/paperless-ai:v4.4.0-learning-v2.6@sha256:4236977476113841eac26ebf9191fd814f84ed3a289515c21d869370d41c15c5`.
  The local test OCI archive has its own digest and cannot supply the release digest.
- Record the current image digest and confirm it will still be available if a
  rollback is needed. Record the Compose project name and base files, the source
  mapped to `/app/data`, its ownership and the volume driver's restore procedure.
- The commands below assume a Docker named volume. For a bind mount, take a
  cold backup of the actual host path and restore it to a separate path with
  matching ownership and permissions. For a 3.x source installation, follow the
  repository's upgrade notes and separately review changed environment settings.
- Confirm that any configured inference provider is an approved provider. In a
  restore rehearsal use only synthetic documents and an isolated fixture provider.

## Cold backup

Before stopping the service, prefetch the approved candidate and confirm that
the previous image and the backup helper image are available locally. Use the
same Compose project and base files for all service operations. Back up the
entire Paperless-AI data mount, including its SQLite database, configuration,
learning data and RAG state. The archive can contain credentials.

```sh
umask 077
docker compose -p "$PROJECT" -f "$BASE_COMPOSE" stop paperless-ai
docker run --rm --network none -v "$AI_DATA_VOLUME:/source:ro" \
  node:22-bookworm-slim tar czf - -C /source . > paperless-ai-data.tgz
gzip -t paperless-ai-data.tgz
sha256sum paperless-ai-data.tgz > paperless-ai-data.tgz.sha256
```

Store the archive and checksum with restricted access. Back up the Compose
files, secret references and image digest separately. Paperless-ngx is a
separate system with its own database and media backup. This upgrade overlay
only targets Paperless-AI.

## Approved cutover

Run `docker compose -p "$PROJECT" -f "$BASE_COMPOSE" -f compose.upgrade.yml config --quiet`.
After checking the selected image and the preserved data mount, use the same
Compose options with `up -d --no-build --no-deps --wait paperless-ai`. The
overlay uses `pull_policy: never` so that it starts the prefetched image.
Check health, sign-in, Paperless connectivity, inventory and prior learning
state before enabling any scheduled processing that was paused for the window.
Record the actual image digest and test results.

## Rollback from the cold backup

Stop the upgraded service. Verify the checksum and extract into a new, empty
volume so that the upgraded data stays available for diagnosis.

```sh
sha256sum -c paperless-ai-data.tgz.sha256
docker volume create "$RESTORE_VOLUME"
docker run --rm -i --network none -v "$RESTORE_VOLUME:/restore" \
  node:22-bookworm-slim tar xzf - -C /restore < paperless-ai-data.tgz
```

Point the base project's `/app/data` mapping at that restored volume in a
rollback override. Use the pre-upgrade image digest and validated settings.
Verify the rendered volume mapping before starting the former version.
Check health and read existing configuration, history and learning state.
Writes made after the backup are outside the restore point and need separate
reconciliation. Retain both volumes until the rollback has been verified.
