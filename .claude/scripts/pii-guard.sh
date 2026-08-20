#!/usr/bin/env bash
# PostToolUse(Bash) guard: refuse to leave rider PII staged in a PUBLIC repo.
#
# Checks the index, not the command string. `git add -A` after someone drops a
# registration export in the tree is the real leak path, and no filename appears in
# the command there. (`git add ../All 2025 Race Docs/x.csv` needs no guard — git
# already rejects paths outside the repo.)
set -uo pipefail
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
echo "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+add' || exit 0

cd "$(git rev-parse --show-toplevel)" || exit 0
bad=$(git diff --cached --name-only \
      | grep -iE '\.(csv|xlsx|xls)$' \
      | grep -v '^lib/engine/__fixtures__/' || true)
env=$(git diff --cached --name-only | grep -E '(^|/)\.env' || true)

if [ -n "$bad$env" ]; then
  printf 'BLOCKED — these are staged and must not be committed to a public repo:\n%s\n%s\n\nRider data is minors'"'"' PII. Run: git restore --staged <paths>\n' "$bad" "$env" >&2
  exit 2
fi
exit 0
