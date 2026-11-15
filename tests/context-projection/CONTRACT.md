# Frozen reference-context projection experiment

SPEC20 approved M-plan, baseline b966103. Data/protocol freeze before candidate
code.10 curated training documents and30 documents per development/confirmation
split; each split15 EN/15 DE,10 current-ID positives,10 missing applicable IDs
and10 inapplicable letter/payment documents. Synthetic role-based ground truth,
same author, published splits; not blind independent or production/OCR evidence.
Titles/reference excerpts intentionally contain source-instance information.
No native review provenance is claimed for curated training fixtures.

A and B use the exact same references chosen by production rankExamples and
selectContext under the raw1500 cl100k-token budget. A is byte-identical to that
raw context. B preserves its prefix and only document_type, tags, correspondent
inside each selected record; no title, excerpt or custom-field values. Selection
occurs before projection and B never adds extra records. Current input is only
CURRENT DOCUMENT plus case.content, not its ID, cohort, expected or annotation.
Schema, system instructions, scoring and typed validation match the existing
consistent-taxonomy-v1 baseline. No evidence gate or selector change is added.

Pinned qwen2.5:1.5b/Ollama0.12.6; same frozen options.6 jobs ×30 attempts =180,
max2 parallel,180s/request, no answer retry, no rerun (run attempt1). Model pulls
may retry before any generation. Development42 and confirmation42/43; temp0
seeds are not independent statistical samples. Existing legacy PR smoke may
generate20 responses per relevant head plus existing failure handling, separately
accounted; it is not part of the180 comparison attempts. No paid/cloud providers.

Freeze gates before inference: both confirmation seeds require zero accepted
wrong IDs, >=80% positive ID coverage and no decline vs A. Every non-ID field
requires no fewer correct present values and no more wrong accepted values.
Metadata type/tags/sender/language require no fewer correct and no more wrong
or missing values. Both arms must have no transport/JSON/schema errors. Report
raw/typed correct/wrong/missing, failures, source training copies, historical
IDs/role errors, timings and tokens separately; never erase a raw failure merely
because validation rejected a value. Whole-answer schema failure remains failure.

Old corpora, manifests,270 archived answers and older reports stay immutable; new
texts/IDs are disjoint and checked. Failed cases remain in partial/complete files.
No post-result prompt/dataset/scoring tuning or automatic extra experiment. A pass
only permits a later proposal, not activation; failure means no promotion. No
production context/provider/writer/default/schema/ngx/release change.

Archive actual request bodies, raw responses, input/reference IDs and byte
digests, model/run/commit/options and per-attempt errors. Aggregate independently
recomputes selection, validation/scoring and gates; requires all6 unique groups
and180 attempts from one commit/run. Fixture runner tests must be labelled as
fixtures, not inference evidence. Replay immutable typed outputs only into the
isolated official ngx test stack, never production or active learning sources.
