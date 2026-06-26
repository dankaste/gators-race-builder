import type { RaceEvent, Rider } from "./models";

export interface WaveWarning {
  wave: number;
  categoryLabel: string;
  size: number;
  max: number;
}

export interface ValidationSummary {
  total: number;
  categorized: number;
  uncategorized: number;
  missingBib: number;
  duplicateBibs: (number | string)[];
  categoryCounts: { label: string; count: number }[];
  waveWarnings: WaveWarning[];
}

/**
 * Director-review checks over a transformed roster: counts that should reconcile
 * to the registration total, plus problems to fix before export (missing/dup
 * bibs, uncategorized riders, oversized waves).
 */
export function validate(riders: Rider[], event: RaceEvent): ValidationSummary {
  const maxByLabel = new Map(event.categories.map((c) => [c.label, c.maxSize]));

  let categorized = 0;
  let missingBib = 0;
  const catCounts = new Map<string, number>();
  const bibSeen = new Map<string | number, number>();
  // Per wave, per category — so a combined (multi-category) wave is checked
  // against each category's own maxSize rather than the whole wave's total.
  const waveCatCounts = new Map<number, Map<string, number>>();

  for (const r of riders) {
    if (r.categoryLabel) {
      categorized += 1;
      catCounts.set(r.categoryLabel, (catCounts.get(r.categoryLabel) ?? 0) + 1);
    }
    if (r.bib == null || r.bib === "") missingBib += 1;
    else bibSeen.set(r.bib, (bibSeen.get(r.bib) ?? 0) + 1);

    if (r.wave != null && r.categoryLabel) {
      const byCat = waveCatCounts.get(r.wave) ?? new Map<string, number>();
      byCat.set(r.categoryLabel, (byCat.get(r.categoryLabel) ?? 0) + 1);
      waveCatCounts.set(r.wave, byCat);
    }
  }

  const waveWarnings: WaveWarning[] = [];
  for (const [wave, byCat] of waveCatCounts) {
    for (const [label, size] of byCat) {
      const max = maxByLabel.get(label) ?? Infinity;
      if (size > max) waveWarnings.push({ wave, categoryLabel: label, size, max });
    }
  }
  waveWarnings.sort((a, b) => a.wave - b.wave || a.categoryLabel.localeCompare(b.categoryLabel));

  return {
    total: riders.length,
    categorized,
    uncategorized: riders.length - categorized,
    missingBib,
    duplicateBibs: [...bibSeen.entries()].filter(([, n]) => n > 1).map(([bib]) => bib),
    categoryCounts: event.categories
      .map((c) => ({ label: c.label, count: catCounts.get(c.label) ?? 0 }))
      .filter((c) => c.count > 0),
    waveWarnings,
  };
}
