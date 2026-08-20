---
name: triage
description: Investigate a bug's root cause before anyone writes a fix, and post the RCA to the GitHub issue. Use when a bug's cause is not obvious, or when a filed issue needs investigation.
---

# /triage <issue#> — Find the root cause

## Steps

1. If no issue number was given, run `.claude/scripts/board.sh list` and ask which one — or
   accept a bare symptom description and offer to `/file` it first.

2. Fetch the issue: `gh issue view <n> --json number,title,body,comments`.
   If a `<!-- artifact:triage -->` comment exists, ask: "#<n> was already triaged. Re-run? [y/n]"

3. Invoke the **triage** agent with the issue body plus anything else the user has said.
   Instruct it: *"Return the full RCA as your final message. Do not write files, do not fix."*

4. Show the RCA to the user, then post it:
   ```bash
   gh issue comment <n> --body "$(printf '<!-- artifact:triage -->\n%s' "$RCA")"
   ```

5. Move the board: `.claude/scripts/board.sh status <n> refined`

6. If the agent's confidence is **low**, say so plainly and ask whether to dig further before
   anyone builds on it.

7. End with: "Root cause on #<n>. Run `/work <n>` to fix it."

## Rules

- Do not fix the bug in this skill, however obvious it looks.
- If the RCA says **config**, the fix is a `RaceConfig` field, not code. Say so.
- The report goes on the issue, not into `docs/`. The issue is the system of record.
