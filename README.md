# Gators Race Director

Turns a **PlayMetrics registration export** into a **WebScorer start list** and
**race-day handouts** for the Gators Race Series (Swamp Dash, John Bryan,
Chestnut Scorcher, and the Swamp Dash Relay).

Neither PlayMetrics nor WebScorer has an API, so the app automates everything
*between* the exports and the manual WebScorer upload: compute age on race day,
assign Category + Distance, resolve bibs from the PlayMetrics player export, seed
and group riders into waves (or build relay teams), let the director team review
and correct, then export the upload file and handouts.

## Stack

- **Next.js 16 + TypeScript** (App Router), deployed to **Vercel** (hobby tier).
- **Transform engine** (`lib/engine/`): pure, framework-agnostic TS — runs in the
  browser so registration PII never leaves the client during processing. Unit
  tested with **Vitest**.
- **Neon Postgres + Drizzle** (`db/`): stores team-shared race configs (non-PII)
  and persisted project state. Configs live as the engine's `RaceConfig` type in
  a `jsonb` column.
- **Auth.js (Google)** with a director email allowlist — added in a later milestone.
- Theme matches [thetrailgators.org](https://thetrailgators.org) (dark UI, green
  brand accents, Source Sans).

## Develop

```bash
npm install
docker compose up -d         # local Postgres + Neon HTTP proxy
cp .env.example .env.local   # DATABASE_URL is already set for local docker
npm run db:migrate           # apply schema to the local DB
npm run db:seed              # load the 4 race configs
npm run dev                  # http://localhost:3000
npm test                     # engine unit tests
npm run build                # production build
```

## Database

Local dev uses a Dockerized Postgres fronted by `local-neon-http-proxy`, so the
same `@neondatabase/serverless` HTTP driver runs locally and in production — no
cloud account needed offline. `DATABASE_URL` for local:
`postgres://postgres:postgres@db.localtest.me:5432/main`.

```bash
npm run db:generate          # generate SQL migrations from db/schema.ts
npm run db:migrate           # apply migrations via the HTTP driver (local or Neon)
npm run db:seed              # upsert the 4 race configs
```

In production, point `DATABASE_URL` at your Neon database and run the same
`db:migrate` / `db:seed`.

## Deploy (Vercel + Neon)

1. Push this repo to GitHub.
2. In Vercel, **New Project → import the repo**.
3. Add a **Neon** Postgres store (Vercel → Storage) or paste a `neon.tech`
   connection string as the `DATABASE_URL` env var.
4. Deploy. (Auth + the director allowlist are wired in a later milestone before
   any real rider data is stored.)

## Privacy

Project state contains minors' PII. Access is director-only (allowlist auth),
the database is encrypted at rest (Neon) and in transit (TLS), raw uploads are
never stored (only derived state), and there is a per-season purge policy. PII is
never logged, the app is `noindex`, and error pages never render data details.

## Before production (REQUIRED)

The app ships with **no access control** for local development — a warning banner
shows on data pages until auth is configured. Before deploying with real data,
set up **Auth.js (Google) with a director allowlist**:

1. `npm install next-auth@beta`
2. Create a Google OAuth client; set env vars: `AUTH_SECRET` (run `npx auth secret`),
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `DIRECTOR_ALLOWLIST` (comma-separated
   emails).
3. Add `auth.ts` with the Google provider and a `signIn` callback that rejects any
   email not in `DIRECTOR_ALLOWLIST`.
4. Protect routes (App Router `proxy`/middleware or per-page `auth()` checks) so
   `/projects/**` and `/api/**` require a signed-in allowlisted director.

Once `AUTH_SECRET` + `AUTH_GOOGLE_ID` are set, the warning banner disappears
(`lib/security.ts#authConfigured`). Also set a **retention job** to purge old
seasons' projects.
