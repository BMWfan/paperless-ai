# Learning Engine v2

## Reviewed Custom-Field saves

The [Manual field-review contract](custom-field-preview.md) adds explicit
selection and snapshot/type validation before native writes. Its optional guard
runs inside the existing writer exclusion, preserving unselected current values
and the current provenance/learning modes. It introduces no migration or separate
proposal database. A selected save is distinct from reviewing a stored learning
event, and neither a text match nor an AI confidence claim confirms a field.
External native writes can still race the final PATCH; no server-side
compare-and-set or global atomicity is claimed.

## Goals

- Automatically detect metadata corrections in Paperless-ngx, with optional confirmation.
- Preserve confirmed user corrections across repeated AI classifications.
- Provide a review dashboard for pending, confirmed and rejected learning examples.
- Use one provider-independent learning context for OpenAI, Azure and Ollama.
- Preserve existing installation data and behavior through safe migrations.

## Implementation phases

1. Audit current `learning_feedback` writes and protect confirmed feedback from automated overwrites; add regression tests.
2. Introduce versioned SQLite migrations, metadata snapshots, append-only change events and learning examples.
3. Build safe change detection, excluding known self-writes and requiring review when provenance is unknown.
4. Build retrieval with relevance scoring and a prompt token budget, shared by all AI providers.
5. Add authenticated learning API, dashboard, review actions and settings.
6. Evaluate integration on held-out synthetic documents; never seed evaluation documents as learning examples.

## Safety invariants

- Never treat all external metadata changes as confirmed human corrections.
- Never overwrite confirmed feedback with unreviewed AI output.
- Make automatic learning configurable and reversible.
- Compare tag IDs as sets and normalize typed custom fields.
- Limit retained document content and redact sensitive values from logs.
- Do not modify `main` until reviewed and tested.

## Existing code to revisit

- `models/document.js`: `saveLearningFeedback`, `markLearningFeedbackCorrected`, `getLearningExamples`.
- `services/serviceUtils.js`: `buildLearningContext`, `recordClassification`.
- `services/ragService.js`: `/search` response contract.
- `services/openaiService.js`, `services/azureService.js`, Ollama provider: shared context injection.
- `routes/setup.js`: manual classification feedback.

## Version 2 runtime

The additive `learning_migrations` version 2 migration preserves legacy
`learning_feedback`. New snapshots, candidate changes, immutable event payloads,
review history, prediction history and confirmed examples are separate tables.
Only confirmed examples are retrieved. Deleting an example removes its influence
and write protection but retains its audit event. Stale pending corrections cannot
replace a newer snapshot. Unknown external changes always require review in all
modes because the Paperless API does not establish human provenance.

Open `/learning` from the dashboard using the existing authenticated session.
Enable detection, choose manual/automatic/hybrid (default), configure polling and
stabilization, filter events and confirm/reject/delete them. Disabled mode turns
off retrieval and scheduled detection. Automatic/hybrid accept only explicit
in-app corrections; arbitrary API changes never qualify as trusted input.

Polling fetches every page with all classification fields and does not inherit
classification tag filters. Candidate stabilization and snapshots survive restart.
Overlapping scans are skipped. A failed scan is retried on the next interval.
Self-writes are recorded only after successful API responses, with an in-process
write guard and preflight metadata comparison. Confirmed documents keep their
current metadata during automated classification until the example is revoked or
an operator explicitly edits the document. Paperless has no atomic compare-and-set
in this integration: an external writer can still race the final PATCH; this is a
known remaining limitation.

The common context selector ranks confirmed examples by lexical overlap, supports
title/type-only feedback, quotes data as untrusted JSON, and fits complete records
within a 1500-token cl100k budget. This is a retrieval heuristic, not a measure of
real model accuracy. All three providers call the shared builder after prompt
overrides. Legacy confirmed feedback remains available. RAG search now accepts
the Python list/doc_id contract and resolves classification metadata via Paperless.

See [test-environment.md](test-environment.md) for the persistent isolated stack.

## Migration, trust and review lifecycle

Migration 3 adds snapshot revisions, authenticated review actors and persistent
legacy suppression records without deleting old feedback. Databases predating
the legacy unique index retain their confirmed row in preference to newer AI
predictions; duplicate payloads are atomically preserved in
`learning_feedback_archive` before the index is created. Reopening migrations is
idempotent. Revoked feedback remains available for an explicit historical read
with `documentModel.getLearningExamples(limit, true)`, but normal retrieval and
metadata protection exclude it.

The existing Manual update route uses the same v2 path and accepts partial edits,
document type, correspondent, tags and custom fields. Omitted fields are preserved;
the route never also marks a legacy row as confirmed. Manual mode queues these
edits; automatic/hybrid modes accept their authenticated provenance; disabled mode
applies the edit without creating learning events. `LEARNING_MONITOR_ENABLED=true`
is an initial database default only; saved UI settings subsequently take precedence.

The dashboard uses the existing navigation/theme and login flow. It exposes
counts, paginated events and review history, metadata names, before/after values,
current examples, outdated protected examples and legacy examples. An outdated
example is excluded from prompt retrieval but keeps conservative metadata
protection until explicitly revoked. Deleting an older event does not revoke a
newer example for the same document. A v2-managed or revoked legacy row never
silently reactivates afterward.

## Detection and retrieval details

Polling initially fetches only metadata; content is fetched for changed documents
and only a 2,000-character preview is retained. Snapshot revisions captured before
an API scan are checked atomically when observations are stored, so a self-write
completed during the fetch cannot become a false external correction. Before
confirming an event, the API refreshes its document from Paperless and rejects
stale approval with HTTP 409. An outage prevents approval with HTTP 503;
rejection/revocation remain available. Settings reschedule the monitor immediately,
and failures are visible in the dashboard and retried on the next interval.

Authenticated `/api/learning` additions include `/summary`, `/history`
(`documentId`, `offset`, `limit`), `/vocabulary`, paginated `/events`, `/examples`
(including legacy/outdated records), and `POST /legacy/:id/revoke`. Reviews record
the authenticated account ID or API-key actor, never a token. POST requests require
JSON and reject malformed or cross-host Origin headers.

Vocabulary names are resolved before relevance ranking, including type-only
feedback. Missing new IDs trigger a fresh vocabulary fetch. During a vocabulary
outage classification can still use confirmed title/content patterns. The shared
builder never falls back to unconfirmed predictions. The optional Python RAG
runtime and real-model quality still require separate evaluation; deterministic
provider fixtures establish integration correctness only.

## PATCH response provenance

A manual request proves intent for its expected normalized metadata state.
Paperless-ngx can add ancestor tags or apply workflow changes. The writer compares
the PATCH response with its final pre-write document plus actual payload. When
monitored metadata differs unexpectedly, it records unknown provenance and leaves
the change pending review instead of auto-confirming it or hiding it as a
self-write. Exact matching writes keep existing learning-mode behavior. API writes
still succeed; no migration is required. Normalization/implicit changes can cause
additional document-level review. See [the native experiment](native-ai-coexistence.md)
for evidence, monitored fields, asynchronous behavior and remaining race limits.
