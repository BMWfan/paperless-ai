# Document-bound learning quality experiment

SPEC [#20](https://github.com/BMWfan/paperless-ai/issues/20), EPIC #12.
The owner approved the model/relevance/extraction plan. This first implementation
adds measurement and an experimental selector; it does not enable that selector,
change user model settings, or modify Paperless-ngx.

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

The existing classification-evaluation workflow retains the historical job and
adds qwen2.5:0.5b / qwen2.5:1.5b on seed 42 (evaluation + confirmation), plus seed43
on the frozen confirmation split for both models. Models download only during
build, with Ollama 0.12.6; inference uses the inherited internal network. Reports
record actual model/corpus digests, seed, generation parameters, selected
references, token use, latency, raw outputs and per-case errors. Each matrix job
has its own disposable project. Additional model images run on isolated CI
runners; do not fill the managed 8-GB vfs workspace or prune unrelated images.

Unit checks use Node22:

```sh
node --test tests/quality.test.js
```

At initial draft these unit checks and lint passed; actual model outcomes must be
read per commit in the linked SPEC/PR. A successful workflow means the measurement
and protocol ran, not that a model is accurate or a selector improved quality.

## Decision and rollback

Select a candidate using evaluation results, then inspect the unchanged
confirmation split across seeds. Report each field and any tradeoff; do not
claim success from aggregate null accuracy, one favorable seed or a green
transport test. Foreign/invented identifiers block promotion of an automatic
extraction candidate in these scenarios. If no reliable gain is measured, keep
production behavior and document the rejected hypothesis.

This initial experiment changes no database schema, confirmed-example policy,
user configuration or default model. Rollback removes the optional overlay/job
and experimental selector; existing classification and learning continue.
