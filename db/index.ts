import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

/** Hosts that mean "local dev proxy" (see docker-compose.yml). */
function isLocalProxyHost(host: string): boolean {
  return host === "db.localtest.me" || host === "localhost" || host === "127.0.0.1";
}

/**
 * Lazily create the Drizzle client. Uses the Neon serverless HTTP driver both in
 * production (real Neon endpoint) and locally (a Postgres + local-neon-http-proxy
 * via docker-compose), so the same code path runs everywhere. Throws only when
 * used without a DATABASE_URL — pages can fall back to seed configs before setup.
 */
export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");

  if (isLocalProxyHost(new URL(url).hostname)) {
    // Point the HTTP driver at the local proxy's /sql endpoint.
    neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  }

  _db = drizzle(neon(url), { schema });
  return _db;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
