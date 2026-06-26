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

/**
 * A single category-block as shown in the wave editor: one category, ordered
 * riders. When `combinedWithPrev` is set, this block shares the previous block's
 * global wave number — i.e. two categories started together in one wave.
 */
export interface WaveGroup {
  categoryLabel: string;
  riders: Rider[];
  /** Share the previous block's wave number (multi-category combined wave). */
  combinedWithPrev?: boolean;
}

/**
 * Reconstruct the current wave layout from riders' existing `wave` values
 * (respecting manual edits) rather than recomputing from scratch. Blocks are
 * ordered by wave number; when one wave holds riders from multiple categories
 * (a combined wave), each category becomes its own block and the 2nd+ are
 * marked `combinedWithPrev`. Within a wave, categories sort by config order
 * (unknown labels last, alphabetically). Categorized riders with no wave yet
 * sort to the end. The inverse of {@link flattenWaveGroups}; uncategorized
 * riders are excluded.
 */
export function groupRidersIntoWaves(
  riders: Rider[],
  categories: CategoryDef[],
): WaveGroup[] {
  const order = new Map<string, number>();
  categories.forEach((c, i) => order.set(c.label, i));
  const catRank = (label: string) =>
    order.has(label) ? order.get(label)! : Number.MAX_SAFE_INTEGER;

  const byWave = new Map<number, Rider[]>();
  const noWave: Rider[] = [];
  for (const r of riders) {
    if (!r.categoryLabel) continue;
    if (r.wave == null) {
      noWave.push(r);
      continue;
    }
    const arr = byWave.get(r.wave) ?? [];
    arr.push(r);
    byWave.set(r.wave, arr);
  }

  const groups: WaveGroup[] = [];

  // Split one wave's riders into category blocks (config order); mark combined.
  const pushWaveBlocks = (waveRiders: Rider[]) => {
    const byCat = new Map<string, Rider[]>();
    for (const r of waveRiders) {
      const arr = byCat.get(r.categoryLabel!) ?? [];
      arr.push(r);
      byCat.set(r.categoryLabel!, arr);
    }
    const labels = [...byCat.keys()].sort(
      (a, b) => catRank(a) - catRank(b) || a.localeCompare(b),
    );
    labels.forEach((label, i) =>
      groups.push({ categoryLabel: label, riders: byCat.get(label)!, combinedWithPrev: i > 0 }),
    );
  };

  for (const wave of [...byWave.keys()].sort((a, b) => a - b)) {
    pushWaveBlocks(byWave.get(wave)!);
  }
  if (noWave.length) pushWaveBlocks(noWave);

  return groups;
}

/**
 * Project edited wave blocks back onto a flat rider list, assigning contiguous
 * global wave numbers (1..N) in block order and skipping empty blocks. A block
 * marked `combinedWithPrev` shares the prior block's number rather than taking a
 * new one (multi-category combined wave). Returns fresh rider objects (no
 * mutation). `otherRiders` (e.g. uncategorized) are appended unchanged. The
 * inverse of {@link groupRidersIntoWaves}.
 */
export function flattenWaveGroups(
  groups: WaveGroup[],
  otherRiders: Rider[] = [],
): Rider[] {
  const out: Rider[] = [];
  let waveNo = 0;
  for (const g of groups) {
    if (g.riders.length === 0) continue;
    if (!g.combinedWithPrev || waveNo === 0) waveNo += 1;
    for (const r of g.riders) out.push({ ...r, wave: waveNo });
  }
  for (const r of otherRiders) out.push(r);
  return out;
}
