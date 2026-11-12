# Experimental field evidence

SPEC #20, following the integrated date-format fix in PR #22. This is a separate
diagnostic experiment, outside all production provider and writing paths.

## Contract fixed before measurement

`field-evidence-v1` compares proposals against explicit same-line label/value
pairs. The six fixed experimental fields use English/German labels: Invoice
number/Rechnungsnummer, Contract number/Vertragsnummer, Policy number/
Versicherungsnummer, Amount/Betrag, Due date/Fällig am, End date/Enddatum.
Labels must occupy the complete line prefix followed by a colon. Exactly one
occurrence of that field is required. Values must match after the existing typed
writer's normalization; IDs retain spelling and leading zeros. Amounts require
explicit EUR. Invalid dates, missing labels, conflicting/repeated labels and
unmatched values cause abstention. The diagnostic never supplies a replacement.

Recognized historical markers (historical, previous, earlier, old contract,
historisch, Altvertrag, vorherig, früher), Markdown quote lines and code fences
cause whole-document abstention. This deliberately sacrifices valid current
values in mixed current/historical documents rather than guessing section scope.
These markers are a finite lexical heuristic, not a semantic or security boundary.

The independent bilingual challenge file has 28 cases, fixed and checksummed
before implementing or measuring this diagnostic. It includes current values,
wrong field assignments, missing IDs, historical sections, conflicting labels,
substrings, quotations, instruction text and invalid types. Unmarked attachment
cases deliberately expose a limitation: a label in an attachment can look like
current-document evidence. Expected values are not passed into the diagnostic.
Do not remove these cases or tune rules on the confirmation answers.

## Measurement and interpretation

Replay the unchanged 420 archived model answers. Keep original raw scoring and
the existing source-presence diagnostic unchanged. Report correct present values
retained/lost, wrong proposals accepted/rejected, and absent values separately;
abstention is not successful extraction of a present field. Ground truth is used
only for scoring, never for choosing accepted values. Record revision, fixture
and report checksums and tested commit. No new model inference is implied.

This fixed six-field vocabulary is not compatible with arbitrary user-defined
field names, multilingual layouts or all document structures. No production
activation, provider response change, new default, migration or configuration
change is part of this experiment. A production proposal would need a separately
reviewed field-definition/evidence contract and qualification on new data.
Removing these diagnostic files rolls back the experiment without changing
stored metadata or learning records. Paperless-ngx stays unmodified.
