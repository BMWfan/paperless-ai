# Automatic occurrence-role contract (pre-code/data freeze)

SPEC20 approved M-plan6906503635; approval6906609954. Base25dba26. Automatic
identifier diagnosis only, no manual source selection or production change.

Enumeration is lexical, without expected data: from each complete original line
collect its entire nonempty trimmed suffix after the FIRST colon or equals sign,
and every whitespace-delimited token containing at least one Unicode decimal
digit. For tokens only, trim ASCII edge punctuation . , ; : ! ? ( ) [ ] { } " '
< >. Internal punctuation/spelling remain unchanged. Suffixes need not contain a
digit. NFC is NOT applied before offsets; normalize only selected native values.
Positions are half-open UTF16 offsets in the original string; CRLF/LF retained,
surrogate pairs never split. Dedupe exact spans, not values; order start then end,
IDs1..N. Any nonempty candidate longer than128 Unicode codepoints, more than32
unique spans, non-string/empty input or >50000 UTF16 units causes document-wide
explicit abstention with no partial first-N candidate list. Input proxy counts
cl100k text/system/schema tokens; >5000 also forces bounded diagnostic input.
Qwen tokenization differs; this is a conservative input guard, not an exact
Qwen token count. Corpus candidate gaps/overflow stay in all coverage denominators.

A sees frozen baseline instructions/schema and production selectContext raw1500
references from10 curated training documents. B sees original bounded current
text plus lexical occurrences only, no training/reference/expected data or case
IDs. On an overflow it sees a digest/length/reason diagnostic with empty roles,
not a secretly truncated document. Both arms use frozen1.5B/Ollama0.12.6,
temperature0/context8192/output1536/threads4,180s, exactly one HTTP attempt for
every scheduled case including guard/empty cases. Development42, confirmation
42/43, two arms =180 attempts; max2 jobs,120min/job,5GB/4CPU. No answer retry or
rerun; retain interrupted/error attempts. Initial download can retry3 times.

B must return exactly one valid role+field assignment for every supplied ID.
No missing/duplicate/unknown IDs or extra keys. own_current needs one of three
fields; not_identifier needs null. Other roles can have a known field or null.
Malformed JSON/schema/assignments are protocol failures, no selective repair.
Resolve each field only from own_current spans whose existing string-normalized
values agree. Different values => abstention. unclear blocks its named field;
unclear without field blocks all. No first-match/confidence/reference fallback.
All selected original spans remain source evidence, including duplicate values.

Gold spans are scoring-only, authored before candidate code. Other lexical spans
are not_identifier; partial/composite values are not whole identifiers. Wrong
accepted role/source counts even if its value equals a legitimate current ID.
A has no model-provided source positions and receives no invented span accuracy.
Score A/B values with existing typed normalization. B source/role scores are
additional; all raw roles/errors/rejections/ambiguities/gaps/overflow visible.
Both confirmation seeds require0 wrong accepted IDs,0 wrong accepted sources,
>=80% of ALL positive IDs and no decline vs A, and0 protocol failures in either
arm. Abstention is not extraction. Failure means no promotion/extra tuning round;
pass only permits a later integration proposal. Metadata/amount/date quality is
not newly predicted by B; existing classifier objects must remain untouched.

New70 same-author synthetic cases:10 training,30 development,30 confirmation.
Each held-out split15 EN/15 DE,10 positives/10 missing/10 inapplicable. Includes
unheaded alpha-ID enumeration gap, positive32+ occurrence overflow, unmarked
attachments, previous text before/after current, same ID in historical/current
positions and repeated current identifiers. Not blind/independent/OCR evidence.
Old cases/answers/measurement locks unchanged. Current PR31 workflow digest may
be mechanically refreshed for new explicitly approved dispatch jobs; original
measurement source lock and byte-identical old180-answer aggregation preserved.

Archive actual requests, responses/errors, source/model/data/options digests,
occurrences/roles/accepted spans, timings/tokens/run/commit. Independent aggregation
reconstructs inputs, enumeration, validation, resolver, scores and gates; requires
all6 groups/180 attempts, same run/head. Fixture-only responses never qualify.
Native replay is model-free with synthetic official ngx3.4.2, standard metadata
and unrelated fields preserved,0 active learning. No provider/writer/default/DB/
ngx production source change; no merge/release/deployment/access expansion.
