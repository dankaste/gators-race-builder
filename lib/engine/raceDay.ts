/**
 * Race-day operational engine: check-in, start line, finish line, and podium
 * for the day the race is actually run — layered on top of the same
 * {@link Rider}/{@link CategoryDef}/wave model the rest of `lib/engine` uses.
 *
 * Pure, framework-agnostic TypeScript like the rest of this directory. All
 * persistence (granular Postgres tables, one row per tap/action, so
 * concurrent station writes never clobber each other) lives outside this
 * file; these functions only ever see plain data.
 *
 * Reconciliation is a single ordered list of riders against a fixed,
 * immutable sequence of captured finish-line timestamps — not two
 * independently-orderable lists. Captured timestamps are physically
 * monotonic (a tap can be voided as a phantom/duplicate, but never
 * reordered); what's actually fallible is which rider a position belongs to,
 * so that's the only thing that's draggable. See {@link computeFinishResults}.
 *
 * Everything here is scoped to a whole event, not to a single wave: waves can
 * overlap on course (a shorter/faster wave can roll before an earlier one
 * finishes), so finishers from different waves interleave at the line rather
 * than arriving as clean per-wave blocks. {@link groupResultsByCategory} is
 * what slices a mixed finish-line sequence back into per-category standings.
 */

import type { CategoryDef, Gender, RaceEvent, Rider } from "./models";

// ---------------------------------------------------------------------------
// Roster (PII-stripped for station devices)
// ---------------------------------------------------------------------------

/** What a race-day station is allowed to see about a rider — no contact info. */
export interface RaceDayRosterEntry {
  playerId: string;
  bib: number | string | null;
  firstName: string;
  lastName: string;
  categoryLabel: string | null;
  distanceLabel: string | null;
  wave: number | null;
}

/** Strip PII (email/phone/parentName/team) down to what a station needs. */
export function toRaceDayRoster(riders: Rider[]): RaceDayRosterEntry[] {
  return riders.map((r) => ({
    playerId: r.playerId,
    bib: r.bib,
    firstName: r.firstName,
    lastName: r.lastName,
    categoryLabel: r.categoryLabel,
    distanceLabel: r.distanceLabel,
    wave: r.wave,
  }));
}

// ---------------------------------------------------------------------------
// Check-in / start line
// ---------------------------------------------------------------------------

export interface CheckInState {
  playerId: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

/** The real, as-it-happened clock time a wave rolled (not the computed/approximate schedule). */
export interface WaveStart {
  wave: number;
  startedAt: string;
}

export type StartStatus = "started" | "dns";

/**
 * An explicit start-line mark. Riders default to "started" with no row at
 * all once their wave has rolled — a row only exists once a volunteer has
 * touched that rider (flagging DNS, or reverting a DNS back to started).
 */
export interface StartMark {
  playerId: string;
  wave: number;
  status: StartStatus;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Finish line: fixed time sequence + one reorderable rider list
// ---------------------------------------------------------------------------

/** One raw timestamp capture from the finish line. Order is physical fact — never reordered. */
export interface FinishTimeTap {
  id: string;
  capturedAt: string;
  voided: boolean;
}

/**
 * One rider believed to have crossed, at this position in the believed
 * crossing order. `editedTime` pins the result regardless of position (a
 * director's hand correction survives reordering/recompute).
 */
export interface FinishOrderRow {
  id: string;
  bib: string;
  playerId: string | null;
  editedTime: string | null;
}

export interface FinishResult {
  rowId: string;
  bib: string;
  playerId: string | null;
  finishTime: string | null;
  origin: "auto" | "manual";
}

export interface ComputeFinishResultsOutput {
  results: FinishResult[];
  /** Captured taps beyond the order list's length — "did someone cross who hasn't been added?" */
  extraTaps: FinishTimeTap[];
}

/**
 * Position `i` in `order` gets its time from position `i` in the non-voided
 * `taps` — unless that row has an `editedTime`, which always wins. Trailing
 * `order` rows with no corresponding tap get `finishTime: null` rather than
 * a guess; trailing `taps` beyond `order`'s length come back as `extraTaps`
 * rather than being silently dropped.
 */
export function computeFinishResults(
  order: FinishOrderRow[],
  taps: FinishTimeTap[],
): ComputeFinishResultsOutput {
  const activeTaps = taps.filter((t) => !t.voided);
  const results: FinishResult[] = order.map((row, i) => {
    const tapTime = activeTaps[i]?.capturedAt ?? null;
    const finishTime = row.editedTime ?? tapTime;
    return {
      rowId: row.id,
      bib: row.bib,
      playerId: row.playerId,
      finishTime,
      origin: row.editedTime != null ? "manual" : "auto",
    };
  });
  return { results, extraTaps: activeTaps.slice(order.length) };
}

// ---------------------------------------------------------------------------
// DNF / race status
// ---------------------------------------------------------------------------

export interface DnfMark {
  playerId: string;
  markedAt: string;
  markedBy?: string;
  note?: string;
}

export type RaceStatus = "not-started" | "started" | "dns" | "finished" | "dnf";

/**
 * Effective per-rider status combining every signal, one rider at a time.
 * Precedence: an explicit DNF always wins (it's a deliberate human call, even
 * against a stray finish tap); then an actual finish; then an explicit
 * start-line mark; otherwise "started" once the rider's wave has rolled, or
 * "not-started" if it hasn't.
 */
export function computeRaceStatus(
  rider: RaceDayRosterEntry,
  waves: WaveStart[],
  startMarks: StartMark[],
  finishResults: FinishResult[],
  dnfMarks: DnfMark[],
): RaceStatus {
  if (dnfMarks.some((d) => d.playerId === rider.playerId)) return "dnf";
  if (finishResults.some((f) => f.playerId === rider.playerId && f.finishTime != null)) {
    return "finished";
  }
  const mark = startMarks.find((s) => s.playerId === rider.playerId);
  if (mark) return mark.status === "dns" ? "dns" : "started";
  const waveHasRolled = rider.wave != null && waves.some((w) => w.wave === rider.wave);
  return waveHasRolled ? "started" : "not-started";
}

/** Batch form of {@link computeRaceStatus} for a whole roster. */
export function computeRaceStatuses(
  roster: RaceDayRosterEntry[],
  waves: WaveStart[],
  startMarks: StartMark[],
  finishResults: FinishResult[],
  dnfMarks: DnfMark[],
): Map<string, RaceStatus> {
  return new Map(
    roster.map((r) => [
      r.playerId,
      computeRaceStatus(r, waves, startMarks, finishResults, dnfMarks),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

export interface PodiumEntry {
  rider: RaceDayRosterEntry;
  elapsedMs: number;
  place: number;
  /** Set (not thrown) when the data looks wrong, e.g. a negative elapsed time. */
  warning?: string;
}

export interface PodiumResult {
  ranked: PodiumEntry[];
  /** Finished, but their wave's actual start time isn't recorded yet. */
  pendingStart: RaceDayRosterEntry[];
  /** A finish result whose bib matched no rider at all. */
  unresolved: { bib: string; finishTime: string }[];
  /** Riders in this category marked DNF — excluded from ranking, not left "pending" forever. */
  dnf: RaceDayRosterEntry[];
}

/**
 * Rank a category's riders across *all* its waves together by elapsed time
 * (finish time minus that rider's own wave's start time) — never by raw
 * finish clock time, so combined-wave categories and overlapping waves are
 * both ranked fairly.
 */
export function computePodium(
  categoryLabel: string,
  waves: WaveStart[],
  roster: RaceDayRosterEntry[],
  finishResults: FinishResult[],
  dnfMarks: DnfMark[],
): PodiumResult {
  const waveStartByNumber = new Map(waves.map((w) => [w.wave, w.startedAt]));
  const rosterByPlayerId = new Map(roster.map((r) => [r.playerId, r]));
  const dnfSet = new Set(dnfMarks.map((d) => d.playerId));

  const pendingStart: RaceDayRosterEntry[] = [];
  const unresolved: { bib: string; finishTime: string }[] = [];
  const withElapsed: { rider: RaceDayRosterEntry; elapsedMs: number }[] = [];

  for (const result of finishResults) {
    if (!result.finishTime) continue;
    const rider = result.playerId ? rosterByPlayerId.get(result.playerId) : undefined;
    if (!rider) {
      unresolved.push({ bib: result.bib, finishTime: result.finishTime });
      continue;
    }
    if (rider.categoryLabel !== categoryLabel || dnfSet.has(rider.playerId)) continue;
    const startedAt = rider.wave != null ? waveStartByNumber.get(rider.wave) : undefined;
    if (!startedAt) {
      pendingStart.push(rider);
      continue;
    }
    const elapsedMs = new Date(result.finishTime).getTime() - new Date(startedAt).getTime();
    withElapsed.push({ rider, elapsedMs });
  }

  const dnf = roster.filter((r) => r.categoryLabel === categoryLabel && dnfSet.has(r.playerId));

  withElapsed.sort((a, b) => a.elapsedMs - b.elapsedMs);
  const ranked: PodiumEntry[] = withElapsed.map((x, i) => ({
    ...x,
    place: i + 1,
    warning: x.elapsedMs < 0 ? "Negative elapsed time — check the wave start and finish time" : undefined,
  }));

  return { ranked, pendingStart, unresolved, dnf };
}

// ---------------------------------------------------------------------------
// Category-grouped standings (shared by Overview, Podium, and the public page)
// ---------------------------------------------------------------------------

export interface CategoryStanding {
  categoryLabel: string;
  waveNumbers: number[];
  totalCount: number;
  finishedCount: number;
  dnsCount: number;
  dnfCount: number;
  podium: PodiumResult;
}

/**
 * The one grouping function behind three different renderers (director
 * Overview, the Podium station, and the public results page) — building it
 * once and reusing it everywhere keeps those three views from drifting.
 */
export function groupResultsByCategory(
  categories: CategoryDef[],
  waves: WaveStart[],
  roster: RaceDayRosterEntry[],
  finishResults: FinishResult[],
  dnfMarks: DnfMark[],
  startMarks: StartMark[],
): CategoryStanding[] {
  return categories.map((cat) => {
    const categoryRiders = roster.filter((r) => r.categoryLabel === cat.label);
    const waveNumbers = [...new Set(categoryRiders.map((r) => r.wave).filter((w): w is number => w != null))].sort(
      (a, b) => a - b,
    );
    const podium = computePodium(cat.label, waves, roster, finishResults, dnfMarks);
    const dnsCount = categoryRiders.filter((r) =>
      startMarks.some((s) => s.playerId === r.playerId && s.status === "dns"),
    ).length;
    return {
      categoryLabel: cat.label,
      waveNumbers,
      totalCount: categoryRiders.length,
      finishedCount: podium.ranked.length,
      dnsCount,
      dnfCount: podium.dnf.length,
      podium,
    };
  });
}

// ---------------------------------------------------------------------------
// Course-watch incidents
// ---------------------------------------------------------------------------

export type IncidentType = "crash" | "injury" | "mechanical" | "other";

/** `playerId` nullable — supports "unknown rider / general location" reports. */
export interface RaceDayIncident {
  id: string;
  playerId: string | null;
  type: IncidentType;
  note?: string;
  reportedAt: string;
  reportedBy?: string;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Walk-up registration at check-in
// ---------------------------------------------------------------------------

/**
 * What a check-in volunteer captures for a walk-up racer: name, bib, and an
 * explicit category picked from a dropdown (there's no age/gender input at
 * check-in, so — unlike the import pipeline's {@link matchCategory} —
 * category is never auto-matched here).
 */
export interface WalkUpRegistration {
  /** Caller-generated unique id, mirroring {@link createManualRider}'s convention. */
  id: string;
  firstName: string;
  lastName: string;
  categoryLabel: string;
  bib?: string | number | null;
}

/**
 * Build a {@link Rider} for a walk-up racer. Pure — does not compute the bib
 * itself, matching `manualRider.ts`'s `createManualRider` (which also just
 * accepts a caller-supplied `bib`). Callers resolve `nextBib` via the
 * existing `getHighestBib()` (`lib/projects.ts`) when online; on the hub
 * this can only see the currently-synced project's bibs, not the true
 * cross-org stack — an accepted narrowing, since a walk-up only needs a bib
 * unused *at this race*.
 */
export function addWalkUpRider(
  registration: WalkUpRegistration,
  event: RaceEvent,
  nextBib: string | number | null,
): Rider {
  const cat = event.categories.find((c) => c.label === registration.categoryLabel) ?? null;
  return {
    playerId: registration.id,
    firstName: registration.firstName.trim(),
    lastName: registration.lastName.trim(),
    gender: "" as Gender | string,
    birthDate: "",
    ageOnRaceDay: null,
    packageName: "",
    bib: registration.bib ?? nextBib ?? null,
    categoryLabel: cat?.label ?? registration.categoryLabel,
    distanceLabel: cat?.distanceLabel ?? null,
    seedLevel: null,
    wave: null,
    warnings: cat ? [] : ["Unknown category — director should verify"],
  };
}
