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
  const waveGroups = new Map<number, { label: string; size: number }>();

  for (const r of riders) {
    if (r.categoryLabel) {
      categorized += 1;
      catCounts.set(r.categoryLabel, (catCounts.get(r.categoryLabel) ?? 0) + 1);
    }
    if (r.bib == null || r.bib === "") missingBib += 1;
    else bibSeen.set(r.bib, (bibSeen.get(r.bib) ?? 0) + 1);

    if (r.wave != null && r.categoryLabel) {
      const g = waveGroups.get(r.wave) ?? { label: r.categoryLabel, size: 0 };
      g.size += 1;
      waveGroups.set(r.wave, g);
    }
  }

  const waveWarnings: WaveWarning[] = [];
  for (const [wave, g] of waveGroups) {
    const max = maxByLabel.get(g.label) ?? Infinity;
    if (g.size > max) waveWarnings.push({ wave, categoryLabel: g.label, size: g.size, max });
  }
  waveWarnings.sort((a, b) => a.wave - b.wave);

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
