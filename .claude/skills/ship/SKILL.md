---
name: ship
description: Review, wait for CI, and merge the current branch's PR, closing its issue. Use when a PR is ready to land, or the user says "ship it" / "merge it".
---

# /ship — Land the current branch

## Steps

1. **Derive the issue** from the branch: `git branch --show-current` → `claude/<n>-<slug>`.
   If the branch has no number, read the PR body's `Closes #<n>` instead. If neither exists,
   ask.

2. **Run the gate locally** — faster feedback than waiting on CI:
   ```bash
   npm test && npx tsc --noEmit && npm run lint
   ```

3. **Review the change.** Run the built-in `/code-review` on the branch diff. Do not write a
   review agent for this — `/code-review` and `/security-review` already exist in this
   environment and are better than a hand-rolled reviewer.

   Fix anything it finds that is a real defect. Push the fixes. Skip stylistic nits.

4. Move the board: `.claude/scripts/board.sh status <n> inReview`

5. **Wait for CI**, don't guess:
   ```bash
   gh pr checks --watch
   ```
   If CI is red, fix and push. If CI never starts on an agent-opened PR, `GH_AGENT_TOKEN` is
   not wired — see `CONTRIBUTING.md`.

6. **Merge** once green:
   ```bash
   gh pr merge --squash --delete-branch
   git checkout main && git pull --ff-only
   ```
   The `Closes #<n>` line closes the issue automatically.

7. Move the board: `.claude/scripts/board.sh status <n> done`

8. Confirm: `git status` clean, on `main`, issue closed.

## Rules

- Never merge with CI red or pending. The check is the gate; that is the whole point of it.
- Never force-merge or bypass branch protection.
- Squash merge, always — one issue, one commit on `main`.
- If `/code-review` finds a correctness bug, fix it before merging, not in a follow-up issue.
