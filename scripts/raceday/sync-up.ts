/**
 * CLI wrapper around `syncUp()` — manual/testing use only. In normal
 * operation this runs automatically via the background sync loop
 * (`lib/raceday/syncLoop.ts`) whenever the hub has connectivity.
 *   npm run raceday:sync-up -- --project <projectId>
 */
import { syncUp } from "@/lib/raceday/sync";

function getArg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

async function main() {
  const projectId = getArg("project");
  await syncUp(projectId);
  console.log(`Synced project ${projectId} up to the cloud.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
