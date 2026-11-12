# Custom field suggestions in Manual Processing

Open `/manual`, select a document and choose **Analyze with AI**. The Custom field
suggestions section shows the native field name/type, its current value, the AI
proposal and the value after the shared typed conversion. Text excerpts show up
to five exact occurrences in the submitted document text. Missing fields,
invalid types, repeated proposals and absent/multiple occurrences are labelled.

This is a preview. **Save Tags does not save these custom field values.** There
is no new approval button or automatic extraction policy. Existing automatic
processing and learning settings keep their previous behavior. Analysis may
record its existing unconfirmed prediction; the added preview endpoint only
reads native documents and field definitions and never calls a writer or learner.

An occurrence is not proof of the right semantic field. A historical reference,
attachment, instruction or unrelated date may contain the same value. Every
proposal remains unverified, even when a single occurrence is found. A converted
currency/date format may have no exact text match; the preview does not invent
a quotation or discard that proposal. Full-text absence is not inferred when
only a prefix was submitted to analysis.

## API contract

Authenticated same-origin JSON `POST /manual/custom-field-preview` accepts:

```json
{"documentId":42,"content":"Invoice number: INV-007","suggestions":[{"field_name":"Invoice number","value":"INV-007"}]}
```

`content` must match the current native document text, capped at50000 characters
as in the existing Manual analysis screen. There are at most50 suggestions.
The provider response's existing object or array shape is supported; provider
prompts and response schemas are unchanged. Definitions are freshly looked up
using native case-insensitive exact names; ambiguous names remain unresolved.

The response includes `documentId`, full and submitted text SHA256 digests,
native `modified`, `searchScope: "submitted_text"`, `readOnly: true` and rows with
`fieldId`, `name`, `type`, `currentValue`, `proposedValue`, `normalizedValue`,
warning `flags`, bounded `evidence` excerpts/count and
`semanticStatus: "unverified"`. The full-content hash binds only the snapshot
read at preview time; it is not a lock, trust score or future write authorization.
No server-side approval/proposal persistence is introduced.

Invalid input returns400; changed native text409 (reload and analyze again);
native document/definition failures502. Authentication follows the existing JWT
or API-key middleware and origin/JSON rules. Responses use `Cache-Control:
no-store`. Document text, field names and provider values are rendered with DOM
text nodes. Excerpts are at most300 characters, at most five per suggestion.

Changing the selected document clears suggestions immediately. Selection and
analysis responses carry a local generation check so late results cannot populate
another document. Analyze/save controls stay disabled while selection loads.
The Manual page initializes its own theme and navigation without loading the
dashboard chart/modal initializer, whose required dashboard data is absent here.
Theme selection remains persistent; this also removes an existing startup error.

## Validation and compatibility

SPEC #20 follows the measured failure of label-only evidence in PR #23. This
feature does not import that experiment or promote it to production. Tests cover
typed/native read-only behavior, stale text, ambiguous/unknown fields, authentication,
origin/input limits, historical occurrences, bounded excerpts, literal HTML,
selection races and responsive rendering with synthetic documents. Use the
[isolated environment](test-environment.md); never test against production.

No database or configuration migration is needed. Reverting this feature removes
the additional preview endpoint/section, without changing native metadata,
learning records or the existing manual update contract. Future confirmed
extraction writes require a separate design with conflict checks and explicit
human review; this preview does not supply those guarantees.
