# SDD-Light

GitHub is the source of truth. Link an issue to its epic where applicable and
record decisions and acceptance criteria in the issue or linked specification.

| Size | Use when | Required evidence |
| --- | --- | --- |
| S | The change is local and low risk | Issue with scope and acceptance criteria, draft PR, regression proof |
| M | Several components or a shared interface change | S plus specification, plan, ordered tasks and verification, which may share one document |
| L | A migration, cross-system change or substantial risk is involved | M plus contracts, compatibility, risks, migration and rollback |

Follow these stages in order. For S changes, short sections in the existing
issue and PR are sufficient; do not create empty specification files.

1. **Specify:** check existing issues, PRs and code. Reuse the relevant work item;
   define the problem, outcome, size, scope, non-goals and acceptance criteria.
2. **Clarify:** resolve ambiguous behavior, compatibility and safety requirements
   with the owner. Record open questions and decisions.
3. **Plan:** describe the design, affected components, dependencies, verification
   and rollback appropriate to the size. Obtain owner agreement before coding.
4. **Tasks:** divide the approved plan into small ordered tasks with observable
   outcomes. Keep unrelated changes in separate work items and draft PRs.
5. **Analyze:** check the plan against acceptance criteria, contracts, migration,
   production isolation and test gaps. Resolve blocking uncertainty before coding.
6. **Implement:** use the existing branch and draft PR when available, otherwise
   the branch approved for this task. Preserve confirmed learning, unknown-source
   review, existing configuration and migration compatibility. Update affected
   documentation in the same PR; do not leave setup, configuration, API,
   architecture, migration or rollback instructions describing obsolete behavior.
7. **Verify:** record the tested commit SHA, commands, actual results, CI links
   and coverage gaps. Distinguish deterministic provider fixtures, real
   Paperless-ngx integration and measured model quality. Recheck changed heads
   and target bases; a passing run for an older commit is not current evidence.
   Check documented commands, links, examples and branch/version references.
   Preserve historical records as dated evidence, clearly separated from current
   results. Document why a change has no documentation impact when applicable.
8. **AI Review:** perform a separate review pass against the specification,
   diff, compatibility and evidence. Record findings and their resolution in the
   PR. State the scope of the review; do not claim independent review unless it
   actually occurred.
9. **Owner-approved Merge:** present the concrete commit and remaining risks for
   owner review. Agents do not merge without explicit approval for that merge.
   Release, prerelease/image publication and deployment each require separate
   explicit approval. Plan approval and green CI do not grant those approvals.

Codex, Copilot and human contributors use the same issue and verification
requirements. See [the isolated test guide](../docs/test-environment.md).

## Agent handoff

Provide the issue/epic, approved plan, existing branch/PR, scope and non-goals,
acceptance criteria, ordered tasks, test commands and expected evidence. State
known blockers and forbidden side effects. The same assignment works for Codex
and Copilot; changing agents does not change the process or approvals.

Paperless-ngx owns documents, field definitions and workflow execution.
Paperless-AI owns its learning/review logic and provider adapters. For changes
across that boundary, pin the tested ngx version and verify the actual API;
provider mocks alone do not establish ngx compatibility. Use the isolated stack
and synthetic data, never production endpoints, documents or credentials.
Changes to CI, release workflows or repository settings need explicit scope in
their own specification. Home Assistant/HACS release steps are not applicable.

## Token-efficient execution (SPEC #33)

Optimize **total task tokens**, not merely initial prompt size. Explicit user instructions, applicable specifications, security, testing, and owner gates always take precedence. Summaries are navigation, not substitutes for source evidence.

1. **Start narrow:** identify the issue, expected behavior, relevant file paths and nearest tests before reading source. Prefer filenames and focused searches over repository-wide dumps, full logs or unrelated history.
2. **Expand progressively:** retrieve relevant regions and bounded tool output; expand for dependencies, actual API contracts, failing traces and security concerns. Never hide failures by truncation; inspect any truncated evidence before concluding.
3. **Keep tasks focused:** S uses issue/PR evidence; M retains spec, plan, tasks and verification; L adds architecture, compatibility, migrations, risk and rollback. Do not collapse required documents to save tokens.
4. **Compact handoffs:** use [the handoff template](spec-templates/handoff.md), normally <=200 words, linking issue, PR, branch/commit, changed paths, decisions, actual test outcomes, blockers and next action. Replace stale summaries rather than copying conversations; inspect original sources when continuing.
5. **Avoid redundant tools:** batch independent lookups where safe; inspect diffs before whole files. Do not introduce a memory MCP, embeddings, paid services or new dependencies solely for context reduction.
6. **Preserve Paperless-AI quality:** verify relevant unit/API tests and isolated `docker-compose.test.yml` integration using synthetic documents when applicable. Distinguish provider fixtures, real Paperless-ngx API evidence and measured model quality. Preserve existing production isolation, security, compatibility and owner approvals.
7. **Measure honestly:** use [the actual-token protocol](spec-templates/token-benchmark.md) to capture complete input/output tokens, cached input subset, tool calls, duration, checks, defects and rework. Mark UNMEASURED when complete counters are unavailable; never infer savings from word/byte counts.

### Context by task size (guidance, not hard caps)

- **S:** issue, applicable instructions, affected source and nearest tests.
- **M:** add approved scoped specification/plan/tasks, interface contracts, integration tests and dependencies as needed.
- **L:** add cross-system architecture, Paperless-ngx version/API evidence, migration, compatibility, rollback and risk analysis deliberately.

The [benchmark worksheet](spec-templates/token-benchmark.md) is optional until real, authorized comparable work can be measured. No new paid model runs solely for measurement without owner approval. Token and billed-cost savings remain **UNMEASURED** at introduction.
