import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

/**
 * Historical WebScorer results (multi-season, multi-race), imported once from
 * the "Rider History Race Result" export and reused every time relay teams
 * are built. Director-only PII, same posture as `projects.state` — a bigger
 * retention surface (8 seasons of minors' names) than any other table here,
 * so it's the first candidate for the per-season retention/purge job noted
 * as pending in CLAUDE.md. A new import replaces the prior one wholesale
 * (see `lib/raceHistory.ts`) rather than accumulating duplicates.
 *
 * These tables ride along with every other migration onto the race-day hub's
 * local PGlite store (`db/raceday-migrate.ts` applies all of `db/migrations`
 * unconditionally) — that only creates the empty schema there, since no
 * race-day code ever writes to it; nothing here is synced to the field.
 */
export const raceHistoryImports = pgTable("race_history_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  importedByEmail: text("imported_by_email"),
});

export const raceHistoryResults = pgTable(
  "race_history_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => raceHistoryImports.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    nameKey: text("name_key").notNull(),
    raceSlug: text("race_slug"), // "sd" | "cs" | "jb" | "sdr" | null (unclassified)
    season: integer("season"),
    eventLabel: text("event_label").notNull(),
    category: text("category").notNull(),
    ageOnRaceDay: integer("age_on_race_day"),
    gender: text("gender"), // "M" | "F" | null
    timeSeconds: doublePrecision("time_seconds"), // null = DNF/DNS/unparseable
    status: text("status").notNull(),
    place: integer("place"),
    groupSize: integer("group_size"),
    distanceLabel: text("distance_label").notNull(),
  },
  (table) => [
    index("race_history_results_import_idx").on(table.importId),
    index("race_history_results_name_key_idx").on(table.nameKey),
  ],
);

export type Race = typeof races.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Director = typeof directors.$inferSelect;
export type RaceHistoryImport = typeof raceHistoryImports.$inferSelect;
export type RaceHistoryResult = typeof raceHistoryResults.$inferSelect;

// ---------------------------------------------------------------------------
// Race day — granular, idempotent tables (one row per tap/action) so
// concurrent writes from different stations never clobber each other. All
// additive, all FK-cascade off `projects`, never touch `projects.state`
// directly except via the roster-write path (walk-up registration).
// See lib/engine/raceDay.ts for the pure functions these feed.
// ---------------------------------------------------------------------------

/** One active access token per project — the bearer credential every station link carries. */
export const raceDayTokens = pgTable("race_day_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByEmail: text("created_by_email"),
});

export const raceDayCheckIns = pgTable(
  "race_day_check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    playerId: text("player_id").notNull(),
    checkedIn: boolean("checked_in").notNull().default(true),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    recordedBy: text("recorded_by"),
    idempotencyKey: text("idempotency_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("race_day_check_ins_project_event_player_idx").on(
      table.projectId,
      table.eventId,
      table.playerId,
    ),
  ],
);

/** The real, as-it-happened clock time a wave rolled (distinct from the computed/approximate schedule). */
export const raceDayWaveStarts = pgTable(
  "race_day_wave_starts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    wave: integer("wave").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by"),
    idempotencyKey: text("idempotency_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("race_day_wave_starts_project_event_wave_idx").on(
      table.projectId,
      table.eventId,
      table.wave,
    ),
  ],
);

/** Explicit start-line marks — riders default to "started" with no row at all once their wave rolls. */
export const raceDayStartMarks = pgTable(
  "race_day_start_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    playerId: text("player_id").notNull(),
    wave: integer("wave").notNull(),
    status: text("status").notNull(), // "started" | "dns"
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: text("recorded_by"),
    idempotencyKey: text("idempotency_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("race_day_start_marks_project_event_player_idx").on(
      table.projectId,
      table.eventId,
      table.playerId,
    ),
  ],
);

/**
 * Append-only, immutable-order sequence of raw finish-line timestamps for the
 * whole event (not per-wave — waves overlap on course, see raceDay.ts). Only
 * mutation allowed is voiding a phantom/duplicate tap; never reordered.
 */
export const raceDayFinishTimeTaps = pgTable(
  "race_day_finish_time_taps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("race_day_finish_time_taps_project_event_idx").on(table.projectId, table.eventId)],
);

/**
 * The single reorderable list a director drags into believed-crossing-order.
 * `computeFinishResults()` (lib/engine/raceDay.ts) derives results by pairing
 * this list's positions against the fixed tap sequence above — there is no
 * separately-persisted results table to keep in sync.
 */
export const raceDayFinishOrder = pgTable(
  "race_day_finish_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    sortOrder: integer("sort_order").notNull(),
    playerId: text("player_id"),
    bib: text("bib").notNull(),
    editedTime: timestamp("edited_time", { withTimezone: true }),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("race_day_finish_order_project_event_sort_idx").on(
      table.projectId,
      table.eventId,
      table.sortOrder,
    ),
  ],
);

export const raceDayDnfMarks = pgTable(
  "race_day_dnf_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    playerId: text("player_id").notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
    markedBy: text("marked_by"),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("race_day_dnf_marks_project_event_player_idx").on(
      table.projectId,
      table.eventId,
      table.playerId,
    ),
  ],
);

/** `playerId` nullable — supports "unknown rider / general location" reports from Course Watch. */
export const raceDayIncidents = pgTable("race_day_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  playerId: text("player_id"),
  type: text("type").notNull(), // "crash" | "injury" | "mechanical" | "other"
  note: text("note"),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  reportedBy: text("reported_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
});

/**
 * At most one active (uncleared) row per project — enforced by a partial
 * unique index so a second concurrent trigger can't create a duplicate
 * "active" evac event. Every station's poll surfaces whichever row has
 * `clearedAt IS NULL`.
 */
export const raceDayEvacEvents = pgTable(
  "race_day_evac_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    triggeredBy: text("triggered_by"),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    clearedBy: text("cleared_by"),
  },
  (table) => [
    uniqueIndex("race_day_evac_events_active_idx")
      .on(table.projectId)
      .where(sql`${table.clearedAt} IS NULL`),
  ],
);

/**
 * Metadata only — the actual video bytes live on the hub's local disk under
 * `RACEDAY_DATA_DIR/videos/`, never as a DB blob, and are never synced to the
 * cloud. `startedAt` is the recording's start against the hub's own clock —
 * the only anchor that lets a finish-tap timestamp map to a scrub position.
 */
export const raceDayFinishVideos = pgTable("race_day_finish_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  device: text("device"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  filePath: text("file_path").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per device that's completed "Add to Home Screen" + `PushManager.subscribe()`.
 * Cloud-only — lives in the real Postgres, never the hub's PGlite, since push
 * delivery only ever happens through the cloud path (see EVAC in the plan).
 */
export const raceDayPushSubscriptions = pgTable("race_day_push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generic Stripe-style replay guard every write handler checks first. */
export const raceDayIdempotencyKeys = pgTable("race_day_idempotency_keys", {
  key: text("key").primaryKey(),
  route: text("route").notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RaceDayToken = typeof raceDayTokens.$inferSelect;
export type RaceDayCheckIn = typeof raceDayCheckIns.$inferSelect;
export type RaceDayWaveStart = typeof raceDayWaveStarts.$inferSelect;
export type RaceDayStartMark = typeof raceDayStartMarks.$inferSelect;
export type RaceDayFinishTimeTap = typeof raceDayFinishTimeTaps.$inferSelect;
export type RaceDayFinishOrderRow = typeof raceDayFinishOrder.$inferSelect;
export type RaceDayDnfMark = typeof raceDayDnfMarks.$inferSelect;
export type RaceDayIncident = typeof raceDayIncidents.$inferSelect;
export type RaceDayEvacEvent = typeof raceDayEvacEvents.$inferSelect;
export type RaceDayFinishVideo = typeof raceDayFinishVideos.$inferSelect;
export type RaceDayPushSubscription = typeof raceDayPushSubscriptions.$inferSelect;
