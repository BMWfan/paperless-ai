# Section evidence diagnostic — not qualified

SPEC #20, after merged PR #25. This experiment stays in `tests/quality`; no
provider, writer, Manual UI, model or configuration imports it. The approved
M-plan tests explicit section ownership as a hypothesis, not a production fix.

## Frozen inputs and contract

Contract and40 cases were frozen before candidate implementation/evaluation at
`b15c8c5` (initial freeze `99b8676`). See the executable
[contract](../tests/quality/section-evidence/contract.md) and
[manifest](../tests/quality/section-evidence/manifest.json). Each split has20
focused single-field cases:10 positives/10 negatives, balanced EN/DE. Development
uses synthetic utility frames; confirmation uses transport frames, alternate
capitalization/spacing and different identifiers. Family IDs/content/expected
identifiers are checked for split leakage. They share the explicit heading
convention and were hand-authored by the same implementing agent; these are not
independently sampled or blinded production documents. Positive targets cover
three identifier fields, amounts and due dates; no new positive end-date cohort
is claimed (end-date behavior has a separate focused regression).

The candidate requires exactly one complete bracket heading `[Current document]`
or `[Aktuelles Dokument]`, case-insensitive. Any bracket heading terminates the
preceding section. In the current section it reuses the unchanged label/type
matcher from [field-evidence-v1](field-evidence.md), retaining original line
positions. No replacement values are generated. Scoring annotations, ground
truth, family/IDs/language are never supplied to the candidate. Unmarked
attachments deliberately remain adversarial failures rather than hidden hints.

## Observed result

| Dataset | Gate | Correct proposals retained | Correct proposals lost | Wrong accepted |
| --- | --- | ---: | ---: | ---: |
| New development | Existing label gate | 4/10 | 6 | 2 |
| New development | Section candidate | 10/10 | 0 | 2 |
| New confirmation | Existing label gate | 4/10 | 6 | 2 |
| New confirmation | Section candidate | 10/10 | 0 | 2 |
| Original28 challenges | Existing label gate | 12/14 | 2 | 2 |
| Original28 challenges | Section candidate | 0/14 | 14 | 0 |
| Original420 archived answers | Existing label gate | 136/375 | 239 | 0 |
| Original420 archived answers | Section candidate | 0/375 | 375 | 0 |

Both new splits reject8 of10 incorrect proposals; the two accepted wrong values
are the EN/DE unmarked-attachment identifiers. These false positives are in absent
target fields. The old challenges/corpus lack the required current heading, so
the candidate abstains completely. Its zero wrong acceptances there are coverage
collapse, not improved extraction. The420 answers span models/seeds/reference
arms; they are repeated predictions, not420 distinct documents. Their original
answers, scoring, manifests and28 challenges remain unchanged.

**The frozen confirmation gate fails:**2 wrong acceptances exceed the allowed0,
despite10/10 positive retention (minimum8/10). No later production qualification
is proposed on this result. Explicit section boundaries recover some useful
values in this artificial grammar but do not establish semantic document
ownership. Do not infer provider/model accuracy, OCR/PDF reliability, arbitrary
native-field compatibility or generalization to user documents. No new model
inference or native API roundtrip is part of this diagnostic.

## Reproduce and verify

From repository root, using Node22 and the existing development dependencies:

```sh
node --test tests/section-evidence.test.js
GITHUB_SHA=$(git rev-parse HEAD) node tests/quality/section-evidence/report.js section-evidence-report.json
sha256sum section-evidence-report.json
```

For an uncommitted checkout, omit `GITHUB_SHA` (report commit is null) rather than
attributing working changes to an older commit. Source digests still identify
executable inputs. The report records input/source hashes, original source run,
freeze revision, per-field/split/language/model counters, rejection reasons and
case evidence. Language subgroups repeat their aggregate counts; sum either the
parent groups or children, never both. A report hash is computed externally to
avoid self-referential hashes. The root suite also runs the full deterministic
replay; no workflow changes, model downloads, credentials or network needed.
Local Node22 cached-runtime evidence and clean CI builds are recorded separately
in the PR with exact head/logs; previous verification is not current-head proof.

Tests validate frozen data/leakage, boundaries/line numbers, ambiguity, date roles,
explicit ownership failures, immutable420-answer/28-case replay and separate
coverage/false-positive counters. A green regression suite confirms these
reported failures remain visible; it does not qualify the gate.

## Compatibility and rollback

No production behavior, database/migration, native ngx or workflow changes.
Remove this diagnostic directory/root test and documentation links to roll back;
stored metadata and learning history are untouched. SPEC #20/#12 stay open.
Any new inference contract, learned ownership model or production integration
requires a fresh plan/qualification; do not tune this frozen confirmation set.
