import type { RaceEvent, Rider } from "./models";

/** A renderable handout table — title + headers + rows, agnostic of Excel/PDF. */
export interface HandoutTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

function fullName(r: Rider): string {
  return `${r.lastName}, ${r.firstName}`;
}

function byName(a: Rider, b: Rider): number {
  return fullName(a).localeCompare(fullName(b));
}

/** Check-in sheet: alphabetical, with a blank "Here?" check column. */
export function checkInTable(riders: Rider[]): HandoutTable {
  const rows = [...riders]
    .sort(byName)
    .map((r) => [
      "", // Here?
      r.bib ?? "",
      fullName(r),
      r.wave != null ? `Wave ${r.wave}` : "",
      r.categoryLabel ?? "",
      r.distanceLabel ?? "",
      r.ageOnRaceDay ?? "",
      r.phone ?? "",
      r.email ?? "",
    ]);
  return {
    title: "Check-In",
    headers: ["Here?", "Bib", "Name", "Wave", "Category", "Distance", "Age", "Phone", "Email"],
    rows,
  };
}

/** Wave stager sheet: grouped by wave, in wave order. */
export function waveStagerTable(riders: Rider[]): HandoutTable {
  const rows = [...riders]
    .filter((r) => r.wave != null)
    .sort((a, b) => (a.wave! - b.wave!) || byName(a, b))
    .map((r) => [
      `Wave ${r.wave}`,
      r.bib ?? "",
      fullName(r),
      r.categoryLabel ?? "",
      r.distanceLabel ?? "",
      r.ageOnRaceDay ?? "",
    ]);
  return {
    title: "Wave Stager",
    headers: ["Wave", "Bib", "Name", "Category", "Distance", "Age"],
    rows,
  };
}

/** Per-category wave numbers + rider counts. */
function categorySummary(riders: Rider[], event: RaceEvent) {
  const waves = new Map<string, Set<number>>();
  const counts = new Map<string, number>();
  for (const r of riders) {
    if (!r.categoryLabel) continue;
    counts.set(r.categoryLabel, (counts.get(r.categoryLabel) ?? 0) + 1);
    if (r.wave != null) {
      const s = waves.get(r.categoryLabel) ?? new Set();
      s.add(r.wave);
      waves.set(r.categoryLabel, s);
    }
  }
  // Preserve config category order.
  return event.categories
    .filter((c) => counts.has(c.label))
    .map((c) => ({
      label: c.label,
      count: counts.get(c.label)!,
      waves: [...(waves.get(c.label) ?? [])].sort((a, b) => a - b),
    }));
}

/** Podium sheet: one line per category with blank 1st/2nd/3rd to fill in. */
export function podiumTable(riders: Rider[], event: RaceEvent): HandoutTable {
  const rows = categorySummary(riders, event).map((c) => [
    c.label,
    c.waves.map((w) => `W${w}`).join(", "),
    c.count,
    "", // 1st
    "", // 2nd
    "", // 3rd
  ]);
  return {
    title: "Podium",
    headers: ["Category", "Waves", "Riders", "1st", "2nd", "3rd"],
    rows,
  };
}

function addMinutes(time: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const total = +m[1] * 60 + +m[2] + minutes;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

export interface ScheduleOptions {
  /** First wave start, "HH:MM" 24h (e.g. "09:30"). */
  startTime: string;
  /** Minutes allotted per wave. */
  minutesPerWave: number;
}

/** Schedule: each wave with an approximate start time, category, and rider count. */
export function scheduleTable(
  riders: Rider[],
  event: RaceEvent,
  opts: ScheduleOptions,
): HandoutTable {
  const waveInfo = new Map<number, { label: string; count: number }>();
  for (const r of riders) {
    if (r.wave == null || !r.categoryLabel) continue;
    const info = waveInfo.get(r.wave) ?? { label: r.categoryLabel, count: 0 };
    info.count += 1;
    waveInfo.set(r.wave, info);
  }
  const waves = [...waveInfo.keys()].sort((a, b) => a - b);
  const rows = waves.map((w, i) => [
    `Wave ${w}`,
    addMinutes(opts.startTime, i * opts.minutesPerWave),
    waveInfo.get(w)!.label,
    waveInfo.get(w)!.count,
  ]);
  // Reference event used for ordering only via riders; keep signature uniform.
  void event;
  return {
    title: "Schedule",
    headers: ["Wave", "Approx. start", "Category", "Riders"],
    rows,
  };
}

export function allHandouts(
  riders: Rider[],
  event: RaceEvent,
  schedule: ScheduleOptions,
): HandoutTable[] {
  return [
    checkInTable(riders),
    waveStagerTable(riders),
    podiumTable(riders, event),
    scheduleTable(riders, event, schedule),
  ];
}
