"use client";

import { useEffect, useState } from "react";
import type { RaceDaySnapshot } from "./snapshot";

export interface SnapshotPollState {
  snapshot: RaceDaySnapshot | null;
  error: string | null;
  lastFetchedAt: number | null;
}

/**
 * Polls the shared snapshot endpoint every `intervalMs` (default 2s),
 * pausing while the tab isn't visible. A failed poll keeps the last-known
 * snapshot rather than blanking the UI — stations should stay usable
 * through a brief Wi-Fi drop. Station devices pass their bearer token;
 * director-facing pages (already session-authenticated) pass
 * `requireToken: false` and rely on the session cookie instead — the
 * snapshot endpoint accepts either via `apiRequireRaceDayAccess`.
 */
export function useSnapshotPoll(
  projectId: string,
  token: string | null,
  opts?: { eventId?: string; intervalMs?: number; requireToken?: boolean },
): SnapshotPollState {
  const { eventId, intervalMs = 2000, requireToken = true } = opts ?? {};
  const [state, setState] = useState<SnapshotPollState>({ snapshot: null, error: null, lastFetchedAt: null });

  useEffect(() => {
    if (requireToken && !token) return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const url = new URL(`/api/raceday/${projectId}/snapshot`, window.location.origin);
        if (eventId) url.searchParams.set("eventId", eventId);
        const res = await fetch(url, token ? { headers: { "x-raceday-token": token } } : {});
        if (!res.ok) throw new Error(`Snapshot request failed (${res.status})`);
        const snapshot = (await res.json()) as RaceDaySnapshot;
        if (!cancelled) setState({ snapshot, error: null, lastFetchedAt: Date.now() });
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }

    poll();
    const timer = setInterval(poll, intervalMs);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [projectId, token, eventId, intervalMs, requireToken]);

  return state;
}
