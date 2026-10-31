# Learning Engine v2

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
6. Evaluate on a held-out, anonymized document set; never use evaluation documents as learning examples.

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
