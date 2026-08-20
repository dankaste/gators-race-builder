---
name: refine
description: Research a filed enhancement and turn it into a spec with acceptance criteria, posted to the GitHub issue. Use before building a feature, or when an issue is too vague to work.
---

# /refine <issue#> — Turn an issue into a buildable spec

## Steps

1. If no issue number was given, run `.claude/scripts/board.sh list` and ask which one.

2. Fetch the issue:
   ```bash
   gh issue view <n> --json number,title,body,labels,comments
   ```
   If a `<!-- artifact:spec -->` comment already exists, ask: "A spec already exists for #<n>.
   Rewrite it? [y/n]" — and if yes, update that comment rather than adding a second one.

3. Invoke the **spec-writer** agent with the issue title and body. Instruct it: *"Return the
   full spec as your final message. Do not write files."*

4. Show the spec to the user and ask: **"Does this match your intent?"** Iterate until they
   approve. Do not proceed without approval — a wrong spec is the most expensive thing in this
   pipeline, since everything downstream trusts it.

5. Post the approved spec to the issue, marker first so the skill can find it later:
   ```bash
   gh issue comment <n> --body "$(printf '<!-- artifact:spec -->\n%s' "$SPEC")"
   ```

6. Move the board: `.claude/scripts/board.sh status <n> refined`

7. End with: "Spec on #<n>. Run `/work <n>` to build it."

## Rules

- If spec-writer says the change is **config only**, say that prominently. It usually means the
  work is a few lines in `lib/configs/` plus a golden-test case — worth knowing before anyone
  opens an editor.
- If spec-writer flags golden-test impact, surface it as a decision for the user, not a
  footnote. Changing 2025 WebScorer labels is a race-director call.
- Do not implement anything here.
