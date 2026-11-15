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

Harness verification and the180-attempt measurement are pending at this draft.
No model-quality improvement is claimed. Prior studies stay immutable and
remain separate evidence. SPEC20/EPIC12 remain open until their actual semantic
requirements are met. Optional full Python RAG/hosted-provider/OCR accuracy is
outside this experiment. No release, deployment, production migration or access
expansion is authorized. Reverting this test/docs/profile-only change requires
no data migration; production behavior is unchanged.
