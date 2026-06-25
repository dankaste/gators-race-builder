/**
 * Core domain types for the race-transform engine.
 *
 * The engine is pure, framework-agnostic TypeScript: given a parsed registration
 * export plus a race config, it produces categorized/seeded/waved riders (or relay
 * teams) ready for WebScorer export and handouts. Everything that differs between
 * races lives in {@link RaceConfig}, not in code.
 *
 * The {@link CategoryDef} shape (classification predicate + wave settings in one
 * object) follows the proven 2024 prototype's config model.
 */

export type Gender = "M" | "F";

export type EventType = "individual" | "relay";

/** A single rider as parsed from a PlayMetrics registration export. */
export interface RegistrationRow {
  playerId: string;
  firstName: string;
  lastName: string;
  gender: Gender | string;
  birthDate: string; // raw value as exported (e.g. "4/26/2021")
  packageName: string; // PlayMetrics package, e.g. "Balance Bike" / "Novice" / "Advanced 1 Lap (2.x)"
  status?: string; // "Completed" / "Canceled" — canceled rows are dropped
  accountFirstName?: string;
  accountLastName?: string;
  accountEmail?: string;
  accountPhone?: string;
  /** Race-specific custom registration questions, keyed by their export header. */
  custom?: Record<string, string>;
}

/** A roster (PlayMetrics player export) entry — source of bibs, team, and contact. */
export interface RosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  bib: number | string | null; // PlayMetrics "number" column = plate/bib
  gender: Gender | string;
  birthDate: string;
  team?: string; // GBP team name — drives seed level
  email?: string;
  parentName?: string;
  phone?: string;
}

/** A rider after the engine has computed derived fields. */
export interface Rider {
  playerId: string;
  firstName: string;
  lastName: string;
  gender: Gender | string;
  birthDate: string;
  ageOnRaceDay: number | null;
  packageName: string;
  bib: number | string | null;
  email?: string;
  parentName?: string;
  phone?: string;
  team?: string;
  categoryLabel: string | null;
  distanceLabel: string | null;
  /** Seed rank from GBP team placement (lower = more beginner/slower). Null = unseeded. */
  seedLevel: number | null;
  wave: number | null;
  custom?: Record<string, string>;
  /** Non-fatal issues surfaced for director review (e.g. "no bib match"). */
  warnings: string[];
}

export type WaveOrdering =
  | "isolate-slow-heat"
  | "seed-ascending"
  | "registration"
  | "manual";

/**
 * A category: both the classification predicate (who belongs) and the wave
 * settings (how to split them). Ordered; the first matching category wins.
 * `label` is the exact char-limited WebScorer string (e.g. "Adv 1 Lap 9-10F").
 */
export interface CategoryDef {
  label: string;
  distanceLabel: string;
  /** Classification predicate. */
  genders: Gender[];
  /** Inclusive age list OR min/max range. */
  ages?: number[];
  ageMin?: number;
  ageMax?: number;
  /** Optional PlayMetrics package substrings this category applies to (e.g. ["Novice"]). */
  packages?: string[];
  /** Wave settings. */
  maxSize: number;
  ordering: WaveOrdering;
}

export interface RelayConfig {
  /** Target riders per character-team within a cup (e.g. 4). */
  teamSize: number;
  /** Cups = time-staggered heats riders are distributed across (e.g. "Mushroom Cup #1"). */
  cups: string[];
  /** Character teams that compete within each cup (e.g. "Link", "Mario"). */
  characters: string[];
  /** Export header of the registration question capturing a friend/teammate request. */
  friendRequestField?: string;
}

/** One race event. SDR has two (a relay and a standard individual pedal race). */
export interface RaceEvent {
  id: string;
  name: string;
  type: EventType;
  order: number;
  nameFormat: string; // e.g. "{last} ,{first}" — replicates the existing convention
  categories: CategoryDef[];
  relay?: RelayConfig;
}

export interface RaceConfig {
  slug: string;
  name: string;
  raceDate?: string;
  events: RaceEvent[];
}

/** Per-event working data inside a persisted project. */
export interface ProjectEventState {
  riders: Rider[];
}

/**
 * The shared, persisted working state of a race project (stored as jsonb).
 * Holds the race date and the computed/edited roster per event. Contains
 * minors' PII — director-only access.
 */
export interface ProjectState {
  raceDate?: string;
  events?: Record<string, ProjectEventState>;
}
