"use client";

import { useEffect, useState } from "react";
import type { PublicResults } from "@/lib/raceday/publicResults";

function CategoryGroup({ standing }: { standing: PublicResults["standings"][number] }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between bg-surface-2 px-3 py-2 text-left"
      >
        <div>
          <div className="text-sm font-bold text-foreground">{standing.categoryLabel}</div>
          <div className="text-xs text-muted">{standing.finishedCount} of {standing.totalCount} finished</div>
        </div>
        <span className="text-muted">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 p-2">
          {standing.podium.ranked.map((entry) => (
            <div
              key={entry.rider.playerId}
              className="flex items-center gap-2 px-1 py-1 text-sm"
              data-search={`${entry.rider.firstName} ${entry.rider.lastName} ${entry.rider.bib ?? ""}`.toLowerCase()}
            >
              <span className="w-6 shrink-0 font-bold text-muted">{entry.place}</span>
              <span className="flex-1 truncate">
                {entry.rider.firstName} {entry.rider.lastName} · #{entry.rider.bib}
              </span>
              <span className="shrink-0 text-xs font-bold">{(entry.elapsedMs / 60000).toFixed(2)} min</span>
            </div>
          ))}
          {standing.podium.ranked.length === 0 && <p className="px-1 py-1 text-xs text-muted">Check back soon.</p>}
        </div>
      )}
    </div>
  );
}

export function ResultsClient({ projectId }: { projectId: string }) {
  const [results, setResults] = useState<PublicResults | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/results/${projectId}`);
        if (res.ok && !cancelled) setResults(await res.json());
      } catch {
        // keep showing the last-known results through a transient failure
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId]);

  if (!results) return <p className="p-6 text-center text-sm text-muted">Loading…</p>;

  const q = search.trim().toLowerCase();
  const visibleStandings = results.standings.filter(
    (s) => !q || s.podium.ranked.some((e) => `${e.rider.firstName} ${e.rider.lastName} ${e.rider.bib ?? ""}`.toLowerCase().includes(q)),
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-black text-foreground">{results.projectName} — Results</h1>
        <span className="text-xs text-muted">Updated {new Date(results.asOf).toLocaleTimeString()}</span>
      </div>
      <input
        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        placeholder="Find your rider by name or bib…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        {visibleStandings.map((s) => (
          <CategoryGroup key={s.categoryLabel} standing={s} />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        Results reflect the last time the timing hub had a connection.
      </p>
    </div>
  );
}
