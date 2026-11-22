# Offline attachment evidence on 4.4 (SPEC #20)

This diagnostic keeps an unmarked document body or one explicitly marked current
section, stops at an explicit old-attachment marker or other heading, and checks
one matching label/value line with the 4.x typed normalizer. It does not modify
the analyzer, writer, model settings, or historical experiments.

## Verification

Run under Node 22:

```sh
node --test tests/v4/attachment-evidence.test.mjs
node tests/v4/attachment-evidence.mjs
node tests/v4/attachment-evidence.mjs /path/to/model-regression-report.json
```

The optional input is the report from [run 44995715248](https://github.com/BMWfan/paperless-ai/actions/runs/44995715248)
on `e6c9550f18dc3f89fb89517f169fcd8bf021798e`. Report SHA-256:
`9bd93ff5a8ec1e907174eea9bd26d2cde5967ffbcab6bd662b8f011d52e59904`.
The replay keeps the original report's field scores. The historical splits
compare typed values and report positive retention independently from false
acceptances. The report file and frozen inputs are read only.

| Dataset | Correct proposals retained | Wrong proposals accepted |
| --- | ---: | ---: |
| Frozen development split | 10/10 | 2/10 |
| Frozen confirmation split | 10/10 | 2/10 |
| 4.4 analyzer replay | 0/26 | 0/18 |

**Rejected.** The frozen confirmation split fails the zero-false-acceptance
gate. In the analyzer replay, blocking every wrong proposal came at the cost of
blocking every correct proposal too. Keep the raw model evidence and the
existing runtime unchanged. This experiment did not send model requests or
write Paperless metadata. SPEC #20 and EPIC #12 remain open.

## Field-level provenance follow-up

`node --test tests/v4/attachment-provenance.test.mjs` verifies raw line
references, repeated and missing evidence, and section boundaries.
`node tests/v4/attachment-provenance.mjs /path/to/model-regression-report.json`
replays invoice numbers and amounts only. Explicitly equivalent EUR formats
count as correct. Currency-less amounts do not. The original report is unchanged.

| Dataset | Correct with support | Wrong held | Wrong for review | Wrong with support |
| --- | ---: | ---: | ---: | ---: |
| 4.4 replay | 14/14 | 7 | 7 | 0/14 |
| Frozen confirmation subset | 4/4 | 0 | 2 | 2/4 |

Both confirmation false supports are unmarked attachments whose lines are
indistinguishable from current values in the flattened text. A literal
`[Current document]` heading is not trusted ownership information. A production
gate would need trustworthy source boundaries or explicit user confirmation for
ambiguous values. Keep this diagnostic out of the automatic writer.

## Distinguish the two amount contracts

The original replay configured an amount field without a description. Its null
expectation assumed a current payment demand, but the file also contains a valid
historic receipt total. The original score is retained as historical evidence.

The new [paired fixture](../test/processing/amount-scope.fixture.json) uses the
same document and field name with two explicit descriptions. The current-payment
scope expects no value, and the invoice-in-file scope expects `EUR777.77`.
`npm test -- test/processing/amount-scope.test.ts` verifies that the real prompt
builder supplies these distinct descriptions with otherwise identical input.
It does not verify that a live model follows either description.
