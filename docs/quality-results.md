# Quality pilot results

SPEC #20 / PR #21. Pilot head `6bd833b`; actual PR checkout `11e96d62ef90ef477b8bda1b640468dbc57c7886`.
[Complete real-model run](https://github.com/BMWfan/paperless-ai/actions/runs/43118154733), Ollama 0.12.6, seed 42 evaluation (30 cases) and seeds42/43 confirmation (20 cases each).
These are results of consistent-taxonomy-v1, not directly comparable to the historical ten-document production-prompt experiment.

## Raw evaluation, seed 42

| Model | References | Type /30 | Tags /30 | Full sender /30 | Language /30 | Present amounts correct /18 | Copied training values* |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen2.5:0.5b | none | 30 | 29 | 2 | 28 | 0 | 0 |
| qwen2.5:0.5b | current | 26 | 29 | 0 | 27 | 0 | 8 |
| qwen2.5:0.5b | selective | 30 | 25 | 1 | 30 | 0 | 0 |
| qwen2.5:1.5b | none | 30 | 30 | 0 | 19 | 0 | 0 |
| qwen2.5:1.5b | current | 30 | 30 | 12 | 18 | 15 | 13 |
| qwen2.5:1.5b | selective | 30 | 30 | 2 | 30 | 0 | 0 |

*Across measured custom fields; excludes separately recorded historical-value and invented-absence errors. Amount scoring here is the original strict raw-format score, before any typed normalization.

## Confirmation across seeds

| Model | Seed | References | Type /20 | Tags /20 | Language /20 | Present IDs correct /6 | False IDs when absent |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| qwen2.5:0.5b | 42 | none | 19 | 19 | 20 | 0 | 5 |
| qwen2.5:0.5b | 42 | current | 20 | 20 | 18 | 6 | 8 |
| qwen2.5:0.5b | 42 | selective | 20 | 20 | 20 | 4 | 21 |
| qwen2.5:0.5b | 43 | none | 19 | 19 | 20 | 0 | 0 |
| qwen2.5:0.5b | 43 | current | 20 | 20 | 18 | 6 | 7 |
| qwen2.5:0.5b | 43 | selective | 20 | 20 | 20 | 2 | 16 |
| qwen2.5:1.5b | 42 | none | 20 | 20 | 13 | 6 | 4 |
| qwen2.5:1.5b | 42 | current | 20 | 20 | 16 | 6 | 4 |
| qwen2.5:1.5b | 42 | selective | 20 | 20 | 20 | 6 | 4 |
| qwen2.5:1.5b | 43 | none | 20 | 19 | 14 | 6 | 4 |
| qwen2.5:1.5b | 43 | current | 20 | 20 | 16 | 6 | 4 |
| qwen2.5:1.5b | 43 | selective | 20 | 20 | 20 | 6 | 4 |

## Decision

The selective context does not qualify for production promotion. It improves language detection and removes the observed literal training-value copies, but sacrifices other fields and still fills absent identifiers. The 0.5B model is especially weak on new instance values. The 1.5B model recovers all present identifiers in this small set but still invents absent ones. No user model or reference policy is changed.

The larger model's synthetic sender results are scored against the entire declared first-line company name, including its test prefix. Outputs such as `Alpha Company` are incomplete under that frozen contract. The ground truth is not shortened after seeing model answers; this artificial naming convention also limits real-world generalization claims.

## Raw audit and bounded production change

[Read-only audit of the original artifacts](https://github.com/BMWfan/paperless-ai/actions/runs/43166136055) confirms both genuine errors (`$42.50` for an EUR document, copied 987.65, a contract end date assigned to due_date) and unambiguous format variants (`EUR 42.50`, `42.50 EUR`). The shared typed writer now accepts explicit currency codes on either side with whitespace, while rejecting symbols, two codes and ambiguous separators.

Raw model scores remain unchanged. A separate replay measures native normalization and source-supported acceptance against exactly the same stored model answers; rejecting a bad value is not a correct extraction. Currency-free model values remain currency-free, and no currency is guessed. Exact replay evidence and tested revisions are linked in PR #21.

The source-support diagnostic alone is insufficient: a historical number or test heading can occur verbatim in the document and still be the wrong field value. It is not activated as a production guard. Automatic extraction would need stronger field-specific evidence/abstention and further qualification, rather than a blanket switch to this selector or model.

The pilot also checked actual native typed roundtrips, unrelated metadata preservation, real review of training examples, and that evaluation predictions never became active training examples. Those are integration results, not evidence that a model prediction is semantically correct.


## Same-answer converter comparison

Only cases with a present amount are counted below, using the current-reference
arm. The previous converter is preserved as checksum-verified source from main
ebc39c5; no old behavior is approximated or rescored as a different model answer.

| Model | Seed / split | Previous converter | Current converter | Present values |
| --- | --- | ---: | ---: | ---: |
| 0.5B | 42 / evaluation | 0 | 18 | 18 |
| 0.5B | 42 / confirmation | 0 | 12 | 12 |
| 0.5B | 43 / confirmation | 0 | 12 | 12 |
| 1.5B | 42 / evaluation | 15 | 18 | 18 |
| 1.5B | 42 / confirmation | 11 | 12 | 12 |
| 1.5B | 43 / confirmation | 11 | 12 | 12 |

This is an input-format improvement at the typed boundary, not a new extraction
accuracy result. Raw model values, raw strict scores and negative-case failures
remain unchanged. Current-converter replay at `91576a5` verified 474 typed field
assignments and 189 updates preserving unrelated metadata against real ngx 3.4.2.
Those are repeated assignments across cases/arms, not 474 distinct documents.
The archived-answer replay and exact final verification are tracked in PR #21.

No tested model/context arm qualifies for unsupervised structured extraction
under this pilot's critical-error gate. In particular, increased acceptance of
a monetary format is not a guarantee against a plausible but wrong number.

## Follow-up: field-specific evidence

The separate [field-evidence diagnosis](field-evidence.md) reuses all420 immutable
answers without inference or score changes. A fixed label/value gate rejects542
incorrect proposals in this replay but also loses239 of375 correct typed
proposals. Two newly frozen unmarked-attachment cases still accept wrong IDs.
It remains outside production: label adjacency and whole-document historical
abstention do not establish reliable semantic extraction. See the linked
contract for per-field reports, negative cases and reproducible commands.

## Follow-up: explicit section boundaries

The separate [section-evidence experiment](section-evidence.md) freezes40 new
single-target cases before implementation. On confirmation it retains10/10
correct proposals versus4/10 with the old label gate, but both accept two wrong
unmarked-attachment IDs. It fails the frozen zero-false-acceptance criterion.
On unheaded old data it abstains completely, losing all375 correct archived
proposals. No new model inference or production improvement is claimed.

## Follow-up: real1.5B/3B and evidence-contract measurement

The [new qualification](extraction-model-qualification.md) ran270 real responses
on separately frozen data at source f33937c/run43463132516. Both new candidates
fail: confirmation B retains8/10 current IDs with5 wrong accepted assignments;
C retains4/10 then3/10 with3 then2 wrong assignments. A retains10/10 but has9
false assignments per seed. C's quote checking also loses correct values and
positive amount coverage. Raw records and reproducible counters remain archived;
no model/prompt/default is promoted. These new-data results do not overwrite or
rescore the earlier pilot's distinct corpus/contract.
