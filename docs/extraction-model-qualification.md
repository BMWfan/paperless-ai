# Extraction model qualification — experimental

SPEC #20 approved M-plan; branch `feat/extraction-model-qualification` after PR26.
This is an isolated experiment, not a new provider/default or production guard.
No model-quality outcome is claimed until the fixed run and replay are complete.

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
all accepted typed values/unrelated-field preservation and that predictions
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
