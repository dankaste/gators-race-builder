import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, type Project } from "@/db/schema";
import type { ProjectState, RosterEntry } from "@/lib/engine/models";
import { matchBibCandidates, type BibCandidate, type BibMatch, type BibSource } from "@/lib/engine/nameMatch";

export type { Project, ProjectState };
export type { BibCandidate, BibMatch };

export async function listProjects(): Promise<Project[]> {
  return getDb().select().from(projects).orderBy(desc(projects.updatedAt));
}

/** Projects for one season only — used to scope PII-bearing rider data to what's needed. */
export async function listProjectsBySeason(season: string): Promise<Project[]> {
  return getDb().select().from(projects).where(eq(projects.season, season)).orderBy(desc(projects.updatedAt));
}

/**
 * Highest numeric bib assigned across ALL projects — the bib plates are one
 * physical stack shared across every race, so the next available plate is this
 * + 1. Non-numeric bibs are ignored. Returns 0 when nothing is assigned yet.
 */
export async function getHighestBib(): Promise<number> {
  const all = await listProjects();
  let max = 0;
  for (const p of all) {
    const state = (p.state ?? {}) as ProjectState;
    for (const ev of Object.values(state.events ?? {})) {
      for (const r of ev.riders ?? []) {
        const n =
          typeof r.bib === "number"
            ? r.bib
            : typeof r.bib === "string" && /^\d+$/.test(r.bib)
              ? Number(r.bib)
              : null;
        if (n != null && n > max) max = n;
      }
    }
  }
  return max;
}

/**
 * Look up existing bibs for riders missing one in the current race, matched
 * by name against every OTHER project in the same season (bibs are one
 * physical plate stack per season — a rider who already raced this season
 * keeps their plate rather than getting a fresh number). Excludes the
 * current project so a race's bib-less riders never match each other.
 */
export async function findExistingBibs(
  candidates: BibCandidate[],
  opts: { excludeProjectId?: string; season: string },
): Promise<Map<number, BibMatch>> {
  const all = await listProjectsBySeason(opts.season);
  const sources: BibSource[] = all
    .filter((p) => p.id !== opts.excludeProjectId)
    .map((p) => {
      const state = (p.state ?? {}) as ProjectState;
      const riders = Object.values(state.events ?? {}).flatMap((ev) => ev.riders ?? []);
      return { raceSlug: p.raceSlug, projectName: p.name, updatedAt: p.updatedAt, riders };
    });
  return matchBibCandidates(candidates, sources);
}

/**
 * A season-wide "roster" derived from every other project's already-imported
 * riders — bib, GBP team, and contact info, exactly what a Player export CSV
 * would provide. Once ANY race this season has had its Player export
 * uploaded, every later race can skip re-uploading it: a director only needs
 * that file once a season, for whichever race they build first.
 *
 * One entry per playerId; when the same rider appears in multiple other
 * projects with conflicting data (a re-imported/corrected roster since),
 * the most-recently-updated project wins — same convention `findExistingBibs`
 * uses. Manually-added riders (`manual-*` ids) aren't real roster members
 * and are excluded.
 */
export async function deriveSeasonRoster(
  season: string,
  opts: { excludeProjectId?: string } = {},
): Promise<{ roster: RosterEntry[]; sourceProjectNames: string[] }> {
  const all = await listProjectsBySeason(season);
  const others = all.filter((p) => p.id !== opts.excludeProjectId);

  const byPlayerId = new Map<string, { rider: RosterEntry; updatedAt: Date }>();
  const usedProjectNames = new Set<string>();
  for (const p of others) {
    const state = (p.state ?? {}) as ProjectState;
    for (const ev of Object.values(state.events ?? {})) {
      for (const r of ev.riders ?? []) {
        if (!r.playerId || r.playerId.startsWith("manual-")) continue;
        const existing = byPlayerId.get(r.playerId);
        if (existing && existing.updatedAt >= p.updatedAt) continue; // an earlier-checked, more-recent project already won
        byPlayerId.set(r.playerId, {
          updatedAt: p.updatedAt,
          rider: {
            id: r.playerId,
            firstName: r.firstName,
            lastName: r.lastName,
            bib: r.bib,
            gender: r.gender,
            birthDate: r.birthDate,
            team: r.team,
            email: r.email,
            parentName: r.parentName,
            phone: r.phone,
          },
        });
        if (r.bib != null || r.team) usedProjectNames.add(p.name); // only credit projects that actually contributed data worth having
      }
    }
  }

  return { roster: [...byPlayerId.values()].map((v) => v.rider), sourceProjectNames: [...usedProjectNames] };
}

export async function getProject(id: string): Promise<Project | undefined> {
  const rows = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0];
}

export async function createProject(input: {
  raceSlug: string;
  name: string;
  season: string;
}): Promise<Project> {
  const rows = await getDb()
    .insert(projects)
    .values({ raceSlug: input.raceSlug, name: input.name, season: input.season })
    .returning();
  return rows[0];
}

export async function deleteProject(id: string): Promise<boolean> {
  const rows = await getDb().delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
  return rows.length > 0;
}

export async function updateProject(
  id: string,
  patch: { state?: ProjectState; status?: string; lastEditedBy?: string },
): Promise<Project | undefined> {
  const rows = await getDb()
    .update(projects)
    .set({
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.lastEditedBy !== undefined ? { lastEditedBy: patch.lastEditedBy } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return rows[0];
}
