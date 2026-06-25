import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { directors, type Director } from "@/db/schema";

export type { Director };

/**
 * Always-allowed bootstrap emails from the environment. These seed the first
 * director(s) and remain allowed even if missing from the table, so the team can
 * never be locked out. Accepts the historical `DIRECTOR_ALLOWLIST` name too.
 */
export function bootstrapEmails(): string[] {
  const raw = process.env.DIRECTOR_BOOTSTRAP ?? process.env.DIRECTOR_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function normalize(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * The single allowlist seam: an email may sign in if it's a bootstrap email or
 * present in the `directors` table. Used both at login (Auth.js `signIn`
 * callback) and on every protected request (the DAL), so removing a director
 * revokes their access even with a still-valid JWT.
 */
export async function isAllowedDirector(email: string | null | undefined): Promise<boolean> {
  const e = normalize(email);
  if (!e) return false;
  if (bootstrapEmails().includes(e)) return true;
  if (!hasDatabase()) return false;
  const rows = await getDb().select({ email: directors.email }).from(directors).where(eq(directors.email, e)).limit(1);
  return rows.length > 0;
}

export async function listDirectors(): Promise<Director[]> {
  return getDb().select().from(directors).orderBy(asc(directors.email));
}

export async function addDirector(input: {
  email: string;
  name?: string | null;
  addedByEmail?: string | null;
}): Promise<Director> {
  const email = normalize(input.email);
  if (!email) throw new Error("Email is required");
  const rows = await getDb()
    .insert(directors)
    .values({ email, name: input.name ?? null, addedByEmail: normalize(input.addedByEmail) || null })
    .onConflictDoNothing()
    .returning();
  // Already present → return the existing row.
  if (rows[0]) return rows[0];
  const existing = await getDb().select().from(directors).where(eq(directors.email, email)).limit(1);
  return existing[0];
}

/**
 * Remove a director. Refuses to remove a bootstrap email (it would just be
 * re-allowed) or the last remaining DB director, surfacing a clear error.
 */
export async function removeDirector(email: string): Promise<void> {
  const e = normalize(email);
  if (bootstrapEmails().includes(e)) {
    throw new Error("Bootstrap directors are set via DIRECTOR_BOOTSTRAP and cannot be removed here.");
  }
  const all = await listDirectors();
  if (all.length <= 1) {
    throw new Error("Cannot remove the last director.");
  }
  await getDb().delete(directors).where(eq(directors.email, e));
}
