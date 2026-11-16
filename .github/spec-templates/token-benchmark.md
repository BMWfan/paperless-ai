# Actual-token A/B protocol — Paperless-AI

Status: **UNRUN / UNMEASURED**. This worksheet is not evidence of savings.

## Matched task design

Use at least three matched pairs of independent baseline and optimized tasks. Hold task prompt, source revision, model/config, tools, permissions, instructions required for correctness, acceptance criteria and quality checks constant. Record instruction revisions; alternate arm order. Never reuse the other arm's answer or conversation. Baseline is normal prior workflow, not artificially inflated context. Optimized follows scoped retrieval guidance.

Choose bounded synthetic tasks relevant to Paperless-AI, such as a fixture-based learning regression, custom-field contract diagnosis or API compatibility check. Include a continuation/handoff task in each arm. Count preparation, retries, tool results, handoff maintenance and rework. Do not use production credentials, documents or endpoints; verify Paperless-ngx integration only in the isolated stack with pinned versions. Do not initiate paid runs merely to fill this table without approval.

## Usage and quality evidence

| Pair / arm | Task + source/instruction SHA | Model/config | Input tokens | Output tokens | Cached input (subset) | Tool calls | Duration | Tests, review defects and rework | Usage evidence |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 baseline | — | — | — | — | — | — | — | — | — |
| 1 optimized | — | — | — | — | — | — | — | — | — |
| 2 baseline | — | — | — | — | — | — | — | — | — |
| 2 optimized | — | — | — | — | — | — | — | — | — |
| 3 baseline | — | — | — | — | — | — | — | — | — |
| 3 optimized | — | — | — | — | — | — | — | — | — |

Use actual platform counters for the entire task including continuation. Record counter semantics, reasoning tokens, cache inclusion, time boundaries and tool-call counting convention. Cached tokens already in input totals are a subset, not extra consumption. Report billed cost separately. If counters are unavailable or partial, mark UNMEASURED and state missing scope; do not substitute estimated token counts, words or bytes.

## Interpretation

For each pair report input+output total, quality, coverage, defects, retries, rework, tool calls and duration. Report paired reductions and median only when comparisons are valid. Preserve failures and deviations; disclose cache effects and sample limitations. Do not adopt an optimization that weakens existing tests, security, Paperless-ngx compatibility or owner approvals. If results are incomplete, conclusion remains inconclusive.
