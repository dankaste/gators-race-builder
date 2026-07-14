"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import { computeRaceStatuses } from "@/lib/engine/raceDay";
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
  const [error, setError] = useState<string | null>(null);

  const results = [...snapshot.finishResults].reverse(); // most recent first

  async function tap() {
    setError(null);
    const clientTime = new Date().toISOString();
    setPending({ id: "pending", capturedAt: clientTime }); // optimistic placeholder until the response lands
    try {
      const res = await fetch(`/api/raceday/${projectId}/finish-taps`, {
        method: "POST",
        headers: { "x-raceday-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, idempotencyKey: crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error(`Tap failed (${res.status})`);
      const data = await res.json();
      setPending({ id: data.id, capturedAt: data.capturedAt ?? clientTime });
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function assign(bib: string, playerId: string) {
    if (!pending) return;
    setError(null);
    const rows = [
      ...snapshot.finishOrder.map((r) => ({ bib: r.bib, playerId: r.playerId, editedTime: r.editedTime })),
      { bib, playerId, editedTime: null },
    ];
    try {
      const res = await fetch(`/api/raceday/${projectId}/finish-order`, {
        method: "PUT",
        headers: { "x-raceday-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, rows }),
      });
      if (!res.ok) throw new Error(`Assign failed (${res.status})`);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function markDnf(playerId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/raceday/${projectId}/dnf`, {
        method: "POST",
        headers: { "x-raceday-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, playerId, idempotencyKey: crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error(`DNF failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // "On course" — started, not yet finished/DNF/DNS — same definition Course
  // Watch uses. Always shown (not gated behind having tapped yet), since the
  // whole point is to have the assign target ready before/as a rider crosses.
  const statuses = computeRaceStatuses(snapshot.roster, snapshot.waves, snapshot.startMarks, snapshot.finishResults, snapshot.dnfMarks);
  const onCourse = snapshot.roster.filter((r) => statuses.get(r.playerId) === "started");
  const filtered = onCourse.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || String(r.bib ?? "").includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <button
        onClick={tap}
        className="rounded-lg bg-accent px-4 py-4 text-base font-bold text-background hover:opacity-90"
      >
        ⏱️ Tap as they finish
      </button>

      <input
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand-strong focus:outline-none"
        placeholder="Search riders on course…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="text-xs font-bold uppercase tracking-wide text-muted">
        On course ({onCourse.length}){pending && " — tap a rider to assign the highlighted crossing"}
      </div>
      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {filtered.map((r) => (
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
              title={pending ? "Assign this rider to the highlighted crossing" : "Tap the finish button first"}
            >
              Assign
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">Nobody currently on course.</p>}
      </div>

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
