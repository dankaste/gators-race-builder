"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

interface PendingTap {
  id: string;
  capturedAt: string;
}

function FinishLineBody({
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
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingTap | null>(null);

  const assignedPlayerIds = new Set(snapshot.finishOrder.map((r) => r.playerId).filter(Boolean));
  const results = [...snapshot.finishResults].reverse(); // most recent first

  async function tap() {
    const clientTime = new Date().toISOString();
    setPending({ id: "pending", capturedAt: clientTime }); // optimistic placeholder until the response lands
    const res = await fetch(`/api/raceday/${projectId}/finish-taps`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, idempotencyKey: crypto.randomUUID() }),
    });
    const data = await res.json();
    setPending({ id: data.id, capturedAt: data.capturedAt ?? clientTime });
  }

  async function assign(bib: string, playerId: string) {
    if (!pending) return;
    const rows = [
      ...snapshot.finishOrder.map((r) => ({ bib: r.bib, playerId: r.playerId, editedTime: r.editedTime })),
      { bib, playerId, editedTime: null },
    ];
    await fetch(`/api/raceday/${projectId}/finish-order`, {
      method: "PUT",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, rows }),
    });
    setPending(null);
  }

  async function markDnf(playerId: string) {
    await fetch(`/api/raceday/${projectId}/dnf`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId, idempotencyKey: crypto.randomUUID() }),
    });
  }

  const unassignedTapCount = snapshot.extraTaps.length + (pending ? 1 : 0);
  const filtered = snapshot.roster
    .filter((r) => !assignedPlayerIds.has(r.playerId))
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || String(r.bib ?? "").includes(q);
    });

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={tap}
        className="rounded-lg bg-accent px-4 py-4 text-base font-bold text-background hover:opacity-90"
      >
        ⏱️ Tap as they finish
      </button>

      <input
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand-strong focus:outline-none"
        placeholder="Search to assign the highlighted tap, or mark DNF…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {unassignedTapCount > 0 && (
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {filtered.slice(0, 6).map((r) => (
            <div key={r.playerId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm">
              <span className="w-10 shrink-0 font-bold text-brand-strong">{r.bib ?? "—"}</span>
              <span className="flex-1 truncate">{r.firstName} {r.lastName}</span>
              <button
                onClick={() => markDnf(r.playerId)}
                className="rounded-lg bg-danger/20 px-2 py-1 text-xs font-bold text-danger"
              >
                DNF
              </button>
              <button
                onClick={() => assign(String(r.bib ?? ""), r.playerId)}
                disabled={!pending}
                className="rounded-lg bg-accent px-2 py-1 text-xs font-bold text-background disabled:opacity-40"
              >
                Assign
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-muted">Crossings — most recent first</div>
      <div className="flex flex-col gap-1">
        {pending && (
          <div className="flex items-center gap-2 rounded-lg border border-warning bg-warning/10 px-2 py-1.5 text-sm">
            <span className="flex-1 font-bold text-warning">{new Date(pending.capturedAt).toLocaleTimeString()}</span>
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold uppercase text-warning">Unassigned</span>
          </div>
        )}
        {results.map((r) => (
          <div key={r.rowId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm">
            <span className="w-10 shrink-0 font-bold text-brand-strong">{r.bib}</span>
            <span className="flex-1 truncate">
              {snapshot.roster.find((rr) => rr.playerId === r.playerId)?.firstName ?? "?"}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {r.finishTime ? new Date(r.finishTime).toLocaleTimeString() : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinishLineStation({ projectId }: { projectId: string }) {
  const token = useRaceDayToken(projectId);

  return (
    <StationShell projectId={projectId} title="Finish line">
      {(snapshot) =>
        token && snapshot.event ? (
          <FinishLineBody projectId={projectId} token={token} eventId={snapshot.event.id} snapshot={snapshot} />
        ) : (
          <p className="text-sm text-muted">No event configured for this project.</p>
        )
      }
    </StationShell>
  );
}
