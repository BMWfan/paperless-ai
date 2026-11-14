# Frozen learned-field hint diagnostic

SPEC20 owner-approved M-plan, baseline c2e7a77. Freeze before matcher code.
24 synthetic cases:12 development and12 confirmation; each split3 positive and3
negative cases per language (en/de). Native scope correspondent5/type7, field1
string. Training has a known changed/confirmed value TRAIN-001; current values
are disjoint. No provider or model calls. This is not a blind human-authored or
production corpus. Both splits are published and must not be called unseen data.

Metrics: exact positive suggestions/positive cases, wrong suggestions, negative
cases with suggestions, abstentions and historical-role errors, by split and
language. No semantic qualification from type validity or absence of writes.
The historical-only negative intentionally has the identical label and native
scope; literal matching may propose the old reference. Preserve and report this
limitation rather than dropping the case. Do not promote automatic application.

Runtime regressions additionally cover changed-field provenance, state/revocation,
limits, scope/definitions, literal regex characters, metamorphic identifiers and
the authenticated read-only-to-explicit-save flow. No frozen model answers are
changed or rerun; earlier qualification reports remain immutable.
