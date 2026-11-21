# Qwen3 extraction readiness — SPEC #20

Approved [plan](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6929235118),
[owner approval](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6943346923),
[PR #35](https://github.com/BMWfan/paperless-ai/pull/35), EPIC #12.
This is a bounded model capability experiment, not production activation.

For offline reproduction at the original 3.x revision, see the
[archived contract test instructions](test-environment.md#historical-qwen3-readiness-evidence-spec-20).

## Frozen contract and sequence

The [contract](../tests/qwen3-readiness/CONTRACT.md), 40 new bilingual synthetic
records, exact 20 known diagnostic IDs, original request hashes, schema, sampler
and stop gates were committed in `0da55b8` before candidate code. Phase zero then
ran at `efa5658`; original metadata and the candidate manifest were committed in
`b6a91b6` before the first generation. Phase one runner: `72bd751`.
No role-list or provider/default/writer/database changes are included.

Phase one uses the original PR32 A-development seed42 request text, system and
JSON schema, with the newly declared model, sampler and top-level `think:false`.
All 10 positive cases plus the frozen missing/inapplicable cases give 10 EN and
10 DE. Known development documents are diagnostic, not fresh confirmation.
Temperature0.7/top_p0.8/top_k20/repeat_penalty1.1/context8192/output1536/threads4
are chosen experimental settings, not claimed manufacturer recommendations.
Do not compare these results causally with older temperature0 studies.

## Phase zero — verified metadata, no generation

[Run 44051912267](https://github.com/BMWfan/paperless-ai/actions/runs/44051912267),
2026-11-17, exact tag `qwen3:4b-instruct-2507-q4_K_M` with Ollama0.12.6.
It passed family qwen3 / size class4.0B / quantization Q4_K_M checks on the first
pull. Original runtime/tags/show/template/parameters/license and manifest bytes
are in [metadata-archive](../tests/qwen3-readiness/metadata-archive).

- ZIP SHA256: `193196e1b952cb1a867825b40f8112602bc1360e6dc3b3e35820b8d94f6dd597`.
- Manifest SHA256: `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`.
- Generation/chat requests: **0**, including no empty-prompt loading request.

The ZIP was independently downloaded and matched against GitHub's digest; all
contained file hashes and metadata were recomputed. Exact registry tag/manifest
is identity evidence, not an independent audit of instruction-tuning provenance.
The approximately2.50GB weights layer is not a measured inference/RAM qualification.

## Phase one — measured, gate failed

[Run 44052878149](https://github.com/BMWfan/paperless-ai/actions/runs/44052878149)
at `72bd751` completed20 one-shot attempts:19 valid returned JSON responses and
one180-second timeout, without retries, repair or replacement. The independently
downloaded ZIP matches GitHub SHA256
`b5125396eaa2c7d763e844d28757c0881bb83d1bbf90f99f2e90b1cfa0536faf`.
Original unmodified payload, compressed/payload hashes and the permanent no-rerun
marker are in [smoke-artifact.json](../tests/qwen3-readiness/smoke-artifact.json).
The [recomputed gate](../tests/qwen3-readiness/report.json) matches the CI report;
[breakdowns](../tests/qwen3-readiness/breakdown.json) retain language/cohort scores.

| Observation | Result |
| --- | --- |
| Correct present identifiers, all10 positive attempts |9/10 |
| Wrong accepted identifiers, all20 attempts |0 |
| Protocol failures |1 timeout, no returned answer |
| Current invoice / contract / policy numbers |4/4,3/4,2/2 |
| EN / DE correct present identifiers |5/5,4/5 |
| Returned JSON/schema/thinking failures |0/19 returned responses |
| Metadata document_type/tags/correspondent/language |19 correct each;1 unanswered each |
| Correct present amount / due_date / end_date |14/15,6/6,8/9 |
| Wrong accepted typed values |0; this does not certify unanswered fields |
| Generation request wall time |3,107,593ms total (51m47.6s), median153.2s |
| Request range |142.7–180.0s |

The sole timeout is `iar-development-de-present-4`, a positive current-contract
case. The absent answer is a transport/runtime failure, not evidence that the
model chose a wrong number. Positive-coverage and zero-wrong-identifier criteria
passed, but the required zero-protocol-failure criterion failed. **Phase two is
blocked:0 of its120 requests ran.** Its native replay was not run because that
phase was not reached. There is no promotion, fallback, rerun, silent time-limit
increase or production/default change. The job's success means it preserved a
valid negative experiment; it is not semantic qualification.

19 valid responses are encouraging on these known synthetic documents, but this
is not fresh confirmation or a causal comparison with older temperature0 work.
The observed CPU latency is substantial. No peak-memory/CPU-utilization trace or
server-side timeout diagnosis was captured; an out-of-memory cause is not
established. Returned Ollama counters cover19/20 attempts only:35,633 prompt and
2,400 generated tokens. Work on the timed-out request is UNMEASURED. These are not
Codex platform tokens. Any changed resources, timeout, sampler or model round
requires a newly approved plan; none was started.

Recompute without inference, with existing project dependencies:
`node tests/qwen3-readiness/core.js <decompressed-original-report.json>`.
The archived payload must first match its recorded SHA256. This recomputes each
request/validation/score and the gate from immutable original answers.

## Boundaries, validation and rollback

The new40-case corpus is frozen even if phase two never runs. It is synthetic,
published and authored by the same developer, not blinded OCR/production evidence.
Repeated monetary/date values in references and documents limit attribution of
correct extractions; no source-role precision is inferred from a matching literal.
No output source positions are requested. Old180-answer reports remain
byte-identical, original measurement locks/corpora/answers stay untouched; only
the two current audit locks refresh the changed workflow digest.

Local checks:4 Python tests,4 new Node tests,17 affected existing Node tests, and
new runner lint passed. Fixtures exercise exact original inputs,20-attempt bound,
stop gates, malformed JSON/schema, unexpected thinking, redirects, no reruns,
partial/tamper rejection and fixture nonqualification. Actual CI/integration
results must be reported separately from these fixture checks.

All new weights/inference run only in public standard CI with an8GB/4CPU model
container. No production data, endpoints, secrets, provider changes or Cloud model
weights. Remove the isolated manual profiles/files to roll back; do not reset
native metadata or learned history. Merge/release/deploy each need separate owner
approval. SPEC #20 and EPIC #12 remain open. Complete Codex token/cost counters are
unavailable: savings **UNMEASURED**; Ollama inference counters are a separate metric.


At measurement head72bd751, regular CI passed:113 Node tests,3 existing Python
helpers,5 API tests,4 browser tests, restart and3.4.1→3.4.2 upgrade; the separate
metadata fixture job also passed (then3 tests). Runs:
[learning44052844642](https://github.com/BMWfan/paperless-ai/actions/runs/44052844642),
[classification44052844479](https://github.com/BMWfan/paperless-ai/actions/runs/44052844479),
[policy44052844428](https://github.com/BMWfan/paperless-ai/actions/runs/44052844428).
The final archive adds a fourth Python regression for original checksums,
request completeness, raw-body consistency and blocked confirmation. Current final
head CI and the separate own review are linked in PR35; these historical run IDs
do not stand in for final-head checks.

Legacy0.5B smoke is separate: efa5658/run44051898258 and
72bd751/run44052844479 each produced20 complete outputs, verified against their
downloaded artifacts. Payloads record the actual synthetic PR merge commits
`a50b42e97aaa3852f7e38a6659b9dd8a0c0fe29d` and
`6843408b08d1456904bdbcba7279ba29e4af44d4`, respectively. Final-head legacy20
and any failures are accounted separately in PR35. None of these outputs count
as new Qwen3 confirmation. An own review is not an independent review.
