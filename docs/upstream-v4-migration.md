# Upstream 4.x migration — SPEC #41 (work in progress)

This branch first merged released upstream v4.2.0 (`4200b96ae376a3bf4cebd743c26e70ee9b5c874b`)
and now integrates the subsequently released v4.3.0 (`ba56eeddc417a02517fd288b1f04a3b917c5df3c`)
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

- Verify the follow-up conservative contract across automatic/manual writes in CI; reviewed preview/save and field hints are ported.
- Recheck the completed paginated legacy management and audit history at the final committed revision.
- Keep the proven CI/Compose counterpart current without real-model inference; baseline qualification passed at baa6628.
- Recheck the native API/restart/upgrade matrix after each runtime change; the baseline passed at baa6628 (see evidence below).
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
At that earlier checkpoint, ordinary automatic/manual paths still required
contract reconciliation; the conservative-write follow-up below supersedes that limitation.

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

### Native counterpart preparation — 2026-11-19

The Compose project is now `paperless-ai-v4-e2e`, separate from the old cloud
stack. It uses unchanged official ngx images, PostgreSQL and Redis, and a fixed
local fake LLM on an internal network. No production URL is an input. A standard
Node-only API runner tests the built fork image against real ngx. The CI matrix
includes 3.5.1 and a retained-volume 3.4.2→3.5.1 upgrade plus app restart.

Local preparation checks pass: Compose semantic validation, workflow YAML
parsing, four explicit safety checks, syntax/lint and existing release-policy
contracts. A deliberate failing Node test was rejected by the harness; direct
execution displayed all four safety cases. This is not yet native integration
evidence. The local vfs executor has only 715 MB free and no 3.5.1 image, so no
large image pull, foreign-data cleanup or local stack start was attempted.
Legacy model workflows are manual-only and fail before experiments on 4.x.

### Native integration evidence at baa6628

[Learning engine validation 44465414428](https://github.com/BMWfan/paperless-ai/actions/runs/44465414428)
passed both jobs at `baa6628305f2ec43149bd74c10e6fbdd7fc89e1e`:
unchanged official ngx 3.5.1, and official 3.4.2 upgraded in place to 3.5.1.
Logs report API 10 and the exact server versions. Real ingestion, typed reviewed
fields, stale snapshots, unknown API provenance, explicit session review,
protected replay, persistent restart and current-number patterns all passed.
The companion [CI run 44465414511](https://github.com/BMWfan/paperless-ai/actions/runs/44465414511)
also passed. This uses a deterministic local LLM fixture, not a model-quality
measurement, native AI-provider benchmark or configured workflow-execution test.

### Conservative ordinary field writes (follow-up)

Automatic, ordinary manual and reviewed writes now reuse the fork's canonical
normalizer. Ordinary writes retain upstream URL and unambiguous legacy select
compatibility. Fractional/out-of-range integers, ambiguous monetary separators,
localized boolean/date guesses, duplicate proposals/field names and oversized
short text are skipped with a note, preserving existing values. Identifiers are
not silently truncated; explicit currency codes are retained even when a native
field has a different default. A default only fills an absent currency.

Value writes fetch the small native field-definition collection freshly, once
per non-empty eligible proposal set, to handle external definition/type changes
without relying on the taxonomy cache. This does not synchronize document
content. Unavailable definitions fail closed for field values; other metadata
can still be saved with a warning. Invalid-value notes do not include the raw
value. Prompt rules require canonical dates/numbers and current-document values,
with no copying of reference identifiers or amounts. A fake canonical response
in a test is not proof that a real model performs that normalization correctly.

This deliberately preserves the old fork's conservative contract rather than
upstream4's silent rounding, truncation or currency relabeling. API clients must
submit `true`/`false`, calendar ISO dates and canonical numeric strings; localized
manual aliases such as `ja` are not accepted for a boolean field. Missing or
ambiguous data is omitted rather than guessed. The native fixture now also
checks ordinary integer rejection and CHF preservation against an EUR default.

### Legacy completeness and management follow-up

Comparison with `models/document.js` at 363c0c6 found an additional
`learning_feedback_archive` table. New failing regressions demonstrated that it
was not copied and that pre-upsert duplicates were not normalized. The importer
now copies that archive, applies the original confirmed-first duplicate policy
only to the target, archives displaced predictions, and keeps source bytes
unchanged. Import JSON errors name the table/column without echoing the payload.

The learning UI now has paginated imported corrections, selective revocation
and a global paginated review history (including legacy revocations). A selected
revoke cannot remove other documents' corrections and retains its audit row.
Automatic protection uses an indexed document lookup instead of materializing
all legacy examples for every document; legacy retrieval ranking is unchanged.
Local follow-up checks: 19 migration tests (including archive preservation and
legacy pagination/revocation), 36 focused import/history/runtime/API cases, and
19 complete simulated browser scenarios passed; type checks and lint passed.
Counts overlap and must not be added as independent executions.

The native initializer is extended to seed actual pre-v4 user/feedback/archive
schemas and a legacy .env for one real synthetic native document, then let the
built app import them. It checks preserved login, correction protection,
archives, and database/config source hashes, including after app restart. It
does not run an old 3.x application. This extension still needs actual CI proof.
Existing fixtures are not retroactively reseeded or erased; qualification must
use fresh disposable volumes rather than rewriting existing test data.

### Released upstream 4.3.0 refresh

Release v4.3.0 was published after the initial baseline selection. Its 41-file
delta adds native OIDC sign-on and exclusion-tag support (processing and
workflow webhook). These are reused from upstream; no fork alternative is
introduced. Both remain governed by upstream configuration, with OIDC disabled
in the native fixture and local mock-issuer tests only. The fork retains its
Learning v2 hooks, conservative field writer and manual-only publication policy.
The E2E append conflict is resolved by keeping all upstream and fork scenarios.
The previous 4.2 qualification is historical; the refreshed head needs complete
checks and the same real-ngx matrix before readiness can be claimed.

Local verification of the integrated 4.3 tree: 588 Vitest cases passed, one real
PaddleOCR-model case skipped, 47 files; TypeScript, full lint, build and all 35
historical hashes passed. All 21 Playwright cases passed, including upstream
OIDC linking/sign-in/provider logout through a local mock and the fork's learning
and legacy-revocation flows. This does not certify a real Entra tenant. The
expanded native legacy-data fixture still requires its next CI run.
