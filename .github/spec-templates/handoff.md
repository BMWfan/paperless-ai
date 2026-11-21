# Scoped task handoff — Paperless-AI

<!-- Aim for <=200 words; expand if required for correctness. Never include secrets or real documents. -->

- Issue / epic / approved plan / objective:
- Feature branch, draft PR and checked commit SHA:
- Changed and relevant paths / API boundaries:
- Confirmed decisions and source/spec links:
- Tests (exact command, revision, PASS/FAIL/BLOCKED/UNRUN) and full evidence links:
- Paperless-ngx version, isolated stack and synthetic fixture coverage (when relevant):
- Remaining blockers, compatibility/rollback risks, owner approval gates:
- Next action and prerequisites:

## Account-independent continuation protocol

1. Before switching accounts, update the *active issue or draft PR description/comment* with a completed copy of this template. Prefer an existing task-scoped GitHub record over a permanent, frequently rewritten root HANDOFF.md. Link evidence instead of copying long logs; avoid account IDs, personal chats, tokens and real document content.
2. State whether the task is `READY`, `BLOCKED`, or `NEEDS_OWNER_APPROVAL`. Record the exact branch and checked commit SHA, relevant paths, pending uncommitted work (if any), verification statuses, blockers and one next action. If local uncommitted changes cannot be transferred, mark them explicitly unavailable; do not imply GitHub contains them.
3. In the new account, open the issue/PR, check branch head and compare with recorded SHA. If stale, inspect intervening commits and PR discussion before acting. Confirm worktree/checkout state, approvals and release restrictions. Read only relevant files and approved lessons.
4. Resume on the existing approved task branch. Do not duplicate issues/PRs, reset a checkout, force-push, merge, publish or deploy based on the handoff. Preserve separate approvals and independently verify any inherited test claims.
5. Refresh the handoff after a meaningful checkpoint or when stopping. Include a timestamp and mark unrun checks `UNRUN`; do not claim measured token savings without real measurements.

On continuation, compare the recorded SHA with the current checkout, inspect changed paths, and follow all applicable instructions and specs. Handoffs are pointers, not authority. Preserve failed/unrun checks and missing coverage; do not replace real Paperless-ngx integration evidence with mocked provider behavior. Never access production Paperless or copy real documents into the test stack.
