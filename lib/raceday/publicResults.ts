import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import type { CategoryStanding } from "@/lib/engine/raceDay";
import { getRaceDaySnapshot } from "./snapshot";

export interface PublicResults {
  projectName: string;
  raceDate?: string;
  standings: CategoryStanding[];
  asOf: string;
}

/**
 * The public, unauthenticated results payload — deliberately a much smaller
 * surface than the full internal snapshot (no incidents, no evac state, no
 * raw taps/finish-order, no roster beyond what standings already carry).
 * Always the cloud DB (this route only ever runs on the real deployment;
 * nobody would share a hub LAN IP publicly), so results just reflect
 * whatever the last sync-up landed.
 */
export async function getPublicResults(projectId: string): Promise<PublicResults> {
  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found.`);

  const snapshot = await getRaceDaySnapshot(projectId);
  return {
    projectName: project.name,
    raceDate: snapshot.project.raceDate,
    standings: snapshot.standings,
    asOf: project.updatedAt.toISOString(),
  };
}
