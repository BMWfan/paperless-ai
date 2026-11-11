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
- On small amd64 cloud runtimes using Docker's `vfs` driver, use `python3 tests/e2e/cloud-test.py test`. This prepares the current source and runs unit, API, real Paperless, and restart checks. Use `reset` to reset synthetic test data or `stop` to preserve it. See `docs/test-environment.md` for advanced commands. Never change the managed storage driver or prune unrelated workloads; the helper selects only cache IDs created by its own build.
- Add meaningful automated coverage, run relevant tests before completion, investigate failures and explicitly report unrun tests and platform limitations.
- `npm test` starts nodemon. Use Node 22 and `node --test tests/*.test.js`, preferably via `docker compose -f docker-compose.test.yml run --rm --no-deps runner sh -c 'node --test tests/*.test.js'`. Host Node 24 has shown a native SQLite addon cleanup abort.
