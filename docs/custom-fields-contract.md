# Automatic custom-field suggestions

The scheduled scan, Scan Now and the processing queue resolve provider field
names against existing Paperless-ngx definitions before constructing a document
update. Existing provider response shapes and app configuration remain valid.

- Integer, float and boolean values retain their types. String and long-text
  suggestions remain text, with the Paperless string length limit applied.
- Select suggestions may use an option ID or an unambiguous exact label.
- Monetary suggestions accept plain nonnegative decimals or an explicit
  three-letter currency code. A single decimal point or comma with at most two
  fractional digits is accepted. Grouped or ambiguous amounts are ignored.
- Missing, null and invalid automatic suggestions leave existing values
  unchanged. Explicit clearing stays in the authenticated manual update path.
  Confirmed corrections remain protected by the existing learning engine.

Run the Node regression tests and the isolated Paperless E2E suite. The real
scan test uses a deterministic provider and Paperless-ngx 3.4.2 to verify typed
round-trips, explicit clearing and preservation of unrelated fields. It does
not measure provider accuracy. The implementation needs no data or configuration
migration. Reverting the change restores the previous suggestion parser and
does not roll back metadata already stored in Paperless-ngx.
