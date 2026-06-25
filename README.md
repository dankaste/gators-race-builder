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
cp .env.example .env.local   # fill in DATABASE_URL
npm run dev                  # http://localhost:3000
npm test                     # engine unit tests
npm run build                # production build
```

## Database

```bash
npm run db:generate          # generate SQL migrations from db/schema.ts
npm run db:push              # apply schema to the Neon database
```

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
never stored, and there is a per-season purge policy. Never log PII.
