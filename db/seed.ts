/**
 * Seed the four race configurations into the database.
 * Run after provisioning Neon: `npm run db:push && npm run db:seed`.
 * Idempotent — upserts by slug, so re-running refreshes configs in place.
 */
import { SEED_CONFIGS } from "../lib/configs";
import { races } from "./schema";
import { getDb } from "./index";

async function main() {
  const db = getDb();
  for (const cfg of SEED_CONFIGS) {
    await db
      .insert(races)
      .values({ slug: cfg.slug, name: cfg.name, raceDate: cfg.raceDate ?? null, config: cfg })
      .onConflictDoUpdate({
        target: races.slug,
        set: { name: cfg.name, raceDate: cfg.raceDate ?? null, config: cfg, updatedAt: new Date() },
      });
    console.log(`seeded ${cfg.slug} (${cfg.name}) — ${cfg.events.length} event(s)`);
  }
  console.log(`Done. ${SEED_CONFIGS.length} race configs seeded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
