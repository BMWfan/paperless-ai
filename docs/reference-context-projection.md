# Reference context projection — approved measurement

SPEC [#20](https://github.com/BMWfan/paperless-ai/issues/20), size M.
[Plan](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6891301227)
and [owner approval](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6894648586).
Baseline main b966103 (PR30). Data/protocol first frozen in65ab22e, before
candidate code or model calls. This is a test-only experiment, not a production
selector, provider, database migration or automatic field-application change.

## Hypothesis and contract

Reference titles, excerpts and instance-specific field values can contaminate
current-document extraction. Arm A uses the existing production selectContext
output. Arm B keeps the same selected reference IDs, order and prefix but only
category, tags and correspondent metadata. Selection uses A's1500-token budget
before projection; B never fills the saved space with extra examples. No new
selector, evidence gate, schema, prompt instruction or model is introduced.

The [frozen contract](../tests/context-projection/CONTRACT.md), cases, protocol
and manifest are authoritative. New70 synthetic cases comprise10 curated source
examples and30 development/30 confirmation documents. Each held-out split has
15 EN/15 DE,10 current IDs,10 absent applicable IDs and10 inapplicable documents,
including historical/attachment distractors. Splits and answers were written by
the same author and are published, not independent blind or OCR/production data.

Pinned Qwen2.5:1.5b, Ollama0.12.6, temperature0 and the existing baseline's
system/schema/options/typed normalization/scoring. Development seed42 and
confirmation42/43, two arms, exactly180 HTTP model attempts, no answer retries
or rerun attempts. Seeds at temperature0 are not independent statistical samples.
Six standard public GitHub jobs, max2 parallel; each model container5GB/4CPU,
180 seconds per request. No model weights are installed in the8GB Cloud runtime.
Existing regular PR smoke generates20 older0.5B outputs per relevant head plus
its existing failure handling; count those separately from this experiment.

Both confirmation seeds require zero wrong accepted IDs, >=80% current-ID
coverage and no decline against A. Non-ID fields must not lose correct values
or gain wrong accepted values. Type/tags/correspondent/language must not lose
correct values or gain wrong/missing values. Both arms require zero protocol
failures. Raw errors remain reported even when typed validation rejects them.
Training-title literal copies receive an additional provenance audit without
changing the frozen primary scorer. Pass permits only a later proposal; failure
means no promotion or automatic tuning round. Neither outcome activates B.

## Ordered tasks and reproduction

1. Freeze data, instructions, gates and shared-source checksums before code.
2. Verify production-identical A, identical selected IDs, B-only projection,
   no held-out answer leakage, complete request accounting and no redirects/retry.
3. Freeze the tested harness source digests before the one measured run.
4. Archive original reports/checksums, independently recompute every row and gate.
5. Replay accepted typed values into official isolated ngx3.4.2; preserve an
   unrelated field and verify zero active learning examples.
6. Record exact head/run evidence, limitations, own review and separate merge approval.

Use Node22.22.0 with locked dependencies, never host Node24 for native SQLite:

```sh
node --test tests/context-projection.test.js
npx --no-install eslint tests/context-projection.test.js tests/context-projection/*.js
```

The existing manually dispatched workflow has two new explicit profiles:

```sh
# One authorized measurement only, on the frozen pre-archive commit:
gh workflow run classification-evaluation.yml --repo BMWfan/paperless-ai \
  --ref test/reference-context-projection -f extraction_stage=projection
# After archiving actual outputs; this performs no inference:
gh workflow run classification-evaluation.yml --repo BMWfan/paperless-ai \
  --ref test/reference-context-projection -f extraction_stage=projection-replay
node tests/context-projection/report.js tests/context-projection/archive
```

The workflow and runner refuse measured reruns (attempt must be1); an archived
artifact-sources.json additionally blocks casual new dispatches on this branch.
Never rerun to replace an undesirable answer. Interrupted/incomplete attempts
remain evidence, not grounds to quietly reset the experiment. The local mock
runner is explicitly labelled fixtureOnly and cannot qualify as model evidence.

Native replay uses docker-compose.test.yml, synthetic documents and the existing
buildCustomFieldUpdates typed boundary. It does not call a model, activate
training, change official ngx source or contact production. Exact raw gzip
payloads remain recoverable and independently hashed; no generated answers are
recreated to fill gaps.

## Status and rollback

Harness ba138ec passes98/98 root tests, targeted ESLint and YAML validation.
Learning [run43717912673](https://github.com/BMWfan/paperless-ai/actions/runs/43717912673)
confirms98 root/3 Python/5 real API/4 browser cases, restart and3.4.1→3.4.2
upgrade, with no failed/skipped cases. Regular classification
[run43717912650](https://github.com/BMWfan/paperless-ai/actions/runs/43717912650)
passes the20 legacy0.5B responses, old typed replay and both model-integrity jobs.
The one approved180-attempt [measurement43717958579](https://github.com/BMWfan/paperless-ai/actions/runs/43717958579)
completed at ba138ec298fa2913d21826b1fc04f171401fea33, attempt1. All180
requests returned complete model responses with zero transport/JSON/schema
failures. Six GitHub ZIP digests and their original decoded payloads were
independently verified before lossless gzip archiving. Native replay is pending.
No model-quality qualification is claimed. GitHub standard runners can have
different CPU models (recorded per report); timings and output differences are
not a controlled hardware benchmark or independent statistical proof. Prior studies stay immutable and
remain separate evidence. SPEC20/EPIC12 remain open until their actual semantic
requirements are met. Optional full Python RAG/hosted-provider/OCR accuracy is
outside this experiment. No release, deployment, production migration or access
expansion is authorized. Reverting this test/docs/profile-only change requires
no data migration; production behavior is unchanged.


## Measured result — no qualification or promotion

The [recomputed report](../tests/context-projection/report.json),
[cohort/timing diagnostics](../tests/context-projection/diagnostics.json) and
[artifact provenance](../tests/context-projection/artifact-sources.json) retain
all180 answers. Wrong accepted IDs count assignments, not unique documents;
current-ID coverage has10 possible positives per group.

| Split / seed | A correct IDs | B correct IDs | A wrong accepted IDs | B wrong accepted IDs |
| --- | --- | --- | --- | --- |
| Development42 | 3/10 | 8/10 | 23 | 12 |
| Confirmation42 | 5/10 | 8/10 | 23 | 14 |
| Confirmation43 | 5/10 | 8/10 | 21 | 13 |

B reaches the80% coverage threshold in both confirmations but fails the frozen
zero-wrong-ID criterion. All14/13 B false identifiers match historical IDs in
the current input. A's additional literal-source audit records7/5 source copies;
B records none. That descriptive audit does not prove causality or replace the
unchanged primary score. Removing reference instance values does not establish
ownership of historical/attachment values inside the current document.

Per-field regressions also matter: B increases wrong accepted contract numbers
and end dates in both seeds and wrong amounts in seed42. Correct present
amounts/due dates improve, but that does not compensate for critical false values.

| Confirmation / arm | Type correct/30 | Tags correct/30 | Correspondent correct/30 | Language correct/30 |
| --- | --- | --- | --- | --- |
| 42 A | 20 | 20 | 18 | 27 |
| 42 B | 19 | 19 | 7 | 16 |
| 43 A | 17 | 17 | 20 | 26 |
| 43 B | 20 | 20 | 5 | 15 |

Thus B also fails metadata non-regression. Raw and typed scores, missing values,
invalid-type rejections, errors, language/cohort breakdowns and all original
responses remain available; rejection is never counted as a successful positive
extraction. Gzip decoding restores the original report bytes, not a regenerated
JSON serialization.

Observed total request times A/B were1447/361 seconds (development),1463/434
(seed42),1374/365 (seed43). Prompt/generated token totals are in the report.
Runner CPUs differ (Intel Xeon8573C, AMD EPYC7763/9V74); these timings are not a
controlled speed benchmark. Model version/options/manifest and selected IDs were
fixed, but public-host variability, same-author synthetic templates and seeds at
temperature0 limit generalization and causal/statistical claims.

Decision: qualifiedForLaterProposal=false, productionActivation=false. No new
model, context, prompt, default or automatic application is activated. No extra
tuning run is authorized by this negative result. A later proposal would need to
address current-vs-historical ownership and sender/language regression, with new
pre-approved data/gates/budget. Existing controlled correction/review remains the
safe user workflow; SPEC20/EPIC12 remain open.


## Native import correction after measurement

The first model-free native replay at1440c18,
[run43723383493](https://github.com/BMWfan/paperless-ai/actions/runs/43723383493),
failed while waiting for its first document. The same synthetic upload was
reproduced locally: native libmagic detects the leading `From:` line as
`message/rfc822`; email-to-PDF conversion is unavailable in this text-only stack.
This is expected native MIME dispatch, not evidence of an ngx defect or an
upstream issue. Official ngx code and configuration remain unchanged.

Only replay transport now prefixes `Paperless-AI synthetic replay fixture.` and
a blank line. The original document content follows unchanged. A real native
probe confirms `text/plain`, successful ingestion and the retained current ID.
Model prompts, reference selection, data/protocol, raw answers, scoring and gates
are unchanged. Native task failures now surface their recorded error immediately
rather than waiting90 seconds without diagnosis.

The original ba138ec harness-lock bytes are retained as measurement-lock.json
(SHA256974263ea1df81f7f1551b063d9ddb6dfa678f5680a29860788f6b6c3e06f0930),
verified byte-for-byte against Git. Archived reports continue to require those
original measurement source digests. harness-lock.json separately verifies the
current replay/audit source, including the new wrapper and the original lock.
The only aggregation change is this historical-versus-current source-lock
separation; all180 recomputed report bytes match the pre-repair report exactly.
This versioned native-only repair does not regenerate, replace or rescore any
model answer. Seven focused regressions, all99 Node22 root tests and ESLint pass with no
failed/skipped tests. Corrected full native replay evidence remains pending in PR31.
