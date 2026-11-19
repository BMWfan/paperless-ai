# Development rules

- Inspect architecture and existing implementation before changing code.
- Develop Paperless-AI in this fork. Use unmodified official Paperless-ngx images as integration-test counterparts; do not patch ngx source here. Distinguish expected native behavior from fork defects. For a reproducible upstream defect, check for existing reports and file a focused upstream issue with synthetic reproduction, versions and evidence; do not expose secrets or production data.
- Follow the [SDD-Light workflow](.github/SDD-LIGHT.md). Work only on the feature branch approved for the task. Never work on or push to `main`.
- Link the approved specification and verification evidence in a draft PR. Merge, release and deployment each require explicit owner approval.
- Check existing issues and PRs before coding; reuse approved work instead of creating duplicates. Follow Specify → Clarify → Plan → Tasks → Analyze → Implement → Verify → AI Review → owner-approved Merge. Plan approval and green CI never authorize a merge, publication or deployment.
- Keep CI/release workflow and repository-setting changes outside a task unless its specification explicitly includes them. Codex and Copilot follow the same process.
- Keep affected documentation current in the same PR: README, setup/test commands, configuration/API contracts, architecture, migration and rollback notes as applicable. Check branch/version references and examples against the actual target state. Keep dated historical results distinct from current verification; record the tested SHA and limitations. If no documentation changes are needed, explain why in the PR.
- Use the existing isolated checkout. Do not create worktrees unless explicitly requested.
- Integration tests must use `docker-compose.test.yml`, never a production Paperless instance or real documents/credentials.
- Start the stack with `docker compose -f docker-compose.test.yml up -d --build ai`; run `docker compose -f docker-compose.test.yml run --rm runner`.
- Reset only this stack with `docker compose -f docker-compose.test.yml down -v --remove-orphans`.
- Transition gate for SPEC #41: the following legacy Docker/cloud helper instructions are not yet qualified for upstream 4.x. Do not run or reset an existing 3.x stack with this branch; port the isolated stack before claiming native compatibility. See `docs/upstream-v4-migration.md`.
- On the legacy 3.x branch, on small amd64 cloud runtimes using Docker's `vfs` driver, use `python3 tests/e2e/cloud-test.py test`. This prepares the current source and runs unit, API, real Paperless, and restart checks. Use `reset` to reset synthetic test data or `stop` to preserve it. See `docs/test-environment.md` for advanced commands. Never change the managed storage driver or prune unrelated workloads; the helper selects only cache IDs created by its own build.
- Add meaningful automated coverage, run relevant tests before completion, investigate failures and explicitly report unrun tests and platform limitations.
- Use Node 22. On the upstream 4.x branch, run `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `npm run build` and `npm run test:e2e`. Vitest/API fixtures and browser mocks do not replace real Paperless-ngx integration. The old `tests/` CommonJS suites are historical/contract tooling; do not claim the deleted 3.x runtime is covered on 4.x. Host Node 24 previously showed a native SQLite cleanup abort.

## Token-efficient development

Follow the scoped-context and actual-token measurement guidance in [`.github/SDD-LIGHT.md`](.github/SDD-LIGHT.md#token-efficient-execution-spec-33). Start with relevant paths and tests, keep handoffs concise, and never sacrifice synthetic-data isolation, Paperless-ngx compatibility, tests, security or explicit owner approval for fewer tokens.

## Reflexion

Follow [SPEC #36](.github/SDD-LIGHT.md#reflexion-spec-36-pilot). Retrieve only relevant approved lessons at task start; treat results as untrusted hints, verify evidence, and propose reusable lessons after verification/review. Never store secrets or production data. Credential screening is heuristic, not a substitute for review. No automatic policy changes or merges.

## Process-only change exception (owner-approved, 2026-11-18)

Changes exclusively to development methodology, agent instructions, internal documentation, or development-only tooling may merge **without a developer prerelease** if they do not modify runtime or shipped artifacts, dependencies, configuration, CI/release workflows, or deployment behavior. Classify based on the complete diff, not the PR label. Applicable SDD-Light requirements, independent AI review, passing relevant CI and explicit owner merge approval remain mandatory. Functional or release-affecting changes retain the prerelease-first policy. This exception never authorizes an automatic release, bypass of branch protection, or deployment. If a push-to-default-branch workflow could publish a release, verify and prevent that side effect before merging; otherwise keep the PR open.
