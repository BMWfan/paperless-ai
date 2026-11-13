# Review and save selected Custom Fields

Open `/manual`, choose a document and **Analyze with AI**. Each suggestion shows
its native field/type, current value, raw proposal, typed value and up to five
exact text excerpts. An occurrence is not proof of the right semantic field:
historical references, attachments and unrelated dates may contain the same
value. Every proposal's meaning remains unverified by the software.

Nothing is selected by default. Check the meaning and select only values you
want to apply, then choose **Save selected custom fields**. Invalid, unresolved,
duplicate and unsupported-type proposals cannot be selected. Missing or repeated
text occurrences remain visible warnings; they do not substitute for your review.
**Save Tags remains separate and does not save these Custom Fields.**

Before saving, the app re-reads the document and relevant native definitions
inside its existing local write exclusion. A changed snapshot, type or definition
returns409 and requires a fresh analysis. Only the selected values are normalized
and written; unselected values come from the fresh native document. A selected
invalid value aborts the batch rather than silently applying only other fields.
There is no implicit clearing from null/missing AI values. The existing explicit
manual clearing API remains available unchanged.

After success the preview refreshes with no selection. A network error after
sending may leave the outcome unknown: reload/check the current document before
another attempt. The app never automatically repeats a PATCH. Switching documents
invalidates the displayed selection/results, but cannot cancel a save already
sent for the original document. Late responses cannot populate another selection.

## Correct a proposal before saving

For a uniquely resolved supported field, **Correct this proposal** edits a draft.
The original **AI suggestion**, current native value, reviewed proposal and typed
value remain distinct. Invalid or missing original values can be corrected;
unresolved, ambiguous, duplicate and unsupported fields have no editor.

Any edit clears all selections and disables saving. Choose **Check edited values**
to re-read the native document/definitions, normalize the drafts and refresh their
text excerpts without writing or calling the model. Nothing is selected after
checking: review the updated values and their meaning, then explicitly select
and save. Empty input cannot clear a field. Dates use YYYY-MM-DD, booleans
true/false, selections an existing exact option label or ID; numeric zero and
false remain valid. Text matching and successful typing still do not establish
which invoice, contract or date the field belongs to.

Editors are disabled during checking/saving. A document switch or new analysis
invalidates pending check results. Failed checks clear the controls and require
a reload; they do not send a save. Saving corrected values uses the same existing
learning modes and actor as selecting the original proposal. In manual learning
mode the resulting learning event still needs its separate review.

## API contracts

Both routes require the existing JWT-cookie or API-key authentication and
same-origin JSON. They set `Cache-Control: no-store` and use only the configured
native endpoint. No field creation, new credentials, database table or queue.

`POST /manual/custom-field-preview` remains read-only and accepts:

```json
{"documentId":42,"content":"Invoice number: INV-007","suggestions":[{"field_name":"Invoice number","value":"INV-007"}]}
```

The submitted content must match current native text, capped at50000 characters
as in Manual analysis. At most50 suggestions; existing object/array provider
shapes are supported. Definitions are freshly resolved by native exact names.
The response retains `contentDigest`, `submittedTextDigest`, `modified`,
`searchScope: "submitted_text"`, `readOnly: true`, and rows with raw/current/typed
values, flags and bounded evidence. Excerpts are at most300 characters and five
per row; format conversion never fabricates a source quotation.

Additive `snapshotDigest` binds document-ID, full-content hash, native modified,
canonical monitored metadata/Custom Fields and relevant definitions (ID, name,
type, extra selection/currency data). `reviewFieldIds` lists those definitions;
rows add `canApply` and `canEdit`. `canEdit` requires a unique supported field
without duplicate proposals, but permits an invalid/missing proposal so it can be
corrected. Editing clients send drafts to the same read-only preview route; no
new endpoint or signed model-output contract is introduced. Old preview clients can ignore these properties and remain
read-only. The digest is an optimistic precondition, not a signed model output,
proof of a human click, new access grant or global lock. Existing authenticated
manual-input trust rules still apply.

`POST /manual/custom-field-apply` accepts:

```json
{"documentId":42,"snapshotDigest":"<64 lowercase hexadecimal characters>","reviewFieldIds":[7,8],"fields":[{"field":7,"value":"INV-007"}]}
```

Copy the full `reviewFieldIds` from the preview, even if selecting only a subset.
It lets the server reconstruct the relevant-definition snapshot. Require1–50
unique existing IDs/values, all inside that list. Supported selected types:
string, longtext, integer, float, boolean, select, date and monetary. Null,
missing, duplicate or invalid values are rejected; new unsupported native types
remain preserved when unselected. No client-provided list of unselected values
is trusted. A successful response contains the current `document` and
`requestedFieldIds`; native workflows can still transform the resulting state,
so inspect the refreshed values rather than treating this as semantic verification.

Errors:400 invalid input/type/selection,409 stale state or concurrent local write,
502 backend/verification failure. `outcome: "not_written"` means no native PATCH
was attempted; `"unknown"` means a write attempt may have applied and must be
checked. Browser transport loss is always treated conservatively as unknown.
The apply handler does not automatically retry or rerun the model. Like the
existing Manual update route, a verified save marks the document processed so
later scan starts skip it. A failure recording that marker after the native save
is reported as unknown, never as not-written. The existing Manual API contract
is unchanged. This marker does not cancel classification already in progress;
existing confirmed-metadata protection and learning modes still apply.

## Learning, concurrency and limits

Explicit saves use the existing manual writer and actor. Manual learning mode
queues actual changes for review; automatic/hybrid retain their existing rules
for explicitly confirmed manual changes; disabled mode does not learn. Native
workflow/hierarchy changes outside the expected PATCH result remain unknown and
require review. A source match or typing success never activates an example by
itself; learning-event review and proposal saving are separate actions.

The guard runs inside existing per-document write exclusion and reads again
after definition validation. It prevents detected stale saves and competing local
updates. **Paperless-ngx has no compare-and-set PATCH here:** an external writer
can still race the final GET→PATCH, including unselected-field changes. There is
no global atomicity or absolute loss-prevention guarantee. Native definition
changes can also race their validation; failures must be refreshed, never retried
blindly. This is controlled editing, not improved automatic model accuracy.

Document text, field names and values use DOM text nodes. Manual initializes its
own theme/navigation, without the dashboard's absent chart/modal state. Selection
generations, disabled save controls and client-side consumed receipts prevent stale UI
responses, double submission and automatic replay after uncertain outcomes.
The stateless server digest is not a one-use nonce; it rejects changed state,
not every possible repetition of an identical unchanged state.

## Validation and rollback

SPEC #20, following merged PR23/24/25/27. The correction-editor M-plan is
[recorded in SPEC20](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6867699704). Tests cover canonical snapshots, typing and
definition changes, all learning modes, stale/invalid batches, local exclusion,
unknown native provenance, authentication/origin, unselected values, uncertain
responses, real ngx3.4.2 API/workflow behavior and browser selection/races/HTML/
mobile behavior. Use only the [isolated test environment](test-environment.md).
Provider fixtures establish behavior, not model accuracy or OCR/PDF quality.

No migration, default/model/provider change or new provenance schema. Revert the
editor/UI and additive `canEdit` property to return to selection-only review.
Reverting the earlier selection/apply/optional-guard additions returns to read-only
previews; existing
stored metadata and learning history are not undone. Publishing and deployment
remain separately authorized actions.
