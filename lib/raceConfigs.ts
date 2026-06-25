import "server-only";
import { races } from "@/db/schema";
import { getDb, hasDatabase } from "@/db";
import type { HandoutTemplate, RaceConfig } from "@/lib/engine/models";
import { SEED_CONFIGS } from "@/lib/configs";

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
 * Persist edited handout templates for one event of a race. Upserts the race
 * row (seed configs get materialized into the DB on first edit). Requires a DB.
 */
export async function updateEventHandoutTemplates(
  slug: string,
  eventId: string,
  templates: HandoutTemplate[],
): Promise<RaceConfig> {
  if (!hasDatabase()) throw new Error("No database connected");
  const current = await getRaceConfig(slug);
  if (!current) throw new Error(`Unknown race: ${slug}`);
  const next: RaceConfig = {
    ...current,
    events: current.events.map((e) =>
      e.id === eventId ? { ...e, handoutTemplates: templates } : e,
    ),
  };
  await getDb()
    .insert(races)
    .values({ slug: next.slug, name: next.name, raceDate: next.raceDate ?? null, config: next })
    .onConflictDoUpdate({ target: races.slug, set: { config: next, updatedAt: new Date() } });
  return next;
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
