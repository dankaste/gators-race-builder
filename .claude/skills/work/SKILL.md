---
name: work
description: Build a refined or triaged GitHub issue on a branch and open a PR. Use to start implementing an issue, or when the user says "work on 12" / "build that" / "fix it".
---

# /work <issue#> — Branch, build, PR

The branch name carries the issue number, so no session state file is needed. Anything that
needs to know what is being worked on derives it from `git branch --show-current`.

## Steps

1. If no issue number was given, run `.claude/scripts/board.sh list` and ask which one.

2. **Require an artifact.** Fetch the issue and check for a `<!-- artifact:spec -->` or
   `<!-- artifact:triage -->` comment:
   ```bash
   gh issue view <n> --json title,body,comments
   ```
   - No artifact, and it's a bug → "Run `/triage <n>` first." Stop.
   - No artifact, and it's an enhancement → "Run `/refine <n>` first." Stop.
   - Trivial and obvious (a typo, a label) → offer to skip straight to the build, but say that
     is what you're doing.

3. **Branch off fresh `main`:**
   ```bash
   git checkout main && git pull --ff-only
   git checkout -b claude/<n>-<short-slug>
   ```
   Never build on `main`. Branch protection will reject a direct push anyway.

4. Invoke the **implementer** agent. Inject the issue body **and the full artifact comment
   text** into its prompt — the agent has no GitHub tools and cannot fetch them itself.
   Instruct it: *"Build this. Write the failing engine test first. Run the gate. Stage with
   explicit paths — never `git add -A`. Do not commit."*

5. **Run the gate yourself** — do not take the agent's word for it:
   ```bash
   npm test && npx tsc --noEmit && npm run lint
   ```

6. **Review what is staged** before committing:
   ```bash
   git status && git diff --staged --stat
   ```
   Confirm no `.csv`/`.xlsx` outside `lib/engine/__fixtures__/`, no `.env*`, no rider data.

7. Commit and push:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>: <one line on the why>

   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   EOF
   )"
   git push -u origin HEAD
   ```

8. Open the PR — the `Closes` line is what closes the issue on merge:
   ```bash
   gh pr create --fill --body "$(printf 'Closes #<n>\n\n%s' "<what changed / how verified>")"
   ```

9. Move the board: `.claude/scripts/board.sh status <n> inProgress`

10. End with: "PR open on #<n>. CI is running. Run `/ship` when it's green."

## Rules

- One issue per branch. If the work grows a second concern, `/file` it and keep this branch
  scoped.
- Do not merge here. `/ship` does that, after CI.
- If the gate fails twice on the same error, stop and report — do not keep patching.
