---
name: board
description: Show the race director project board — what is filed, refined, in progress, and stale. Use when the user asks what's on the board, what to work on next, or wants a backlog review.
---

# /board — See the work

## Steps

1. Print the board:
   ```bash
   .claude/scripts/board.sh list
   ```

2. Cross-check against open PRs and recent activity:
   ```bash
   gh pr list --json number,title,headRefName,isDraft,statusCheckRollup
   gh issue list --state open --json number,title,labels,updatedAt --limit 100
   ```

3. Present it as one table grouped by Status, most actionable first. For each row show: issue
   number, title, area label, and **the next command** (`/refine 12`, `/work 12`, `/ship`).

4. Flag, briefly:
   - Issues in **In progress** with no open PR — abandoned branches.
   - PRs with CI red or checks never started.
   - Issues open more than 30 days with no comment — ask whether to close them.
   - Anything in **Filed** with no `area:` label.

## Rules

- Read-only. Do not move cards, close issues, or start work from this skill.
- Do not spawn an agent. This is a few `gh` calls and a table.
- Keep it to one screen. If there are more than 20 open items, show the top of each column and
  a count for the rest.
