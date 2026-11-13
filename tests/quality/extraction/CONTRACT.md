# Frozen extraction qualification v1

Approved SPEC20 M-plan, after main96fac11. Freeze cases/protocol/manifest before
harness implementation/inference. Never tune confirmation data/prompts/threshold
on results. Original420 predictions/40 section cases/28 challenges stay unchanged.

70 synthetic documents:10 curated training fixtures,30 development/30 confirmation,
15 EN/15 DE per test split. Split-specific senders, IDs and frame families;
shared document genres are intentional. Same-author synthetic text, not blinded
production/OCR/PDF qualification. Bundle/formfeed ambiguity expects null current
IDs; expected answers/annotations never enter prompts. Missing and inapplicable
fields remain separate counts. Training fixtures simulate reviewed records; this
experiment does not add production examples or retest human native confirmation.

Three arms A1.5B/baseline, B3B/same baseline, C3B/additive evidence contract.
Same current selectContext, training data and1500-token budget for all arms.
A/B CURRENT DOCUMENT text unchanged; C annotates each original line with its
1-based number. Schema/prompt/options/180s request timeout frozen in protocol.json.
Each job has exactly30 scheduled attempts, no per-answer retry; errors/timeouts
are archived once and scored as missing/protocol failure, not dropped. Nine jobs,
max2 concurrent,120min/job,270 attempts total. Keep every response/partial error,
raw and typed/evidence-filtered scores, all token/timing/resource/model digests.
Resolve and checksum both model manifests before first inference. Abort if a
lock mismatches; no new model choices without another plan. Existing historical
CI baseline remains separate and does not count toward these270 attempts.

C literal quote must occur in the original inclusive1-based line range (maximum5
lines); typed quote must equal the normalized value. No labels/annotations in
quote, no fabricated replacement. Null value requires null quote/start/end.
Source presence does not establish semantic ownership. A/B validated output uses
existing typed normalization only; C adds evidence validation. Raw scores retain
model errors even if withheld. Scoring ground truth is never used in validation.
JSON schema/metadata protocol failure is explicit; missing fields are not a
successful extraction. Do not activate/select a model from green protocol tests.

Per field/model/seed/split: correct/wrong/missing, absent false positives, training
or historical ID copies, wrong date roles, JSON/type/evidence failures, positive
coverage, duration/tokens. Proposal gate on BOTH confirmation seeds: zero wrong
accepted identifiers, at least80% correct present IDs and no decline against A.
Other fields/classification and tradeoffs must be reported separately. Passing
only permits a later integration proposal; new generic native-field contract,
qualification and owner approval still required. No production/model default
change in this package. Failure or missing attempts cannot qualify.

Model inference uses isolated standard-public CI runner with pinned Ollama;
API replay of stored outputs is a separate official ngx3.4.2 synthetic stack,
never production, never training on predictions. Opt-in workflow changes are
explicitly approved here; default CI/release/permissions remain unchanged.
Rollback removes experiment/opt-in job and docs; native metadata/learning intact.
