import "server-only";
import { eq } from "drizzle-orm";
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
  raceDayWaveStarts,
} from "@/db/schema";
import {
  computeFinishResults,
  groupResultsByCategory,
  toRaceDayRoster,
  type CategoryStanding,
  type CheckInState,
  type DnfMark,
  type FinishOrderRow,
  type FinishResult,
  type FinishTimeTap,
  type RaceDayIncident,
  type RaceDayRosterEntry,
  type StartMark,
  type WaveStart,
} from "@/lib/engine/raceDay";
import type { ProjectState } from "@/lib/engine/models";

export interface RaceDaySnapshot {
  project: { id: string; name: string; raceDate?: string };
  event: { id: string; name: string } | null;
  roster: RaceDayRosterEntry[];
  waves: WaveStart[];
  checkIns: CheckInState[];
  startMarks: StartMark[];
  finishTimeTaps: FinishTimeTap[];
  finishOrder: FinishOrderRow[];
  finishResults: FinishResult[];
  extraTaps: FinishTimeTap[];
  dnfMarks: DnfMark[];
  standings: CategoryStanding[];
  incident: RaceDayIncident | null;
  evac: { triggeredAt: string } | null;
}

/**
 * The single computed projection every station polls. Deliberately reads
 * the race's config via `getRaceDayDb()` (whichever DB this process is
 * currently pointed at — hub or cloud), NOT `lib/raceConfigs.ts`'s
 * `getRaceConfig()` — that helper is hardcoded to the cloud DB with a
 * generic seed-config fallback, which on the hub would silently serve the
 * wrong (unedited, non-project-specific) categories/waves instead of what
 * was actually synced down for this project.
 */
export async function getRaceDaySnapshot(projectId: string, eventId?: string): Promise<RaceDaySnapshot> {
  const db = getRaceDayDb();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found.`);

  const [race] = await db.select().from(races).where(eq(races.slug, project.raceSlug));
  const state = (project.state ?? {}) as ProjectState;
  const events = race?.config.events ?? [];
  const raceEvent = eventId ? events.find((e) => e.id === eventId) : events[0];
  const eventState = raceEvent ? state.events?.[raceEvent.id] : undefined;

  const riders = eventState?.riders ?? [];
  const roster = toRaceDayRoster(riders);

  if (!raceEvent) {
    return {
      project: { id: project.id, name: project.name, raceDate: state.raceDate },
      event: null,
      roster,
      waves: [],
      checkIns: [],
      startMarks: [],
      finishTimeTaps: [],
      finishOrder: [],
      finishResults: [],
      extraTaps: [],
      dnfMarks: [],
      standings: [],
      incident: null,
      evac: null,
    };
  }

  const [checkInRows, waveStartRows, startMarkRows, tapRows, orderRows, dnfRows, incidentRows, evacRows] =
    await Promise.all([
      db.select().from(raceDayCheckIns).where(eq(raceDayCheckIns.projectId, projectId)),
      db.select().from(raceDayWaveStarts).where(eq(raceDayWaveStarts.projectId, projectId)),
      db.select().from(raceDayStartMarks).where(eq(raceDayStartMarks.projectId, projectId)),
      db.select().from(raceDayFinishTimeTaps).where(eq(raceDayFinishTimeTaps.projectId, projectId)),
      db.select().from(raceDayFinishOrder).where(eq(raceDayFinishOrder.projectId, projectId)),
      db.select().from(raceDayDnfMarks).where(eq(raceDayDnfMarks.projectId, projectId)),
      db.select().from(raceDayIncidents).where(eq(raceDayIncidents.projectId, projectId)),
      db.select().from(raceDayEvacEvents).where(eq(raceDayEvacEvents.projectId, projectId)),
    ]);

  const forThisEvent = <T extends { eventId: string }>(rows: T[]) =>
    rows.filter((r) => r.eventId === raceEvent.id);

  const checkIns: CheckInState[] = forThisEvent(checkInRows).map((r) => ({
    playerId: r.playerId,
    checkedIn: r.checkedIn,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
  }));

  const waves: WaveStart[] = forThisEvent(waveStartRows).map((r) => ({
    wave: r.wave,
    startedAt: r.startedAt.toISOString(),
  }));

  const startMarks: StartMark[] = forThisEvent(startMarkRows).map((r) => ({
    playerId: r.playerId,
    wave: r.wave,
    status: r.status as StartMark["status"],
    recordedAt: r.recordedAt.toISOString(),
  }));

  const finishTimeTaps: FinishTimeTap[] = forThisEvent(tapRows)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
    .map((r) => ({ id: r.id, capturedAt: r.capturedAt.toISOString(), voided: r.voidedAt != null }));

  const finishOrder: FinishOrderRow[] = forThisEvent(orderRows)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      id: r.id,
      bib: r.bib,
      playerId: r.playerId,
      editedTime: r.editedTime?.toISOString() ?? null,
    }));

  const { results: finishResults, extraTaps } = computeFinishResults(finishOrder, finishTimeTaps);

  const dnfMarks: DnfMark[] = forThisEvent(dnfRows).map((r) => ({
    playerId: r.playerId,
    markedAt: r.markedAt.toISOString(),
    markedBy: r.markedBy ?? undefined,
    note: r.note ?? undefined,
  }));

  const activeIncident = forThisEvent(incidentRows)
    .filter((r) => r.resolvedAt == null)
    .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime())[0];
  const incident: RaceDayIncident | null = activeIncident
    ? {
        id: activeIncident.id,
        playerId: activeIncident.playerId,
        type: activeIncident.type as RaceDayIncident["type"],
        note: activeIncident.note ?? undefined,
        reportedAt: activeIncident.reportedAt.toISOString(),
        reportedBy: activeIncident.reportedBy ?? undefined,
        resolvedAt: null,
      }
    : null;

  const activeEvac = evacRows.find((r) => r.clearedAt == null);
  const evac = activeEvac ? { triggeredAt: activeEvac.triggeredAt.toISOString() } : null;

  const standings = groupResultsByCategory(
    raceEvent.categories,
    waves,
    roster,
    finishResults,
    dnfMarks,
    startMarks,
  );

  return {
    project: { id: project.id, name: project.name, raceDate: state.raceDate },
    event: { id: raceEvent.id, name: raceEvent.name },
    roster,
    waves,
    checkIns,
    startMarks,
    finishTimeTaps,
    finishOrder,
    finishResults,
    extraTaps,
    dnfMarks,
    standings,
    incident,
    evac,
  };
}
