import "server-only";
import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { raceHistoryImports, raceHistoryResults, type RaceHistoryImport } from "@/db/schema";
import { normName } from "@/lib/engine/nameMatch";
import type { HistoryRow } from "@/lib/engine/history";

export type { RaceHistoryImport };

/**
 * Server-only CRUD for the persisted "Race History" import (mirrors the shape
 * of `lib/projects.ts`). There is at most one import at a time — a new one
 * replaces the prior wholesale, since it's a periodic re-export of the same
 * multi-season WebScorer data, not something to accumulate duplicates of.
 */

/** Postgres has a 65535 bind-parameter limit; 3000+ rows × 16 columns is close to it in one statement. */
const INSERT_CHUNK_SIZE = 500;

type ResultInsert = typeof raceHistoryResults.$inferInsert;

function toDbRow(importId: string, row: HistoryRow): ResultInsert {
  return {
    importId,
    firstName: row.firstName,
    lastName: row.lastName,
    nameKey: normName(`${row.lastName} ${row.firstName}`),
    raceSlug: row.raceSlug,
    season: row.season,
    eventLabel: row.eventLabel,
    category: row.category,
    ageOnRaceDay: row.age,
    gender: row.gender,
    timeSeconds: row.timeSeconds,
    status: row.status,
    place: row.place,
    groupSize: row.groupSize,
    distanceLabel: row.distanceLabel,
  };
}

export async function getCurrentImport(): Promise<RaceHistoryImport | undefined> {
  const rows = await getDb().select().from(raceHistoryImports).orderBy(desc(raceHistoryImports.importedAt)).limit(1);
  return rows[0];
}

/** Deletes the current import (cascades to its results). No-op if there isn't one. */
export async function clearHistory(): Promise<void> {
  await getDb().delete(raceHistoryImports);
}

/**
 * Replace the current history with a freshly-parsed CSV's rows, atomically.
 * The neon-http driver has no `db.transaction()` — `db.batch()` maps to one
 * server-side transaction instead, so the old import's deletion, the new
 * import row, and every chunked results insert either all land or none do.
 */
export async function importHistory(
  filename: string,
  rows: HistoryRow[],
  importedByEmail?: string,
): Promise<RaceHistoryImport> {
  const db = getDb();
  const id = randomUUID();
  const importedAt = new Date();
  const importRow = { id, filename, rowCount: rows.length, importedAt, importedByEmail: importedByEmail ?? null };

  const chunks: ResultInsert[][] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + INSERT_CHUNK_SIZE).map((r) => toDbRow(id, r)));
  }

  const statements = [
    db.delete(raceHistoryImports),
    db.insert(raceHistoryImports).values(importRow),
    ...chunks.map((chunk) => db.insert(raceHistoryResults).values(chunk)),
  ];
  // db.batch()'s type wants a statically-known non-empty tuple; ours is built at
  // runtime from a variable row count, so the cast is the boundary — the array is
  // always non-empty (delete + import-insert are unconditional).
  await db.batch(statements as unknown as [(typeof statements)[number], ...(typeof statements)[number][]]);

  return importRow as RaceHistoryImport;
}

/**
 * Full history table, shaped back into the engine's `HistoryRow` for the
 * estimator (`lib/engine/history.ts`). Never shipped raw to the browser —
 * only the small per-rider estimate (`estimateLapTimes`'s result) crosses
 * the wire, via `/api/history/estimates`, matching how `match-bibs` keeps
 * its source PII server-side.
 */
export async function getAllHistoryResults(): Promise<HistoryRow[]> {
  const rows = await getDb().select().from(raceHistoryResults);
  return rows.map((r) => ({
    bib: "",
    firstName: r.firstName,
    lastName: r.lastName,
    raceSlug: r.raceSlug as HistoryRow["raceSlug"],
    season: r.season,
    eventLabel: r.eventLabel,
    category: r.category,
    age: r.ageOnRaceDay,
    gender: r.gender as HistoryRow["gender"],
    timeSeconds: r.timeSeconds,
    status: r.status,
    place: r.place,
    groupSize: r.groupSize,
    distanceLabel: r.distanceLabel,
  }));
}
