# Automatic identifier roles — approved M experiment

[Plan](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6906503635),
[approval](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6906609954),
SPEC20/EPIC12. Base main25dba26; branch test/automatic-identifier-roles.
Data/protocol/gates frozen in13c48d0 before candidate code. This replaces the
withdrawn manual-selection proposal. Users do not mark a document section.

## Problem and approach

A number appearing verbatim in a document can belong to an earlier invoice or
another attached document. PR23/26 label/heading rules, PR27 literal quote evidence
and PR31 reference projection did not establish semantic ownership. Their data,
original answers and failures remain unchanged; this is a new hypothesis.

The automatic enumerator collects bounded label suffixes and number-bearing
text tokens, retaining original UTF16 positions and spelling. Same text at two
positions remains two occurrences. The model assigns every occurrence a role:
current identifier, historical mention, other document, unclear or not an
identifier, plus the relevant invoice/contract/policy field when applicable.
The deterministic resolver returns only original source values. Conflicting
current values or uncertainty cause abstention. Model role claims are predictions,
not evidence that they are true. Even a value-correct historical source is a
critical source error. Duplicate current header/footer occurrences can agree.

See the authoritative [pre-code contract](../tests/identifier-roles/CONTRACT.md),
[protocol](../tests/identifier-roles/protocol.json),
[manifest](../tests/identifier-roles/manifest.json) and
[new cases](../tests/identifier-roles/cases.json). Gold values/spans never enter
enumeration, prompts, schemas or resolution. Only the scorer sees annotations.

Bounds:50000 UTF16 units,32 distinct occurrences,128 Unicode codepoints per
candidate; oversize input/candidates/lists cause whole-document abstention with
no silent first-N subset. A cl100k input/system/schema proxy guard of5000 tokens
reserves context space but does not claim exact Qwen tokenization. Diagnostic
requests for guarded cases cannot override abstention. Candidate gaps, guarded
positives and all failures remain in the full denominator.

## Arms, data and predeclared decision

A uses the established baseline instructions/schema and production selectContext
raw1500 references. B sees only current text and lexical occurrences, no previous
reference values. This compares extraction approaches, not one isolated variable.
Both use pinned Qwen2.5:1.5b/Ollama0.12.6, temperature0/context8192/output1536/
threads4,180s/request. The1536 output budget is equal across arms and differs from
older768-token studies; do not present results as direct old-corpus reproduction.

New70 same-author synthetic documents:10 curated baseline references and30 per
held-out development/confirmation split; each15 EN/15 DE,10 current IDs,10 missing
applicable IDs,10 inapplicable records. Families/IDs/text are disjoint from prior
studies. Includes unmarked attachments, historical text before/after current,
current and historical occurrences with identical text, repeated current IDs,
an unlabelled alphabetic-ID enumeration gap and a positive occurrence overflow.
Training references simulate reviewed records, not real new native review events.
Published synthetic splits/temperature0 seeds are not independent blind, OCR/PDF,
production or all-language accuracy evidence.

Development42, confirmation42/43, A/B: exactly180 scheduled HTTP attempts in six
jobs, max2 parallel,5GB/4CPU model containers,120min/job. No answer retry, no rerun;
model download can retry3 times before inference. Every started request is saved
before awaiting its response and terminal failures remain in partial/complete
reports. No weights or inference in the8GB Cloud runtime; public standard CI only,
no paid provider, production data/secret or access expansion. Regular20-answer
legacy PR smoke remains separate per relevant head; cancellations/actual counts
are recorded in the PR.

Both confirmation seeds require0 wrong accepted IDs,0 wrong accepted current
sources, >=80% of ALL current IDs and no positive-coverage decline vs A; both arms
must have0 protocol failures. Missing IDs, absent false positives, source/role
errors, candidate gaps, guard losses and raw current claims remain separate.
Abstaining is not correct extraction. Failure means no promotion/automatic tuning
round; passing permits a later integration proposal only.

B predicts only three identifiers. It does not generate or replace standard
classification, sender/language, amount or deadline outputs. No improvement in
those independent predictions is claimed. Native replay preserves actual native
title/tags/correspondent/type plus unrelated money/date/string fields. Language
is an AI-object concern, not an invented native document language endpoint.

## Implementation and verification

1. Freeze data/protocol/gates, then lexical enumeration/schema/resolver.
2. Check span identity, Unicode/CRLF, bounds, conflicts, unknown/duplicate IDs,
   no annotation leakage, raw versus accepted errors and independent gate tests.
3. Exercise actual runner through a labelled fixture HTTP backend:30 unique
   attempts, failed requests/JSON/redirect refusal, no retries or rerun attempt2.
   Fixture responses can never qualify as model evidence.
4. Freeze source digests before the one approved measured run. Archive actual
   requests/roles/responses/errors, manifests/options/run/commit, tokens/times.
5. Verify original GitHub ZIP and decoded payload checksums; independent aggregator
   reconstructs every input, occurrence, validation, resolver, score and gate.
6. Replay stored accepted IDs only in isolated official ngx3.4.2, with the common
   typed writer and0 active learning before/after. Preserve non-target fields.
7. Record exact current-head checks, own separate review (not independent) and
   obtain separate owner merge decision. SPEC20/EPIC12 stay open for actual quality.

Node22.22.0 with locked dependencies:

```sh
node --test tests/identifier-roles.test.js
npx --no-install eslint tests/identifier-roles.test.js tests/identifier-roles/*.js
# One explicitly approved dispatch on the frozen pre-archive head only:
gh workflow run classification-evaluation.yml --repo BMWfan/paperless-ai \
  --ref test/automatic-identifier-roles -f extraction_stage=identifier-roles
# After archiving original responses, no inference:
node tests/identifier-roles/report.js tests/identifier-roles/archive
gh workflow run classification-evaluation.yml --repo BMWfan/paperless-ai \
  --ref test/automatic-identifier-roles -f extraction_stage=identifier-roles-replay
```

Existing registered workflow receives only the two manual profiles; contents:read,
old default jobs and release barriers stay intact. Current PR31 audit lock updates
only its living workflow digest. Original measurement-lock stays immutable; old
180-answer aggregate must reproduce byte-identically. Old270/420 data unchanged.

## Current status and rollback

No measured role result yet; no quality improvement claimed. Initial local test
run had8/9 passes: changing a workflow artifact name during that run correctly
triggered source-digest mismatch. The repeated stable run passes all9 focused tests, ESLint and byte-identical
old180-answer aggregation. The full local Node22 suite passes108/108 with no
failed/skipped cases. A further focused assertion checks untouched AI metadata
including language/correspondent. The invalidated first run is not passing evidence
or a model attempt. Exact CI/run/commit links will be recorded in the PR.

Production providers/context/writers/defaults/database/native ngx remain unchanged.
Removing experimental files/manual profiles needs no migration or metadata reset.
No UI/manual marking, production promotion, merge, publication, deployment or
repository/access changes are authorized by a successful test. The optional
full Python RAG and hosted-provider/OCR quality remain outside this package.
