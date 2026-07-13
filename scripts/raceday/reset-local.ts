/**
 * Wipes the hub's local PGlite store AND the local finish-camera video
 * directory, so old event data doesn't bleed into next season. Destructive —
 * requires an explicit --confirm flag. Run only after `syncUp()` has been
 * confirmed successful (check the Sync panel's "last synced" timestamp).
 *   npm run raceday:reset-local -- --confirm
 */
import { rm } from "fs/promises";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "Refusing to run without --confirm. This permanently deletes the hub's local race-day data " +
        "and recorded video clips. Only run this after confirming sync-up succeeded.",
    );
    process.exit(1);
  }

  const dataDir = process.env.RACEDAY_DATA_DIR;
  if (!dataDir) throw new Error("RACEDAY_DATA_DIR must be set. See RACEDAY.md.");

  await rm(dataDir, { recursive: true, force: true });
  console.log(`Removed local race-day data at ${dataDir} (including recorded video clips).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
