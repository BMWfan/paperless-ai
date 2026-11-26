# Model regression measurement (SPEC #50)

The optional measurement exercises the current document analyzer and OpenAI
provider on four fixed confirmation documents from the synthetic extraction
corpus in #20. Each snapshot sees each document once without and once with
confirmed references from the disjoint training split (16 planned analyses).
This is a bounded regression sample, not a qualification of model quality.
The regular PR checks remain authoritative for metadata writing and protection.
The measurement never invokes the writer, accesses a real Paperless instance,
or changes the configured production model.

## Offline check

Run `npm test -- test/model-regression.test.ts --maxWorkers=1` under Node 22.
It uses synthetic HTTP responses and a local Paperless fixture. No key is needed.

## Owner-approved measurement

1. Review the exact commit, including its workflow, dependencies and fixture
   code. Use a branch in the repository itself. Configure the protected
   `model-regression` environment with required reviewers, deployment-branch
   restrictions, the environment-only secret `MODEL_REGRESSION_API_KEY` and
   variable `MODEL_REGRESSION_APPROVED_SHA` set to the reviewed SHA.
2. Verify the pricing and conversion assumptions below. After explicit cost
   approval, dispatch the workflow on the reviewed branch with `reviewed_sha`
   set to that full SHA. The workflow requires a match between the input, the
   owner-configured SHA and the checked-out commit. Do not use GitHub's rerun
   button. A new dispatch is a new billable run and needs separate approval.
3. Download the short-lived `model-regression-<SHA>` artifact. It lists the
   corpus hash and case IDs, snapshots, per-arm suggestions and field scores,
   request hashes, durations and reported usage per attempt. Wrong identifiers
   copied from a training reference, absent from the source, or marked forbidden
   are reported separately. Failed API calls or budget stops leave explicit
   unmeasured rows. Compare matched rows across SHAs using the same protocol.

GitHub requires this workflow file on the default branch before a
`workflow_dispatch` is available. Until then, standard PR CI validates only
the offline tests. Creating this workflow does not authorize its installation
on the default branch or a live run.

## Budget

| Snapshot | Input USD / 1M | Output USD / 1M |
| --- | ---: | ---: |
| `gpt-4.1-mini-2025-04-14` | 0.40 | 1.60 |
| `gpt-5.4-mini-2026-03-17` | 0.75 | 4.50 |

Standard text pricing checked on 2026-11-21 against
[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
and [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
Do not run if those prices have increased or if the effective EUR per USD
including taxes and fees exceeds 4/3. The shared USD 0.75 reservation limit
assumes that conversion ceiling to stay within EUR 1.

The HTTP boundary allows at most 24 attempts across both snapshots, with at most
10,000 input and 19,000 output tokens reserved per attempt. It conservatively
reserves the UTF-8 byte length of the entire text-only request as input tokens
plus 1,024 tokens for protocol overhead. The output reservation comes from the
request's explicit cap and includes hidden reasoning where applicable. Failed
attempts do not release their reservation. Retries go back through the same
check. Redirects, tools, unrecognized request fields and unbounded output are
rejected. Reported usage outside the reservation stops further calls.

Remove the optional workflow and its test helpers to roll back the measurement.

## Offline eight-case report audit (SPEC #20)

The confirmation-v1 auditor reads an **existing JSON report** and the frozen
fixtures from its exact, separately reviewed source commit. It never imports the
analyzer/provider/harness, sends HTTP requests, reads API keys or starts a model.
Fetch the reviewed source commit separately if it is not present locally.

```sh
node --import tsx scripts/audit-amount-report.mjs model-regression-report.json \
  --source-sha e998c61247c6fa9bc42e48d1e8df33cc28275f26
```

Use Node 22 with the repository's existing dependencies. The explicit SHA must
match the report; the CLI reads the pair/confirmation fixture blobs from that
Git commit, not today's working-tree fixtures. Only the frozen eight-case
`amount-scope-confirmation-v1` / GPT-5.4 mini snapshot is supported. Other
protocols require their own reviewed contract. Input is capped at 1 MiB.

The audit verifies case identity, document/description/expected values, duplicate
and unknown cases, model/protocol/SHA, recorded scoring, one-attempt bounds,
reservation arithmetic and measured usage. Missing cases and failed/stopped
attempts stay unmeasured. Positive accuracy and correct omissions are separate;
wrong current/attachment amounts, missing values, invalid normalization and
multiple proposals are not silently converted into correct omissions. Reported
tokens cover only attempts with reconcilable usage; reservations are not billed
usage. No source-position or document-role accuracy is inferred from a literal.

Exit codes: **0** = internally valid, complete, all eight sample values match;
**1** = internally valid but mismatching/partial/unmeasured sample; **2** = invalid
report/arguments or unavailable source fixtures. Even exit 0 is a diagnostic
sample, **not** general qualification or permission for unattended extraction.
Report and fixture hashes identify the bytes audited; they do not authenticate
that an API call occurred. Original report bytes are never modified. Full raw
provider responses/request bodies are absent from the existing report, so the
auditor cannot reconstruct them or independently recompute request hashes.

Verification uses synthetic reports, including tampering, partial results,
missing usage and CLI exit codes. A real archived report still has to be supplied
for its actual outcome to be audited; no new inference is authorized or needed.
No workflow, permission, application, writer or schema changes are made. Revert
the audit helper/CLI/tests and this section to roll back the development tool.
