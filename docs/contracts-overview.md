# Private contract metadata overview — SPEC #44

Open **Contracts → Configure mappings** in an authenticated browser session. Select the native document types representing contracts and optionally map contract number, party, start date, end date and cancellation date. Number/party accept `string` or `longtext`; dates require native `date` fields. Each role must use a distinct field. Save only changes Paperless-AI's local configuration.

This is a private archive overview, not a legal retention or cancellation calculator. Dates are existing native values, not computed advice. Existing metadata has unknown authorship: it is not automatically considered a human confirmation or learning evidence. No extraction, model request, document PATCH, learning write, notification or calendar event is triggered. When the existing calendar feature is enabled, its page is linked without creating events.

## Data and API contract

All endpoints require a browser session; an API key is insufficient:

- `GET /api/contracts/settings`: current local mapping, visible native document types/custom-field definitions, and a SHA-256 definition snapshot.
- `PUT /api/contracts/settings`: `{snapshotDigest, documentTypeIds, fields: {number, party, start, end, cancelBy}}`; field values are positive native IDs or null. Missing fields default to null. A stale definition snapshot returns 409. Invalid/duplicate role assignments return 400; cross-origin changes return 403.
- `GET /api/contracts?page=1`: one native-filtered page of at most 25 documents, ordered by ID. Projection contains only ID, title, document type and custom fields. There is no content fetch, per-document request or full archive synchronization.

The optional `contracts` configuration defaults to no selected types and no mapped fields. Disabled list requests do not access Paperless-ngx. Native IDs, names, field types and the Paperless source URL are saved as a mapping snapshot. Changing the source or document-type definition disables the overview until mappings are saved again. Changed/deleted field definitions, duplicate assignments and invalid values are displayed as unknown; absent values and unmapped roles remain distinct. Text is rendered as text and capped at 1,000 characters with an explicit truncation label; open the source for the complete value. Dates use the shared native-field validator, including leap-day validation.

Only metadata visible to the configured Paperless connection is included. Native permission restrictions still apply. Metadata fetch failures are errors, not a zero-contract count. Connection/mapping changes during a read return 409 rather than combining different configurations. Pagination reflects live native data and is not an archive snapshot.

## Migration, disabling and rollback

No database migration or model/provider change is required. Older configuration files receive disabled defaults. Save an empty document-type selection to disable the feature and clear mappings; the API supports this even while native metadata is unavailable. Back up the configuration before any upgrade and restore that backup when rolling back, following the existing upgrade runbook. No native values need undoing because this feature writes none.

## Verification

`test/integration/contracts.test.ts` covers session-only access, disabled/no-call behavior, native pagination/projection, persistence, invalid/missing/duplicate values, stale definitions, source changes, cross-origin rejection and native failures. `e2e/app.spec.ts` configures mappings in the browser and checks literal markup rendering. `tests/v4/native.mjs` creates synthetic native contract metadata, verifies filtering and typed values against unchanged official Paperless-ngx, and checks persistence after application restart. These are fixture/compatibility checks, not measurements of model extraction accuracy.

Run with Node 22: `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `npm run build`, `npm run test:e2e`. For the isolated official-ngx matrix and storage precautions, follow [test-environment.md](test-environment.md). Never use production documents or credentials. Exact commit/check evidence belongs in the draft PR; no historical report is rewritten for this change.
