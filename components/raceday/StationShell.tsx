"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import { useSnapshotPoll } from "@/lib/raceday/usePoll";
import { usePushSubscription } from "@/lib/raceday/usePushSubscription";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

const HOLD_MS = 1100;

/** Two-tone alert tone via Web Audio — no audio asset needed. Repeats while an EVAC is active. */
function useEvacDing(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  function ensureAudio() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
    ctxRef.current?.resume();
  }

  function playDing() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.16);
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.32, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.35);
    });
  }

  useEffect(() => {
    if (!active) return;
    playDing();
    const id = setInterval(playDing, 2500);
    return () => clearInterval(id);
  }, [active]);

  return { ensureAudio };
}

function EvacButton({ projectId, token }: { projectId: string; token: string }) {
  const [holding, setHolding] = useState(0); // 0-100 fill percent
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const { ensureAudio } = useEvacDing(false);

  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setHolding(0);
  }

  function start() {
    ensureAudio(); // must happen inside the user gesture or the browser blocks sound later
    const startedAt = Date.now();
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - startedAt) / HOLD_MS) * 100);
      setHolding(pct);
      if (pct < 100) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(async () => {
      cancel();
      const body = "{}";
      const headers = { "x-raceday-token": token, "Content-Type": "application/json" };
      // Relative path: whichever network this device is actually on (hub LAN or cloud) — always attempted.
      fetch(`/api/raceday/${projectId}/evac`, { method: "POST", headers, body }).catch(() => {});
      // Best-effort second attempt straight at the public cloud URL, so a device on the hub's LAN
      // that also happens to have cell signal still triggers the real push fan-out. Short timeout,
      // silently ignored on failure — the LAN broadcast above already covers the common case.
      const cloudUrl = process.env.NEXT_PUBLIC_RACEDAY_CLOUD_URL;
      if (cloudUrl && cloudUrl !== window.location.origin) {
        fetch(`${cloudUrl}/api/raceday/${projectId}/evac`, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(4000),
        }).catch(() => {});
      }
    }, HOLD_MS);
  }

  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className="relative shrink-0 overflow-hidden rounded-full bg-danger px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-background"
    >
      <span
        className="absolute inset-0 bg-white/35"
        style={{ width: `${holding}%`, transition: holding === 0 ? "none" : undefined }}
      />
      <span className="relative">🚨 Evac</span>
    </button>
  );
}

function IncidentBanner({ incident }: { incident: RaceDaySnapshot["incident"] }) {
  if (!incident) return null;
  return (
    <div className="flex items-center gap-2 bg-danger px-3 py-2 text-xs font-bold text-background">
      🚑 {incident.type} reported{incident.note ? ` · ${incident.note}` : ""}
    </div>
  );
}

function EvacOverlay({ active }: { active: boolean }) {
  useEvacDing(active);
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-red-900 to-red-950 p-10 text-center text-white">
      <div className="text-5xl font-black">🚨 EVACUATE</div>
      <p className="max-w-md text-base opacity-90">
        Leave the course immediately and follow marshal instructions. Treat the air-horn/whistle
        signal as authoritative — this is reinforcement, not the primary alert.
      </p>
    </div>
  );
}

/**
 * Shared chrome for every race-day volunteer station: token resolution,
 * snapshot polling, the EVAC hold-to-confirm control, the incident banner,
 * and the full-screen EVAC takeover. Station components receive the polled
 * snapshot via `render` rather than fetching it themselves.
 */
export function StationShell({
  projectId,
  title,
  eventId,
  children,
}: {
  projectId: string;
  title: string;
  eventId?: string;
  children: (snapshot: RaceDaySnapshot) => ReactNode;
}) {
  const token = useRaceDayToken(projectId);
  const { snapshot, error } = useSnapshotPoll(projectId, token, { eventId });
  const push = usePushSubscription(projectId, token);

  if (!token) {
    return (
      <div className="mx-auto max-w-sm p-6 text-center text-sm text-muted">
        No access token found. Open this station using the link a director shared with you.
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <span className="text-sm font-bold text-foreground">{title}</span>
        <div className="flex items-center gap-2">
          {push.state === "unsubscribed" && (
            <button
              onClick={push.subscribe}
              className="rounded-full border border-border px-2 py-1 text-xs font-semibold text-muted hover:border-brand-strong hover:text-foreground"
              title="Enables this device to receive an EVAC alert even if the app isn't open"
            >
              🔔 Enable alerts
            </button>
          )}
          <EvacButton projectId={projectId} token={token} />
        </div>
      </div>
      <IncidentBanner incident={snapshot?.incident ?? null} />
      <div className="flex-1 p-4">
        {snapshot ? (
          children(snapshot)
        ) : error ? (
          <p className="text-sm text-danger">Couldn&apos;t reach the hub: {error}</p>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </div>
      <EvacOverlay active={Boolean(snapshot?.evac)} />
    </div>
  );
}
