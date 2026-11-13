# Project status — 2026-11-12

This is a dated source/acceptance audit, not a release announcement. GitHub issues,
PRs and their exact checked commits remain the source of truth. Historical
validation records are not evidence for later heads.

## Integrated in main at this audit

Baseline: `185607ac1f4cf64bdaa96c07a646175cad9eb02a` (merged PR23 after PR24).

| Requirement | Delivered state | Evidence / limit |
| --- | --- | --- |
| Learn from corrections and confirmed assignments | Modes, persistent detection, review/history/revocation, compatible migration and bounded shared provider context | [Architecture](learning-engine-v2.md), [historical acceptance](learning-v2-acceptance.md); unknown external edits require review |
| Isolated development | Official ngx3.4.2, PostgreSQL, Redis, synthetic fixtures, compact Cloud helper and isolated CI | [Test guide](test-environment.md); production is never the test counterpart. Current local fresh vfs builds have hit the8GB limit; source-bound local runs and clean CI builds are distinct evidence. |
| Typed structured fields | Native definitions and common automatic writer; preservation, explicit manual clearing, currency/date validation | [Field contract](custom-fields-contract.md), merged PR14/21/22 |
| Native coexistence and provenance | Conservative unknown-source handling for implicit/overlapping native changes; ngx owns workflows | Merged PR19; [synergy analysis](paperless-ngx-synergies.md). No ngx source patch |
| Manual Custom-Field preview | Current/proposed/typed values, unverified excerpts, safe rendering and selection-response guards | Merged PR24; baseline preview does not write fields |
| Measured model/relevance quality | Disjoint data, archived answers, reproducible scoring/replay and rejected field-evidence hypothesis | Merged PR21/23; [protocol](learning-quality.md), [results](quality-results.md), [evidence limits](field-evidence.md). No arm qualifies for unattended extraction |
| Agent/release rules | SDD-Light, approved feature branches, tests/review and explicit merge approvals | [AGENTS](../AGENTS.md), [SDD-Light](../.github/SDD-LIGHT.md); publication separately gated |

Additional post-merge validation ran directly on this main SHA:
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

## Approved work in development, not merged at this audit

`feat/confirmed-custom-fields`, SPEC #20 M-plan: explicitly select and save valid
fields, compare fresh document/definition snapshots inside the existing writer,
preserve unselected values and current learning/provenance rules, handle stale
or uncertain outcomes without automatic retries. [The contract](custom-field-preview.md)
describes this feature branch; use its PR for the exact tested head and results.
Plan approval permits implementation, not merge or deployment. No new database,
provider, workflow engine or production automatic extraction policy is included.

## Remaining requirements

- SPEC #20 and EPIC #12 remain open: semantic/document-section ownership is not
  established by a literal or label match. Old references, invented absent IDs
  and dates assigned to the wrong field remain real model errors.
- Controlled field saving needs completed current-head verification, separate
  review and owner-approved merge. Existing learning-event review remains
  distinct from approval of a not-yet-applied proposal.
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
