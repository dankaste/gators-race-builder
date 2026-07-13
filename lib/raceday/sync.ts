import "server-only";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { getRaceDayDb } from "@/db/racedayDb";
import {
  projects,
  races,
  raceDayCheckIns,
  raceDayDnfMarks,
  raceDayEvacEvents,
  raceDayFinishOrder,
  raceDayFinishTimeTaps,
  raceDayIncidents,
  raceDayStartMarks,
  raceDayTokens,
  raceDayWaveStarts,
} from "@/db/schema";

/**
 * Pull a project's current roster/config from the cloud DB onto the hub,
 * reusing the same UUIDs (no id remapping — this is what keeps every upsert
 * on both sides dumb and idempotent). Run before leaving for the venue,
 * while there's still internet; safe to re-run right up until departure to
 * pick up last-minute roster edits.
 */
export async function syncDown(projectId: string): Promise<void> {
  const cloud = getDb();
  const hub = getRaceDayDb();

  const [project] = await cloud.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found in the cloud database.`);

  const [race] = await cloud.select().from(races).where(eq(races.slug, project.raceSlug));
  if (race) {
    await hub
      .insert(races)
      .values(race)
      .onConflictDoUpdate({
        target: races.id,
        set: { slug: race.slug, name: race.name, raceDate: race.raceDate, config: race.config, updatedAt: race.updatedAt },
      });
  }

  await hub
    .insert(projects)
    .values(project)
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        raceSlug: project.raceSlug,
        name: project.name,
        season: project.season,
        status: project.status,
        state: project.state,
        lastEditedBy: project.lastEditedBy,
        updatedAt: project.updatedAt,
      },
    });

  const [existingToken] = await hub.select().from(raceDayTokens).where(eq(raceDayTokens.projectId, projectId));
  if (!existingToken) {
    await hub.insert(raceDayTokens).values({ projectId, token: randomBytes(32).toString("base64url") });
  }
}

/**
 * Push everything the hub has accumulated back to the cloud: every race-day
 * table's rows for this project, plus the hub's current `projects.state`
 * (roster edits made on-site sync back too, last-write-wins by `updatedAt`).
 * Batches per table so a connection drop mid-push loses nothing — idempotent
 * upserts (by the shared `id`) mean the next attempt just resends cleanly.
 */
export async function syncUp(projectId: string): Promise<void> {
  const cloud = getDb();
  const hub = getRaceDayDb();

  const [hubProject] = await hub.select().from(projects).where(eq(projects.id, projectId));
  if (hubProject) {
    const [cloudProject] = await cloud.select().from(projects).where(eq(projects.id, projectId));
    if (!cloudProject || hubProject.updatedAt > cloudProject.updatedAt) {
      await cloud
        .update(projects)
        .set({
          state: hubProject.state,
          lastEditedBy: hubProject.lastEditedBy,
          updatedAt: hubProject.updatedAt,
        })
        .where(eq(projects.id, projectId));
    }
  }

  const checkIns = await hub.select().from(raceDayCheckIns).where(eq(raceDayCheckIns.projectId, projectId));
  for (const row of checkIns) {
    await cloud
      .insert(raceDayCheckIns)
      .values(row)
      .onConflictDoUpdate({ target: raceDayCheckIns.id, set: { checkedIn: row.checkedIn, checkedInAt: row.checkedInAt, updatedAt: row.updatedAt } });
  }

  const waveStarts = await hub.select().from(raceDayWaveStarts).where(eq(raceDayWaveStarts.projectId, projectId));
  for (const row of waveStarts) {
    await cloud
      .insert(raceDayWaveStarts)
      .values(row)
      .onConflictDoUpdate({ target: raceDayWaveStarts.id, set: { startedAt: row.startedAt, updatedAt: row.updatedAt } });
  }

  const startMarks = await hub.select().from(raceDayStartMarks).where(eq(raceDayStartMarks.projectId, projectId));
  for (const row of startMarks) {
    await cloud
      .insert(raceDayStartMarks)
      .values(row)
      .onConflictDoUpdate({ target: raceDayStartMarks.id, set: { status: row.status, recordedAt: row.recordedAt, updatedAt: row.updatedAt } });
  }

  const taps = await hub.select().from(raceDayFinishTimeTaps).where(eq(raceDayFinishTimeTaps.projectId, projectId));
  for (const row of taps) {
    await cloud
      .insert(raceDayFinishTimeTaps)
      .values(row)
      .onConflictDoUpdate({ target: raceDayFinishTimeTaps.id, set: { voidedAt: row.voidedAt, voidedBy: row.voidedBy } });
  }

  const orderRows = await hub.select().from(raceDayFinishOrder).where(eq(raceDayFinishOrder.projectId, projectId));
  for (const row of orderRows) {
    await cloud
      .insert(raceDayFinishOrder)
      .values(row)
      .onConflictDoUpdate({ target: raceDayFinishOrder.id, set: { sortOrder: row.sortOrder, bib: row.bib, playerId: row.playerId, editedTime: row.editedTime, updatedAt: row.updatedAt } });
  }

  const dnfMarks = await hub.select().from(raceDayDnfMarks).where(eq(raceDayDnfMarks.projectId, projectId));
  for (const row of dnfMarks) {
    await cloud
      .insert(raceDayDnfMarks)
      .values(row)
      .onConflictDoUpdate({ target: raceDayDnfMarks.id, set: { note: row.note } });
  }

  const incidents = await hub.select().from(raceDayIncidents).where(eq(raceDayIncidents.projectId, projectId));
  for (const row of incidents) {
    await cloud
      .insert(raceDayIncidents)
      .values(row)
      .onConflictDoUpdate({ target: raceDayIncidents.id, set: { resolvedAt: row.resolvedAt, resolvedBy: row.resolvedBy } });
  }

  const evacEvents = await hub.select().from(raceDayEvacEvents).where(eq(raceDayEvacEvents.projectId, projectId));
  for (const row of evacEvents) {
    await cloud
      .insert(raceDayEvacEvents)
      .values(row)
      .onConflictDoUpdate({ target: raceDayEvacEvents.id, set: { clearedAt: row.clearedAt, clearedBy: row.clearedBy } });
  }

  // race_day_finish_videos is deliberately NOT synced — the actual clips live
  // only on the hub's local disk, and there's no reason to push metadata for
  // files that will never exist in the cloud.
}
