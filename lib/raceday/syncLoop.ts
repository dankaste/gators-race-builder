import "server-only";
import { syncDown, syncUp } from "./sync";

export interface SyncStatus {
  online: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

const statusByProject = new Map<string, SyncStatus>();

function emptyStatus(): SyncStatus {
  return { online: false, lastSyncedAt: null, lastSyncError: null };
}

export function getSyncStatus(projectId: string): SyncStatus {
  return statusByProject.get(projectId) ?? emptyStatus();
}

async function checkOnline(): Promise<boolean> {
  const url = process.env.RACEDAY_CLOUD_URL;
  if (!url) return false;
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One sync attempt for a project: check connectivity, and if online, push
 * then pull. Tolerant of brief, unpredictable connectivity (a phone hotspot
 * for 30 seconds in a parking lot is enough to make progress) — failures
 * just get recorded and retried on the next tick.
 */
export async function runSyncCycle(projectId: string): Promise<void> {
  const online = await checkOnline();
  const prev = getSyncStatus(projectId);
  if (!online) {
    statusByProject.set(projectId, { ...prev, online: false });
    return;
  }
  try {
    await syncUp(projectId);
    await syncDown(projectId);
    statusByProject.set(projectId, { online: true, lastSyncedAt: new Date().toISOString(), lastSyncError: null });
  } catch (e) {
    statusByProject.set(projectId, { online: true, lastSyncedAt: prev.lastSyncedAt, lastSyncError: String(e) });
  }
}

let started = false;

/**
 * Starts the hub's background sync loop, polling connectivity every ~45s.
 * Only meaningful under RACEDAY_MODE=local — a no-op in normal cloud mode.
 * The project(s) to sync come from RACEDAY_PROJECT_IDS (comma-separated),
 * set alongside RACEDAY_MODE on the hub during pre-race prep.
 */
export function startSyncLoop(): void {
  if (started || process.env.RACEDAY_MODE !== "local") return;
  started = true;

  const projectIds = (process.env.RACEDAY_PROJECT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (projectIds.length === 0) return;

  const tick = () => {
    for (const id of projectIds) {
      runSyncCycle(id).catch((e) => console.error(`Race-day sync cycle failed for ${id}:`, e));
    }
  };
  tick();
  setInterval(tick, 45_000);
}
