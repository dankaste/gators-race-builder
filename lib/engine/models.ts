/**
 * Core domain types for the race-transform engine.
 *
 * The engine is pure, framework-agnostic TypeScript: given a parsed registration
 * export plus a race config, it produces categorized/seeded/waved riders (or relay
 * teams) ready for WebScorer export and handouts. Everything that differs between
 * races lives in {@link RaceConfig}, not in code.
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
  packageName: string;
  accountFirstName?: string;
  accountLastName?: string;
  accountEmail?: string;
  accountPhone?: string;
  /** Race-specific custom registration questions, keyed by their export header. */
  custom?: Record<string, string>;
}

/** A rider after the engine has computed derived fields. */
export interface Rider extends RegistrationRow {
  ageOnRaceDay: number | null;
  bib: number | string | null;
  categoryLabel: string | null;
  distanceLabel: string | null;
  /** Seed rank within category from prior-year results; lower = faster. Null = unseeded. */
  seedRank: number | null;
  wave: number | null;
  /** Non-fatal issues surfaced for director review (e.g. "no bib match"). */
  warnings: string[];
}

/** A condition under which a category rule applies. */
export interface CategoryWhen {
  package?: string;
  gender?: Gender;
  ageMin?: number;
  ageMax?: number;
}

/** Ordered rule mapping a rider to a WebScorer category + distance label. */
export interface CategoryRule {
  when: CategoryWhen;
  categoryLabel: string; // exact char-limited WebScorer string, e.g. "Adv 1 Lap 9-10F"
  distanceLabel: string; // e.g. "Balance", "Novice 0.5", "3.3"
}

export type WaveOrdering =
  | "isolate-slow-heat"
  | "seed-ascending"
  | "registration"
  | "manual";

export interface WaveRule {
  /** Category label (or pattern) this rule governs. */
  category: string;
  maxSize: number;
  ordering: WaveOrdering;
}

export interface RelayConfig {
  teamSize: number;
  cupNaming?: string;
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
  categoryRules: CategoryRule[];
  waveRules: WaveRule[];
  relay?: RelayConfig;
}

export interface RaceConfig {
  slug: string;
  name: string;
  raceDate?: string;
  events: RaceEvent[];
}
