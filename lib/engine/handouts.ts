import type {
  HandoutColumn,
  HandoutFieldSource,
  HandoutTemplate,
  RaceEvent,
  Rider,
} from "./models";

/** A renderable handout table — title + headers + rows, agnostic of Excel/PDF. */
export interface HandoutTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface ScheduleOptions {
  /** First wave start, "HH:MM" 24h (e.g. "09:30"). */
  startTime: string;
  /** Minutes allotted per wave. */
  minutesPerWave: number;
}

function fullName(r: Rider): string {
  return `${r.lastName}, ${r.firstName}`;
}

function byName(a: Rider, b: Rider): number {
  return fullName(a).localeCompare(fullName(b));
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

// --- value resolvers per row kind ---

function rosterValue(r: Rider, source: HandoutFieldSource): string | number {
  switch (source) {
    case "bib": return r.bib ?? "";
    case "name": return fullName(r);
    case "firstName": return r.firstName;
    case "lastName": return r.lastName;
    case "gender": return String(r.gender ?? "");
    case "age": return r.ageOnRaceDay ?? "";
    case "category": return r.categoryLabel ?? "";
    case "distance": return r.distanceLabel ?? "";
    case "wave": return r.wave != null ? `Wave ${r.wave}` : "";
    case "seed": return r.seedLevel ?? "";
    case "phone": return r.phone ?? "";
    case "email": return r.email ?? "";
    case "parentName": return r.parentName ?? "";
    case "team": return r.team ?? "";
    case "blank": return "";
    default:
      return source.startsWith("custom:") ? r.custom?.[source.slice(7)] ?? "" : "";
  }
}

interface CategorySummary {
  label: string;
  count: number;
  waves: number[];
}

function categorySummary(riders: Rider[], event: RaceEvent): CategorySummary[] {
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
  return event.categories
    .filter((c) => counts.has(c.label))
    .map((c) => ({
      label: c.label,
      count: counts.get(c.label)!,
      waves: [...(waves.get(c.label) ?? [])].sort((a, b) => a - b),
    }));
}

function podiumValue(c: CategorySummary, source: HandoutFieldSource): string | number {
  switch (source) {
    case "categoryLabel":
    case "category": return c.label;
    case "waves": return c.waves.map((w) => `W${w}`).join(", ");
    case "count": return c.count;
    default: return ""; // blank places (1st/2nd/3rd) etc.
  }
}

interface ScheduleRow {
  wave: number;
  time: string;
  label: string;
  count: number;
}

function scheduleRows(riders: Rider[], opts: ScheduleOptions): ScheduleRow[] {
  const info = new Map<number, { label: string; count: number }>();
  for (const r of riders) {
    if (r.wave == null || !r.categoryLabel) continue;
    const i = info.get(r.wave) ?? { label: r.categoryLabel, count: 0 };
    i.count += 1;
    info.set(r.wave, i);
  }
  return [...info.keys()]
    .sort((a, b) => a - b)
    .map((wave, i) => ({
      wave,
      time: addMinutes(opts.startTime, i * opts.minutesPerWave),
      label: info.get(wave)!.label,
      count: info.get(wave)!.count,
    }));
}

function scheduleValue(row: ScheduleRow, source: HandoutFieldSource): string | number {
  switch (source) {
    case "wave": return `Wave ${row.wave}`;
    case "scheduleTime": return row.time;
    case "categoryLabel":
    case "category": return row.label;
    case "count": return row.count;
    default: return "";
  }
}

/** Render one template to a table. */
export function renderHandout(
  template: HandoutTemplate,
  riders: Rider[],
  event: RaceEvent,
  opts: ScheduleOptions,
): HandoutTable {
  const headers = template.columns.map((c: HandoutColumn) => c.header);
  let rows: (string | number)[][] = [];

  if (template.kind === "roster") {
    let list = [...riders];
    if (template.filter === "hasWave") list = list.filter((r) => r.wave != null);
    if (template.sort === "name" || !template.sort) list.sort(byName);
    else if (template.sort === "wave") list.sort((a, b) => (a.wave ?? 1e9) - (b.wave ?? 1e9) || byName(a, b));
    else if (template.sort === "category") list.sort((a, b) => (a.categoryLabel ?? "").localeCompare(b.categoryLabel ?? "") || byName(a, b));
    rows = list.map((r) => template.columns.map((c) => rosterValue(r, c.source)));
  } else if (template.kind === "podium") {
    rows = categorySummary(riders, event).map((c) => template.columns.map((col) => podiumValue(c, col.source)));
  } else {
    rows = scheduleRows(riders, opts).map((row) => template.columns.map((col) => scheduleValue(row, col.source)));
  }

  return { title: template.title, headers, rows };
}

// --- default templates (reproduce the original hardcoded handouts) ---

function col(header: string, source: HandoutFieldSource): HandoutColumn {
  return { header, source };
}

export function defaultHandoutTemplates(): HandoutTemplate[] {
  return [
    {
      key: "check-in",
      title: "Check-In",
      kind: "roster",
      sort: "name",
      filter: "all",
      columns: [
        col("Here?", "blank"), col("Bib", "bib"), col("Name", "name"), col("Wave", "wave"),
        col("Category", "category"), col("Distance", "distance"), col("Age", "age"),
        col("Phone", "phone"), col("Email", "email"),
      ],
    },
    {
      key: "wave-stager",
      title: "Wave Stager",
      kind: "roster",
      sort: "wave",
      filter: "hasWave",
      columns: [
        col("Wave", "wave"), col("Bib", "bib"), col("Name", "name"),
        col("Category", "category"), col("Distance", "distance"), col("Age", "age"),
      ],
    },
    {
      key: "podium",
      title: "Podium",
      kind: "podium",
      columns: [
        col("Category", "categoryLabel"), col("Waves", "waves"), col("Riders", "count"),
        col("1st", "blank"), col("2nd", "blank"), col("3rd", "blank"),
      ],
    },
    {
      key: "schedule",
      title: "Schedule",
      kind: "schedule",
      columns: [
        col("Wave", "wave"), col("Approx. start", "scheduleTime"),
        col("Category", "categoryLabel"), col("Riders", "count"),
      ],
    },
  ];
}

/** Render all handouts for an event, using its saved templates or the defaults. */
export function renderAllHandouts(
  event: RaceEvent,
  riders: Rider[],
  schedule: ScheduleOptions,
): HandoutTable[] {
  const templates = event.handoutTemplates?.length ? event.handoutTemplates : defaultHandoutTemplates();
  return templates.map((t) => renderHandout(t, riders, event, schedule));
}

// --- backward-compatible named builders (used by tests and as defaults) ---

const DEFAULTS = defaultHandoutTemplates();
const NO_SCHED: ScheduleOptions = { startTime: "09:30", minutesPerWave: 5 };

export function checkInTable(riders: Rider[]): HandoutTable {
  return renderHandout(DEFAULTS[0], riders, { categories: [] } as unknown as RaceEvent, NO_SCHED);
}
export function waveStagerTable(riders: Rider[]): HandoutTable {
  return renderHandout(DEFAULTS[1], riders, { categories: [] } as unknown as RaceEvent, NO_SCHED);
}
export function podiumTable(riders: Rider[], event: RaceEvent): HandoutTable {
  return renderHandout(DEFAULTS[2], riders, event, NO_SCHED);
}
export function scheduleTable(riders: Rider[], event: RaceEvent, opts: ScheduleOptions): HandoutTable {
  return renderHandout(DEFAULTS[3], riders, event, opts);
}

/** @deprecated use renderAllHandouts (kept for callers passing default schedule). */
export function allHandouts(riders: Rider[], event: RaceEvent, schedule: ScheduleOptions): HandoutTable[] {
  return renderAllHandouts(event, riders, schedule);
}
