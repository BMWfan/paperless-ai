# SDD-Light

GitHub is the source of truth. Link an issue to its epic where applicable and
record decisions and acceptance criteria in the issue or linked specification.

| Size | Use when | Required evidence |
| --- | --- | --- |
| S | The change is local and low risk | Issue with scope and acceptance criteria, draft PR, regression proof |
| M | Several components or a shared interface change | S plus specification, plan, ordered tasks and verification, which may share one document |
| L | A migration, cross-system change or substantial risk is involved | M plus contracts, compatibility, risks, migration and rollback |

1. Specify and clarify the intended behavior, non-goals and acceptance criteria.
   Check existing issues, PRs and code before proposing a new implementation.
2. Plan the work and verification. Resolve scope, compatibility and safety
   questions with the owner before implementation.
3. Implement on the approved feature branch in an isolated checkout. Open a
   draft PR and link the issue and specification.
4. Verify with synthetic fixtures. Record the commit SHA, commands, actual
   results, CI links and coverage gaps. Distinguish mocked provider tests from
   real Paperless-ngx integration and model quality.
5. Review the diff against the specification. Resolve findings or record the
   owner's decision. The owner explicitly approves each merge, release and
   deployment separately.

Codex, Copilot and human contributors use the same issue and verification
requirements. See [the isolated test guide](../docs/test-environment.md).
