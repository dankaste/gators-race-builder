@AGENTS.md

# Gators Race Director — project guide

Turns a **PlayMetrics registration export** into a **WebScorer start list** + **race-day
handouts** for the Gators Race Series (Swamp Dash `sd`, John Bryan `jb`, Chestnut Scorcher
`cs`, Swamp Dash Relay `sdr`). Neither PlayMetrics nor WebScorer has an API, so the app
automates everything *between* the exports and the manual WebScorer upload.

## Commands
- `npm run dev` — dev server (falls back to :3001 if :3000 is taken).
- `npm test` / `npm run test:watch` — Vitest (engine + schema). Keep green.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — must all pass before committing.
- Local DB: `docker compose up -d` (Postgres + Neon HTTP proxy), then `npm run db:migrate && npm run db:seed`.
- DB changes: `db:generate` (SQL) → `db:migrate` (apply via HTTP driver). **Do NOT use `db:push`** — it needs Neon's WebSocket driver, which the local proxy doesn't speak.

## Architecture
- `lib/engine/*` — **pure, framework-agnostic TypeScript**, runs in the browser. Parse →
  age → categorize → seed → waves → transform → validate → export → handouts → relay. Fully
  unit-tested. No React/Next/server imports here.
- `lib/configs/*` — the four seeded `RaceConfig`s (`SEED_CONFIGS`), built from real 2025 data.
- `lib/raceConfigs.ts` (server-only) — read configs (DB with seed-fallback) + save/create/
  delete/reset. `lib/projects.ts` (server-only) — project CRUD.
- `db/` — Drizzle schema; `races.config` and `projects.state` are `jsonb` holding the engine
  types. Lazy `getDb()` (throws only when used without `DATABASE_URL`).
- `app/` + `components/` — Next.js App Router UI. The engine is imported directly into client
  components; persistence goes through `app/api/**` route handlers.

## Conventions & rules (important)
- **Config-driven, not code-driven.** Anything that differs between races (categories, age
  bands, distances, labels, wave sizes/ordering, relay cups/characters) is **data** in
  `RaceConfig`, never a branch in code. Add/adjust races via config, not new code paths.
- **Golden tests pin the in-code seeds.** `lib/configs/golden.test.ts` asserts every config
  reproduces the exact 2025 WebScorer labels using **sanitized fixtures** (demographics +
  labels only — never PII). Don't weaken these. Editing the *DB* config can't break them, and
  "Reset to built-in default" restores a seed.
- **PII & credentials — never commit either.** Rider data is minors' PII. Real registration
  files live in `../All 2025 Race Docs/` (OUTSIDE the repo); never copy them in. Tests read
  them via `realdata.test.ts` (skips if absent). No PII in logs. **Never embed the WebScorer
  login/password** (they're in the source docx) anywhere in UI or code — the repo is public.
- **Privacy posture:** app is `noindex`; error pages don't render data. **Auth is enforced**:
  Auth.js (Google) + a DB-managed director allowlist. `proxy.ts` redirects unauthenticated
  users (optimistic); the real gate is `lib/auth-dal.ts` (`requireDirector` on pages,
  `apiRequireDirector` in route handlers), which re-checks the allowlist each request so
  removing a director revokes access. `DIRECTOR_BOOTSTRAP` seeds the first director(s) and
  can't be locked out; directors then manage each other at `/directors`. Local dev still
  needs `AUTH_SECRET` + Google creds in `.env.local` to sign in.
- **Next.js 16 (read the bundled docs):** dynamic-route `params` is a `Promise` (await it);
  route handlers are `export async function GET/POST/...`.
- **Slug is immutable after creation** — `projects.raceSlug` links to it. Settable only when
  cloning a new race.
- **Zod `source` strings are intentionally looser** than the `HandoutFieldSource` union; cast
  to the engine type at the API boundary (see `app/api/races/[slug]/route.ts`).

## Pending (deferred)
The Vercel + Neon production deploy (auth is wired; set `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `DIRECTOR_BOOTSTRAP` in Vercel) and the per-season retention/purge job.
