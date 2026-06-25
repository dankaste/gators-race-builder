/**
 * Seed the four race configurations and the bootstrap director allowlist.
 * Run after provisioning Neon: `npm run db:migrate && npm run db:seed`.
 * Idempotent — upserts configs by slug; inserts bootstrap directors if absent.
 */
import { SEED_CONFIGS } from "../lib/configs";
import { directors, races } from "./schema";
import { getDb } from "./index";

/** Bootstrap emails from the env (matches lib/directors#bootstrapEmails). */
function bootstrapEmails(): string[] {
  const raw = process.env.DIRECTOR_BOOTSTRAP ?? process.env.DIRECTOR_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

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

  const emails = bootstrapEmails();
  for (const email of emails) {
    await db.insert(directors).values({ email }).onConflictDoNothing();
  }
  console.log(
    emails.length
      ? `Seeded ${emails.length} bootstrap director(s): ${emails.join(", ")}`
      : "No DIRECTOR_BOOTSTRAP set — skipping director seed (set it before deploying with real data).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
