"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { buildWaves } from "@/lib/engine/waves";
import { validate } from "@/lib/engine/validate";
import { toPlayMetricsBibCsv } from "@/lib/engine/export_playmetrics";
import { allHandouts } from "@/lib/engine/handouts";
import { handoutsToXlsx } from "@/lib/render/excel";
import { toWebScorerXlsx } from "@/lib/render/webscorerXlsx";
import { handoutsToPdf } from "@/lib/render/pdf";
import { downloadBlob, downloadText } from "@/lib/download";
import { DEFAULT_SCHEDULE, type RaceEvent, type Rider, type ScheduleConfig } from "@/lib/engine/models";
import { ReviewTable } from "./ReviewTable";
import { WaveEditor } from "./WaveEditor";

export function IndividualReview({
  event,
  slug,
  raceDate,
  riders,
  onChange,
  schedule,
  onScheduleChange,
  highestBib,
}: {
  event: RaceEvent;
  slug: string;
  raceDate: string;
  riders: Rider[];
  onChange: (riders: Rider[]) => void;
  schedule?: ScheduleConfig;
  onScheduleChange: (next: ScheduleConfig) => void;
  highestBib: number;
}) {
  const [importError, setImportError] = useState<string | null>(null);
  // Effective schedule for handouts; the wave editor edits it via onScheduleChange.
  const effSchedule: ScheduleConfig = schedule ?? event.schedule ?? DEFAULT_SCHEDULE;
  const [bibStart, setBibStart] = useState<number>(highestBib + 1);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"table" | "waves">("table");
  // Bumped to re-mount (re-seed) the WaveEditor when riders change underneath it.
  const [waveEpoch, setWaveEpoch] = useState(0);

  const editRider = useCallback(
    (index: number, patch: Partial<Rider>) => {
      onChange(riders.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    },
    [riders, onChange],
  );

  async function handleImport(regFile: File, rosterFile: File | null) {
    setImportError(null);
    try {
      const registrations = parseRegistrations(await regFile.text());
      const roster = rosterFile ? parseRoster(await rosterFile.text()) : [];
      const { riders: computed } = transformEvent({ registrations, roster, event, raceDate });
      onChange(computed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import");
    }
  }

  function resuggestWaves() {
    const clone = riders.map((r) => ({ ...r }));
    buildWaves(clone, event.categories);
    onChange(clone);
    setWaveEpoch((n) => n + 1); // re-seed the wave editor from the fresh suggestion
  }

  const blankBibCount = riders.filter((r) => r.bib == null || r.bib === "").length;

  /** Assign sequential bibs (from `bibStart`) to bib-less riders in wave order. */
  function assignBibs() {
    if (blankBibCount === 0) return;
    if (!confirm(`Assign ${blankBibCount} bib${blankBibCount === 1 ? "" : "s"} starting at ${bibStart}? Existing bibs are left untouched.`)) return;
    const nameOf = (r: Rider) => `${r.lastName}, ${r.firstName}`;
    const order = riders
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.bib == null || r.bib === "")
      .sort((a, b) => (a.r.wave ?? 1e9) - (b.r.wave ?? 1e9) || nameOf(a.r).localeCompare(nameOf(b.r)));
    const bibByIndex = new Map<number, number>();
    let n = bibStart;
    for (const { i } of order) bibByIndex.set(i, n++);
    onChange(
      riders.map((r, i) =>
        bibByIndex.has(i)
          ? { ...r, bib: bibByIndex.get(i)!, warnings: r.warnings.filter((w) => !w.includes("assign manually")) }
          : r,
      ),
    );
  }

  async function downloadExcel() {
    setBusy(true);
    try {
      const blob = await handoutsToXlsx(allHandouts(riders, event, effSchedule));
      downloadBlob(blob, `${slug}-${event.id}-handouts.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadWebScorer() {
    setBusy(true);
    try {
      const blob = await toWebScorerXlsx(riders, event);
      downloadBlob(blob, `${slug}-${event.id}-webscorer.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    const blob = handoutsToPdf(allHandouts(riders, event, effSchedule), event.name);
    downloadBlob(blob, `${slug}-${event.id}-handouts.pdf`);
  }

  if (riders.length === 0) {
    return <ImportPanel raceDate={raceDate} onImport={handleImport} error={importError} />;
  }

  const summary = validate(riders, event);

  return (
    <>
      <ValidationPanel summary={summary} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={resuggestWaves} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-brand-strong">
          Re-suggest waves
        </button>
        <button
          onClick={downloadWebScorer}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong disabled:opacity-60"
        >
          Export WebScorer file
        </button>
        <button
          onClick={() => downloadText(toPlayMetricsBibCsv(riders), `${slug}-${event.id}-playmetrics-bibs.csv`)}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-brand-strong"
        >
          Export bibs → PlayMetrics CSV
        </button>
        <button
          onClick={() => { if (confirm("Clear this roster and re-import?")) onChange([]); }}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Re-import
        </button>
        <Link href="/guide#webscorer" className="text-sm text-brand-strong hover:underline">
          How to upload to WebScorer →
        </Link>
      </div>

      {/* Bulk bib assignment — bibs are one physical plate stack shared across all races. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted">Start bibs from</span>
        <input
          type="number"
          min={1}
          value={bibStart}
          onChange={(e) => setBibStart(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 rounded border border-border bg-surface px-2 py-1 text-foreground"
        />
        <button
          onClick={assignBibs}
          disabled={blankBibCount === 0}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          Assign {blankBibCount} blank{blankBibCount === 1 ? "" : "s"}
        </button>
        <span className="text-xs text-muted">
          Highest plate used across all races: <b className="text-foreground">{highestBib || "—"}</b>
          {highestBib > 0 && <> → next available {highestBib + 1}</>}
        </span>
      </div>
      <div className="mt-4 inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm font-semibold">
        {(["table", "waves"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 ${
              view === v ? "bg-brand text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {v === "table" ? "Review by rider" : "Manage waves"}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {view === "table" ? (
          <ReviewTable riders={riders} categories={event.categories} onEdit={editRider} />
        ) : (
          <WaveEditor
            key={waveEpoch}
            riders={riders}
            categories={event.categories}
            onChange={onChange}
            schedule={effSchedule}
            onScheduleChange={onScheduleChange}
          />
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-bold text-foreground">Handouts</h2>
        <p className="mt-1 text-sm text-muted">
          Check-in, wave stager, podium, and schedule — generated from the reviewed roster above.
          Wave times come from the schedule set in <span className="text-foreground">Manage waves</span>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            onClick={downloadExcel}
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
          >
            {busy ? "Generating…" : "Download Excel"}
          </button>
          <button
            onClick={downloadPdf}
            className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-semibold hover:border-brand-strong"
          >
            Download PDF
          </button>
        </div>
      </div>
    </>
  );
}

function ImportPanel({
  raceDate,
  onImport,
  error,
}: {
  raceDate: string;
  onImport: (reg: File, roster: File | null) => void;
  error: string | null;
}) {
  const [reg, setReg] = useState<File | null>(null);
  const [roster, setRoster] = useState<File | null>(null);
  const label = "block text-sm font-semibold text-muted mb-1";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold text-foreground">Import registration</h2>
      <p className="mt-1 text-sm text-muted">
        Files are parsed in your browser — registration data never leaves your machine until you save.{" "}
        <Link href="/guide#exports" className="text-brand-strong hover:underline">Where do I get these files? →</Link>
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label}>PlayMetrics registration export (CSV) *</label>
          <input type="file" accept=".csv" onChange={(e) => setReg(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-brand-deep file:px-3 file:py-1.5 file:text-foreground" />
        </div>
        <div>
          <label className={label}>PlayMetrics player export (CSV) — for bibs &amp; seeding</label>
          <input type="file" accept=".csv" onChange={(e) => setRoster(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-foreground" />
        </div>
      </div>
      {!raceDate && <p className="mt-4 text-warning">Set the race date above before importing.</p>}
      {error && <p className="mt-4 text-danger">{error}</p>}
      <button
        onClick={() => reg && onImport(reg, roster)}
        disabled={!reg || !raceDate}
        className="mt-5 rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
      >
        Compute categories &amp; waves
      </button>
    </div>
  );
}

function ValidationPanel({ summary }: { summary: ReturnType<typeof validate> }) {
  const stat = (label: string, value: number, danger = false) => (
    <div className="rounded-lg border border-border bg-surface px-4 py-2">
      <div className={`text-xl font-black ${danger && value > 0 ? "text-warning" : "text-foreground"}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stat("Riders", summary.total)}
        {stat("Categorized", summary.categorized)}
        {stat("Uncategorized", summary.uncategorized, true)}
        {stat("Missing bib", summary.missingBib, true)}
        {stat("Oversized waves", summary.waveWarnings.length, true)}
      </div>
      {(summary.waveWarnings.length > 0 || summary.duplicateBibs.length > 0) && (
        <div className="mt-3 space-y-1 text-sm text-warning">
          {summary.waveWarnings.map((w) => (
            <div key={w.wave}>⚠ Wave {w.wave} ({w.categoryLabel}): {w.size} riders &gt; max {w.max}</div>
          ))}
          {summary.duplicateBibs.length > 0 && <div>⚠ Duplicate bibs: {summary.duplicateBibs.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}
