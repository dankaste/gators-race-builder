import ExcelJS from "exceljs";
import { parseCsv } from "./parse";
import { nameKeys, normName } from "./nameMatch";

/**
 * Historical race-result normalization for relay seeding.
 *
 * Turns a multi-season WebScorer "Rider History" export (Swamp Dash, Chestnut
 * Scorcher, John Bryan, and the Swamp Dash Relay's standard race — never the
 * relay itself, which WebScorer doesn't record lap-by-lap) into a per-rider
 * estimated Swamp Dash pedal-bike lap time, so relay teams can be balanced on
 * an actual speed signal instead of an ordinal GBP team level.
 *
 * The core idea is a single "cohort ratio": every result is compared to the
 * median of its own cell — (race, season, age band, gender) — and that ratio
 * is carried forward onto the current season's target cell. This one formula
 * absorbs age drift, season-to-season course/weather drift, the 5-6 age
 * band's shorter individual-race course (it's just its own cell), and
 * Chestnut Scorcher/John Bryan's Novice-vs-Advanced self-selection (also its
 * own cell) — no separate tiers or percentile interpolation needed.
 *
 * Pure, framework-agnostic — no DB/React imports. See relay.ts for how the
 * resulting estimates feed team balancing.
 */

export type HistoryRaceSlug = "sd" | "cs" | "jb" | "sdr";
export type HistoryGender = "M" | "F";

/** One row of the historical export, normalized. */
export interface HistoryRow {
  bib: string;
  firstName: string;
  lastName: string;
  raceSlug: HistoryRaceSlug | null;
  season: number | null;
  eventLabel: string;
  category: string;
  age: number | null;
  gender: HistoryGender | null;
  timeSeconds: number | null;
  status: string;
  place: number | null;
  groupSize: number | null;
  distanceLabel: string;
}

const EVENT_PATTERNS: { pattern: RegExp; raceSlug: HistoryRaceSlug }[] = [
  // Order matters: "Swamp Dash Relay(s) Standard Races" also contains "swamp dash".
  { pattern: /swamp dash relay/i, raceSlug: "sdr" },
  { pattern: /swamp dash/i, raceSlug: "sd" },
  { pattern: /chestnut scorcher/i, raceSlug: "cs" },
  { pattern: /john bryan/i, raceSlug: "jb" },
];

/** Classify a raw `Event` string (e.g. "2025 Gator Race Series Swamp Dash") into slug + season. */
export function classifyEvent(eventLabel: string): { raceSlug: HistoryRaceSlug | null; season: number | null } {
  const yearMatch = /^(\d{4})/.exec(eventLabel.trim());
  const season = yearMatch ? Number(yearMatch[1]) : null;
  const hit = EVENT_PATTERNS.find((p) => p.pattern.test(eventLabel));
  return { raceSlug: hit?.raceSlug ?? null, season };
}

/** "Male"/"Female" (WebScorer's export) → "M"/"F". Anything else (blank, "Female/Male") → null. */
export function normalizeGender(raw: string): HistoryGender | null {
  const s = raw.trim().toLowerCase();
  if (s === "male" || s === "m") return "M";
  if (s === "female" || s === "f") return "F";
  return null;
}

/**
 * Race-clock time string → seconds. Handles every shape seen in the export:
 * "M:SS.s", "M:SS.sss", "MM:SS.ss", "H:MM:SS" (no fraction, e.g. 2022's
 * "0:02:15"). DNS/DNF/blank/dash → null (no time recorded).
 */
export function parseRaceTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^(dns|dnf|dq|-)$/i.test(s)) return null;
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums.reduce((seconds, n) => seconds * 60 + n, 0);
}

/** "Last, First" (the export's Name column) → { firstName, lastName }. */
function splitName(raw: string): { firstName: string; lastName: string } {
  const idx = raw.indexOf(",");
  if (idx === -1) return { firstName: raw.trim(), lastName: "" };
  return { lastName: raw.slice(0, idx).trim(), firstName: raw.slice(idx + 1).trim() };
}

/** First non-empty value among candidate header names (headers are exact — no PlayMetrics-style variants here). */
function cell(row: Record<string, string>, key: string): string {
  return row[key]?.trim() ?? "";
}

/** Parse the raw "Rider History Race Result" CSV export into normalized rows. */
export function parseHistoryCsv(csvText: string): HistoryRow[] {
  return parseCsv(csvText).map((row) => {
    const { firstName, lastName } = splitName(cell(row, "Name"));
    const eventLabel = cell(row, "Event");
    const { raceSlug, season } = classifyEvent(eventLabel);
    const ageRaw = cell(row, "Age");
    const placeRaw = cell(row, "Place");
    const groupSizeRaw = cell(row, "Group_Size");
    return {
      bib: cell(row, "Bib"),
      firstName,
      lastName,
      raceSlug,
      season,
      eventLabel,
      category: cell(row, "Category"),
      age: ageRaw ? Number(ageRaw) : null,
      gender: normalizeGender(cell(row, "Gender")),
      timeSeconds: parseRaceTime(cell(row, "Time")),
      status: cell(row, "Status"),
      place: placeRaw ? Number(placeRaw) : null,
      groupSize: groupSizeRaw ? Number(groupSizeRaw) : null,
      distanceLabel: cell(row, "Distance"),
    };
  });
}

/**
 * Infer {raceSlug, season} from a single-race WebScorer results export's
 * filename (e.g. "2026 Gators Race Series Swamp Dash Results.xlsx") — this
 * file format has no per-row Event column, unlike the multi-season history
 * CSV, so the race/season it covers has to come from somewhere else. Reuses
 * the same header-variant patterns as classifyEvent since race names are
 * written the same way in both. Callers should let the director confirm/
 * override this before importing — filenames get renamed.
 */
export function inferRaceFromFilename(filename: string): { raceSlug: HistoryRaceSlug; season: number } | null {
  const base = filename.replace(/\.[^./]+$/, "");
  const { raceSlug, season } = classifyEvent(base);
  return raceSlug && season ? { raceSlug, season } : null;
}

/**
 * Parse a single-race WebScorer results export (.xlsx — "Place, Bib, Name,
 * Distance, Category, Age, Gender, ..., Time, ..." with a decorative title
 * row and a repeated header row before each category's block). Every row
 * gets the SAME race/season, since the file covers exactly one event —
 * pass it in (see inferRaceFromFilename). `groupSize` is derived from the
 * file itself: how many rows share a category.
 */
export async function parseRaceResultsXlsx(
  data: ArrayBuffer,
  meta: { raceSlug: HistoryRaceSlug; season: number; eventLabel: string },
): Promise<HistoryRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  interface RawRow {
    place: string;
    bib: string;
    name: string;
    distance: string;
    category: string;
    age: string;
    gender: string;
    time: string;
  }
  const raw: RawRow[] = [];
  sheet.eachRow((row) => {
    const at = (col: number) => {
      const v = row.getCell(col).value;
      return v == null ? "" : String(v).trim();
    };
    const bib = at(2);
    // Title rows ("Balance Bike - Balance F"), the repeated "Place/Bib/..." header,
    // and blank separator rows all lack a numeric bib — every real data row has one.
    if (!/^\d+$/.test(bib)) return;
    raw.push({ place: at(1), bib, name: at(3), distance: at(4), category: at(5), age: at(6), gender: at(7), time: at(12) });
  });

  const groupSizes = new Map<string, number>();
  for (const r of raw) groupSizes.set(r.category, (groupSizes.get(r.category) ?? 0) + 1);

  return raw.map((r) => {
    const { firstName, lastName } = splitName(r.name);
    const timeSeconds = parseRaceTime(r.time);
    return {
      bib: r.bib,
      firstName,
      lastName,
      raceSlug: meta.raceSlug,
      season: meta.season,
      eventLabel: meta.eventLabel,
      category: r.category,
      age: r.age ? Number(r.age) : null,
      gender: normalizeGender(r.gender),
      timeSeconds,
      status: timeSeconds !== null ? "OK" : r.time || "DNS",
      place: /^\d+$/.test(r.place) ? Number(r.place) : null,
      groupSize: groupSizes.get(r.category) ?? null,
      distanceLabel: r.distance,
    };
  });
}

// --- age bands --------------------------------------------------------------

/** Standard age bands (matches the sd.ts config bands) a cohort cell is bucketed by. */
export function ageBandOf(age: number): string {
  if (age <= 2) return "0-2";
  if (age <= 4) return "3-4";
  if (age <= 6) return "5-6";
  if (age <= 8) return "7-8";
  if (age <= 10) return "9-10";
  if (age <= 12) return "11-12";
  if (age <= 14) return "13-14";
  return "15+";
}

/** Recover an age band from a category label like "Adv 1 Lap 9-10F" or "Novice 5-6 M" (used only when Age is blank — e.g. all 2024 John Bryan rows). */
function ageBandFromCategory(category: string): string | null {
  const range = /(\d{1,2})\s*-\s*(\d{1,2})/.exec(category);
  if (range) return `${range[1]}-${range[2]}`;
  const plus = /(\d{1,2})\s*\+/.exec(category);
  if (plus) return `${plus[1]}+`;
  return null;
}

/** A row's age band, falling back to the category label when Age is unpopulated. */
function rowAgeBand(row: HistoryRow): string | null {
  if (row.age !== null && !Number.isNaN(row.age)) return ageBandOf(row.age);
  return ageBandFromCategory(row.category);
}

// --- name index --------------------------------------------------------------

/** Every normalized name-key variant a history row could be looked up under. */
function historyNameKeys(row: HistoryRow): string[] {
  return nameKeys(row.firstName, row.lastName);
}

function buildNameIndex(history: HistoryRow[]): Map<string, HistoryRow[]> {
  const index = new Map<string, HistoryRow[]>();
  for (const row of history) {
    if (!row.firstName && !row.lastName) continue;
    for (const key of historyNameKeys(row)) {
      const arr = index.get(key) ?? [];
      arr.push(row);
      index.set(key, arr);
    }
  }
  return index;
}

/** True if the rows sharing a name imply more than one birth year — likely two different people (siblings/cousins), not drift. */
function isAmbiguousName(rows: HistoryRow[]): boolean {
  const impliedBirthYears = new Set<number>();
  for (const row of rows) {
    if (row.season === null || row.age === null || Number.isNaN(row.age)) continue;
    impliedBirthYears.add(row.season - row.age);
  }
  if (impliedBirthYears.size < 2) return false;
  const years = [...impliedBirthYears];
  return Math.max(...years) - Math.min(...years) > 1;
}

// --- cohort cells --------------------------------------------------------------

/** key = `${raceSlug}|${season}|${ageBand}|${gender-or-"*"}`. The "*" gender bucket is maintained alongside every specific-gender entry so widening (drop gender) is a cheap lookup, not a re-scan. */
type CellIndex = Map<string, number[]>;

function cellKey(raceSlug: HistoryRaceSlug, season: number, ageBand: string, gender: HistoryGender | "*"): string {
  return `${raceSlug}|${season}|${ageBand}|${gender}`;
}

function buildCellIndex(history: HistoryRow[]): CellIndex {
  const index: CellIndex = new Map();
  const push = (key: string, t: number) => {
    const arr = index.get(key) ?? [];
    arr.push(t);
    index.set(key, arr);
  };
  for (const row of history) {
    if (row.raceSlug === null || row.season === null || row.timeSeconds === null) continue;
    const band = rowAgeBand(row);
    if (!band) continue;
    if (row.gender) push(cellKey(row.raceSlug, row.season, band, row.gender), row.timeSeconds);
    push(cellKey(row.raceSlug, row.season, band, "*"), row.timeSeconds);
  }
  return index;
}

/** Exposed for callers outside this module (e.g. the relay review screen's population-median default for unestimated riders — see RelayBuilder.tsx). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface CellSummary {
  raceSlug: HistoryRaceSlug;
  season: number;
  ageBand: string;
  /** "*" = the gender-dropped (widened) bucket, maintained alongside each specific gender. */
  gender: HistoryGender | "*";
  n: number;
  median: number;
}

/** Every cohort cell's size/median — diagnostic view for the history import page and golden/real-data tests. */
export function summarizeCells(history: HistoryRow[]): CellSummary[] {
  const index = buildCellIndex(history);
  return [...index.entries()]
    .map(([key, values]) => {
      const [raceSlug, seasonStr, ageBand, gender] = key.split("|");
      return {
        raceSlug: raceSlug as HistoryRaceSlug,
        season: Number(seasonStr),
        ageBand,
        gender: gender as HistoryGender | "*",
        n: values.length,
        median: median(values),
      };
    })
    .sort(
      (a, b) =>
        a.raceSlug.localeCompare(b.raceSlug) ||
        a.season - b.season ||
        a.ageBand.localeCompare(b.ageBand) ||
        a.gender.localeCompare(b.gender),
    );
}

export interface CellLookup {
  median: number;
  n: number;
  /** True once the lookup had to drop gender and/or merge adjacent seasons to reach `minCellSize`. */
  widened: boolean;
}

/**
 * Find a cohort cell's median time, widening (drop gender, then merge the
 * adjacent seasons) until it reaches `minCellSize` samples or options run
 * out. Returns the widest attempt made even if it never reaches the
 * threshold, so callers always get *something* when any data exists.
 */
function lookupCell(
  index: CellIndex,
  raceSlug: HistoryRaceSlug,
  season: number,
  ageBand: string,
  gender: HistoryGender,
  minCellSize: number,
): CellLookup | null {
  const attempts: { key: () => number[]; widened: boolean }[] = [
    { key: () => index.get(cellKey(raceSlug, season, ageBand, gender)) ?? [], widened: false },
    { key: () => index.get(cellKey(raceSlug, season, ageBand, "*")) ?? [], widened: true },
    {
      key: () => [season - 1, season, season + 1].flatMap((s) => index.get(cellKey(raceSlug, s, ageBand, gender)) ?? []),
      widened: true,
    },
    {
      key: () => [season - 1, season, season + 1].flatMap((s) => index.get(cellKey(raceSlug, s, ageBand, "*")) ?? []),
      widened: true,
    },
  ];

  let best: CellLookup | null = null;
  for (const attempt of attempts) {
    const values = attempt.key();
    if (values.length === 0) continue;
    if (!best || values.length > best.n) best = { median: median(values), n: values.length, widened: attempt.widened };
    if (values.length >= minCellSize) return { median: median(values), n: values.length, widened: attempt.widened };
  }
  return best;
}

// --- 5-6 course factor --------------------------------------------------------------

/** One rider's best Swamp Dash (sd) time per season, with its age band. */
function sdTimesByRiderSeason(history: HistoryRow[]): Map<string, Map<number, { ageBand: string; timeSeconds: number }>> {
  const byRider = new Map<string, Map<number, { ageBand: string; timeSeconds: number }>>();
  for (const row of history) {
    if (row.raceSlug !== "sd" || row.season === null || row.timeSeconds === null) continue;
    const band = rowAgeBand(row);
    if (!band) continue;
    const key = normName(`${row.lastName}, ${row.firstName}`);
    if (!key.trim()) continue;
    const seasons = byRider.get(key) ?? new Map();
    seasons.set(row.season, { ageBand: band, timeSeconds: row.timeSeconds });
    byRider.set(key, seasons);
  }
  return byRider;
}

/** Paired ratio of `toBand`'s time over `fromBand`'s time, one season apart, for every rider who raced both. */
function pairedRatios(
  byRiderSeason: Map<string, Map<number, { ageBand: string; timeSeconds: number }>>,
  fromBand: string,
  toBand: string,
): number[] {
  const ratios: number[] = [];
  for (const seasons of byRiderSeason.values()) {
    for (const [season, from] of seasons) {
      if (from.ageBand !== fromBand) continue;
      const to = seasons.get(season + 1);
      if (to?.ageBand === toBand) ratios.push(to.timeSeconds / from.timeSeconds);
    }
  }
  return ratios;
}

/**
 * The 5-6 individual Swamp Dash course is physically shorter than the 7+
 * course. Riders who raced 5-6 then 7-8 a year later slow down by ~1.6x, but
 * that conflates the course-length jump with a year of ordinary growth.
 * De-confound it using a SAME-AGE growth baseline: riders who stayed within
 * the 5-6 band a year apart (age 5 → age 6, same short course both years) —
 * factor = paired 5-6→7-8 ratio ÷ that same-course, same-age growth.
 *
 * An earlier version of this function used OLDER riders' same-course growth
 * (7-8→9-10, 9-10→11-12) as the baseline instead, reasoning that any
 * same-course pair would do. Real data doesn't support that: young kids
 * improve much faster year over year than older kids do (5-6→5-6 riders get
 * ~20% faster per year; 7-8+ riders only ~8%). Using the older, slower
 * growth rate as a stand-in for the younger transition systematically
 * UNDERSTATED how much of the 5-6→7-8 slowdown was really the course jump
 * (vs. ordinary growth), silently deflating the derived factor — riders on
 * the shorter course looked faster, relative to the full field, than they
 * actually are. Age-matching the baseline (5-6→5-6, not 7-8→9-10) fixes
 * this; see history.test.ts for the numbers.
 *
 * Best-effort either way — 5-6 riders never race the full course, so this
 * can never be measured directly; store the result as an editable config
 * default (see RelayConfig.historyEstimation), not gospel.
 */
export function deriveFiveSixFactor(history: HistoryRow[]): { factor: number | null; n: number } {
  const byRiderSeason = sdTimesByRiderSeason(history);
  const paired = pairedRatios(byRiderSeason, "5-6", "7-8");
  const growth = pairedRatios(byRiderSeason, "5-6", "5-6");
  if (paired.length === 0 || growth.length === 0) return { factor: null, n: paired.length };
  return { factor: median(paired) / median(growth), n: paired.length };
}

/**
 * Project a band-relative estimate onto the full-course scale. A 5-6 rider's
 * estimate is only comparable to other 5-6 riders (see the cohort-ratio
 * explanation at the top of this file) — multiply by `fiveSixCourseFactor`
 * (see deriveFiveSixFactor) to put it on the same scale as everyone else.
 * Every other age band is already full-course and passes through unchanged.
 * Apply this exactly once, right where an estimate is first assigned (see
 * RelayBuilder.tsx's withLapTimeEstimates) — applying it more than once
 * silently compounds the factor.
 */
export function projectToFullCourse(seconds: number, ageOnRaceDay: number, fiveSixCourseFactor: number): number {
  return ageBandOf(ageOnRaceDay) === "5-6" ? seconds * fiveSixCourseFactor : seconds;
}

/**
 * Fallback `fiveSixCourseFactor` for a relay whose persisted RaceConfig
 * predates this field (historyEstimation is optional in raceConfigSchema.ts,
 * and getRaceConfigs() reads the DB row as-is with no backfill from the seed
 * default) — without this, a project saved before the field existed would
 * silently skip the 5-6 projection entirely rather than erroring, producing
 * impossible-looking times for 5-6 relay riders (their raw estimate is
 * genuinely on the shorter 5-6 course's scale, just never corrected up to
 * full-course). Matches sdr.ts's real derived value; see deriveFiveSixFactor.
 */
export const DEFAULT_FIVE_SIX_COURSE_FACTOR = 2.03;

// --- estimation --------------------------------------------------------------

export interface EstimateTarget {
  firstName: string;
  lastName: string;
  ageOnRaceDay: number | null;
  gender: HistoryGender | string | null;
}

export type EstimateConfidence = "direct" | "cross-event" | "widened" | "none" | "manual";

export interface LapTimeEstimate {
  seconds: number | null;
  confidence: EstimateConfidence;
  ambiguousName: boolean;
  detail: string;
}

export interface HistoryEstimationConfig {
  /** Season whose Swamp Dash cohort is the estimate's target scale — normally the most recent season with sd data. */
  targetSeason: number;
  minCellSize: number;
}

const NO_ESTIMATE: LapTimeEstimate = { seconds: null, confidence: "none", ambiguousName: false, detail: "no history match" };

/** The most recent season across the whole dataset that has Swamp Dash times — the natural default `targetSeason`. */
export function mostRecentSwampDashSeason(history: HistoryRow[]): number | null {
  const seasons = history
    .filter((r) => r.raceSlug === "sd" && r.timeSeconds !== null && r.season !== null)
    .map((r) => r.season as number);
  return seasons.length ? Math.max(...seasons) : null;
}

/**
 * Estimate every target rider's Swamp Dash pedal-bike lap time from history,
 * via the cohort-ratio described at the top of this file. Returns one entry
 * per target index; a target with no history match at all still gets an
 * entry (confidence "none", seconds null) so callers can distinguish "we
 * looked and found nothing" from "we never looked".
 */
export function estimateLapTimes(
  targets: EstimateTarget[],
  history: HistoryRow[],
  config: HistoryEstimationConfig,
): Map<number, LapTimeEstimate> {
  const nameIndex = buildNameIndex(history);
  const cellIndex = buildCellIndex(history);
  const results = new Map<number, LapTimeEstimate>();

  targets.forEach((target, i) => {
    const gender = target.gender === "M" || target.gender === "F" ? target.gender : null;
    if (target.ageOnRaceDay === null || !gender) {
      results.set(i, NO_ESTIMATE);
      return;
    }

    const matches = nameKeys(target.firstName, target.lastName)
      .flatMap((k) => nameIndex.get(k) ?? [])
      .filter((row, idx, arr) => arr.indexOf(row) === idx); // de-dupe (a row can hit multiple key variants)
    if (matches.length === 0) {
      results.set(i, NO_ESTIMATE);
      return;
    }
    const ambiguousName = isAmbiguousName(matches);

    // Prefer the rider's own most recent Swamp Dash result; else their most recent Chestnut Scorcher/John Bryan result.
    const usable = (row: HistoryRow) => row.raceSlug !== null && row.season !== null && row.timeSeconds !== null && rowAgeBand(row);
    const sdRows = matches.filter((r) => r.raceSlug === "sd" && usable(r));
    const crossRows = matches.filter((r) => (r.raceSlug === "cs" || r.raceSlug === "jb") && usable(r));
    const isDirect = sdRows.length > 0;
    const source = isDirect ? sdRows : crossRows;
    if (source.length === 0) {
      results.set(i, { ...NO_ESTIMATE, ambiguousName });
      return;
    }
    const row = source.reduce((a, b) => (b.season! > a.season! ? b : a));
    const sourceBand = rowAgeBand(row)!;
    const sourceCell = lookupCell(cellIndex, row.raceSlug!, row.season!, sourceBand, row.gender ?? gender, config.minCellSize);
    if (!sourceCell) {
      results.set(i, { ...NO_ESTIMATE, ambiguousName });
      return;
    }

    const targetBand = ageBandOf(target.ageOnRaceDay);
    const targetCell = lookupCell(cellIndex, "sd", config.targetSeason, targetBand, gender, config.minCellSize);
    if (!targetCell) {
      results.set(i, { ...NO_ESTIMATE, ambiguousName });
      return;
    }

    const ratio = Math.log(row.timeSeconds!) - Math.log(sourceCell.median);
    const seconds = targetCell.median * Math.exp(ratio);
    const widened = sourceCell.widened || targetCell.widened;
    const confidence: EstimateConfidence = isDirect ? (widened ? "widened" : "direct") : widened ? "widened" : "cross-event";
    const detail = `${row.season} ${row.raceSlug} (${sourceBand}, ${row.gender ?? gender}) → ${confidence}`;

    results.set(i, { seconds, confidence, ambiguousName, detail });
  });

  return results;
}
