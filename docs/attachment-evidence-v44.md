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
