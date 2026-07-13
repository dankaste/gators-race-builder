"use client";

import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

function WaveBlock({
  projectId,
  token,
  eventId,
  wave,
  riders,
  snapshot,
}: {
  projectId: string;
  token: string;
  eventId: string;
  wave: number;
  riders: RaceDaySnapshot["roster"];
  snapshot: RaceDaySnapshot;
}) {
  const waveStart = snapshot.waves.find((w) => w.wave === wave);
  const marksByPlayer = new Map(snapshot.startMarks.filter((m) => m.wave === wave).map((m) => [m.playerId, m.status]));
  const categories = [...new Set(riders.map((r) => r.categoryLabel).filter(Boolean))];

  async function startWave() {
    await fetch(`/api/raceday/${projectId}/starts/wave`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, wave, idempotencyKey: crypto.randomUUID() }),
    });
  }

  async function toggle(playerId: string) {
    const current = marksByPlayer.get(playerId) ?? "started";
    const next = current === "dns" ? "started" : "dns";
    await fetch(`/api/raceday/${projectId}/starts/mark`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId, wave, status: next, idempotencyKey: crypto.randomUUID() }),
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-surface-2 px-3 py-2">
        <div>
          <div className="text-sm font-bold text-foreground">Wave {wave}</div>
          <div className="text-xs text-muted">{categories.join(" · ")}</div>
        </div>
        {waveStart ? (
          <span className="text-xs font-bold text-brand-strong">
            🟢 {new Date(waveStart.startedAt).toLocaleTimeString()}
          </span>
        ) : (
          <button
            onClick={startWave}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
          >
            Start wave
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {riders.map((r) => {
          const status = marksByPlayer.get(r.playerId) ?? "started";
          return (
            <button
              key={r.playerId}
              onClick={() => toggle(r.playerId)}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              <span className="w-10 shrink-0 font-bold text-brand-strong">{r.bib ?? "—"}</span>
              <span className="flex-1 truncate">
                {r.firstName} {r.lastName}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                  status === "dns" ? "bg-danger/20 text-danger" : "bg-brand-deep/20 text-brand-strong"
                }`}
              >
                {status === "dns" ? "DNS" : "Started"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StartLineList({
  projectId,
  token,
  eventId,
  snapshot,
}: {
  projectId: string;
  token: string;
  eventId: string;
  snapshot: RaceDaySnapshot;
}) {
  const byWave = new Map<number, RaceDaySnapshot["roster"]>();
  for (const rider of snapshot.roster) {
    if (rider.wave == null) continue;
    const arr = byWave.get(rider.wave) ?? [];
    arr.push(rider);
    byWave.set(rider.wave, arr);
  }
  const waves = [...byWave.keys()].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      {waves.map((wave) => (
        <WaveBlock
          key={wave}
          projectId={projectId}
          token={token}
          eventId={eventId}
          wave={wave}
          riders={byWave.get(wave)!}
          snapshot={snapshot}
        />
      ))}
      {waves.length === 0 && <p className="text-sm text-muted">No waves assigned yet.</p>}
    </div>
  );
}

export function StartLineStation({ projectId }: { projectId: string }) {
  const token = useRaceDayToken(projectId);

  return (
    <StationShell projectId={projectId} title="Start line">
      {(snapshot) =>
        token && snapshot.event ? (
          <StartLineList projectId={projectId} token={token} eventId={snapshot.event.id} snapshot={snapshot} />
        ) : (
          <p className="text-sm text-muted">No event configured for this project.</p>
        )
      }
    </StationShell>
  );
}
