# Frozen Qwen3 extraction readiness contract

Approved SPEC20 plan6929235118; approval6943346923. Base d49822f. No manual
marking, role-list tuning, production provider/default/writer/DB or ngx change.

Phase0 is metadata only: one proposed tag qwen3:4b-instruct-2507-q4_K_M, no tag
fallback, no generate/chat/load-by-empty-generation, no inference at all. In
public standard CI pin Ollama0.12.6 and record pull outcome, original manifest
bytes and SHA256, layer sizes/digests, /api/version, /api/tags and /api/show
metadata/template/parameters/license/details. Download may retry3 times before
inference. Verify qwen3 family,4B size class,Q4_K_M quantization, expected tag and
no mismatch between stored manifest/tag digest. Registry identity/tag/runtime
compatibility is not yet established. File size is not a measured RAM/quality
qualification. Missing/unavailable/mismatched metadata stops with0 generations.

Before the first answer: this contract,40 new documents, exact20 old diagnostic
IDs, instructions/schema/sampler/stop gates and all model/source hashes frozen.
No expected answer or source annotation becomes prompt input. Old20 diagnostic
cases are known, not novel confirmation; source request text/system/schema from
archived PR32 A-development42, with declared new model/sampler, not an asserted
matched comparison to earlier temp0 predictions. All10 positives plus3 EN/2 DE
missing and2 EN/3 DE inapplicable cases, ID-sorted, gives10 EN/10 DE.

Phase1 at most20 one-shot candidate generations, seed42. Only if all20 terminal
attempts exist with0 transport/JSON/schema errors,0 wrong accepted IDs and at
least8/10 correct present IDs may Phase2 be enabled. Otherwise STOP; no substitute
answers/second setup or phase2. Fixture responses never unlock a measured phase.

Phase2 has30 NEW confirmation docs (15 EN/15 DE,10 positive/10 missing applicable/
10 inapplicable) plus10 separate baseline reference docs.40 texts/IDs/families
frozen before any phase1 answer. Both pinned models see same raw1500 production
selectContext records and baseline instructions/schema; only model-specific
Thinking disablement differs. No changed role schema or new retrieval strategy.
Both models: temp0.7,top_p0.8,top_k20,repeat_penalty1.1,context8192,output1536,
threads4. These are chosen test settings, not claimed manufacturer recommendations
or directly comparable old temp0 results. Candidate uses top-level think:false;
unexpected nonempty thinking is an explicit protocol failure, never stripped.
Baseline non-thinking model keeps its old request contract. All actual requests,
settings, outputs/errors, seeds, tokens/times/CPU/model/run/head hashes retained.

Phase2:2 models×30×2 seeds42/43=120, maximum140 including phase1. Both confirmation
seeds require0 wrong accepted identifiers, >=80% of ALL current IDs, no positive
coverage decline vs baseline; each field/metadata must not lose correct present
values or gain wrong accepted values; both models0 protocol failures. Report all
raw/typed/per-language/absent/date-role/training-copy errors and abstentions.
No emitted source positions => no fabricated source-role precision for identical
current/historical values. Same-author published synthetic data/temp sampler
seeds are not independent blind production/OCR evidence.

180s/request,120min/job,8GB/4CPU container,max2 model jobs. Every scheduled attempt
recorded before request, no answer retries/reruns, run attempt1; retain partials.
No silent RAM increase/model replacement. All weights/inference only public CI,
not8GB Cloud. No paid provider/production secrets, access/config change. Regular
legacy PR smoke20 per relevant head plus old failure handling is separate.
Token/cost savings UNMEASURED without complete actual platform counters.

Old180/270/420 artifacts/scores/data and original measurement locks immutable;
live audit locks may only refresh new workflow digest, both180 reports must
remain byte-identical. Preserve activation/learning/provenance rules. Fresh tests,
model-free native replay only if phase2 runs, docs/rollback/own review and separate
owner merge. Passed gate permits later integration proposal only. Any failure
means no promotion/automatic additional round. No release/deploy/production
migration or user-model change. Remove isolated profiles/files without resetting
native metadata or learned history to roll back.
