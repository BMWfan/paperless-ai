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
