import { parseDate } from "./age";

/** Case/whitespace-insensitive normalization for name matching. */
export function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Candidate normalized name keys handling "First Last" and "Last, First" input orders. */
export function nameKeys(firstName: string, lastName: string): string[] {
  const f = firstName?.trim() ?? "";
  const l = lastName?.trim() ?? "";
  return [normName(`${f} ${l}`), normName(`${l} ${f}`), normName(`${l}, ${f}`), normName(`${l} ,${f}`)].filter(Boolean);
}

export interface BibCandidate {
  firstName: string;
  lastName: string;
  birthDate?: string | null;
}

export interface BibSourceRider {
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  bib: number | string | null;
}

export interface BibSource {
  raceSlug: string;
  projectName: string;
  updatedAt: Date;
  riders: BibSourceRider[];
}

export interface BibMatch {
  bib: number | string;
  raceSlug: string;
  projectName: string;
  /** Set when another source disagreed on the bib for the same name (most-recent wins). */
  conflict?: { raceSlug: string; bib: number | string };
}

/** True if two birthdates both parse and disagree — the only case that should block a name match. */
function birthDatesConflict(a?: string | null, b?: string | null): boolean {
  const da = parseDate(a ?? null);
  const db = parseDate(b ?? null);
  if (!da || !db) return false;
  return da.getTime() !== db.getTime();
}

/**
 * Match bib-less riders (candidates) against riders with an assigned bib from
 * other races (sources), by normalized name. `birthDate` disambiguates only
 * when both sides parse cleanly and disagree — anything else (missing,
 * unparseable) is treated as "no information," not a mismatch, since raw
 * export date strings can differ in formatting between races.
 *
 * When multiple sources agree on a name but disagree on the bib (data
 * drift), the most-recently-updated source's bib wins and the result carries
 * a `conflict` so the caller can surface it instead of silently resolving it.
 */
export function matchBibCandidates(candidates: BibCandidate[], sources: BibSource[]): Map<number, BibMatch> {
  interface Entry {
    bib: number | string;
    raceSlug: string;
    projectName: string;
    birthDate?: string | null;
    updatedAt: Date;
  }
  const byKey = new Map<string, Entry>();
  const conflicts = new Map<string, { raceSlug: string; bib: number | string }>();

  for (const src of sources) {
    for (const r of src.riders) {
      if (r.bib == null || r.bib === "") continue;
      for (const k of nameKeys(r.firstName, r.lastName)) {
        const existing = byKey.get(k);
        if (!existing) {
          byKey.set(k, { bib: r.bib, raceSlug: src.raceSlug, projectName: src.projectName, birthDate: r.birthDate, updatedAt: src.updatedAt });
          continue;
        }
        if (existing.bib === r.bib) continue; // same plate, no conflict
        // Different bib for the same name key — most-recently-updated source wins.
        if (src.updatedAt > existing.updatedAt) {
          conflicts.set(k, { raceSlug: existing.raceSlug, bib: existing.bib });
          byKey.set(k, { bib: r.bib, raceSlug: src.raceSlug, projectName: src.projectName, birthDate: r.birthDate, updatedAt: src.updatedAt });
        } else {
          conflicts.set(k, { raceSlug: src.raceSlug, bib: r.bib });
        }
      }
    }
  }

  const results = new Map<number, BibMatch>();
  candidates.forEach((c, i) => {
    for (const k of nameKeys(c.firstName, c.lastName)) {
      const found = byKey.get(k);
      if (!found) continue;
      if (birthDatesConflict(c.birthDate, found.birthDate)) continue;
      const conflict = conflicts.get(k);
      results.set(i, {
        bib: found.bib,
        raceSlug: found.raceSlug,
        projectName: found.projectName,
        ...(conflict ? { conflict } : {}),
      });
      break;
    }
  });
  return results;
}
