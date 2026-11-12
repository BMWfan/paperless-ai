# Automatic custom-field suggestions

The scheduled scan, Scan Now and the processing queue resolve provider field
names against existing Paperless-ngx definitions before constructing a document
update. Existing provider response shapes and app configuration remain valid.

- Integer, float and boolean values retain their types. String and long-text
  suggestions remain text, with the Paperless string length limit applied.
- Select suggestions may use an option ID or an unambiguous exact label.
- Monetary suggestions accept plain nonnegative decimals or an explicit
  three-letter currency code before or after the amount, with optional whitespace
  (`EUR 42.5` and `42,50 EUR` become `EUR42.50`). A single decimal point or comma
  with at most two fractional digits is accepted. Grouped/ambiguous separators,
  currency symbols and two currency codes are ignored. Currency-free legacy values
  remain currency-free; no currency is guessed from a symbol or added implicitly.
- Missing, null and invalid automatic suggestions leave existing values
  unchanged. Explicit clearing stays in the authenticated manual update path.
  Confirmed corrections remain protected by the existing learning engine.

Run the Node regression tests and the isolated Paperless E2E suite. The real
scan test uses a deterministic provider and Paperless-ngx 3.4.2 to verify typed
round-trips, explicit clearing and preservation of unrelated fields. It does
not measure provider accuracy. The implementation needs no data or configuration
migration. Reverting the change restores the previous suggestion parser and
does not roll back metadata already stored in Paperless-ngx.

The integration fixture reuses its named synthetic field definitions after
checking their types, so the scan scenario can run again without deleting test
data. A changed fixture type or ambiguous select label fails explicitly; tests
do not rewrite field definitions to make them pass.

For the compact Cloud path, the helper releases only cache records created by
its own build before exporting the final image. This frees intermediate compiler
stages before `vfs` copies the export container. Pre-existing cache, tagged final
image layers, database/document volumes and the managed storage driver remain
untouched. The setup safety test checks both the selected cache IDs and ordering.

The format extension was derived from actual synthetic model answers in SPEC #20.
The [quality protocol](learning-quality.md) keeps raw strict-format errors separate
from native typed normalization. Accepting a format does not prove the amount is
correct for the current document or prevent copied values by itself.

This is format validation, not a source-currency check: `USD42.50` is a valid
format even if the document says EUR. Semantic correctness still requires
provider evidence/review; the format parser does not establish it.
