---
name: file
description: File a bug or feature request as a GitHub issue on the race director project board. Use when the user reports something broken, asks for a new capability, or says "file this" / "log a bug" / "add to the board".
---

# /file — File a bug or enhancement

Creates a GitHub issue, puts it on the project board in **Filed**, and offers to investigate or
refine it immediately.

## Step 1 — Intake

Ask all of these **in one message**. Never one at a time.

For a **bug**:
1. What were you doing? (which screen, which race, which step)
2. What did you expect to happen?
3. What actually happened?
4. Severity — high / medium / low
5. Anything else? (error text, the race slug, whether it happened on race day)

For an **enhancement**:
1. Which screen or step does this affect?
2. What should it do?
3. What problem does it solve — what can't you do today?
4. Priority — critical / high / medium / nice-to-have
5. Anything else? (examples, constraints)

If the user already gave you all of it in their request, skip the questions and confirm your
reading in one line instead.

**Never paste rider names or registration data into an issue.** This repo is public. If the
report depends on specific riders, refer to them as "rider A", "the 7-8 M wave", a bib number,
or a row index.

## Step 2 — Create the issue

```bash
gh issue create \
  --title "<one line, imperative for features, symptom-first for bugs>" \
  --label "<bug|enhancement>" --label "area:<engine|config|ui|raceday|relay>" \
  --body "$(cat <<'BODY'
**Expected**: ...
**Actual**: ...
**Severity**: ...
**Notes**: ...
BODY
)"
```

Take the issue number from the command output. Never invent it.

## Step 3 — Put it on the board

```bash
.claude/scripts/board.sh status <issue#> filed
```

(This adds the item if it isn't on the board yet.)

## Step 4 — Offer the next step

Report the issue number and URL, then ask one question:

- Bug → "Want me to investigate the root cause now? `/triage <n>` finds exactly where it
  breaks, so the fix is the easy part later."
- Enhancement → "Want me to refine this now? `/refine <n>` researches the code and writes
  acceptance criteria — and often finds it's a config edit, not code."

If yes, chain into that skill. If no, stop.

## Rules

- One issue per problem. Two symptoms with different causes are two issues.
- Do not triage, diagnose, or start fixing in this skill. Filing is all it does.
- Pick the `area:` label from the code the report touches, not from the screen name alone.
