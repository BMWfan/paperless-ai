# section-evidence-v1 — frozen diagnostic contract

SPEC20, approved M-plan. Freeze this contract/cases/manifest in a commit before
implementing or evaluating the candidate. Do not revise the confirmation data or
threshold after seeing outputs. No production integration or new model inference.

The candidate receives only `(content, proposedFields)`. It recognizes complete,
case-insensitive bracket heading lines `[Current document]` / `[Aktuelles Dokument]`.
Exactly one such heading is required. Any complete bracket heading ends the
previous section; text after other headings, before the current heading and in
historical/attachment sections is excluded. A heading in a quote is not a heading.
This is a deliberately narrow text grammar, not semantic section recognition.

Within that single explicit current section use the unchanged field-evidence-v1
label/type/value contract, including its quotation/history ambiguity abstention.
Only exact typed matches are retained, never supplied/replaced from expected
answers. Preserve original one-based line locations in retained evidence. Missing
or repeated current sections produce abstention. Do not use fixture IDs, language,
family, kind, annotations, expected answers or document-specific strings in rules.
Unmarked attachments can masquerade as current text: report such failures; no
finite heading convention proves document ownership or user intent.

New data:40 focused single-target cases,20 development/20 confirmation; each
split has10 positive fields and10 negative/ambiguous fields, balanced EN/DE.
Families, full texts and non-null expected identifiers are split-disjoint. These
are hand-authored grammar diagnostics, not independently collected production
samples, unseen model predictions or evidence of OCR/generalization accuracy.
Annotations and expected answers are scoring-only. The same author creates the
fixtures/candidate; no independent evaluator or blinded human study is claimed.
Old420 predictions and28 challenges remain immutable additional regressions.

Counters by split/language/field: present, correct input, correct retained/lost,
missing after, wrong accepted/rejected, absent/absent after, abstentions and absent
false positives. Abstention is not correct extraction. Report old and new gates
side by side, plus rejection reasons and case evidence. Frozen confirmation gate:
zero wrong accepted AND at least8/10 correct positive fields retained. Any wrong
acceptance fails regardless of positive recall. Passing permits proposing a later
qualification only; no default/model/provider/production activation is authorized.
Record tested commit, source/data/report hashes. No workflows or schema changes.
Rollback removes diagnostic files/docs only; saved metadata/learning unchanged.
