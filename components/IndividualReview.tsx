"use client";

import { useCallback, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { buildWaves } from "@/lib/engine/waves";
import { validate } from "@/lib/engine/validate";
import { toWebScorerCsv } from "@/lib/engine/export_webscorer";
import { allHandouts } from "@/lib/engine/handouts";
import { handoutsToXlsx } from "@/lib/render/excel";
import { handoutsToPdf } from "@/lib/render/pdf";
import { downloadBlob, downloadText } from "@/lib/download";
import type { RaceEvent, Rider } from "@/lib/engine/models";
import { ReviewTable } from "./ReviewTable";

export function IndividualReview({
  event,
  slug,
  raceDate,
  riders,
  onChange,
}: {
  event: RaceEvent;
  slug: string;
  raceDate: string;
  riders: Rider[];
  onChange: (riders: Rider[]) => void;
}) {
  const [importError, setImportError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:30");
  const [minutesPerWave, setMinutesPerWave] = useState(5);
  const [busy, setBusy] = useState(false);

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
  }

  async function downloadExcel() {
    setBusy(true);
    try {
      const blob = await handoutsToXlsx(allHandouts(riders, event, { startTime, minutesPerWave }));
      downloadBlob(blob, `${slug}-${event.id}-handouts.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    const blob = handoutsToPdf(allHandouts(riders, event, { startTime, minutesPerWave }), event.name);
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
          onClick={() => downloadText(toWebScorerCsv(riders, event), `${slug}-${event.id}-webscorer.csv`)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong"
        >
          Export WebScorer CSV
        </button>
        <button
          onClick={() => { if (confirm("Clear this roster and re-import?")) onChange([]); }}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Re-import
        </button>
      </div>
      <div className="mt-4">
        <ReviewTable riders={riders} categories={event.categories} onEdit={editRider} />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-bold text-foreground">Handouts</h2>
        <p className="mt-1 text-sm text-muted">
          Check-in, wave stager, podium, and schedule — generated from the reviewed roster above.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm font-semibold text-muted">
            First wave start
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="ml-2 rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
          <label className="text-sm font-semibold text-muted">
            Minutes per wave
            <input
              type="number"
              min={1}
              value={minutesPerWave}
              onChange={(e) => setMinutesPerWave(Number(e.target.value) || 1)}
              className="ml-2 w-20 rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
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
        Files are parsed in your browser — registration data never leaves your machine until you save.
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
