import "server-only";
import { randomUUID } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { raceHistoryImports, raceHistoryResults, type RaceHistoryImport } from "@/db/schema";
import { normName } from "@/lib/engine/nameMatch";
import { deriveAgeCourseFactors, type AgeCourseFactor, type HistoryRow } from "@/lib/engine/history";

export type { RaceHistoryImport };

/**
 * Server-only CRUD for the persisted "Race History" data. Imports are
 * additive and append-only in the log (`raceHistoryImports`): every row
 * lands via an upsert keyed on (raceSlug, season, bib) — see `upsertHistory`
 * — so importing the multi-season baseline once and then a fresh race
 * result after every event just keeps building up the same table, updating
 * a rider's row in place if the same race/season/bib comes in again (a
 * corrected results file, or that rider showing up again in a later
 * multi-season dump). `wipeAllHistory` is the separate, rare, nuclear reset.
 */

/** Postgres has a 65535 bind-parameter limit; 3000+ rows × 17 columns is close to it in one statement. */
const CHUNK_SIZE = 400;

export type HistorySource = "bulk-history" | "race-result";

type ResultInsert = typeof raceHistoryResults.$inferInsert;

function toDbRow(importId: string, row: HistoryRow): ResultInsert {
  return {
    importId,
    bib: row.bib,
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

/** Every field an upsert should overwrite on conflict — everything except the (raceSlug, season, bib) key itself. */
const UPSERT_SET = {
  importId: sql`excluded.import_id`,
  firstName: sql`excluded.first_name`,
  lastName: sql`excluded.last_name`,
  nameKey: sql`excluded.name_key`,
  eventLabel: sql`excluded.event_label`,
  category: sql`excluded.category`,
  ageOnRaceDay: sql`excluded.age_on_race_day`,
  gender: sql`excluded.gender`,
  timeSeconds: sql`excluded.time_seconds`,
  status: sql`excluded.status`,
  place: sql`excluded.place`,
  groupSize: sql`excluded.group_size`,
  distanceLabel: sql`excluded.distance_label`,
};

export async function listImports(limit = 50): Promise<RaceHistoryImport[]> {
  return getDb().select().from(raceHistoryImports).orderBy(desc(raceHistoryImports.importedAt)).limit(limit);
}

export interface HistoryStats {
  totalRows: number;
  seasons: number[];
  raceSlugs: string[];
}

export async function getHistoryStats(): Promise<HistoryStats> {
  const rows = await getDb()
    .select({ season: raceHistoryResults.season, raceSlug: raceHistoryResults.raceSlug })
    .from(raceHistoryResults);
  const seasons = [...new Set(rows.map((r) => r.season).filter((s): s is number => s != null))].sort((a, b) => b - a);
  const raceSlugs = [...new Set(rows.map((r) => r.raceSlug).filter((s): s is string => s != null))].sort();
  return { totalRows: rows.length, seasons, raceSlugs };
}

/**
 * Age → full-course scaling factor, for the history page's audit table (see
 * deriveAgeCourseFactors). Reads the full history table server-side — same
 * as the estimator does — but only ever ships the small derived summary
 * (age/band/factor/n) to the browser, never a raw row: names are PII and
 * never cross the wire from here, matching getAllHistoryResults's own rule.
 */
export async function getAgeCourseFactors(ages: number[]): Promise<AgeCourseFactor[]> {
  const history = await getAllHistoryResults();
  return deriveAgeCourseFactors(history, ages);
}

/** Wipes ALL history (imports log + results) — the rare nuclear reset, not the normal path. */
export async function wipeAllHistory(): Promise<void> {
  await getDb().delete(raceHistoryImports); // cascades to results
}

/**
 * Upsert a batch of parsed rows (from either the multi-season bulk CSV or a
 * single race's fresh .xlsx results) into history, logging the import. Each
 * row is keyed on (raceSlug, season, bib) — Postgres never conflicts a row
 * missing any of those (NULLs are always distinct), so unclassified rows
 * just insert fresh, same as before this was upsert-based.
 *
 * The neon-http driver has no `db.transaction()` — `db.batch()` maps to one
 * server-side transaction instead, so the import-log row and every chunked
 * upsert either all land or none do.
 */
export async function upsertHistory(
  filename: string,
  rows: HistoryRow[],
  source: HistorySource,
  importedByEmail?: string,
): Promise<RaceHistoryImport> {
  const db = getDb();
  const id = randomUUID();
  const importedAt = new Date();
  const importRow = { id, filename, source, rowCount: rows.length, importedAt, importedByEmail: importedByEmail ?? null };

  // Postgres refuses to ON CONFLICT DO UPDATE the same row twice within one
  // statement — and the real historical export does have a handful of rows
  // sharing a (raceSlug, season, bib) key (data-entry bib collisions from
  // past seasons, or a rider corrected into a second category). Collapse
  // those before chunking, last one wins — same "most-recent wins"
  // convention lib/engine/nameMatch.ts's matchBibCandidates already uses for
  // conflicting bib data. Rows missing any key part are never collapsed
  // (each gets its own always-unique key), matching Postgres's own
  // NULL-is-distinct behavior for the real insert.
  let anon = 0;
  const dedupedRows = [...new Map(rows.map((r) => [r.raceSlug && r.season && r.bib ? `${r.raceSlug}|${r.season}|${r.bib}` : `_row_${anon++}`, r])).values()];

  const toInsert = dedupedRows.map((r) => toDbRow(id, r));
  const chunks: ResultInsert[][] = [];
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) chunks.push(toInsert.slice(i, i + CHUNK_SIZE));

  const statements = [
    db.insert(raceHistoryImports).values(importRow),
    ...chunks.map((chunk) =>
      db
        .insert(raceHistoryResults)
        .values(chunk)
        .onConflictDoUpdate({
          target: [raceHistoryResults.raceSlug, raceHistoryResults.season, raceHistoryResults.bib],
          set: UPSERT_SET,
        }),
    ),
  ];
  // db.batch()'s type wants a statically-known non-empty tuple; ours is built at
  // runtime from a variable row count, so the cast is the boundary — the array is
  // always non-empty (the import-log insert is unconditional).
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
    bib: r.bib,
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
