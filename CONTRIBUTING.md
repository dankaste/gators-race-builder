# Contributing

This repo turns a PlayMetrics registration export into a WebScorer start list and race-day
handouts for the Gators Race Series. Read `CLAUDE.md` first — it explains the architecture and
the rules that actually matter.

## The loop

Work is tracked as GitHub issues on the project board. Every change lands through a PR.

```
/file      →  issue on the board, Filed
/refine    →  spec with acceptance criteria      (features)
/triage    →  root cause analysis                (bugs)
/work      →  branch → implement → gate → PR     In progress
   CI      →  test, typecheck, lint, build
/ship      →  review → merge → issue closes      Done
```

The `/…` names are Claude Code skills in `.claude/skills/`. You do not have to use them — the
same loop by hand is fine:

```bash
gh issue list
git checkout -b claude/42-fix-relay-cups
# ...work...
npm test && npx tsc --noEmit && npm run lint
gh pr create --body "Closes #42"
```

`main` is protected. Push a branch, open a PR, let CI go green, then squash-merge.

## The gate

Run this before you push. A hook runs it for you in Claude Code, and CI runs it plus
`npm run build` on every PR.

```bash
npm test && npx tsc --noEmit && npm run lint
```

The whole 692-test suite takes under a second. There is no reason to skip it.

## Three rules that are not negotiable

**1. Never commit rider data.** Registration exports are minors' PII and this repo is public.
Real files live in `../All 2025 Race Docs/`, outside the repo — never copy one in. The only
`.csv`/`.xlsx` allowed in the tree are the sanitized fixtures in `lib/engine/__fixtures__/`
(demographics and labels only, never names). The WebScorer login and password never appear in
code, UI, or a commit. A `PostToolUse` hook checks the index on every `git add`, but the hook
is a backstop, not permission to stop thinking.

`lib/engine/realdata.test.ts` and `history.realdata.test.ts` read that outside directory and
skip when it is absent. That is why they show as skipped in CI. Leave it that way.

**2. Config, not code.** Anything that differs between the four races — categories, age bands,
distances, labels, wave sizes and ordering, relay cups and characters — is data in a
`RaceConfig` (`lib/configs/`). If you are writing `if (slug === 'sd')`, the answer is a config
field instead. New races are added by cloning a config, not by adding a code path.

**3. The golden tests are the spec.** `lib/configs/golden.test.ts` and
`lib/engine/history.golden.test.ts` pin every seeded config to the exact 2025 WebScorer labels,
using sanitized fixtures. If your change breaks them, assume your change is wrong. Changing
2025 labels is a race-director decision — raise it on the issue, don't edit the test quietly.

## Setup

```bash
npm ci
docker compose up -d          # Postgres + Neon HTTP proxy
npm run db:migrate && npm run db:seed
npm run dev
```

Sign-in needs `AUTH_SECRET` and Google OAuth credentials in `.env.local`. Ask Dan.

Schema changes: `npm run db:generate` then `npm run db:migrate`. **Never `db:push`** — it needs
Neon's WebSocket driver, which the local proxy doesn't speak.

## Agents in CI

Adding the `agent:go` label to an issue makes Claude build it and open a PR
(`.github/workflows/claude-issue.yml`). It only runs if the person who applied the label has
write access — this repo is public and that job holds an API key.

Two secrets make it work:

| Secret | Why |
|---|---|
| `ANTHROPIC_API_KEY` | Pays for the run. |
| `GH_AGENT_TOKEN` | Fine-grained PAT: contents, pull requests, issues, **projects** — all write. |

`GH_AGENT_TOKEN` is not optional. A PR opened with the default `GITHUB_TOKEN` does not trigger
`ci.yml` (GitHub suppresses that to prevent recursion), so its required check never runs and
the PR can never merge. `GITHUB_TOKEN` also has no Projects v2 access at all, so board moves
would silently do nothing. **If an agent PR appears with no CI check on it, that token is the
first thing to check.**
