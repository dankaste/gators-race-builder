"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { buildWaves } from "@/lib/engine/waves";
import { validate } from "@/lib/engine/validate";
import { toWebScorerCsv } from "@/lib/engine/export_webscorer";
import type { ProjectState, RaceConfig, Rider } from "@/lib/engine/models";
import { ReviewTable } from "./ReviewTable";

type SaveState = "idle" | "saving" | "saved" | "error";

export function Workspace({
  projectId,
  config,
  initialState,
}: {
  projectId: string;
  config: RaceConfig;
  initialState: ProjectState;
}) {
  // v1 handles the single individual event; relay events come in a later milestone.
  const event = config.events.find((e) => e.type === "individual") ?? config.events[0];
  const relayEvent = config.events.find((e) => e.type === "relay");

  const [raceDate, setRaceDate] = useState(initialState.raceDate ?? config.raceDate ?? "");
  const [riders, setRiders] = useState<Rider[]>(initialState.events?.[event.id]?.riders ?? []);
  const [save, setSave] = useState<SaveState>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const firstRender = useRef(true);

  // Debounced autosave of the working state.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSave("saving");
    const handle = setTimeout(async () => {
      try {
        const state: ProjectState = { raceDate, events: { [event.id]: { riders } } };
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state, status: riders.length ? "review" : "draft" }),
        });
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [riders, raceDate, projectId, event.id]);

  const editRider = useCallback((index: number, patch: Partial<Rider>) => {
    setRiders((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  async function handleImport(regFile: File, rosterFile: File | null) {
    setImportError(null);
    try {
      const registrations = parseRegistrations(await regFile.text());
      const roster = rosterFile ? parseRoster(await rosterFile.text()) : [];
      const { riders: computed } = transformEvent({ registrations, roster, event, raceDate });
      setRiders(computed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import");
    }
  }

  function resuggestWaves() {
    const clone = riders.map((r) => ({ ...r }));
    buildWaves(clone, event.categories);
    setRiders(clone);
  }

  function exportCsv() {
    const csv = toWebScorerCsv(riders, event);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.slug}-${event.id}-webscorer.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = validate(riders, event);

  return (
    <div className="mt-6">
      {relayEvent && (
        <p className="mb-4 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted">
          This race also has a <strong className="text-foreground">{relayEvent.name}</strong> (relay) —
          the relay builder arrives in a later milestone.
        </p>
      )}

      {riders.length === 0 ? (
        <ImportPanel
          raceDate={raceDate}
          setRaceDate={setRaceDate}
          onImport={handleImport}
          error={importError}
        />
      ) : (
        <>
          <ValidationPanel summary={summary} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={resuggestWaves} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-brand-strong">
              Re-suggest waves
            </button>
            <button onClick={exportCsv} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong">
              Export WebScorer CSV
            </button>
            <button
              onClick={() => { if (confirm("Clear the roster and re-import?")) setRiders([]); }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Re-import
            </button>
            <span className="ml-auto text-sm text-muted">
              {save === "saving" && "Saving…"}
              {save === "saved" && "All changes saved"}
              {save === "error" && <span className="text-danger">Save failed</span>}
            </span>
          </div>
          <div className="mt-4">
            <ReviewTable riders={riders} categories={event.categories} onEdit={editRider} />
          </div>
        </>
      )}
    </div>
  );
}

function ImportPanel({
  raceDate,
  setRaceDate,
  onImport,
  error,
}: {
  raceDate: string;
  setRaceDate: (v: string) => void;
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
          <label className={label}>Race date</label>
          <input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </div>
        <div />
        <div>
          <label className={label}>PlayMetrics registration export (CSV) *</label>
          <input type="file" accept=".csv" onChange={(e) => setReg(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-brand-deep file:px-3 file:py-1.5 file:text-foreground" />
        </div>
        <div>
          <label className={label}>PlayMetrics player export (CSV) — for bibs</label>
          <input type="file" accept=".csv" onChange={(e) => setRoster(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-foreground" />
        </div>
      </div>
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
            <div key={w.wave}>
              ⚠ Wave {w.wave} ({w.categoryLabel}): {w.size} riders &gt; max {w.max}
            </div>
          ))}
          {summary.duplicateBibs.length > 0 && (
            <div>⚠ Duplicate bibs: {summary.duplicateBibs.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}
