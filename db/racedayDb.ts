import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { getDb } from "./index";
import * as schema from "./schema";

type RaceDayDb = PgliteDatabase<typeof schema> | ReturnType<typeof getDb>;

let _raceDayDb: RaceDayDb | null = null;

/**
 * The only file in the app that knows PGlite exists. When running as the
 * race-day hub (`RACEDAY_MODE=local`), lazily construct a PGlite instance
 * persisted at `RACEDAY_DATA_DIR` and wrap it with Drizzle. Otherwise
 * delegate unchanged to the existing `getDb()` — `db/index.ts` and every
 * existing table/query is untouched, and the "same driver in dev and prod"
 * property for `races`/`projects`/`directors` still holds.
 *
 * Both branches return a Drizzle instance over the same `schema`, so callers
 * (API routes, sync logic) never need to know or care which one they got.
 */
export function getRaceDayDb(): RaceDayDb {
  if (_raceDayDb) return _raceDayDb;

  if (process.env.RACEDAY_MODE === "local") {
    const dataDir = process.env.RACEDAY_DATA_DIR;
    if (!dataDir) {
      throw new Error("RACEDAY_DATA_DIR must be set when RACEDAY_MODE=local. See RACEDAY.md.");
    }
    _raceDayDb = drizzlePglite(new PGlite(dataDir), { schema });
    return _raceDayDb;
  }

  _raceDayDb = getDb();
  return _raceDayDb;
}

export function isLocalHub(): boolean {
  return process.env.RACEDAY_MODE === "local";
}
