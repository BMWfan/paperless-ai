# Project status — baseline after PR26

This is a dated source/acceptance audit, not a release announcement. GitHub issues,
PRs and their exact checked commits remain the source of truth. Historical
validation records are not evidence for later heads.

## Integrated in main at this audit

Baseline: `96fac1157eed5fe3bcb5b562af78b24b8b875fe0` (owner-approved PR26).
PR25 integrated confirmed saving; PR26 preserves the failed section diagnostic.
PR25's direct main-push [Learning run43378895338](https://github.com/BMWfan/paperless-ai/actions/runs/43378895338)
passed. The earlier main audit below remains dated evidence for185607a.

| Requirement | Delivered state | Evidence / limit |
| --- | --- | --- |
| Learn from corrections and confirmed assignments | Modes, persistent detection, review/history/revocation, compatible migration and bounded shared provider context | [Architecture](learning-engine-v2.md), [historical acceptance](learning-v2-acceptance.md); unknown external edits require review |
| Isolated development | Official ngx3.4.2, PostgreSQL, Redis, synthetic fixtures, compact Cloud helper and isolated CI | [Test guide](test-environment.md); production is never the test counterpart. Current local fresh vfs builds have hit the8GB limit; source-bound local runs and clean CI builds are distinct evidence. |
| Typed structured fields | Native definitions and common automatic writer; preservation, explicit manual clearing, currency/date validation | [Field contract](custom-fields-contract.md), merged PR14/21/22 |
| Native coexistence and provenance | Conservative unknown-source handling for implicit/overlapping native changes; ngx owns workflows | Merged PR19; [synergy analysis](paperless-ngx-synergies.md). No ngx source patch |
| Manual Custom-Field preview | Current/proposed/typed values, unverified excerpts, safe rendering and selection-response guards | Merged PR24; baseline preview does not write fields |
| Measured model/relevance quality | Disjoint data, archived answers, reproducible scoring/replay and rejected field-evidence hypothesis | Merged PR21/23; [protocol](learning-quality.md), [results](quality-results.md), [evidence limits](field-evidence.md). No arm qualifies for unattended extraction |
| Agent/release rules | SDD-Light, approved feature branches, tests/review and explicit merge approvals | [AGENTS](../AGENTS.md), [SDD-Light](../.github/SDD-LIGHT.md); publication separately gated |

Earlier post-merge validation ran directly on185607a:
[Learning43294521484](https://github.com/BMWfan/paperless-ai/actions/runs/43294521484).
Its logs confirm49 root regressions,3 Python contracts,3 real API cases,2 browser
cases, restart and3.4.1→3.4.2 upgrade, with no skipped/failed test cases. Browser
artifact metadata is retained in the run. Earlier PR-specific replay/native
profiles remain separate source-linked evidence, not re-executed main-push jobs.

The GitHub integration audit checked workflow source, real job steps/logs and
artifact metadata. Default E2E uses deterministic provider fixtures and real ngx;
model reports distinguish wrong/missing fields from protocol success. The420
original answers are checksum-verified. This is traceable scenario evidence,
not a production-accuracy, full OCR/PDF or all-version qualification.

Known test-configuration limits: the existing CI lint command does not include
all newer Custom-Field modules (these are explicitly linted locally); image
version tags and apt installs do not make every build byte-identical. The test
pin is3.4.2, not an assertion of the globally latest upstream release.

## Integrated confirmed saving and current diagnostic work

PR25 integrated explicit selected-field saving, fresh document/definition guards,
existing learning modes, unselected-value preservation and conservative uncertain
outcomes. [Contract](custom-field-preview.md). Head28080f4 had59 root/3 Python/
4 real API/3 browser cases, restart, upgrade and native-coexistence verification.
Owner-approved merge9f561e8 has the same tree. No migration or model change.

The approved `feat/section-evidence-diagnostic` M-plan remains diagnostic only.
[Results and frozen contract](section-evidence.md):10/10 positive confirmation
proposals retained but two wrong unmarked-attachment IDs accepted; old unheaded
data loses all coverage. The candidate is not qualified and is not activated.
Use its PR for exact current-head verification/review; PR26 was separately owner-approved and integrated. No production activation.
The approved [model qualification](extraction-model-qualification.md) now adds
a separate opt-in inference/replay profile on feat/extraction-model-qualification;
its fixed results and exact tested head remain in its PR. No new quality result
is claimed before measurement. Merge and activation remain separate approvals.

## Remaining requirements

- SPEC #20 and EPIC #12 remain open: semantic/document-section ownership is not
  established by a literal or label match. Old references, invented absent IDs
  and dates assigned to the wrong field remain real model errors.
- Controlled field saving is integrated through PR25. Existing learning-event
  review remains distinct from approval of a not-yet-applied proposal.
- ngx provides no compare-and-set PATCH. Preflight checks/local exclusion do not
  guarantee atomicity against external writers, including changes after the final
  read. No absolute loss-prevention guarantee is claimed.
- Fixed-label and selective-retrieval candidates stay unpromoted. Further model
  hypotheses require newly frozen qualification, positive coverage and explicit
  critical-error measurements, not only green transport tests.
- Optional full Python RAG and hosted-provider model quality have contract/protocol
  coverage, not a newly completed full-runtime accuracy qualification.
- Reusable Cloud-template settings, publishing, releases and production deployment
  retain their separate authorization boundaries. Historical template observations
  are not a fresh settings inspection.

There is no project-wide completion claim or implied publishing/access expansion.
