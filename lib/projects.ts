import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, type Project } from "@/db/schema";
import type { ProjectState } from "@/lib/engine/models";

export type { Project, ProjectState };

export async function listProjects(): Promise<Project[]> {
  return getDb().select().from(projects).orderBy(desc(projects.updatedAt));
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
