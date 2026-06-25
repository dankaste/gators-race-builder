import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { RaceConfig } from "@/lib/engine/models";

/**
 * Race configurations (team-shared, NON-PII). The `config` jsonb holds the
 * engine's {@link RaceConfig} — category rules, wave rules, relay + handout
 * templates — so the editable config keeps the TypeScript types as its schema.
 */
export const races = pgTable("races", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  raceDate: text("race_date"),
  config: jsonb("config").$type<RaceConfig>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A race project: one running instance of a race for a given season. The
 * `state` jsonb holds the shared working data (roster, assignments, handout
 * overlays). NOTE: this contains minors' PII — access is director-only and the
 * DB is encrypted at rest. Raw uploads are never stored, only derived state.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raceSlug: text("race_slug").notNull(),
    name: text("name").notNull(),
    season: text("season").notNull(),
    status: text("status").notNull().default("draft"),
    state: jsonb("state")
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastEditedBy: text("last_edited_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("projects_race_slug_idx").on(table.raceSlug)],
);

/**
 * Directors permitted to sign in (team-shared allowlist, NON-PII). The signed-in
 * director team manages this list in-app; an env `DIRECTOR_BOOTSTRAP` list seeds
 * the first entries and is always allowed even if absent here (can't lock out).
 * Email is the primary key, stored lowercased.
 */
export const directors = pgTable("directors", {
  email: text("email").primaryKey(),
  name: text("name"),
  image: text("image"),
  addedByEmail: text("added_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Race = typeof races.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Director = typeof directors.$inferSelect;
