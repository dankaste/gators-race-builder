"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RaceHistoryImport } from "@/db/schema";
import {
  inferRaceFromFilename,
  parseHistoryCsv,
  parseRaceResultsXlsx,
  type HistoryRaceSlug,
  type HistoryRow,
} from "@/lib/engine/history";
import { ConfirmButton } from "./ConfirmButton";

interface HistoryStats {
  totalRows: number;
  seasons: number[];
  raceSlugs: string[];
}

const RACE_LABELS: Record<HistoryRaceSlug, string> = {
  sd: "Swamp Dash",
  cs: "Chestnut Scorcher",
  jb: "John Bryan Trail Magic",
  sdr: "Swamp Dash Relay",
};

/**
 * Import history — additively. Two file shapes, auto-detected by extension:
 *   .csv  — a multi-season "Rider History" dump (imported occasionally as a baseline)
 *   .xlsx — a single race's fresh WebScorer results (imported after every race)
 * Every import upserts by (raceSlug, season, bib), so re-importing never
 * duplicates — see app/api/history/route.ts / lib/raceHistory.ts.
 */
export function RaceHistoryManager({
  initialImports,
  initialStats,
}: {
  initialImports: RaceHistoryImport[];
  initialStats: HistoryStats;
}) {
  const router = useRouter();
  const [imports, setImports] = useState(initialImports);
  const [stats, setStats] = useState(initialStats);
  const [file, setFile] = useState<File | null>(null);
  const [raceSlug, setRaceSlug] = useState<HistoryRaceSlug | "">("");
  const [season, setSeason] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isXlsx = file?.name.toLowerCase().endsWith(".xlsx") ?? false;
  const isCsv = file?.name.toLowerCase().endsWith(".csv") ?? false;

  function pickFile(f: File | null) {
    setFile(f);
    setError(null);
    if (f?.name.toLowerCase().endsWith(".xlsx")) {
      const inferred = inferRaceFromFilename(f.name);
      setRaceSlug(inferred?.raceSlug ?? "");
      setSeason(inferred?.season ?? "");
    }
  }

  async function postImport(filename: string, rows: HistoryRow[], source: "bulk-history" | "race-result") {
    const res = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, rows, source }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Could not import.");
      return false;
    }
    setImports((prev) => [data.imported, ...prev]);
    setStats(data.stats);
    return true;
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      let rows: HistoryRow[];
      let source: "bulk-history" | "race-result";
      if (isXlsx) {
        if (!raceSlug || !season) {
          setError("Confirm the race and season this file covers before importing.");
          return;
        }
        const eventLabel = `${season} ${RACE_LABELS[raceSlug]}`;
        rows = await parseRaceResultsXlsx(await file.arrayBuffer(), { raceSlug, season, eventLabel });
        source = "race-result";
      } else {
        rows = parseHistoryCsv(await file.text());
        source = "bulk-history";
      }
      if (rows.length === 0) {
        setError("No rows found in that file.");
        return;
      }
      const ok = await postImport(file.name, rows, source);
      if (ok) {
        setFile(null);
        setRaceSlug("");
        setSeason("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse/import that file.");
    } finally {
      setBusy(false);
    }
  }

  async function wipeAll() {
    setError(null);
    const res = await fetch("/api/history", { method: "DELETE" });
    if (!res.ok) {
      setError("Could not wipe history.");
      return;
    }
    setImports([]);
    setStats({ totalRows: 0, seasons: [], raceSlugs: [] });
    router.refresh();
  }

  return (
    <div className="mt-8">
      <div className="rounded-xl border border-border bg-surface p-5">
        {stats.totalRows > 0 ? (
          <p className="text-foreground">
            <span className="font-semibold">{stats.totalRows.toLocaleString()} results</span> across{" "}
            {stats.seasons.length} season{stats.seasons.length === 1 ? "" : "s"} ({stats.seasons.join(", ")}) ·{" "}
            {stats.raceSlugs.map((s) => RACE_LABELS[s as HistoryRaceSlug] ?? s).join(", ")}
          </p>
        ) : (
          <p className="text-muted">No history imported yet. Relay team-building will fall back to GBP team seeding until some is.</p>
        )}
        {imports.length > 0 && (
          <div className="mt-4">
            <ConfirmButton
              onConfirm={wipeAll}
              prompt="Wipe ALL race history? This deletes every imported season/race, not just the most recent import. Relay estimates fall back to GBP team seeding until it's re-imported."
              confirmLabel="Wipe everything"
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-danger"
            >
              Wipe all history
            </ConfirmButton>
          </div>
        )}
      </div>

      <form onSubmit={submitImport} className="mt-6 rounded-xl border border-border bg-surface p-5">
        <label className="block text-sm font-semibold text-muted">
          Import a file — either a multi-season &quot;Rider History&quot; dump (.csv) or one race&apos;s fresh WebScorer
          results (.xlsx). Either way, this adds/updates results — it never erases what&apos;s already imported.
        </label>
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          className="mt-2 block text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-brand-deep file:px-3 file:py-1.5 file:text-foreground"
        />

        {isXlsx && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3">
            <div>
              <label className="block text-xs font-semibold text-muted">Race</label>
              <select
                value={raceSlug}
                onChange={(e) => setRaceSlug(e.target.value as HistoryRaceSlug | "")}
                className="mt-1 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
              >
                <option value="">— choose —</option>
                {(Object.keys(RACE_LABELS) as HistoryRaceSlug[]).map((s) => (
                  <option key={s} value={s}>{RACE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted">Season</label>
              <input
                type="number"
                value={season}
                onChange={(e) => setSeason(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 w-24 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
              />
            </div>
            <p className="text-xs text-muted">
              Guessed from the filename — confirm or correct it; every row in this file will be tagged with this race/season.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || busy || (isXlsx && (!raceSlug || !season)) || (!isXlsx && !isCsv)}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </form>

      {imports.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-4 py-2 font-semibold">File</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Rows</th>
                <th className="px-4 py-2 font-semibold">Imported</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{imp.filename}</td>
                  <td className="px-4 py-2 text-muted">{imp.source === "race-result" ? "single race" : "bulk history"}</td>
                  <td className="px-4 py-2 text-muted">{imp.rowCount.toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted">
                    {new Date(imp.importedAt).toLocaleString()}
                    {imp.importedByEmail ? ` · ${imp.importedByEmail}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
