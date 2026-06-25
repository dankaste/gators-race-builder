import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

/**
 * Lazily create the Drizzle client. Throws only when actually used without a
 * DATABASE_URL — so pages can fall back to seed configs before Neon is wired up.
 */
export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  _db = drizzle(neon(url), { schema });
  return _db;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
