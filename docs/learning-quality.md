# Document-bound learning quality experiment

SPEC [#20](https://github.com/BMWfan/paperless-ai/issues/20), EPIC #12.
The owner approved the model/relevance/extraction plan. This first implementation
adds measurement, an experimental selector and a bounded typed-currency format
fix derived from real answers. It does not enable the selector, change user model
settings, or modify Paperless-ngx. See [the measured results](quality-results.md).

## Frozen protocol

The historical ten-document `generate.corpus()` and its report remain unchanged.
A new versioned corpus contains 10 training, 30 evaluation and 20 confirmation
texts, evenly split between English and German. `tests/quality/manifest.json`
locks the pre-inference ground truth. Current identifiers differ across splits.
Missing numbers/dates and quoted historical identifiers are negative cases.
The corpus is synthetic and small; this is not a general accuracy guarantee.

The previous experiment had conflicting language instructions: the production
Ollama system prompt requests document-language categories, while the benchmark
requested fixed English labels. Placeholder examples also appeared in that
prompt. New `consistent-taxonomy-v1` explicitly fixes taxonomy identifiers,
preserves sender names, uses ISO language codes and null for absent fields.
Schema constraints apply equally to all three arms. Its results cannot be silently
compared with historical scores as though only the model changed.

Three arms use the same actual Ollama adapter and schema:

1. No reference context.
2. Existing `learningContext.selectContext` behavior.
3. Experimental `learningRelevance.relevantContext`: corpus-frequency weighting,
   boilerplate abstention, bounded relevant matches, and reference-pattern context
   with sender/number/date/amount instance values removed.

This isolates a controlled protocol through `_callOllamaAPI`, not the entire
production `analyzeDocument` prompt path. Production adoption requires separate
interpretation, backward-compatibility tests and review after actual results.
The selector is not used by the production provider adapters yet.

## Classification and extraction scoring

Report raw correct/wrong/missing values for type, tags, sender, language and each
custom field. Keep positive-field coverage separate from correct absences;
an all-null extractor must not look accurate because many fields are absent.
Distinguish copied training values, historical values, invented absent values,
wrong current fields and missing outputs. Never correct an output using its
expected answer or remove failed cases from a report.

A separate conservative source-support diagnostic accepts exact strings,
explicit ISO dates and explicit EUR amounts with decimal separator normalization.
It never reads ground truth. A rejected wrong value remains a raw error; an
omitted present value remains missing. A historical identifier can be present in
the document but still be the wrong current value: presence alone is not semantic
evidence. This diagnostic is not a production extraction policy and does not
promise complete hallucination prevention.

Training documents are ingested into the isolated official ngx instance, edited,
and explicitly reviewed through the fork's actual learning API. Only those active
references enter the comparison. Evaluation predictions never become learning
references. Source-supported proposals use the existing shared typed-field
builder and actual native API roundtrips; an unrelated field must survive.

## Reproduce

Use a fresh separate project for each model/seed; all endpoints are internal:

```sh
export COMPOSE_PROJECT_NAME=paperless-quality-local
export TEST_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export QUALITY_MODEL=qwen2.5:0.5b
export QUALITY_SEED=42
export QUALITY_SPLITS=evaluation,confirmation
docker compose -f docker-compose.test.yml -f docker-compose.quality.yml up -d --build --wait ai quality-model
docker compose -f docker-compose.test.yml -f docker-compose.quality.yml run --no-deps --build --name quality-evaluation quality-check
docker cp quality-evaluation:/app/data/learning-quality.json ./learning-quality.json
docker compose -f docker-compose.test.yml -f docker-compose.quality.yml down -v --remove-orphans
```

The existing classification-evaluation workflow retains the historical job. Its
manually dispatched quality matrix runs qwen2.5:0.5b / qwen2.5:1.5b on seed 42
(evaluation + confirmation), plus seed 43 on confirmation for both models. The
initial actual matrix ran in workflow 43118154733 before this dispatch-only split.
Models download only during build, with Ollama 0.12.6; their observed manifests
are now locked under tests/quality/model-locks and checked at build. Inference
uses the inherited internal network. Reports
record actual model/corpus digests, seed, generation parameters, selected
references, token use, latency, raw outputs and per-case errors. Each matrix job
has its own disposable project. Additional model images run on isolated CI
runners; do not fill the managed 8-GB vfs workspace or prune unrelated images.

Unit checks use Node22:

```sh
node --test tests/quality.test.js
```

The pilot completed 420 actual classifications; model answers are archived under
tests/quality/baseline with source run, checkout SHA, artifact IDs/digests and
checksums. Original raw scores are regression-checked, not rewritten. The previous typed
writer is also archived with its original commit/checksum so replay compares
actual before/after normalization rather than treating every raw-format error
as a new parser improvement. Only trusted checksum-verified repository source
is executed for that comparison; model text is never evaluated as code. The archive
is independent of expiring GitHub artifact retention. Current PR CI replays those
answers through the current typed writer and real isolated API without rerunning
models or claiming new inference. The replay verifies corpus and answer hashes.
Actual outcomes and tested revisions are linked in the SPEC/PR and results page. A successful workflow means the measurement
and protocol ran, not that a model is accurate or a selector improved quality.

## Decision and rollback

Select a candidate using evaluation results, then inspect the unchanged
confirmation split across seeds. Report each field and any tradeoff; do not
claim success from aggregate null accuracy, one favorable seed or a green
transport test. Foreign/invented identifiers block promotion of an automatic
extraction candidate in these scenarios. If no reliable gain is measured, keep
production behavior and document the rejected hypothesis.

No database schema, confirmed-example policy, user configuration or default model
changes. The shared currency parser additionally accepts explicit prefix/suffix
codes with whitespace and keeps old currency-free behavior. Reverting that small
parser change restores old acceptance rules but does not undo existing metadata.
The optional overlay/job and unused experimental selector can be removed without
changing existing classification/learning configuration. No unqualified selector
or source-presence policy is promoted.

## Replay and raw audit

On a sufficiently sized Docker runner, use a fresh base test project and run:

```sh
export COMPOSE_PROJECT_NAME=paperless-quality-replay
export TEST_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
docker compose -f docker-compose.test.yml up -d --build --wait ai
docker compose -f docker-compose.test.yml exec -T ai node tests/quality/replay.js tests/quality/baseline
docker compose -f docker-compose.test.yml cp ai:/app/data/quality-replay.json ./quality-replay.json
docker compose -f docker-compose.test.yml down -v --remove-orphans
```

The managed 8-GB/vfs environment uses the compact helper described in the test
guide instead of a full multi-stage rebuild; the automatic replay runs in CI.
No model image is needed for replay. For a local read-only raw-value audit use
`node tests/quality/audit-report.js tests/quality/baseline`; it edits no scores.
The separately manually dispatched audit workflow can inspect retained original
GitHub artifacts, but ordinary CI does not depend on their continued availability.
