# Paperless-ngx / Learning Engine v2 technical assessment

Source check: 2026-11-11. Fork baseline: main `1e27411`, Paperless-ngx 3.4.2.
This assessment separates shipped behavior in that pinned version, later upstream
merges and proposals. PR #19 / SPEC #17 holds the experimental runtime evidence;
source inspection alone does not establish a passing integration.

## Native classification and APIs

Paperless-ngx has an existing learned metadata classifier, independent of the
optional newer LLM functions. `/api/documents/{id}/suggestions/` exposes native
metadata suggestions. Optional LLM suggestions use
`/api/documents/{id}/ai_suggestions/`; disabled AI returns HTTP 400. In 3.4.2 the
response contains title, existing/suggested tags, correspondents, document types,
storage paths and dates. It is not the fork's singular-field classification
schema and does not include custom-field values. Names/IDs and visibility rules
must be mapped explicitly; a suggestion is not a confirmed correction.

The [versioned views](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/src/documents/views.py)
show requester permissions, user/backend cache keys and field resolution.
Native chat and vector similarity use the configured generator/embedding backend;
configuration already supports local Ollama and OpenAI-compatible APIs. Provider
independence is therefore not unique to the fork. The fork's differentiated role
is correction history, explicit review/revocation, reusable confirmed context and
structured extraction across its providers.

Reuse native suggestions as an optional read-only candidate source, not a second
mandatory classifier or a new automatic learning source. Existing vocabulary
and review APIs can be reused. The monitor sees changes regardless of their
origin, but an unknown source must remain pending even in automatic/hybrid mode.
Native auto-writes and fork auto-writes require non-overlapping field ownership.

## Custom fields: available contract versus proposal

[Discussion #13996](https://github.com/paperless-ngx/paperless-ngx/discussions/13996)
requests configurable native prompts/per-field overrides and custom-field
population. It is discussion, not a released API. Its comments also distinguish
reusing existing taxonomy with the older classifier from LLM invention of names.

[PR #14340](https://github.com/paperless-ngx/paperless-ngx/pull/14340) is **closed,
not merged** at the source check. Its proposed field descriptions, `cf_<id>`
prompt keys, coercion, cache invalidation and workflow selection are not the
3.4.2 contract. Do not require or backport that provisional shape into the fork.
It is a useful future adapter design, not an integration dependency.

3.4.2 already provides `/api/custom_fields/` definitions and document
`custom_fields: [{field, value}]` updates. Reuse native IDs, data types, select
options and validation. The fork's merged #14 uses a shared typed update builder
for its automatic paths; missing/invalid automatic suggestions preserve existing
values, while manual clearing remains possible. See
[the qualified contract](custom-fields-contract.md) for coverage and limitations.
Not every native type/schema or extraction accuracy is qualified.

Keep the fork's extraction adapter useful now, but separate provider output,
field coercion and native transport. Future native custom-field proposals can
then replace candidate generation without changing learning storage. Do not
create a second field-definition database or promise native learning from each
individual field without additional provenance/granularity work.

## Workflows and structured values

The 3.4.2 [workflow documentation](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/docs/usage.md#workflows)
and API tests confirm `/api/workflows/` creation/update with nested triggers and
actions. Added, updated and scheduled triggers can use metadata/custom-field
filters. Scheduled dates can come from added/created/modified or a date custom
field, with offsets and recurrence. Jinja title templates can read custom-field
values, including fields assigned by the same action.

Extract invoice/contract numbers, due dates and amounts into native custom fields;
let ngx own title rules and downstream scheduling. Avoid building a parallel
workflow scheduler in the fork. The native AI action (type 8) can select title,
tags, correspondent, document type, storage path and created date, with missing
object/overwrite options. It executes asynchronously. #19 exercises real native
API workflows and the manual-PATCH provenance boundary; its evidence must be read per tested commit. The ancestor case reproduced false
confirmation and has a conservative response-provenance guard subject to the native
qualification tracked in #19; the asynchronous manual/workflow case passed without such a defect.

## OCR templates

[PR #14507](https://github.com/paperless-ngx/paperless-ngx/pull/14507) is **open,
not merged**. The proposal includes owned/matchable OCR templates, zone extraction
and bulk/manual application. It is not a stable 3.4.2 endpoint. Do not introduce a
runtime dependency or duplicate that template editor/engine. A future extraction
adapter can feed validated typed candidates into the same review pipeline once
a released API, permissions and output contract are established. Deterministic
extraction may be preferable for repetitive layouts, but this assessment does
not claim an OCR-template quality or runtime benchmark.

## Performance and change detection

[#14612](https://github.com/paperless-ngx/paperless-ngx/pull/14612) (adjacency-list
tags) and [#14597](https://github.com/paperless-ngx/paperless-ngx/pull/14597)
(selection-data query performance) are **merged upstream**. Neither merge is an
ancestor of v3.4.2: compare merge `8aa99a3` or `5357be2` against v3.4.2 returns
behind (21/23 commits respectively). 3.4.2 still has Tag inheriting TreeNodeModel.
Do not claim these improvements are in our pinned test image. Neither PR is a
change-feed API. Selection-data optimization retains response shape and concerns
aggregate filtering, not the fork's polling protocol.

The existing [document filter source](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/src/documents/filters.py)
already supports modified datetime comparisons and paginated document retrieval.
Use these to design an incremental metadata scan; do not request
`include_selection_data=true` for polling or repeatedly fetch every document's
content. A safe future L-sized SPEC needs checkpoint persistence, overlap for
clock/timestamp ties, stable ordering, pagination races, retries, deletion/
permission reconciliation, candidate stabilization and periodic full metadata
reconciliation. The current monitor still scans metadata and only requests
content for relevant changes. Incremental synchronization is not implemented.
Tag ancestor expansion must be tested on upgrades: an implied ancestor is not an
explicit human correction.

## Development decisions and additional tests

| Decision | Action / evidence needed |
| --- | --- |
| Reuse native metadata and field contracts | Keep shared typed writer; real API round trips and migration compatibility. |
| Native candidate integration | Optional, read-only first; cache/version/permission handling and no implicit confirmation. |
| Native/fork automatic writes | Assign one writer per field; overlap negative tests and unknown-source review. |
| Manual PATCH plus workflow | Compare requested, returned and freshly read metadata; prevent unrequested automatic confirmation. |
| Custom-field learning | Test each supported type, null vs missing, select ambiguity, workflow updates and review/revoke. Existing document-level examples do not provide complete per-field provenance. |
| Workflow execution | Delegate to ngx; test title custom fields and date-offset filters in a future explicitly scoped extension to #19. |
| OCR templates | Monitor released upstream API; no provisional dependency or duplicate editor. |
| Upgrade compatibility | Keep isolated PostgreSQL/Redis, synthetic corpus, API regressions, pinned ngx versions and baseline upgrade checks. Add tag-hierarchy/provenance coverage before adopting later versions. |
| Model quality | Existing #16 measurement is mixed, no reliable improvement. Separate model/retrieval experiments before production behavior changes. |

#18 separately implements publication-policy code/tests; its merge does not set
repository protections or authorize publication. #19 remains opt-in, with actual
runtime outcomes recorded separately. Do not mark the complete project finished
based on unit counts or an integration workflow alone.
