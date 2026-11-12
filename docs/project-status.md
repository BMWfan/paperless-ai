# Project status — 2026-11-12

This is a dated source/acceptance audit, not a release announcement. GitHub issues,
PRs and their exact checked commits remain the source of truth. Historical
validation results below this page's links are not current-head evidence.

## Integrated in main

Baseline: `35e1d91bb395a4ddda2ee752e7a66f59c0d28a32` (PR #22).

| Requirement | Delivered state | Evidence / limit |
| --- | --- | --- |
| Learn from corrections and confirmed assignments | Modes, persistent correction detection, review/history/revocation, compatible migration and bounded shared provider context | [Architecture](learning-engine-v2.md), [historical acceptance](learning-v2-acceptance.md); unknown external edits still require review |
| Isolated reproducible development | Official ngx3.4.2, PostgreSQL, Redis, synthetic fixtures, compact Cloud helper and full isolated CI | [Test guide](test-environment.md); production is never the test counterpart |
| Typed structured fields | Native definitions and common automatic writer; field preservation, explicit manual clearing, currency/date format validation | [Field contract](custom-fields-contract.md), merged PRs #14/#21/#22 |
| Native coexistence and provenance | Conservative unknown-source handling for implicit/overlapping native changes; ngx owns workflow execution | Merged #19, [synergy analysis](paperless-ngx-synergies.md); no ngx source patch |
| Measured model/relevance quality | Disjoint training/evaluation/confirmation data, archived answers and reproducible scoring/replay | [Quality protocol](learning-quality.md), [results](quality-results.md); no model/context arm qualifies for unattended extraction |
| Agent development/release rules | SDD-Light, approved feature branches, documented checks/review and explicit merge approvals | [AGENTS](../AGENTS.md), [SDD-Light](../.github/SDD-LIGHT.md); publication remains separately gated |

Main's date-format fix was checked at `209fd192` before its tree-identical merge:
[Learning43203133639](https://github.com/BMWfan/paperless-ai/actions/runs/43203133639)
and [evaluation/replay43203133506](https://github.com/BMWfan/paperless-ai/actions/runs/43203133506).
These establish41 root regressions, real API/browser/restart/upgrade checks and
stored-answer replay at that source, not every later PR or semantic accuracy.
The configured test pin is3.4.2; this page does not assert the globally latest
upstream release or automatically change the pin.

## Implemented but not merged

| Work | Checked code | State and limits |
| --- | --- | --- |
| PR #23: field-label evidence diagnostic | `5b9f58f`, Learning43221172104 and evaluation43221172154 successful | Outside production. Rejects wrong proposals but loses239/375 correct typed proposals; two challenge attachment errors remain. Merge needs explicit approval. |
| PR #24: Manual custom-field preview | Functional source `4f0c49f`, Learning43279561006 and native43279560562 successful | Native fields/current/proposed/typed values and unverified excerpts, stale-selection/HTML/theme regressions. Preview only; Save Tags does not save Custom Fields. This documentation audit is a subsequent change and must obtain its own current-head check. |

PR #23 is not a dependency imported into #24. Neither open PR may be described
as already available on main. Their checked SHAs are historical anchors if the
head moves; use each PR's latest verification for its merge decision.

## Remaining requirements

- SPEC #20 and EPIC #12 remain open: field-specific and document/section-specific
  meaning is not established by a literal or label match. Old references,
  invented missing IDs and dates assigned to the wrong field remain real errors.
- Confirmed extraction writes are not supplied by the preview. A future design
  must check the original snapshot and current document before writing, preserve
  unrelated/confirmed metadata and keep learning review distinct from approval
  of a not-yet-applied AI proposal. ngx provides no compare-and-set guarantee here.
- The failed fixed-label gate and selective retrieval experiment stay unpromoted.
  Further candidates need a newly frozen qualification set, useful positive
  coverage and explicit negative-case evidence; green integration tests do not
  satisfy those criteria.
- The optional full Python RAG runtime and hosted-provider model quality have
  contract/protocol coverage, not a newly completed full-runtime accuracy test.
- A reusable Cloud template, live publishing setup, releases, merges and
  production deployments each keep their applicable approval boundary. Historical
  environment-template observations are not a fresh settings inspection.

There is no project-wide completion claim. No deployment, image publication,
production test or access expansion follows from this audit.
