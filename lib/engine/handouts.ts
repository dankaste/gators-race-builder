import type {
  HandoutColumn,
  HandoutFieldSource,
  HandoutTemplate,
  RaceEvent,
  Rider,
  ScheduleBreak,
} from "./models";

/** A renderable handout table — title + headers + rows, agnostic of Excel/PDF. */
export interface HandoutTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  /**
   * Optional per-row grouping (parallel to `rows`) for the wave stager: a bold
   * rule is drawn where `wave` changes, a dashed rule where `category` changes
   * within the same wave. Present only for wave-sorted roster handouts.
   */
  rowGroups?: { wave: number | string; category: string }[];
}

export interface ScheduleOptions {
  /** First wave start, "HH:MM" 24h (e.g. "09:30"). */
  startTime: string;
  /** Default minutes allotted per wave. */
  minutesPerWave: number;
  /** Per-category minutes-per-wave overrides (keyed by category label). */
  minutesPerWaveByCategory?: Record<string, number>;
  /** Fixed breaks inserted into the timeline. */
  breaks?: ScheduleBreak[];
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
  kind: "wave" | "break";
  wave: number | null;
  time: string;
  label: string;
  count: number | null;
}

/**
 * Per-wave schedule rows with fixed breaks interleaved. Each wave consumes
 * `minutesPerWave`; a break after wave W emits its own row and pushes every
 * later row's time out by the break's length.
 */
function scheduleRows(riders: Rider[], opts: ScheduleOptions): ScheduleRow[] {
  const info = new Map<number, { label: string; count: number }>();
  for (const r of riders) {
    if (r.wave == null || !r.categoryLabel) continue;
    const i = info.get(r.wave) ?? { label: r.categoryLabel, count: 0 };
    i.count += 1;
    info.set(r.wave, i);
  }
  const waveNums = [...info.keys()].sort((a, b) => a - b);
  const lastWave = waveNums[waveNums.length - 1] ?? 0;

  const breaksByWave = new Map<number, ScheduleBreak[]>();
  for (const b of opts.breaks ?? []) {
    const arr = breaksByWave.get(b.afterWave) ?? [];
    arr.push(b);
    breaksByWave.set(b.afterWave, arr);
  }
  const breakRow = (b: ScheduleBreak, time: string): ScheduleRow => ({
    kind: "break",
    wave: null,
    time,
    label: `${b.label?.trim() || "Break"} — ${b.minutes} min`,
    count: null,
  });

  const minsFor = (label: string) =>
    opts.minutesPerWaveByCategory?.[label] ?? opts.minutesPerWave;

  const rows: ScheduleRow[] = [];
  let offset = 0; // minutes elapsed from startTime
  for (const wave of waveNums) {
    rows.push({
      kind: "wave",
      wave,
      time: addMinutes(opts.startTime, offset),
      label: info.get(wave)!.label,
      count: info.get(wave)!.count,
    });
    offset += minsFor(info.get(wave)!.label);
    for (const b of breaksByWave.get(wave) ?? []) {
      rows.push(breakRow(b, addMinutes(opts.startTime, offset)));
      offset += b.minutes;
    }
  }
  // Breaks pointing past the last wave still show, appended in order.
  const trailing = [...breaksByWave.entries()]
    .filter(([aw]) => aw > lastWave)
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, bs]) => bs);
  for (const b of trailing) {
    rows.push(breakRow(b, addMinutes(opts.startTime, offset)));
    offset += b.minutes;
  }
  return rows;
}

function scheduleValue(row: ScheduleRow, source: HandoutFieldSource): string | number {
  switch (source) {
    case "wave": return row.kind === "break" ? "" : `Wave ${row.wave}`;
    case "scheduleTime": return row.time;
    case "categoryLabel":
    case "category": return row.label;
    case "count": return row.count ?? "";
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
  let rowGroups: { wave: number | string; category: string }[] | undefined;

  if (template.kind === "roster") {
    let list = [...riders];
    if (template.filter === "hasWave") list = list.filter((r) => r.wave != null);
    if (template.sort === "name" || !template.sort) list.sort(byName);
    else if (template.sort === "wave") list.sort((a, b) => (a.wave ?? 1e9) - (b.wave ?? 1e9) || byName(a, b));
    else if (template.sort === "category") list.sort((a, b) => (a.categoryLabel ?? "").localeCompare(b.categoryLabel ?? "") || byName(a, b));
    rows = list.map((r) => template.columns.map((c) => rosterValue(r, c.source)));
    // Wave-sorted rosters (the stager) carry grouping so the renderer can rule
    // between waves (bold) and between categories within a wave (dashed).
    if (template.sort === "wave") {
      rowGroups = list.map((r) => ({ wave: r.wave ?? "", category: r.categoryLabel ?? "" }));
    }
  } else if (template.kind === "podium") {
    rows = categorySummary(riders, event).map((c) => template.columns.map((col) => podiumValue(c, col.source)));
  } else {
    rows = scheduleRows(riders, opts).map((row) => template.columns.map((col) => scheduleValue(row, col.source)));
  }

  return { title: template.title, headers, rows, rowGroups };
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
