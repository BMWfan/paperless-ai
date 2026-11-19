# Upstream 4.x migration — SPEC #41 (work in progress)

This branch merges released upstream v4.2.0 (`4200b96ae376a3bf4cebd743c26e70ee9b5c874b`)
into the fork baseline `363c0c646ef368642e0468d139dc974095e8cb6a`.
The merge preserves upstream ancestry so future updates can use a normal fetch,
review and merge. Do not deploy this intermediate branch.

## Ownership and integration

Upstream supplies the TypeScript/Fastify server, React interface, provider
adapters, Paperless client, OCR and processing engine. Fork-owned Learning v2
lives in `src/server/learning/`; the existing SQLite algorithms are preserved as
CommonJS modules behind a typed adapter. The build copies these modules into
`dist/server/learning/legacy/`. Learning tables share the upstream SQLite handle.

Processing injects bounded confirmed learning context into the common prompt
before calculating its budget. Unknown external metadata changes remain pending
in every mode. Only authenticated manual UI writes establish `confirmed_ui`
provenance; API-key writes do not establish a human actor. Self-writes update
snapshots without creating correction examples. The applier reads current
metadata before writing, rejects a stale plan, and excludes overlapping writes.
Confirmed v2 and non-revoked legacy corrections protect automatic processing.
Revocation retains review history and removes learning influence/protection.

`/learning` provides mode selection, monitor enablement, event filtering,
pagination and confirm/reject/revoke actions. Authenticated `/api/learning/`
endpoints expose settings, events, examples, summary and review history. A
confirmation re-fetches current Paperless metadata; a stale event cannot replace
a newer snapshot. Changes from workflows and other clients require review.

The monitor fetches paginated metadata, requesting full content only when
needed. This is not yet an incremental modification cursor: a metadata pass
still enumerates documents. Do not claim full synchronization was eliminated.

## Migration and rollback contract

The upstream importer handles its existing legacy core tables. The fork then
opens `documents.db` read-only and imports known learning tables into the new
upstream database in a target transaction. These are separate import steps,
not one atomic transaction across both core and learning data.

The learning importer preserves settings, IDs, snapshots, pending events,
examples, field generations, review history and legacy revocations. It rejects
unknown future schema versions, unsupported columns, malformed JSON and existing
target learning history. A marker prevents a second startup from overwriting
new corrections. The old source file is neither replaced nor migrated in place.

Before any approved deployment, back up the complete old data directory and
configuration. Test migration on a copy in the isolated stack. Roll back using
the old image and untouched pre-migration backup; do not point old software at
the new database or expect new 4.x corrections to appear in the old backup.
Never test this against production.

## Verification and outstanding gates

Use Node 22, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build` and `npm run test:e2e` after the migration is complete.
On the small cloud executor, use one Vitest worker to bound memory.
Provider fixtures are not real model quality measurements.

Completed during development: synthetic migration tests, monitor lifecycle and
write-lock tests, and API checks for authentication, invalid settings,
cross-origin changes, fresh confirmation and stale rejection. Exact counts and
commit evidence belong in the eventual PR; these intermediate working-tree
results are not release qualification.

Still required before readiness:

- Complete strict normalization across all automatic/manual paths; reviewed preview/save and field hints are ported.
- Complete paginated legacy-example management; event history and interval controls are implemented in the follow-up working tree.
- Adapt legacy CI/test commands to the new runtime without running new model experiments.
- Run disposable official Paperless-ngx 3.5.1 integration and migration/restart tests.
- Repeat complete tests at the final committed revision and review the complete diff. Build and 18 synthetic browser tests passed during development.
- Update README, test environment instructions and affected legacy references.
- Resolve the existing no-new-PR constraint before opening any linked draft PR; obtain the required independent review and owner
  approval for any prerelease, merge, release or deployment separately.

Historical model evidence is immutable. `docs/historical-evidence-lock.json`
and `node scripts/audit-historical-evidence.mjs` check archived hashes; they do
not establish compatibility or model accuracy on the new runtime. Legacy reports
must be reproduced on their recorded original commit, not relabeled as 4.x runs.

No live model experiment, registry publication or production migration is part
of these local checks.

### Development checkpoint (2026-11-18; uncommitted working tree)

The full Vitest suite passed 555 tests with one skipped before the last custom
field additions. The later focused learning/field suites passed 18 tests, and
the field/API suites passed nine after adding the current-number regression.
Both TypeScript targets and the complete web/server build passed. Playwright
passed all 18 browser scenarios with system Chromium and simulated providers,
including authenticated learning confirmation and revocation. These counts
refer to different checkpoints and must not be added together as one run.

Reviewed custom-field endpoints now support read-only preview, learned label
patterns, and explicit selected-field saving. They reuse the original strict
normalizer and snapshot contract. Fresh field definitions and document/content
hashes are checked while the document lock is held. Unselected values are
preserved; reviewed saves fail instead of silently dropping rejected fields.
Native upstream automatic and ordinary manual custom-field paths still need
contract reconciliation and must not be described as strict yet.

### Follow-up import integrity — 2026-11-19 (not part of the pending merge checkpoint)

Additional importer guards reject orphaned examples/review entries, mismatched
field generations, unknown event statuses, invalid metadata JSON shapes and
field values/scopes that disagree with their snapshots. Checks run before any
reopen normalization can discard proof. The source remains read-only and the
target import rolls back on rejection. These follow-up changes are kept in a separate commit from the upstream and
diagnostic-history merges.

Follow-up verification: all 16 focused migration tests pass, including a real
file-backed AppContext import/restart and invalid-settings rollback. The six
existing legacy-import integration tests also pass. These are local synthetic
checks; official ngx 3.5.1 integration remains pending. No model was called.

The follow-up learning UI renders before/after values using metadata names,
loads per-document review history on expansion, and exposes scan/stabilization
interval controls. Requests use the shared abort-aware loader so a superseded
filter response cannot overwrite a newer result. This work is recorded with the importer follow-up, separately from the
upstream and diagnostic-history merges.

The owner approved the local feature-branch merge and push on 2026-11-19.
This approval covers neither a merge to main nor publication or deployment.
The follow-up UI passed all 18 synthetic browser scenarios, including readable
provenance, review history, confirmation and revocation; both TypeScript targets
and scoped lint passed. Native official ngx integration remains unverified.
