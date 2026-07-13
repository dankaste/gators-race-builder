/**
 * Apply pending SQL migrations to the race-day hub's local PGlite store.
 * Uses the exact same `db/migrations/*.sql` files `db:generate` produces for
 * the cloud/dev database — just a different apply target.
 *   npm run raceday:migrate
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

async function main() {
  const dataDir = process.env.RACEDAY_DATA_DIR;
  if (!dataDir) {
    throw new Error("RACEDAY_DATA_DIR must be set. See RACEDAY.md.");
  }
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: "./db/migrations" });
  console.log("Race-day hub migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
