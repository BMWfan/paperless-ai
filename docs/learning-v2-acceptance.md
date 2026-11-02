# Learning Engine v2 acceptance

This checklist compares the complete original project request with the delivered
implementation. Provider fixtures establish integration, not real model accuracy.
The final clean-build validation is recorded in `learning-v2-validation.md`.

| Requirement | Finding at d924021 | Delivered behavior and evidence |
| --- | --- | --- |
| Isolated real Paperless, PostgreSQL, Redis, initialization and synthetic corpus | Existing stack; pinned versions | Pinned Paperless 3.4.1 (latest stable release rechecked on 2026-11-01); own internal network, no ports, fixture user/token and data volumes. `paperless.test.js` uses real ingestion and metadata APIs. |
| Reproducible 8 GB setup and future reuse | Working compact images but lengthy manual setup | `cloud-test.py test` installs checksum-verified tooling, builds current source, prepares services, waits for health and runs the suite. Fingerprints invalidate stale app images. Reset/stop/full-rebuild instructions and AGENTS.md are supplied. Setup safety tests prevent broad cleanup and accidental volume replacement. |
| Safe metadata normalization and migrations | Basic snapshots and migration 2 | Migration 3 adds atomic snapshot revisions, actors and legacy suppression. Empty IDs, tag sets, custom-field ordering and typed values are normalized. Reopen tests preserve old schemas. Real-model migration tests retain confirmed duplicates and archive all displaced payloads instead of dropping them. |
| Stabilization, pagination, restart, failures, duplicates and self-writes | Polling lacked concurrent-write revision guards and live rescheduling | Metadata-only paginated polling, content retrieval on changes, persisted candidates, atomic revision checks and one scan at a time. Tests exercise actual API pagination, outages, overlap, a self-write completed during fetch and edits made while the app is stopped. |
| Automatic/manual/hybrid/disabled modes | Manual route bypassed review by confirming legacy rows | The Manual route now uses only v2, preserves omitted fields and supports all classification fields. Trusted explicit edits auto-confirm only in automatic/hybrid; manual queues them; disabled applies metadata without learning. Real HTTP and Paperless tests cover all modes. Unknown external edits always require review. |
| Legacy compatibility and reversible examples | Legacy rows were invisible and could reactivate after v2 deletion | Legacy/current/outdated examples are visible and revocable. Data remains stored; suppression is honored by normal model reads, prompt retrieval and write protection. Real model/API/E2E tests verify revocation cannot resurrect duplicate legacy feedback. |
| Stale-event and metadata protection | Only the last stored snapshot was checked on approval | Approval reads live Paperless metadata and returns 409 for a stale correction; offline approval returns 503. Older revocation cannot remove a newer example. Outdated examples remain explicitly revocable while conserving metadata protection. Multi-field E2E verifies title, tags, type, correspondent and custom fields. |
| Shared relevant bounded context for OpenAI/Azure/Ollama | Shared builder present, type-only relevance incomplete | Resolve names before ranking, refresh missing IDs, fall back to confirmed title/content during vocabulary outages, quote data, fit complete records into 1,500 tokens. Unit tests cover type-only/budget behavior; all three real provider clients receive confirmed context despite custom prompts, using deterministic protocol fixtures. |
| Learning dashboard and configuration | Bare standalone page; no accessible history or older pages | Existing theme/navigation/login integration, counts, before/after names, provenance, paginated events/history, active/outdated/legacy examples, confirmation/rejection/revocation and live settings. Chromium exercises review/revoke/reject actions and settings, verifies responsive layout and theme persistence, and produces light/dark desktop/mobile screenshots. Mobile navigation width and unreadably narrow metadata columns found during visual inspection are corrected and regression-checked. |
| Authentication and authorization | Existing JWT/API-key middleware | Reused login/authentication, JWT-cookie and API-key tests, unauthenticated rejection, malformed/cross-host Origin rejection, request validation, account/API-key audit actors. Tokens are never stored in review history. |
| Existing RAG contract and compatibility | Python list/doc_id mapping added but untested | Contract tests resolve Python search results to Paperless metadata and verify graceful unavailable-search behavior. The optional full Python/model runtime is not executed; it is not needed by the learning engine. |
| CI, automated tests and documentation | CI green for d924021 | Workflow runs Node unit/API/migration tests, ESLint, Python setup safety tests, real Paperless scenarios and offline-edit restart detection. README, architecture, modes, migration, setup/reset, agent rules and validation record are updated. |
| Existing branch/PR and release boundary | Existing draft PR #1 | Continue only `feature/learning-engine-v2` and PR #1. Reviewable source and test evidence are delivered without merging or production deployment. |

## External settings action

The saved `paperless-ai` environment still reports repository ref `main`. This
coding task exposes environment inspection, but no configuration editor/publish
operation; plugin discovery did not supply that capability. The precise ref,
install command and startup instructions are provided in
[test-environment.md](test-environment.md#saved-codex-environment-settings). They
must be reviewed and applied through the environment editor to make the saved
template start directly on this development branch. No additional domains,
credentials or access grants are needed.

## Deliberate limits

- Default provider fixtures do not measure a real language model's accuracy. The
  optional `extended` profile adds a real local Ollama evaluation with ten synthetic
  held-out documents, a recorded model digest and separate completeness/type/language
  measurements. This is a small descriptive evaluation, not a quality guarantee or
  actual hosted OpenAI/Azure evaluation.
- The optional Python RAG/model service is contract-checked, not launched.
- Paperless provides no compare-and-set PATCH in this integration; an external
  writer can still race the final metadata write. Local write exclusion,
  revision guards and preflight comparisons reduce this risk without claiming
  server-side atomicity.
- The program volume is a disposable dependency cache paired with its compact
  image; it survives a data reset and is removed explicitly for a full rebuild.
