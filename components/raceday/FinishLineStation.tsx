"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import { computeFinishResults, computeRaceStatuses, type FinishOrderRow, type FinishTimeTap } from "@/lib/engine/raceDay";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

interface LocalTap {
  id: string;
  capturedAt: string;
}

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
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
  const [order, setOrder] = useState<FinishOrderRow[] | null>(null);
  const [localTaps, setLocalTaps] = useState<LocalTap[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed local editable state once the snapshot first arrives (adjusted during
  // render, guarded to fire exactly once); further poll updates don't
  // overwrite it, so an in-progress drag/assign is never yanked out from
  // under the volunteer.
  if (order === null) {
    setOrder(snapshot.finishOrder);
  }

  // Merge in optimistic local taps (from a tap() that hasn't round-tripped
  // through a poll yet) so the "unassigned crossings" list and next-slot
  // assignment are correct immediately, not just after the next snapshot.
  const knownTapIds = new Set(snapshot.finishTimeTaps.map((t) => t.id));
  const mergedTaps: FinishTimeTap[] = [
    ...snapshot.finishTimeTaps,
    ...localTaps.filter((t) => !knownTapIds.has(t.id)).map((t) => ({ id: t.id, capturedAt: t.capturedAt, voided: false })),
  ].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  const effectiveOrder = order ?? snapshot.finishOrder;
  const { results, extraTaps } = computeFinishResults(effectiveOrder, mergedTaps);
  const rosterByPlayer = new Map(snapshot.roster.map((r) => [r.playerId, r]));

  async function tap() {
    setError(null);
    try {
      const res = await fetch(`/api/raceday/${projectId}/finish-taps`, {
        method: "POST",
        headers: { "x-raceday-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, idempotencyKey: crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error(`Tap failed (${res.status})`);
      const data = await res.json();
      setLocalTaps((prev) => [...prev, { id: data.id, capturedAt: data.capturedAt }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function commit(next: FinishOrderRow[]) {
    setOrder(next);
    setError(null);
    try {
      const res = await fetch(`/api/raceday/${projectId}/finish-order`, {
        method: "PUT",
        headers: { "x-raceday-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          rows: next.map((r) => ({ bib: r.bib, playerId: r.playerId, editedTime: r.editedTime })),
        }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Tapping a rider takes the next open finishing spot — the oldest
  // still-unassigned crossing — rather than requiring a separate "assign"
  // step. Appending to the end of the order list is exactly that: results
  // are matched positionally, so the new row lines up with
  // extraTaps[0] / activeTaps[order.length].
  function assignNext(bib: string, playerId: string) {
    commit([...effectiveOrder, { id: `new-${crypto.randomUUID()}`, bib, playerId, editedTime: null }]);
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

  function removeRow(index: number) {
    commit(effectiveOrder.filter((_, i) => i !== index));
  }

  // "On course" — started, not yet finished/DNF/DNS — same definition Course
  // Watch uses. Computed against the locally-assigned results, not just the
  // last-polled snapshot, so a rider just assigned here drops off the list
  // immediately instead of waiting for the next poll.
  const statuses = computeRaceStatuses(snapshot.roster, snapshot.waves, snapshot.startMarks, results, snapshot.dnfMarks);
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

      <div className="flex flex-col gap-1">
        <div className="text-xs font-bold uppercase tracking-wide text-muted">
          Unassigned crossings ({extraTaps.length})
        </div>
        {extraTaps.length === 0 ? (
          <p className="text-xs text-muted">None waiting — every captured time has a rider.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {extraTaps.map((t, i) => (
              <span
                key={t.id}
                className={`rounded-full px-2 py-1 text-xs font-bold ${
                  i === 0 ? "bg-warning/20 text-warning" : "bg-surface-2 text-muted"
                }`}
                title={i === 0 ? "Next open finishing spot" : undefined}
              >
                {new Date(t.capturedAt).toLocaleTimeString()}
              </span>
            ))}
          </div>
        )}
      </div>

      <input
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand-strong focus:outline-none"
        placeholder="Search riders on course…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="text-xs font-bold uppercase tracking-wide text-muted">
        On course ({onCourse.length}) — tap a rider to give them the next finishing spot
      </div>
      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {filtered.map((r) => (
          <div key={r.playerId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm">
            <button
              onClick={() => assignNext(String(r.bib ?? ""), r.playerId)}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <span className="w-10 shrink-0 font-bold text-brand-strong">{r.bib ?? "—"}</span>
              <span className="flex-1 truncate">{r.firstName} {r.lastName}</span>
            </button>
            <button
              onClick={() => markDnf(r.playerId)}
              className="rounded-lg bg-danger/20 px-2 py-1 text-xs font-bold text-danger"
            >
              DNF
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">Nobody currently on course.</p>}
      </div>

      <div className="text-xs font-bold uppercase tracking-wide text-muted">Finishing order — drag to reorder</div>
      <div className="flex flex-col gap-1.5">
        {results.map((result, i) => {
          const rider = result.playerId ? rosterByPlayer.get(result.playerId) : undefined;
          return (
            <div
              key={result.rowId}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) commit(reorder(effectiveOrder, dragIndex, i));
                setDragIndex(null);
              }}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
                result.finishTime ? "border-border bg-surface-2" : "border-warning bg-warning/10"
              }`}
            >
              <span className="cursor-grab text-muted">⠿</span>
              <span className="w-6 shrink-0 font-bold text-muted">{i + 1}</span>
              <span className="w-10 shrink-0 font-bold text-brand-strong">{result.bib}</span>
              <span className="flex-1 truncate">{rider ? `${rider.firstName} ${rider.lastName}` : "Unknown rider"}</span>
              <span className="shrink-0 text-xs text-muted">
                {result.finishTime ? new Date(result.finishTime).toLocaleTimeString() : "no time yet"}
              </span>
              <button onClick={() => removeRow(i)} className="text-muted hover:text-danger">
                ×
              </button>
            </div>
          );
        })}
        {results.length === 0 && <p className="text-sm text-muted">No finishers recorded yet.</p>}
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
