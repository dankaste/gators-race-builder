"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

function CheckInList({
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
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [showWalkUp, setShowWalkUp] = useState(false);
  const [walkUp, setWalkUp] = useState({ firstName: "", lastName: "", categoryLabel: "", bib: "" });

  const checkedInByPlayer = new Map(snapshot.checkIns.map((c) => [c.playerId, c.checkedIn]));
  const isCheckedIn = (playerId: string) => optimistic[playerId] ?? checkedInByPlayer.get(playerId) ?? false;

  const filtered = snapshot.roster.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
      String(r.bib ?? "").toLowerCase().includes(q)
    );
  });

  async function toggle(playerId: string) {
    const next = !isCheckedIn(playerId);
    setOptimistic((prev) => ({ ...prev, [playerId]: next }));
    await fetch(`/api/raceday/${projectId}/checkins`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId, checkedIn: next, idempotencyKey: crypto.randomUUID() }),
    });
  }

  async function submitWalkUp() {
    if (!walkUp.firstName.trim() || !walkUp.lastName.trim() || !walkUp.categoryLabel) return;
    await fetch(`/api/raceday/${projectId}/roster`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        id: `walkup-${crypto.randomUUID()}`,
        firstName: walkUp.firstName,
        lastName: walkUp.lastName,
        categoryLabel: walkUp.categoryLabel,
        bib: walkUp.bib.trim() || null,
      }),
    });
    setWalkUp({ firstName: "", lastName: "", categoryLabel: "", bib: "" });
    setShowWalkUp(false);
  }

  const checkedInCount = snapshot.roster.filter((r) => isCheckedIn(r.playerId)).length;
  const categories = [...new Set(snapshot.roster.map((r) => r.categoryLabel).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
          <div className="text-lg font-bold text-foreground">
            {checkedInCount}
            <span className="font-medium text-muted">/{snapshot.roster.length}</span>
          </div>
          <div className="text-xs text-muted">Checked in</div>
        </div>
      </div>

      <input
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand-strong focus:outline-none"
        placeholder="Search name or bib…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button
        onClick={() => setShowWalkUp((v) => !v)}
        className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-brand-strong"
      >
        + Add walk-up racer
      </button>

      {showWalkUp && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex gap-2">
            <input
              className="w-1/2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
              placeholder="First name"
              value={walkUp.firstName}
              onChange={(e) => setWalkUp((w) => ({ ...w, firstName: e.target.value }))}
            />
            <input
              className="w-1/2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
              placeholder="Last name"
              value={walkUp.lastName}
              onChange={(e) => setWalkUp((w) => ({ ...w, lastName: e.target.value }))}
            />
          </div>
          <select
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
            value={walkUp.categoryLabel}
            onChange={(e) => setWalkUp((w) => ({ ...w, categoryLabel: e.target.value }))}
          >
            <option value="">— pick a category —</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
            placeholder="Bib (leave blank to auto-assign)"
            value={walkUp.bib}
            onChange={(e) => setWalkUp((w) => ({ ...w, bib: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              onClick={submitWalkUp}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
            >
              Add &amp; check in
            </button>
            <button onClick={() => setShowWalkUp(false)} className="text-xs text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {filtered.map((rider) => {
          const done = isCheckedIn(rider.playerId);
          return (
            <button
              key={rider.playerId}
              onClick={() => toggle(rider.playerId)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                done ? "border-transparent bg-brand-deep/20" : "border-border bg-surface-2"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done ? "border-brand bg-brand" : "border-border"
                }`}
              >
                {done && <span className="text-xs text-background">✓</span>}
              </span>
              <span className="w-10 shrink-0 font-bold text-brand-strong">{rider.bib ?? "—"}</span>
              <span className="flex-1 truncate">
                {rider.firstName} {rider.lastName}
              </span>
              <span className="shrink-0 text-xs text-muted">{rider.categoryLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CheckInStation({ projectId }: { projectId: string }) {
  const token = useRaceDayToken(projectId);

  return (
    <StationShell projectId={projectId} title="Check-in">
      {(snapshot) =>
        token && snapshot.event ? (
          <CheckInList projectId={projectId} token={token} eventId={snapshot.event.id} snapshot={snapshot} />
        ) : (
          <p className="text-sm text-muted">No event configured for this project.</p>
        )
      }
    </StationShell>
  );
}
