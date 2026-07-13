"use client";

import { useEffect, useState } from "react";
import { useSnapshotPoll } from "@/lib/raceday/usePoll";
import { computeFinishResults, type FinishOrderRow } from "@/lib/engine/raceDay";

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

interface ClipMeta {
  id: string;
  startedAt: string;
  durationSeconds: number;
}

export function ReconciliationEditor({ projectId }: { projectId: string }) {
  const { snapshot } = useSnapshotPoll(projectId, null, { requireToken: false, intervalMs: 4000 });
  const [order, setOrder] = useState<FinishOrderRow[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [reviewing, setReviewing] = useState<{ clipId: string; offsetSeconds: number; label: string } | null>(null);

  const eventId = snapshot?.event?.id;

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/raceday/${projectId}/videos?eventId=${eventId}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setClips)
      .catch(() => {});
  }, [projectId, eventId]);

  // Seed local editable state once the snapshot first arrives (adjusted
  // during render, guarded to fire exactly once — React's documented pattern
  // for this, not an effect); further poll updates don't overwrite it, so an
  // in-progress edit is never yanked out from under the director.
  if (order === null && snapshot) {
    setOrder(snapshot.finishOrder);
  }

  if (!snapshot || order === null) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (!eventId) return <p className="text-sm text-muted">No event configured for this project.</p>;

  function openReview(finishTime: string, label: string) {
    const finishMs = new Date(finishTime).getTime();
    const clip = clips.find((c) => {
      const startMs = new Date(c.startedAt).getTime();
      return finishMs >= startMs && finishMs <= startMs + c.durationSeconds * 1000;
    });
    if (!clip) return;
    const offsetSeconds = (finishMs - new Date(clip.startedAt).getTime()) / 1000;
    setReviewing({ clipId: clip.id, offsetSeconds, label });
  }

  async function commit(next: FinishOrderRow[]) {
    setOrder(next);
    await fetch(`/api/raceday/${projectId}/finish-order`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        rows: next.map((r) => ({ bib: r.bib, playerId: r.playerId, editedTime: r.editedTime })),
      }),
    });
  }

  const { results, extraTaps } = computeFinishResults(order, snapshot.finishTimeTaps);
  const rosterByPlayer = new Map(snapshot.roster.map((r) => [r.playerId, r]));

  const searchResults = snapshot.roster
    .filter((r) => !order.some((o) => o.playerId === r.playerId))
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return false;
      return `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || String(r.bib ?? "").includes(q);
    })
    .slice(0, 5);

  function editTime(index: number, value: string) {
    const next = order!.slice();
    next[index] = { ...next[index], editedTime: value ? new Date(value).toISOString() : null };
    commit(next);
  }

  function remove(index: number) {
    commit(order!.filter((_, i) => i !== index));
  }

  function addRider(playerId: string, bib: string) {
    commit([...order!, { id: `new-${crypto.randomUUID()}`, bib, playerId, editedTime: null }]);
    setSearch("");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        One list for the whole finish line — not per-wave, since waves can overlap on course. Drag a
        rider to change their finishing position; their time updates to match the fixed sequence of
        captured taps. Click a time to hand-correct it.
      </p>

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
        {snapshot.finishTimeTaps.filter((t) => !t.voided).length} times captured · {order.length} placed
        {extraTaps.length > 0 && (
          <span className="ml-2 text-warning">
            ⚠ {extraTaps.length} captured time(s) unassigned — did someone cross who hasn&apos;t been added?
          </span>
        )}
      </div>

      <input
        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        placeholder="Missed a rider? Search to add…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {searchResults.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {searchResults.map((r) => (
            <button
              key={r.playerId}
              onClick={() => addRider(r.playerId, String(r.bib ?? ""))}
              className="rounded-full border border-dashed border-border px-3 py-1 text-xs"
            >
              + #{r.bib} {r.firstName} {r.lastName}
            </button>
          ))}
        </div>
      )}

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
                if (dragIndex !== null && dragIndex !== i) commit(reorder(order, dragIndex, i));
                setDragIndex(null);
              }}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                result.finishTime ? "border-border bg-surface-2" : "border-warning bg-warning/10"
              }`}
            >
              <span className="cursor-grab text-muted">⠿</span>
              <span className="w-10 shrink-0 font-bold text-brand-strong">{result.bib}</span>
              <span className="flex-1 truncate">
                {rider ? `${rider.firstName} ${rider.lastName}` : "Unknown rider"}
                {rider && <span className="ml-1 text-xs text-muted">· {rider.categoryLabel} · Wave {rider.wave}</span>}
              </span>
              {result.finishTime ? (
                <input
                  type="time"
                  step={1}
                  defaultValue={new Date(result.finishTime).toISOString().slice(11, 19)}
                  onBlur={(e) => {
                    const [h, m, s] = e.target.value.split(":").map(Number);
                    const d = new Date(result.finishTime!);
                    d.setUTCHours(h, m, s);
                    editTime(i, d.toISOString());
                  }}
                  className="w-24 rounded border border-border bg-surface px-1 py-0.5 text-xs"
                />
              ) : (
                <span className="text-xs italic text-warning">no time captured</span>
              )}
              {result.origin === "manual" && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">edited</span>
              )}
              {result.finishTime && clips.length > 0 && (
                <button
                  onClick={() => openReview(result.finishTime!, `#${result.bib} at ${new Date(result.finishTime!).toLocaleTimeString()}`)}
                  className="rounded-lg border border-border px-2 py-1 text-xs"
                  title="Check this moment against the finish camera"
                >
                  ▶
                </button>
              )}
              <button onClick={() => remove(i)} className="text-muted hover:text-danger">
                ×
              </button>
            </div>
          );
        })}
        {results.length === 0 && <p className="text-sm text-muted">No finishers recorded yet.</p>}
      </div>

      {reviewing && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">Finish camera — {reviewing.label}</span>
            <button onClick={() => setReviewing(null)} className="text-xs text-muted hover:text-foreground">
              Close
            </button>
          </div>
          <video
            key={reviewing.clipId}
            src={`/api/raceday/${projectId}/videos/${reviewing.clipId}/file`}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
            ref={(el) => {
              if (el) el.currentTime = reviewing.offsetSeconds;
            }}
          />
        </div>
      )}
    </div>
  );
}
