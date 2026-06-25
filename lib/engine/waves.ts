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

    const ordered = orderRiders(group, cat.ordering);
    const numWaves = waveCountFor(ordered.length, cat.maxSize);
    // Even split: balance wave sizes rather than filling maxSize then a remainder.
    const waveSize = Math.ceil(ordered.length / numWaves);

    for (let i = 0; i < numWaves; i++) {
      waveNo += 1;
      const slice = ordered.slice(i * waveSize, (i + 1) * waveSize);
      for (const r of slice) r.wave = waveNo;
      assignments.push({ wave: waveNo, categoryLabel: cat.label, riders: slice });
    }
  }

  return assignments;
}
