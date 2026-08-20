#!/usr/bin/env bash
# PreToolUse(Bash) gate: block `git push` unless tests, typecheck, and lint pass.
#
# Gates push rather than commit on purpose — WIP commits stay fast, and push is what
# feeds CI. `npm run build` is not here; it takes minutes and belongs in CI only.
set -uo pipefail
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')

echo "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+push' || exit 0

# `cd "$(git rev-parse ...)"` succeeds outside a repo (cd "" is a no-op), which
# would silently skip the check. Resolve the root explicitly and bail loudly.
root=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}
[ -n "$root" ] && [ -d "$root/.git" ] || { echo "hook: not in a git repo, skipping" >&2; exit 0; }
cd "$root" || exit 0
out=$(npm test --silent 2>&1 && npx tsc --noEmit 2>&1 && npm run lint --silent 2>&1)
if [ $? -ne 0 ]; then
  jq -n --arg r "$(printf 'Push blocked — the gate failed:\n\n%s\n\nFix it, then push.' "$(echo "$out" | tail -40)")" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
fi
exit 0
