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

## Reproduce

From the repository root, using Node22:

```sh
node --test tests/quality.test.js
GITHUB_SHA=$(git rev-parse HEAD) node tests/quality/evidence-report.js field-evidence-report.json
```

The report verifies the challenge and archived-answer hashes. It contains the
six-field counters for every model/seed/split/reference arm, rejection reasons,
and challenge evidence with one-based line numbers. `inputCorrect` counts present
values correct after the current typed normalization, not the original strict
raw-format model score. `correctLost` is a correct input proposal rejected by
the gate; `missingAfter` also includes already missing inputs. `wrongRejected`
counts incorrect proposals withheld, including populated absent fields and
invalid types, separately from lost correct proposals. `absentAfter` counts
empty absent fields, not successful extraction. Repeated cases/arms are not
distinct documents. Commit metadata identifies the caller's checkout; CI uses
its actual PR checkout and the PR links the exact reviewed head.

The existing root regression suite executes this measurement automatically.
No new workflow, network access or model inference is required. The report is
synthetic diagnostic evidence; it does not establish a native API roundtrip
for a new production integration because no such integration is enabled.

## Initial outcome

Contract/challenges were frozen at `72b78c3` before implementing the gate or
inspecting its results. Across all420 stored answers and six fields,540 present
field instances contain375 correct typed proposals:136 are retained and239
are lost;542 wrong proposals are rejected. No incorrect proposal is accepted in
this small original corpus. This is not sufficient for promotion: its
confirmation documents with current IDs also contain historical references,
and whole-document abstention rejects every one of those correct identifiers.

Current-reference arm, identifiers only (invoice/contract/policy combined):

| Model | Split / seed | Present | Correct input | Retained | Lost |
| --- | --- | ---: | ---: | ---: | ---: |
| 0.5B | Evaluation /42 | 12 | 10 | 5 | 5 |
| 1.5B | Evaluation /42 | 12 | 12 | 6 | 6 |
| 0.5B | Confirmation /42 | 6 | 6 | 0 | 6 |
| 0.5B | Confirmation /43 | 6 | 6 | 0 | 6 |
| 1.5B | Confirmation /42 | 6 | 6 | 0 | 6 |
| 1.5B | Confirmation /43 | 6 | 6 | 0 | 6 |

The28 additional bilingual challenge cases retain12 of14 correct present
proposals, lose the two correct current IDs in mixed historical documents, and
still accept two incorrect attachment IDs. These failures remain explicit
regressions against overstated safety claims, not cases excluded from reporting.
The original raw predictions/scores and ground truth remain unchanged.

Decision: **do not promote this gate**. Mere label adjacency adds useful
diagnostic information but does not resolve document/section ownership. A next
candidate needs section-scoped or reviewable evidence and a newly frozen
qualification set; it must not silently tune this gate to the existing
confirmation answers. SPEC #20 and EPIC #12 remain open.

## Subsequent section experiment

The separate [section-evidence diagnostic](section-evidence.md) reuses this gate
unchanged within explicit current-section headings. Its newly frozen40 cases
recover positive values but still accept two wrong attachment identifiers on
confirmation. Without headings, old-data coverage collapses. Neither experiment
is promoted; the old predictions/challenges remain immutable.
