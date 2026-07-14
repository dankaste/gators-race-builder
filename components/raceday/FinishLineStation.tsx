"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import {
  computeFinishResults,
  computeRaceStatuses,
  computeWaveProgress,
  type FinishOrderRow,
  type FinishResult,
  type FinishTimeTap,
} from "@/lib/engine/raceDay";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

interface LocalTap {
  id: string;
  capturedAt: string;
}

type DragPayload =
  | { source: "roster"; playerId: string; bib: string }
  | { source: "slot"; playerId: string; bib: string; fromIndex: number };

function emptyRow(i: number): FinishOrderRow {
  return { id: `empty-${i}`, bib: "", playerId: null, editedTime: null };
}

// A small qualitative palette for wave badges, kept out of the app's
// green/amber/red semantic colors (brand/warning/danger) so a wave number
// never reads as a status. Cycled by wave number for an event with more
// concurrent waves than colors.
const WAVE_COLORS = ["#4fb3bf", "#8b7fd9", "#d17bb0", "#c9a25f", "#6fa8dc", "#7fd9b0"];
function waveColor(wave: number | null): string {
  if (wave == null) return "var(--muted-2)";
  return WAVE_COLORS[(wave - 1) % WAVE_COLORS.length];
}

function WaveChip({ wave }: { wave: number | null }) {
  if (wave == null) return null;
  const c = waveColor(wave);
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 20%, var(--surface-2))`, border: `1px solid color-mix(in srgb, ${c} 42%, transparent)` }}
    >
      W{wave}
    </span>
  );
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
  const [locallyVoided, setLocallyVoided] = useState<Set<string>>(new Set());
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which fully-resolved waves' slots the volunteer has manually expanded
  // back open — collapsed by default so the live view stays a manageable
  // size across a whole day's worth of waves.
  const [expandedCompleted, setExpandedCompleted] = useState<Set<number>>(new Set());

  // Seed local editable state once the snapshot first arrives (adjusted during
  // render, guarded to fire exactly once); further poll updates don't
  // overwrite it, so an in-progress drag/assign is never yanked out from
  // under the volunteer.
  if (order === null) {
    setOrder(snapshot.finishOrder);
  }

  // Merge in optimistic local taps (a tap() that hasn't round-tripped through
  // a poll yet) and locally-voided ones (a remove that hasn't either), so the
  // slot list is correct immediately rather than only after the next poll.
  const knownTapIds = new Set(snapshot.finishTimeTaps.map((t) => t.id));
  const mergedTaps: FinishTimeTap[] = [
    ...snapshot.finishTimeTaps,
    ...localTaps.filter((t) => !knownTapIds.has(t.id)).map((t) => ({ id: t.id, capturedAt: t.capturedAt, voided: false })),
  ]
    .map((t) => ({ ...t, voided: t.voided || locallyVoided.has(t.id) }))
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  const activeTaps = mergedTaps.filter((t) => !t.voided);
  const effectiveOrder = order ?? snapshot.finishOrder;
  // One slot per captured (non-voided) time — the finishing order list is a
  // fixed set of time slots, not a freeform reorderable list; a slot is
  // either empty (awaiting a rider) or filled.
  const paddedOrder: FinishOrderRow[] = Array.from(
    { length: activeTaps.length },
    (_, i) => effectiveOrder[i] ?? emptyRow(i),
  );
  const { results } = computeFinishResults(paddedOrder, mergedTaps);
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

  // Tapping a rider fills the next open slot — the oldest still-unassigned
  // captured time — rather than requiring a separate "assign" step or drag.
  function assignNext(bib: string, playerId: string) {
    const idx = paddedOrder.findIndex((r) => r.playerId === null);
    if (idx === -1) {
      setError("No open finishing slot yet — tap the timer to capture one first.");
      return;
    }
    const next = paddedOrder.slice();
    next[idx] = { id: `assign-${crypto.randomUUID()}`, bib, playerId, editedTime: null };
    commit(next);
  }

  // Drag-and-drop lets a rider be placed into a *specific* slot (not just
  // the next one) — from the on-course list, or moved from another slot.
  function assignToSlot(targetIndex: number, payload: DragPayload) {
    if (payload.source === "slot" && payload.fromIndex === targetIndex) {
      setDragPayload(null);
      return;
    }
    const next = paddedOrder.slice();
    if (payload.source === "slot") {
      next[payload.fromIndex] = emptyRow(payload.fromIndex);
    }
    next[targetIndex] = { id: `assign-${crypto.randomUUID()}`, bib: payload.bib, playerId: payload.playerId, editedTime: null };
    commit(next);
    setDragPayload(null);
  }

  function unassign(index: number) {
    const next = paddedOrder.slice();
    next[index] = emptyRow(index);
    commit(next);
  }

  // Removing a *timing* voids the underlying tap (a phantom/duplicate
  // capture) — every later slot shifts up to line up with the next real
  // crossing, not just this slot going empty.
  async function removeTiming(index: number) {
    const tapToVoid = activeTaps[index];
    if (!tapToVoid) return;
    setLocallyVoided((prev) => new Set(prev).add(tapToVoid.id));
    await commit(paddedOrder.filter((_, i) => i !== index));
    try {
      const res = await fetch(`/api/raceday/${projectId}/finish-taps/${tapToVoid.id}/void`, {
        method: "POST",
        headers: { "x-raceday-token": token },
      });
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
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

  // Fully-resolved waves (every rider finished/DNF/DNS) collapse their
  // finish-line slots into a one-line summary, so the live slot list stays
  // bounded to whatever waves are actually still on course, however many
  // hundred riders pass through over a whole day.
  const waveProgress = computeWaveProgress(snapshot.roster, snapshot.waves, snapshot.startMarks, results, snapshot.dnfMarks);
  const completeWaveNumbers = new Set(waveProgress.filter((w) => w.complete).map((w) => w.wave));

  const activeItems: { result: FinishResult; index: number }[] = [];
  const completedByWave = new Map<number, { result: FinishResult; index: number }[]>();
  results.forEach((result, index) => {
    const rider = result.playerId ? rosterByPlayer.get(result.playerId) : undefined;
    if (rider?.wave != null && completeWaveNumbers.has(rider.wave)) {
      const arr = completedByWave.get(rider.wave) ?? [];
      arr.push({ result, index });
      completedByWave.set(rider.wave, arr);
    } else {
      activeItems.push({ result, index });
    }
  });
  const completedWaveNumbers = [...completedByWave.keys()].sort((a, b) => a - b);

  function toggleCompleted(wave: number) {
    setExpandedCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(wave)) next.delete(wave);
      else next.add(wave);
      return next;
    });
  }

  function renderSlotRow(result: FinishResult, index: number) {
    const rider = result.playerId ? rosterByPlayer.get(result.playerId) : undefined;
    const filled = result.playerId != null;
    return (
      <div
        key={result.rowId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (dragPayload) assignToSlot(index, dragPayload);
        }}
        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
          filled ? "border-border bg-surface-2" : "border-dashed border-border/60 bg-surface"
        }`}
      >
        <span className="w-6 shrink-0 font-bold text-muted">{index + 1}</span>
        <span className="w-20 shrink-0 text-xs text-muted">
          {result.finishTime ? new Date(result.finishTime).toLocaleTimeString() : "—"}
        </span>
        {filled ? (
          <div
            draggable
            onDragStart={() => setDragPayload({ source: "slot", fromIndex: index, playerId: result.playerId!, bib: result.bib })}
            className="flex flex-1 cursor-grab items-center gap-2"
          >
            <span className="text-muted">⠿</span>
            <WaveChip wave={rider?.wave ?? null} />
            <span className="w-10 shrink-0 font-bold text-brand-strong">{result.bib}</span>
            <span className="flex-1 truncate">{rider ? `${rider.firstName} ${rider.lastName}` : "Unknown rider"}</span>
            <button onClick={() => unassign(index)} title="Unassign this rider" className="text-muted hover:text-danger">
              ×
            </button>
          </div>
        ) : (
          <span className="flex-1 text-xs italic text-muted">— empty, tap or drag a rider here —</span>
        )}
        <button onClick={() => removeTiming(index)} title="Remove this timing entirely" className="shrink-0 text-muted hover:text-danger">
          🗑
        </button>
      </div>
    );
  }

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

      <div className="text-xs font-bold uppercase tracking-wide text-muted">
        Finishing order ({results.length}) — tap a rider below to fill the next slot, or drag one into a specific slot
      </div>
      <div className="flex flex-col gap-1.5">
        {activeItems.map(({ result, index }) => renderSlotRow(result, index))}
        {results.length === 0 && <p className="text-sm text-muted">No times captured yet — tap the timer above.</p>}
      </div>

      <input
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand-strong focus:outline-none"
        placeholder="Search riders on course…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="text-xs font-bold uppercase tracking-wide text-muted">On course ({onCourse.length})</div>
      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {filtered.map((r) => (
          <div
            key={r.playerId}
            draggable
            onDragStart={() => setDragPayload({ source: "roster", playerId: r.playerId, bib: String(r.bib ?? "") })}
            className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
          >
            <button
              onClick={() => assignNext(String(r.bib ?? ""), r.playerId)}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <WaveChip wave={r.wave} />
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

      {completedWaveNumbers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Completed waves</div>
          {completedWaveNumbers.map((wave) => {
            const items = completedByWave.get(wave)!;
            const open = expandedCompleted.has(wave);
            return (
              <div key={wave} className="overflow-hidden rounded-lg border border-border">
                <button
                  onClick={() => toggleCompleted(wave)}
                  className="flex w-full items-center justify-between gap-2 bg-surface-2 px-3 py-2 text-left text-sm"
                >
                  <span className="flex items-center gap-2">
                    <WaveChip wave={wave} />
                    <span className="font-bold text-foreground">{items.length} finisher{items.length === 1 ? "" : "s"} ✓</span>
                  </span>
                  <span className="text-muted">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="flex flex-col gap-1.5 p-2">
                    {items.map(({ result, index }) => renderSlotRow(result, index))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
