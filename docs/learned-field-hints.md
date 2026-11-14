# Learned identifier-label suggestions

SPEC20 [approved M-plan](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6873839574).
Baseline c2e7a77; this feature does not change automatic classification or its
existing learning context. No model/provider/prompt/default, schema, native ngx,
workflow or release change. It is not an OCR template editor.

## Use

In Manual select a document and **Find learned field suggestions**. This requires
no AI analysis or provider connection. Suggestions show **Original learned
suggestion**, current native value, editable draft, typed value, current source
excerpts and source document/event IDs. A historical attachment may contain the
same label; meaning always remains unverified. Nothing is selected by default.
Review, optionally correct and **Check edited values**, then select and save
using the existing [Manual contract](custom-field-preview.md). Save Tags remains
separate. Saving and learning-event confirmation remain separate in manual mode.

Example: a confirmed correction with `Invoice reference: TRAIN-001` can yield
the label `Invoice reference:`. On a different matching document containing
`Invoice reference: NEW-0007`, only `NEW-0007` is proposed. A missing current label
never falls back to TRAIN-001. This does not prove that a unique matching line is
the current document's own identifier.

## Eligibility and boundaries

- Read at most500 active v2 examples joined to their confirmed event and current
  metadata snapshot. Only fields actually changed in that event qualify, with
  the same nonempty trimmed string in the example. Title-only confirmation does
  not turn unchanged fields into explicit field corrections. Pending, rejected,
  revoked, stale and legacy examples do not supply labels.
- Both native correspondent and document-type IDs must be positive and match;
  exclude the target itself. Missing native scope means abstention, not a model
  query. `mode: disabled` returns no hints; `enabled` still only controls scans.
- The bounded stored event text is at most2000 characters. Learn only a unique
  complete line of the form `Label: value` or `Label = value`. Labels are literal,
  NFC-normalized, case-sensitive, at most80 characters and contain at least3
  letters, no digits or instance value. Spaces and common punctuation are
  allowed; no arbitrary executable regular expression is accepted.
- Current text is the exact native prefix capped at50000 characters. Conservatively
  discard the last line when either text reaches its cap, even if its true end
  might coincide with the cap. No extraction from a possibly truncated line.
- Only freshly resolved, uniquely named native string fields qualify. Missing,
  deleted, renamed/retargeted, ambiguous or differently typed definitions cannot
  be silently retargeted. Existing string normalization enforces128 Unicode code
  points. The initial document and relevant-definition snapshot must still match
  after native resolution.
- Up to50 candidate fields, at most3 source-event references per label/candidate.
  Multiple current matches or conflicting candidate lines cause abstention for
  that field. Repeated identical patterns are combined. No native full-document
  synchronization and no pattern cache/table are introduced. Revocation or
  staleness affects the next request's source query; an already displayed draft
  is still explicit human input and is not remotely erased.

Labels are derived on demand; the old confirmed value is used only to locate
the training label, never as a fallback for a new document. Only current captures,
labels and bounded source IDs leave this service. Existing native current values
remain visible under the ordinary Manual contract. Actual confirmed examples and
history remain in the existing learning store.

## API and frontend

`POST /manual/learned-field-preview` uses JWT-cookie/API-key authentication,
same-origin JSON and `Cache-Control: no-store`:

```json
{"documentId":42,"content":"Invoice reference: NEW-0007"}
```

It reads current native metadata and definitions, reads eligible local events and
returns the existing preview/snapshot/rows contract plus `suggestionSource:
"learned_pattern"`, `ambiguousPatterns`, an empty-result explanation, and per-row
`origin: {kind, fieldId, label, line, sources: [{documentId,eventId}]}`. It never
calls a model, creates definitions, confirms events or writes native metadata.
Errors:400 invalid/bounded input,409 changed text/document/definition,502 backend
failure with no raw backend error. Disabled mode returns a successful empty view.

Editing reuses `/manual/custom-field-preview`; the UI retains the original
learned source and value separately. Source labels are informational, never an
access grant or trusted provenance for learning. Saving uses the unchanged
`/manual/custom-field-apply` route, with fresh snapshot guards, actor, learning
modes and conservative unknown workflow handling. No inferred value is ever
applied just because it matched. A changed field ID/type remains blocked after
rechecking. Existing external GET→PATCH race limits still apply.

Choosing another document, starting a new analysis or finding hints invalidates
pending field UI results. Analysis and hint buttons mutually disable while their
request is active. Failed lookups clear save controls. Edits still require a
read-only check, new explicit selection, and no retry after an unknown save.
All labels, source IDs and captured text use text nodes.

## Frozen diagnostic and tests

Data/contract committed before matcher code at df77426.24 synthetic cases,12 per
published development/confirmation split, each balanced EN/DE with6 positive and
6 negative cases. This is not a blind or independent real-world corpus.

```sh
node tests/quality/field-hints/report.js
# Full verification: docs/test-environment.md and unchanged learning-e2e workflow
```

[Archived deterministic results](../tests/quality/field-hints/results.json) and
[contract](../tests/quality/field-hints/CONTRACT.md) report each split:

| Measurement | Development | Confirmation |
| --- | ---: | ---: |
| Correct positive suggestions |6/6|6/6|
| Negative cases receiving a wrong suggestion |2/6|2/6|
| Abstentions |4/12|4/12|
| Historical-role errors |2|2|

Thus the literal matcher is **not semantically qualified for automatic use**.
The historical cases stay in the dataset and result; they are not skipped or
scored as success. No model runs or old reports are changed. Runtime tests cover
source lifecycle/actual field changes, limits, native definition races, literal
and Unicode labels, metamorphic identifier substitution, read-only authentication,
real correction→review→new-document→hint→explicit-save→revoke behavior, browser
source retention/editing/races/mobile and the existing regressions. Exact tested
SHA, execution results and separate own review are recorded in the PR; fixture
checks do not establish production/OCR/PDF accuracy.

## Rollback

Remove the new read-only route/service, optional store query, Manual button and
origin display additions. Existing field editor, native values, events, confirmed
examples and migrations remain intact. No data migration or cleanup is needed.
Owner merge, publication and deployment remain separately authorized actions.
