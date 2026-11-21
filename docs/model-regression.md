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
