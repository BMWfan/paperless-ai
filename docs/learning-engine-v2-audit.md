# Existing branch audit (2026-10-31)

The branch already protects `learning_feedback` confirmed rows in the AI upsert,
and appends shared learning context after prompt overrides in all three providers.
These changes must be preserved. The original feedback table remains intact.

Remaining gaps found before implementation:

- `learningStore` creates tables without versioned migrations; review only changes
  event status and does not produce retrievable examples.
- `learningMonitor` limits each scan to the first 100 documents, starving later
  documents. It lacks stabilization, provenance history and self-write integration.
- `paperlessService.updateDocument` does not inform snapshot tracking and does not
  guard confirmed metadata from AI writes.
- `routes/learning` is not mounted and there is no Learning Dashboard.
- `buildLearningContext` takes recent examples without relevance scoring, excludes
  title/type-only corrections, and truncates serialized data mid-record.
- RAG `/search` metadata mapping needs validation against the Python contract;
  returned search text alone does not establish classification metadata.
- Existing upsert tests replicate SQL rather than exercising the model itself.
- `npm test` launches nodemon, not automated tests.

The isolated stack and initial integration test are provided first. End-to-end
learning retrieval, all review actions and provider parity are not established by
that initial smoke test and must be covered before claiming v2 complete.
