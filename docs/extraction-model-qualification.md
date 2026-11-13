# Extraction model qualification — experimental

SPEC #20 approved M-plan; branch `feat/extraction-model-qualification` after PR26.
This is an isolated experiment, not a new provider/default or production guard.
The fixed270-answer run is complete; both candidates fail qualification. No
production/default is changed. Native API replay is separate integration evidence;
its exact tested head/run/results are recorded in PR #27.

## Inputs fixed before inference

Initial data/protocol freeze726a7f0; pre-inference corpus correction78bd558 moves
current contract/policy amounts and end dates before ambiguous bundle fragments.
The final pre-inference v1.2 data review additionally separates ten genuinely
missing applicable IDs from ten inapplicable letter/payment documents in each
30-case split, while retaining ten present IDs. No model answers existed when
these corrections were made. Thresholds/prompts remain
unchanged. See [contract](../tests/quality/extraction/CONTRACT.md),
[protocol](../tests/quality/extraction/protocol.json),
[manifest](../tests/quality/extraction/manifest.json) and
[model locks](../tests/quality/extraction/model-locks.json).

10 curated training fixtures simulate reviewed records, not newly confirmed
native learning events.30 development/30 confirmation documents each have15 EN/
15 DE cases and split-specific families/senders/IDs. They contain absent/current
IDs, historical references, marked/unmarked attachments, amounts and date roles.
Semantically ambiguous bundles require abstention. Same-author synthetic text
and shared genres are not independent production/OCR/PDF qualification. Old420
answers and40/28 diagnostic cases are unchanged. Test answers/annotations are
scoring-only; the model sees current text and the same existing `selectContext`
reference data for all arms, bounded at1500 tokens.

| Arm | Model | Contract |
| --- | --- | --- |
| A | qwen2.5:1.5b | Existing consistent-taxonomy-v1 |
| B | qwen2.5:3b | Same baseline contract |
| C | qwen2.5:3b | Additive literal quote and inclusive1-based line positions per field |

C annotates current-document line numbers, validates quotes against original
text and requires typed quote/value agreement; null values require null evidence.
ID comparisons preserve spelling/case/zeros. Literal evidence is not semantic
ownership proof. Raw predictions and typed/evidence-filtered results remain
separate; rejecting a wrong proposal is not correctly extracting a present one.

## Boundaries and resource budget

270 scheduled attempts:3 arms×30 development at seed42, plus3×30 confirmation at
seeds42/43. Nine isolated jobs, at most2 concurrent,120min/job,180s/request,768
output tokens,8192 context, temperature0,4 model threads. Fixed Ollama0.12.6,
5GB model container, standard public runner; the managed8GB cloud base does not
install models or run the inference stack. A bounded model-download retry may
occur before inference; model answers are never retried. Workflow reruns are
refused by the measurement runner; retain partial/error artifacts instead.

Both official manifests were downloaded without inference in
[preparation43459415099](https://github.com/BMWfan/paperless-ai/actions/runs/43459415099).
Artifact14055193090 ZIP SHA256 was independently verified:
`dcc13233e66c3abdb706379399104d5386d0ecc03a69a0fdf9d76e39f781b46b`.
Each inference job compares its actual manifest and loaded digest with frozen
locks before generation. Model choice/tag drift aborts rather than silently
changing qualification. No paid provider or production credentials.

Every attempted response/error is persisted immediately with exact commit,
model/options, source/data hashes, context/prompt, token counts and timing.
Timeouts, invalid JSON/schema/type/evidence and preflight failures are explicit;
partial jobs cannot qualify. Synthetic API mocks test the harness but are never
reported as model predictions. All nine original reports must be present with
270 unique scheduled rows, identical frozen inputs and one source run/commit.
Aggregator revalidates raw parsed answers, inputs/context and scores; it rejects
missing/tampered reports. Source/file hashes remain available for audit.

## Reproduce (explicitly approved measurements only)

Use Node22.22.0 and locked dependencies. Unit tests require only fixture APIs:

```sh
mkdir -p data logs
node --test tests/extraction-qualification.test.js
npx --no-install eslint tests/extraction-qualification.test.js tests/quality/extraction/*.js
```

The existing classification workflow now has explicit manual stages; default
PR/legacy jobs retain their behavior. These commands are not part of normal app
startup and must not be run repeatedly to choose favorable answers:

```sh
gh workflow run classification-evaluation.yml --repo BMWfan/paperless-ai --ref feat/extraction-model-qualification -f extraction_stage=locks
# After freezing the approved manifests, run the fixed measurement ONCE:
gh workflow run classification-evaluation.yml --repo BMWfan/paperless-ai --ref feat/extraction-model-qualification -f extraction_stage=measure
```

After downloading the nine unmodified reports, verify artifact/file hashes and
run `node tests/quality/extraction/report.js <report-directory> <summary.json>`.
Archive original bytes/manifests with source run/commit. Reproduction means
re-scoring those saved answers; a fresh model generation is a new measured run,
not the original evidence. The dispatch-only `replay` stage uses archived outputs
with the official ngx3.4.2 synthetic stack, never a production endpoint. It checks
all350 accepted typed field assignments across270 snapshots, unrelated-field
preservation and that predictions
never become active learning examples. That checks integration, not correctness.

## Fixed decision and rollback

For BOTH confirmation seeds: zero wrong accepted identifiers, at least80% correct
present IDs, no decline against A, no failed attempts in candidate/baseline.
Report per field/language/model/seed raw/validated correct-wrong-missing,
absent false positives, training/historical copies, wrong date roles, failures,
positive coverage, tokens/timing and classification tradeoffs. Never change this
threshold or silently repair ground truth after observing answers.

Passing only permits proposing later production qualification with generic
native definitions/compatibility and owner approval. No automatic promotion;
#20/#12 remain open until their actual requirements are met. Removing experimental
files/opt-in stages/docs rolls back without changing stored metadata/learning or
user model settings. Merge, release/publication and deployment remain separate.

## Actual outcome — original run43463132516

[Measurement](https://github.com/BMWfan/paperless-ai/actions/runs/43463132516),
actual source head `f33937c884964bf611d8c1da761384ffd9606d2f`. All nine batches
completed,270 unique scheduled responses, no request/JSON/schema failures. Every
original ZIP was downloaded and independently hash-verified. Original report
bytes (including token-context arrays) are losslessly gzip-preserved under
[archive](../tests/quality/extraction/archive/manifest.json); both compressed-file and decoded-original hashes are checked. Generated-file
attributes collapse review payloads; decoding reproduces the exact source bytes. Artifact
IDs/ZIP hashes are in [provenance](../tests/quality/extraction/artifact-sources.json).
The executable [result](../tests/quality/extraction/results.json) verifies all
inputs, model locks, contexts, parsed raw answers and scores. Postprocessing adds
sorted directory iteration and typed-input retention diagnostics only; no
predictions, validation rules, prompts or thresholds were changed after inference.

Each30-document test split contains10 present target IDs,10 missing applicable
IDs and10 non-ID documents. There are90 possible invoice/contract/policy slots;
wrong acceptances are field assignments, not distinct documents. All270 rows
repeat60 distinct test documents across arms/seeds, not270 independent documents.

| Split | Arm/seed | Correct typed ID input | Correct IDs retained /10 | Correct input IDs lost | Wrong IDs accepted | Of these in absent fields |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Development | A/42 | 8 | 8 | 0 | 9 | 9 |
| Development | B/42 | 9 | 9 | 0 | 7 | 6 |
| Development | C/42 | 7 | 3 | 4 | 0 | 0 |
| Confirmation | A/42 | 10 | 10 | 0 | 9 | 9 |
| Confirmation | A/43 | 10 | 10 | 0 | 9 | 9 |
| Confirmation | B/42 | 8 | 8 | 0 | 5 | 4 |
| Confirmation | B/43 | 8 | 8 | 0 | 5 | 4 |
| Confirmation | C/42 | 8 | 4 | 4 | 3 | 2 |
| Confirmation | C/43 | 9 | 3 | 6 | 2 | 1 |

B lowers false assignments versus A but loses two correct present IDs. It fails
zero-wrong acceptance and no-regression. C's four/six lost correct typed inputs
are rejected for evidence-value/range mismatch, not missing model values. C also
retains semantic wrong-field/absent-ID errors despite literal evidence. It fails
zero-wrong acceptance,80% positive coverage and no-regression. Development C's
zero wrong assignments does not survive confirmation; do not select that split
as the result or relax validation after seeing losses. A itself is unsafe in
this test despite10/10 present-ID recall because it populates absent fields.

Other validated fields on confirmation (each seed separately):

| Arm/seed | Amount correct /18; wrong accepted | Due date correct /6; wrong accepted | End date correct /12; wrong accepted |
| --- | --- | --- | --- |
| A/42 and43 | 18;2 | 6;2 | 12;0 |
| B/42 and43 | 16;2 | 6;0 | 12;0 |
| C/42 and43 | 0;0 | 0;1 | 2;0 |

C's lack of accepted wrong amounts accompanies complete loss of positive amount
coverage; this is not accurate extraction. Per-field raw/validated scores,
correct typed inputs/loss reasons, missing-target/inapplicable counts, language
breakdowns and errors remain in the full result. No raw score is retroactively
replaced with a normalized success. Sender/type/language results use the frozen
existing metadata comparator, not strict new verbatim scoring.

On confirmation, A classifies type/tags30/30, sender/language27/30 in each seed.
B has type/tags/sender29/30 and language30/30. C has type/tags29/30 then30/30,
sender30/30 and language29/30 in both seeds. These mixed tradeoffs do not justify
a global model switch. Requested seeds42/43 at temperature0 are repeat executions,
not independent stochastic samples or a statistical generalization guarantee.

Measured batch request times: A710/1043/783s, B1719/1434/1578s,
C1904/2331/2152s (development42, confirmation42, confirmation43).
Hardware/token/timing metadata is retained per original report; independent
runner variability prevents claiming a tightly controlled latency comparison.
Same-author, artificial prefixes/absence cues and limited genre/field coverage
also constrain generalization. Text occurrence/quote positions do not prove
current ownership, especially near historical references and bundle boundaries.
No arbitrary-field/provider/OCR/PDF or production accuracy is established.

**Decision: neither B nor C qualifies for a production-integration proposal on
these results.** Existing user settings, reference selection, provider paths,
learning/provenance and Manual confirmed saving stay unchanged. Do not rerun the
frozen confirmation cases to seek a favorable seed or promote a larger model on
language scores alone. #20/#12 remain open for actual semantic reliability.

Re-score saved answers without model generation:

```sh
node tests/quality/extraction/report.js tests/quality/extraction/archive extraction-summary.json
sha256sum extraction-summary.json
```

Use the recorded source/data revisions when comparing future evaluator changes;
input source hashes and original answer bytes distinguish a converter/evaluator
change from a new model result. Native replay checks representability and
preservation only; successfully writing a wrong synthetic value does not make it
semantically correct. The current PR links actual replay and CI evidence.
