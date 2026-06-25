import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, type Project } from "@/db/schema";
import type { ProjectState } from "@/lib/engine/models";

export type { Project, ProjectState };

export async function listProjects(): Promise<Project[]> {
  return getDb().select().from(projects).orderBy(desc(projects.updatedAt));
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
