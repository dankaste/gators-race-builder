"use client";

import { useState } from "react";
import Link from "next/link";
import { useSnapshotPoll } from "@/lib/raceday/usePoll";
import type { CategoryStanding } from "@/lib/engine/raceDay";

function CategoryGroup({ projectId, category }: { projectId: string; category: CategoryStanding }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasUnresolved = category.podium.unresolved.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between bg-surface-2 px-3 py-2 text-left"
      >
        <div>
          <div className="text-sm font-bold text-foreground">{category.categoryLabel}</div>
          <div className="text-xs text-muted">
            Wave{category.waveNumbers.length > 1 ? "s" : ""} {category.waveNumbers.join(", ")} ·{" "}
            {category.finishedCount} of {category.totalCount} finished
          </div>
        </div>
        <span className="text-muted">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 p-2">
          {category.podium.ranked.slice(0, 5).map((entry) => (
            <div key={entry.rider.playerId} className="flex items-center gap-2 px-1 py-1 text-sm">
              <span className="w-6 shrink-0 font-bold text-muted">{entry.place}</span>
              <span className="flex-1 truncate">
                {entry.rider.firstName} {entry.rider.lastName} · #{entry.rider.bib}
              </span>
              <span className="shrink-0 text-xs font-bold">
                {(entry.elapsedMs / 60000).toFixed(2)} min
              </span>
            </div>
          ))}
          {category.podium.ranked.length === 0 && (
            <p className="px-1 py-1 text-xs text-muted">No finishers yet.</p>
          )}
          {hasUnresolved && (
            <div className="mt-1 flex items-center gap-2 rounded-lg bg-warning/10 px-2 py-1.5 text-xs text-warning">
              ⚠ {category.podium.unresolved.length} finish tap(s) don&apos;t match a rider.
              <Link href={`/projects/${projectId}/raceday/reconcile`} className="ml-auto font-bold underline">
                Fix in reconciliation →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OverviewPanel({ projectId }: { projectId: string }) {
  const { snapshot, error } = useSnapshotPoll(projectId, null, { requireToken: false, intervalMs: 4000 });
  const [resolving, setResolving] = useState(false);

  if (!snapshot) {
    return (
      <p className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
        {error ? `Couldn't load race-day data: ${error}` : "Loading…"}
      </p>
    );
  }

  const checkedInCount = snapshot.checkIns.filter((c) => c.checkedIn).length;
  const startedCount = snapshot.startMarks.filter((m) => m.status === "started").length;
  const dnsCount = snapshot.startMarks.filter((m) => m.status === "dns").length;
  const finishedCount = snapshot.finishResults.filter((r) => r.finishTime).length;
  const dnfCount = snapshot.dnfMarks.length;

  async function resolveIncident() {
    if (!snapshot?.incident) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/raceday/${projectId}/incidents/${snapshot.incident.id}/resolve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
    } catch (err) {
      alert(`Couldn't resolve the incident: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          { label: "Checked in", value: checkedInCount },
          { label: "Started", value: startedCount },
          { label: "DNS", value: dnsCount },
          { label: "Finished", value: finishedCount },
          { label: "DNF", value: dnfCount },
          { label: "Incidents", value: snapshot.incident ? 1 : 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-center">
            <div className="text-lg font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {snapshot.incident && (
        <div className="flex items-center gap-2 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm">
          🚑 {snapshot.incident.type}
          {snapshot.incident.note ? ` · ${snapshot.incident.note}` : ""}
          <button
            onClick={resolveIncident}
            disabled={resolving}
            className="ml-auto rounded-lg bg-surface-2 px-2 py-1 text-xs font-bold disabled:opacity-50"
          >
            Resolve
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
          Categories &amp; results
        </h2>
        <div className="flex flex-col gap-2">
          {snapshot.standings.map((category) => (
            <CategoryGroup key={category.categoryLabel} projectId={projectId} category={category} />
          ))}
          {snapshot.standings.length === 0 && <p className="text-sm text-muted">No categories configured.</p>}
        </div>
      </div>
    </div>
  );
}
