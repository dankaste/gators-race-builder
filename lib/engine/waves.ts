import type { CategoryDef, Rider, WaveOrdering } from "./models";

/**
 * Order riders within a single category prior to splitting into waves.
 *
 * - `seed-ascending` / `isolate-slow-heat`: sort by seed level ascending so the
 *   slowest/most-beginner riders land in the earliest wave(s). We deliberately
 *   do NOT stack the fastest into the final wave (mixed rider feedback) — an even
 *   split after sorting keeps waves balanced. Unseeded riders sort to the middle.
 * - `registration` / `manual`: preserve input order (director adjusts manually).
 */
function orderRiders(riders: Rider[], ordering: WaveOrdering): Rider[] {
  if (ordering === "registration" || ordering === "manual") {
    return riders.slice();
  }
  // seed-ascending and isolate-slow-heat both sort slowest-first.
  const seedOf = (r: Rider) =>
    r.seedLevel ?? Number.POSITIVE_INFINITY; // unseeded -> end of sort
  return riders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const d = seedOf(a.r) - seedOf(b.r);
      return d !== 0 ? d : a.i - b.i; // stable
    })
    .map((x) => x.r);
}

/** Number of waves needed for a category given its max size. */
export function waveCountFor(n: number, maxSize: number): number {
  if (n <= 0) return 0;
  return Math.ceil(n / maxSize);
}

/**
 * Split one category's riders into evenly-balanced waves: order them per the
 * category's `ordering`, then slice into `waveCountFor` buckets. This is the
 * single source of even-split logic — `buildWaves` uses it for the initial
 * suggestion and the wave editor reuses it for "rebalance"/"split".
 */
export function rebalanceCategoryWaves(
  riders: Rider[],
  cat: CategoryDef,
): Rider[][] {
  const ordered = orderRiders(riders, cat.ordering);
  const numWaves = waveCountFor(ordered.length, cat.maxSize);
  if (numWaves === 0) return [];
  // Even split: balance wave sizes rather than filling maxSize then a remainder.
  const waveSize = Math.ceil(ordered.length / numWaves);
  const waves: Rider[][] = [];
  for (let i = 0; i < numWaves; i++) {
    waves.push(ordered.slice(i * waveSize, (i + 1) * waveSize));
  }
  return waves;
}

/** Split a single bucket of riders into `parts` evenly-sized waves (order kept). */
export function splitEvenly(riders: Rider[], parts: number): Rider[][] {
  if (parts <= 1 || riders.length <= 1) return [riders.slice()];
  const size = Math.ceil(riders.length / parts);
  const out: Rider[][] = [];
  for (let i = 0; i < parts; i++) {
    const slice = riders.slice(i * size, (i + 1) * size);
    if (slice.length) out.push(slice);
  }
  return out;
}

export interface WaveAssignment {
  /** Global wave number across all categories (1-based). */
  wave: number;
  categoryLabel: string;
  riders: Rider[];
}

/**
 * Assign waves across all categories of an event. Riders are grouped by their
 * already-assigned `categoryLabel`, categories are processed in config order,
 * and the wave counter increments globally (Wave 1, 2, 3, … across categories),
 * matching the existing WebScorer numbering. Mutates each rider's `wave`.
 */
export function buildWaves(
  riders: Rider[],
  categories: CategoryDef[],
): WaveAssignment[] {
  const byLabel = new Map<string, Rider[]>();
  for (const r of riders) {
    if (!r.categoryLabel) continue;
    const arr = byLabel.get(r.categoryLabel) ?? [];
    arr.push(r);
    byLabel.set(r.categoryLabel, arr);
  }

  const assignments: WaveAssignment[] = [];
  let waveNo = 0;

  for (const cat of categories) {
    const group = byLabel.get(cat.label);
    if (!group || group.length === 0) continue;

    for (const slice of rebalanceCategoryWaves(group, cat)) {
      waveNo += 1;
      for (const r of slice) r.wave = waveNo;
      assignments.push({ wave: waveNo, categoryLabel: cat.label, riders: slice });
    }
  }

  return assignments;
}

/** A single wave as shown in the wave editor: one category, ordered riders. */
export interface WaveGroup {
  categoryLabel: string;
  riders: Rider[];
}

/**
 * Reconstruct the current wave layout from riders' existing `wave` values
 * (respecting manual edits) rather than recomputing from scratch. Categories
 * are ordered per config (unknown labels sort last, alphabetically); within a
 * category, riders are grouped by their current wave number (nulls last). The
 * inverse of {@link flattenWaveGroups}. Uncategorized riders are excluded.
 */
export function groupRidersIntoWaves(
  riders: Rider[],
  categories: CategoryDef[],
): WaveGroup[] {
  const order = new Map<string, number>();
  categories.forEach((c, i) => order.set(c.label, i));

  const byLabel = new Map<string, Rider[]>();
  for (const r of riders) {
    if (!r.categoryLabel) continue;
    const arr = byLabel.get(r.categoryLabel) ?? [];
    arr.push(r);
    byLabel.set(r.categoryLabel, arr);
  }

  const labels = [...byLabel.keys()].sort((a, b) => {
    const ia = order.has(a) ? order.get(a)! : Number.MAX_SAFE_INTEGER;
    const ib = order.has(b) ? order.get(b)! : Number.MAX_SAFE_INTEGER;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });

  const groups: WaveGroup[] = [];
  for (const label of labels) {
    const byWave = new Map<number | null, Rider[]>();
    for (const r of byLabel.get(label)!) {
      const key = r.wave ?? null;
      const arr = byWave.get(key) ?? [];
      arr.push(r);
      byWave.set(key, arr);
    }
    const keys = [...byWave.keys()].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });
    for (const k of keys) groups.push({ categoryLabel: label, riders: byWave.get(k)! });
  }
  return groups;
}

/**
 * Project edited wave groups back onto a flat rider list, assigning contiguous
 * global wave numbers (1..N) in group order and skipping empty waves. Returns
 * fresh rider objects (no mutation). `otherRiders` (e.g. uncategorized) are
 * appended unchanged. The inverse of {@link groupRidersIntoWaves}.
 */
export function flattenWaveGroups(
  groups: WaveGroup[],
  otherRiders: Rider[] = [],
): Rider[] {
  const out: Rider[] = [];
  let waveNo = 0;
  for (const g of groups) {
    if (g.riders.length === 0) continue;
    waveNo += 1;
    for (const r of g.riders) out.push({ ...r, wave: waveNo });
  }
  for (const r of otherRiders) out.push(r);
  return out;
}
