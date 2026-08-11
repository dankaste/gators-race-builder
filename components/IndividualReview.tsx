"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { buildWaves, lastWaveForCategory } from "@/lib/engine/waves";
import { createManualRider } from "@/lib/engine/manualRider";
import { validate } from "@/lib/engine/validate";
import { toPlayMetricsBibCsv } from "@/lib/engine/export_playmetrics";
import { allHandouts } from "@/lib/engine/handouts";
import { handoutsToXlsx } from "@/lib/render/excel";
import { toWebScorerXlsx } from "@/lib/render/webscorerXlsx";
import { handoutsToPdf } from "@/lib/render/pdf";
import { downloadBlob, downloadText } from "@/lib/download";
import { normName } from "@/lib/engine/nameMatch";
import { fetchSeasonRoster } from "@/lib/fetchSeasonRoster";
import { DEFAULT_SCHEDULE, type RaceEvent, type Rider, type ScheduleConfig } from "@/lib/engine/models";
import { ReviewTable } from "./ReviewTable";
import { WaveEditor } from "./WaveEditor";
import { AddRiderForm, type AddRiderFields } from "./AddRiderForm";
import { ConfirmButton } from "./ConfirmButton";

export function IndividualReview({
  event,
  slug,
  raceDate,
  riders,
  onChange,
  schedule,
  onScheduleChange,
  highestBib,
  projectId,
  season,
}: {
  event: RaceEvent;
  slug: string;
  raceDate: string;
  riders: Rider[];
  onChange: (riders: Rider[]) => void;
  schedule?: ScheduleConfig;
  onScheduleChange: (next: ScheduleConfig) => void;
  highestBib: number;
  projectId: string;
  season: string;
}) {
  const [importError, setImportError] = useState<string | null>(null);
  // Effective schedule for handouts; the wave editor edits it via onScheduleChange.
  const effSchedule: ScheduleConfig = schedule ?? event.schedule ?? DEFAULT_SCHEDULE;
  const [bibStart, setBibStart] = useState<number>(highestBib + 1);
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [bibMessage, setBibMessage] = useState<string | null>(null);
  const [rosterSource, setRosterSource] = useState<string[] | null>(null);
  const [view, setView] = useState<"table" | "waves">("table");
  const [adding, setAdding] = useState(false);
  // Bumped to re-mount (re-seed) the WaveEditor when riders change underneath it.
  const [waveEpoch, setWaveEpoch] = useState(0);

  const editRider = useCallback(
    (index: number, patch: Partial<Rider>) => {
      onChange(riders.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    },
    [riders, onChange],
  );

  /** Append a hand-entered rider, dropping it into the last wave of its category. */
  function addRider(fields: AddRiderFields) {
    const rider = createManualRider({ id: `manual-${crypto.randomUUID()}`, ...fields }, event);
    rider.wave = rider.categoryLabel ? lastWaveForCategory(riders, rider.categoryLabel) : null;
    onChange([...riders, rider]);
    setAdding(false);
  }

  async function handleImport(regFile: File, rosterFile: File | null) {
    setImportError(null);
    setRosterSource(null);
    try {
      const registrations = parseRegistrations(await regFile.text());
      let roster = rosterFile ? parseRoster(await rosterFile.text()) : [];
      if (!rosterFile) {
        // No Player export this time — reuse whatever bib/team/contact data other races this season already captured.
        const derived = await fetchSeasonRoster(season, projectId);
        roster = derived.roster;
        if (derived.sourceProjectNames.length > 0) setRosterSource(derived.sourceProjectNames);
      }
      const { riders: computed } = transformEvent({ registrations, roster, event, raceDate });

      // Auto-fill bibs for riders who already raced this season under another
      // race, so directors don't have to click "Assign blanks" for the common
      // case — it's still there afterward for any genuine leftovers.
      const blanks = computed.map((r, i) => ({ r, i })).filter(({ r }) => r.bib == null || r.bib === "");
      if (blanks.length > 0) {
        setMatching(true);
        try {
          const matches = await fetchBibMatches(blanks.map(({ r }) => r));
          for (const [pos, m] of matches) {
            const { i } = blanks[pos];
            const warnings = computed[i].warnings.filter((w) => !w.includes("assign manually"));
            if (m.conflict) {
              warnings.push(`Bib matched from ${m.raceSlug}; conflicting bib ${m.conflict.bib} also found in ${m.conflict.raceSlug}`);
            }
            computed[i] = { ...computed[i], bib: m.bib, warnings };
          }
          if (matches.size > 0) {
            setBibMessage(`Matched ${matches.size} bib${matches.size === 1 ? "" : "s"} from other races on import.`);
          }
        } finally {
          setMatching(false);
        }
      }

      onChange(computed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import");
    }
  }

  type BibMatched = { bib: number | string; raceSlug: string; conflict?: { raceSlug: string; bib: number | string } };

  /**
   * Look up existing bibs (by name, this season, other races) for a batch of
   * bib-less riders. Returns matches keyed by position in `blankRiders` —
   * skips any name shared by more than one rider in the batch itself (e.g.
   * twins), since we can't tell which one a historical match belongs to.
   * Fails safe: returns an empty map on any network/server error.
   */
  async function fetchBibMatches(blankRiders: Rider[]): Promise<Map<number, BibMatched>> {
    const result = new Map<number, BibMatched>();
    if (blankRiders.length === 0) return result;
    const localKey = (r: Rider) => normName(`${r.firstName} ${r.lastName}`);
    const nameCounts = new Map<string, number>();
    for (const r of blankRiders) nameCounts.set(localKey(r), (nameCounts.get(localKey(r)) ?? 0) + 1);

    try {
      const res = await fetch("/api/projects/match-bibs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          season,
          candidates: blankRiders.map((r) => ({ firstName: r.firstName, lastName: r.lastName, birthDate: r.birthDate })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const m of data.matches as (BibMatched & { index: number })[]) {
          const r = blankRiders[m.index];
          if ((nameCounts.get(localKey(r)) ?? 0) > 1) continue; // ambiguous within this batch — skip
          result.set(m.index, { bib: m.bib, raceSlug: m.raceSlug, conflict: m.conflict });
        }
      }
    } catch {
      // network/lookup failure — caller falls back to whatever it does without matches
    }
    return result;
  }

  function resuggestWaves() {
    const clone = riders.map((r) => ({ ...r }));
    buildWaves(clone, event.categories);
    onChange(clone);
    setWaveEpoch((n) => n + 1); // re-seed the wave editor from the fresh suggestion
  }

  const blankBibCount = riders.filter((r) => r.bib == null || r.bib === "").length;

  function bibAsNumber(bib: number | string | null): number | null {
    if (typeof bib === "number") return bib;
    if (typeof bib === "string" && /^\d+$/.test(bib)) return Number(bib);
    return null;
  }

  /**
   * Assign bibs to bib-less riders: first try to match each one, by name,
   * against a rider with an existing bib from another race this season (the
   * physical plate stack is shared across races) — anyone left over gets a
   * fresh sequential number from `bibStart`, in wave order, same as before.
   * This runs automatically on import too; the button here is the manual
   * catch-all for riders added afterward (or missed the first time).
   */
  async function assignBibs() {
    if (blankBibCount === 0 || matching) return;
    setMatching(true);
    setBibMessage(null);
    try {
      const blanks = riders.map((r, i) => ({ r, i })).filter(({ r }) => r.bib == null || r.bib === "");
      const matchesByPos = await fetchBibMatches(blanks.map(({ r }) => r));
      const matchByIndex = new Map<number, BibMatched>();
      for (const [pos, m] of matchesByPos) matchByIndex.set(blanks[pos].i, m);

      // Numbers already in play (existing + this round's matches) so the
      // sequential fallback never hands out a number that collides with a
      // reused plate, even if `bibStart` was set below `highestBib`.
      const usedBibs = new Set<number>();
      for (const r of riders) {
        const n = bibAsNumber(r.bib);
        if (n != null) usedBibs.add(n);
      }
      for (const m of matchByIndex.values()) {
        const n = bibAsNumber(m.bib);
        if (n != null) usedBibs.add(n);
      }

      const nameOf = (r: Rider) => `${r.lastName}, ${r.firstName}`;
      const remaining = blanks
        .filter(({ i }) => !matchByIndex.has(i))
        .sort((a, b) => (a.r.wave ?? 1e9) - (b.r.wave ?? 1e9) || nameOf(a.r).localeCompare(nameOf(b.r)));
      const seqByIndex = new Map<number, number>();
      let n = bibStart;
      for (const { i } of remaining) {
        while (usedBibs.has(n)) n++;
        seqByIndex.set(i, n);
        usedBibs.add(n);
        n++;
      }

      onChange(
        riders.map((r, i) => {
          const matched = matchByIndex.get(i);
          const seq = seqByIndex.get(i);
          if (matched) {
            const warnings = r.warnings.filter((w) => !w.includes("assign manually"));
            if (matched.conflict) {
              warnings.push(
                `Bib matched from ${matched.raceSlug}; conflicting bib ${matched.conflict.bib} also found in ${matched.conflict.raceSlug}`,
              );
            }
            return { ...r, bib: matched.bib, warnings };
          }
          if (seq != null) {
            return { ...r, bib: seq, warnings: r.warnings.filter((w) => !w.includes("assign manually")) };
          }
          return r;
        }),
      );

      const matchedCount = matchByIndex.size;
      setBibMessage(
        matchedCount > 0
          ? `Matched ${matchedCount} bib${matchedCount === 1 ? "" : "s"} from other races, assigned ${remaining.length} new.`
          : `Assigned ${remaining.length} new bib${remaining.length === 1 ? "" : "s"}.`,
      );
    } finally {
      setMatching(false);
    }
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
    return <ImportPanel raceDate={raceDate} onImport={handleImport} error={importError} busy={matching} />;
  }

  const summary = validate(riders, event);

  return (
    <>
      <ValidationPanel summary={summary} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={resuggestWaves}
          disabled={matching}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-brand-strong disabled:opacity-60"
        >
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
          onClick={() => setAdding((v) => !v)}
          disabled={matching}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60"
        >
          + Add rider
        </button>
        <ConfirmButton
          onConfirm={() => onChange([])}
          prompt="Clear this roster and re-import?"
          confirmLabel="Clear"
          disabled={matching}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Re-import
        </ConfirmButton>
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
          disabled={blankBibCount === 0 || matching}
          title={`Checks other races this season for an existing plate by name, then fills any remainder starting at ${bibStart} in wave order. Existing bibs are left untouched.`}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          {matching ? "Checking…" : `Assign ${blankBibCount} blank${blankBibCount === 1 ? "" : "s"}`}
        </button>
        <span className="text-xs text-muted">
          Highest plate used across all races: <b className="text-foreground">{highestBib || "—"}</b>
          {highestBib > 0 && <> → next available {highestBib + 1}</>}
        </span>
        {bibMessage && <span className="text-xs text-brand-strong">{bibMessage}</span>}
        {rosterSource && (
          <span className="text-xs text-muted">No Player export uploaded — used roster data from {rosterSource.join(", ")} instead.</span>
        )}
      </div>
      {adding && (
        <div className="mt-4">
          <AddRiderForm variant="individual" event={event} onAdd={addRider} onCancel={() => setAdding(false)} />
        </div>
      )}

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
  busy,
}: {
  raceDate: string;
  onImport: (reg: File, roster: File | null) => void;
  error: string | null;
  busy: boolean;
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
        disabled={!reg || !raceDate || busy}
        className="mt-5 rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
      >
        {busy ? "Checking other races for existing bibs…" : "Compute categories & waves"}
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
