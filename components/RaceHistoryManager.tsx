"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RaceHistoryImport } from "@/db/schema";
import {
  inferRaceFromFilename,
  parseHistoryCsv,
  parseRaceResultsXlsx,
  type AgeCourseFactor,
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
  ageFactors,
}: {
  initialImports: RaceHistoryImport[];
  initialStats: HistoryStats;
  /** Age → full-course scaling factor (see deriveAgeCourseFactors) — recomputed server-side on refresh, so no local state needed for it. */
  ageFactors: AgeCourseFactor[];
}) {
  const router = useRouter();
  const [imports, setImports] = useState(initialImports);
  const [stats, setStats] = useState(initialStats);
  const [file, setFile] = useState<File | null>(null);
  const [raceSlug, setRaceSlug] = useState<HistoryRaceSlug | "">("");
  const [season, setSeason] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `stats` updates instantly from the POST response for a snappy summary line, but
  // `ageFactors` is a server-computed prop that only catches up once router.refresh()'s
  // re-render lands — a beat later. Without this, a first import into an empty history
  // would flash the age-factor card's "not enough paired data" warning even though the
  // import that just landed IS enough data; it just hasn't been recomputed yet.
  // Reset during render (not an effect) once the refreshed prop actually arrives — the
  // React-recommended way to adjust state in response to a prop change without an
  // extra render round trip. See https://react.dev/learn/you-might-not-need-an-effect.
  const [prevAgeFactors, setPrevAgeFactors] = useState(ageFactors);
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);
  if (ageFactors !== prevAgeFactors) {
    setPrevAgeFactors(ageFactors);
    setAwaitingRefresh(false);
  }

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
        setAwaitingRefresh(true);
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

      {stats.totalRows > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold text-foreground">Age → full Swamp Dash lap-time scaling factor</h2>
          <p className="mt-1 text-sm text-muted">
            The 5-6 age band races a physically shorter individual course — multiply a rider&apos;s raw time by
            this factor to project it onto the same scale as everyone else (see{" "}
            <span className="font-mono text-xs">deriveFiveSixFactor</span>). 5 and 6 share one derived factor
            (same course; the difference between those ages is ordinary growth, handled separately). 7 and 8 are
            already full-course, so their factor is fixed at 1 — not derived.
          </p>
          <p className="mt-2 text-xs text-warning">
            This is derived fresh from whatever history is currently imported — it is NOT automatically what
            relay seeding actually uses. That value is stored per-race in the config (
            <span className="font-mono">RelayConfig.historyEstimation.fiveSixCourseFactor</span>, edited on the
            race&apos;s config page) and only updates if you copy this number over by hand. If the two drift,
            relay seeding keeps using the stored one.
          </p>
          <table className="mt-3 w-full max-w-sm text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-3">Age</th>
                <th className="py-1.5 pr-3">Course</th>
                <th className="py-1.5 pr-3">Factor</th>
                <th className="py-1.5 pr-3">n (paired samples)</th>
              </tr>
            </thead>
            <tbody>
              {ageFactors.map((a) => (
                <tr key={a.age} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-3 text-foreground">{a.age}</td>
                  <td className="py-1.5 pr-3 text-muted">{a.fullCourse ? "full" : "5-6 (short)"}</td>
                  <td className="py-1.5 pr-3 text-foreground">{a.factor != null ? a.factor.toFixed(2) : "—"}</td>
                  <td className="py-1.5 pr-3 text-muted">{a.n ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!awaitingRefresh && ageFactors.some((a) => !a.fullCourse && a.factor == null) && (
            <p className="mt-2 text-xs text-warning">
              Not enough paired same-rider data yet to derive the 5-6 factor — relay seeding falls back to the
              stored config default until there is.
            </p>
          )}
        </div>
      )}

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
