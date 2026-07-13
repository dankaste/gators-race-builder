"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

function formatElapsed(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = ((abs % 60000) / 1000).toFixed(1);
  return `${sign}${minutes}:${seconds.padStart(4, "0")}`;
}

function PodiumBody({ snapshot }: { snapshot: RaceDaySnapshot }) {
  const [selected, setSelected] = useState(snapshot.standings[0]?.categoryLabel ?? "");
  const standing = snapshot.standings.find((s) => s.categoryLabel === selected) ?? snapshot.standings[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {snapshot.standings.map((s) => (
          <button
            key={s.categoryLabel}
            onClick={() => setSelected(s.categoryLabel)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              s.categoryLabel === standing?.categoryLabel
                ? "bg-accent text-background"
                : "border border-border text-foreground"
            }`}
          >
            {s.categoryLabel}
          </button>
        ))}
      </div>

      {standing && (
        <>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
              <div className="text-lg font-bold text-foreground">{standing.finishedCount}</div>
              <div className="text-xs text-muted">Finished</div>
            </div>
            <div className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
              <div className="text-lg font-bold text-danger">{standing.dnsCount}</div>
              <div className="text-xs text-muted">DNS</div>
            </div>
            <div className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
              <div className="text-lg font-bold text-warning">{standing.dnfCount}</div>
              <div className="text-xs text-muted">DNF</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {standing.podium.ranked.map((entry) => (
              <div
                key={entry.rider.playerId}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-sm font-bold text-muted">
                  {entry.place}
                </span>
                <span className="flex-1 truncate text-sm">
                  {entry.rider.firstName} {entry.rider.lastName}{" "}
                  <span className="text-muted">· #{entry.rider.bib}</span>
                </span>
                <span className="shrink-0 text-sm font-bold">{formatElapsed(entry.elapsedMs)}</span>
              </div>
            ))}
            {standing.podium.ranked.length === 0 && (
              <p className="text-sm text-muted">No finishers yet — results appear here as the wave comes in.</p>
            )}
          </div>

          {standing.podium.pendingStart.length > 0 && (
            <div className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              ⏳ {standing.podium.pendingStart.length} finisher(s) waiting on their wave&apos;s start time.
            </div>
          )}
          {standing.podium.dnf.length > 0 && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              🚩 {standing.podium.dnf.length} marked DNF — excluded from ranking.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PodiumBoard({ projectId }: { projectId: string }) {
  return <StationShell projectId={projectId} title="Podium">{(snapshot) => <PodiumBody snapshot={snapshot} />}</StationShell>;
}
