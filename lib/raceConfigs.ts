import "server-only";
import { eq } from "drizzle-orm";
import { races } from "@/db/schema";
import { getDb, hasDatabase } from "@/db";
import type { HandoutTemplate, RaceConfig } from "@/lib/engine/models";
import { SEED_CONFIGS, getSeedConfig } from "@/lib/configs";

/**
 * Source of race configs for the app. Reads from Neon when DATABASE_URL is set
 * and the table is populated; otherwise falls back to the in-code seed configs
 * so the app is usable before the database is provisioned.
 */
export async function getRaceConfigs(): Promise<RaceConfig[]> {
  if (!hasDatabase()) return SEED_CONFIGS;
  try {
    const rows = await getDb().select().from(races);
    if (rows.length === 0) return SEED_CONFIGS;
    return rows.map((r) => r.config);
  } catch {
    return SEED_CONFIGS;
  }
}

export async function getRaceConfig(slug: string): Promise<RaceConfig | undefined> {
  const all = await getRaceConfigs();
  return all.find((c) => c.slug === slug);
}

/**
 * Upsert a full race config by slug (seed configs get materialized into the DB
 * on first edit). Requires a DB.
 */
export async function saveRaceConfig(config: RaceConfig): Promise<RaceConfig> {
  if (!hasDatabase()) throw new Error("No database connected");
  await getDb()
    .insert(races)
    .values({ slug: config.slug, name: config.name, raceDate: config.raceDate ?? null, config })
    .onConflictDoUpdate({
      target: races.slug,
      set: { name: config.name, raceDate: config.raceDate ?? null, config, updatedAt: new Date() },
    });
  return config;
}

/** Create a new race config; throws if the slug is already taken. */
export async function createRaceConfig(config: RaceConfig): Promise<RaceConfig> {
  if (await getRaceConfig(config.slug)) {
    throw new Error(`A race with slug "${config.slug}" already exists`);
  }
  return saveRaceConfig(config);
}

export async function deleteRaceConfig(slug: string): Promise<boolean> {
  if (!hasDatabase()) throw new Error("No database connected");
  const rows = await getDb().delete(races).where(eq(races.slug, slug)).returning({ slug: races.slug });
  return rows.length > 0;
}

/** Restore a seeded race to its built-in default; throws for non-seeded slugs. */
export async function resetRaceConfig(slug: string): Promise<RaceConfig> {
  const seed = getSeedConfig(slug);
  if (!seed) throw new Error(`No built-in default for "${slug}"`);
  return saveRaceConfig(seed);
}

/**
 * Persist edited handout templates for one event of a race. Upserts the race
 * row. Requires a DB.
 */
export async function updateEventHandoutTemplates(
  slug: string,
  eventId: string,
  templates: HandoutTemplate[],
): Promise<RaceConfig> {
  const current = await getRaceConfig(slug);
  if (!current) throw new Error(`Unknown race: ${slug}`);
  return saveRaceConfig({
    ...current,
    events: current.events.map((e) =>
      e.id === eventId ? { ...e, handoutTemplates: templates } : e,
    ),
  });
}

/** Whether configs are coming from the live database vs. the in-code seeds. */
export async function configsAreLive(): Promise<boolean> {
  if (!hasDatabase()) return false;
  try {
    const rows = await getDb().select({ slug: races.slug }).from(races).limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}
