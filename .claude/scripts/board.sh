#!/usr/bin/env bash
# Board helpers for the /file, /refine, /triage, /work, /ship, /board skills.
#
# Reads .claude/gh-project.json for the project coordinates so no skill hardcodes a
# project number or Status option name. Run `.claude/scripts/board.sh init` once to
# create that file (needs `gh auth refresh -s read:project,project` first).
#
#   board.sh init                   write .claude/gh-project.json from the live project
#   board.sh add <issue#>           add an issue to the project, print its item id
#   board.sh status <issue#> <key>  set Status; key = filed|refined|inProgress|inReview|done
#   board.sh list                   print the board, one row per item
set -euo pipefail

CFG="$(git rev-parse --show-toplevel)/.claude/gh-project.json"

need_cfg() {
  [ -f "$CFG" ] || { echo "Missing $CFG — run: .claude/scripts/board.sh init" >&2; exit 1; }
}
cfg() { jq -r "$1" "$CFG"; }

case "${1:-}" in
init)
  owner=$(gh repo view --json owner --jq .owner.login)
  num=${2:-}
  if [ -z "$num" ]; then
    echo "Projects for @$owner:" >&2
    gh project list --owner "$owner" >&2
    echo "Re-run: .claude/scripts/board.sh init <number>" >&2
    exit 1
  fi
  pid=$(gh project view "$num" --owner "$owner" --format json --jq .id)
  fields=$(gh project field-list "$num" --owner "$owner" --format json)
  sf=$(echo "$fields" | jq -r '.fields[] | select(.name=="Status")')
  [ -n "$sf" ] || { echo "No Status field on project $num" >&2; exit 1; }

  # Map our five canonical keys onto whatever the Status options are actually named.
  jq -n --arg owner "$owner" --arg number "$num" --arg pid "$pid" --argjson sf "$sf" '
    def pick($re): [$sf.options[] | select(.name | test($re; "i")) | .name][0];
    { owner: $owner, number: ($number|tonumber), projectId: $pid,
      statusField: $sf.name, statusFieldId: $sf.id,
      status: {
        filed:      (pick("^filed|^todo|^backlog|^new") // $sf.options[0].name),
        refined:    pick("refined|ready|groomed"),
        inProgress: pick("in ?progress|building|doing"),
        inReview:   pick("in ?review|review"),
        done:       (pick("^done|closed|shipped") // ($sf.options | last | .name))
      } }' > "$CFG"
  echo "Wrote $CFG:"; cat "$CFG"
  echo "Check the status mapping above — any null means the option does not exist yet." >&2
  ;;

add)
  need_cfg
  url=$(gh issue view "$2" --json url --jq .url)
  gh project item-add "$(cfg .number)" --owner "$(cfg .owner)" --url "$url" \
    --format json --jq .id
  ;;

status)
  need_cfg
  key="$3"
  name=$(cfg ".status.$key")
  [ "$name" != "null" ] || { echo "No Status option mapped for '$key' in $CFG" >&2; exit 1; }
  url=$(gh issue view "$2" --json url --jq .url)
  item=$(gh project item-list "$(cfg .number)" --owner "$(cfg .owner)" --format json --limit 500 \
    | jq -r --arg u "$url" '.items[] | select(.content.url==$u) | .id')
  if [ -z "$item" ]; then
    item=$(gh project item-add "$(cfg .number)" --owner "$(cfg .owner)" --url "$url" --format json --jq .id)
  fi
  opt=$(gh project field-list "$(cfg .number)" --owner "$(cfg .owner)" --format json \
    | jq -r --arg f "$(cfg .statusField)" --arg n "$name" \
        '.fields[] | select(.name==$f) | .options[] | select(.name==$n) | .id')
  gh project item-edit --id "$item" --project-id "$(cfg .projectId)" \
    --field-id "$(cfg .statusFieldId)" --single-select-option-id "$opt" >/dev/null
  echo "#$2 -> $name"
  ;;

list)
  need_cfg
  gh project item-list "$(cfg .number)" --owner "$(cfg .owner)" --format json --limit 500 \
    | jq -r '.items[] | [(.content.number // "-"), (.status // "no status"), .content.title]
             | @tsv' | sort -k2,2
  ;;

*) sed -n '2,12p' "$0"; exit 1 ;;
esac
