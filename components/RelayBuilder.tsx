"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { assignCups, buildRelayTeams, compareLegOrder, type RelayResult } from "@/lib/engine/relay";
import { median, parseRaceTime, projectToFullCourse } from "@/lib/engine/history";
import { createManualRider } from "@/lib/engine/manualRider";
import { toRelayWebScorerXlsx } from "@/lib/render/webscorerXlsx";
import { downloadBlob } from "@/lib/download";
import { fetchSeasonRoster } from "@/lib/fetchSeasonRoster";
import type { RaceEvent, RelayConfig, Rider } from "@/lib/engine/models";
import { AddRiderForm, type AddRiderFields } from "./AddRiderForm";
import { ConfirmButton } from "./ConfirmButton";

/** Badge shown next to a rider's estimated lap time — mirrors EstimateConfidence in lib/engine/history.ts. */
const CONFIDENCE_LABEL: Record<string, { text: string; title: string; className: string }> = {
  direct: { text: "D", title: "Direct — their own recent Swamp Dash time", className: "bg-brand-deep text-foreground" },
  "cross-event": { text: "X", title: "Cross-event — estimated from Chestnut Scorcher/John Bryan", className: "bg-surface-2 text-foreground" },
  widened: { text: "W", title: "Widened cohort — sparse data, gender/season merged", className: "bg-surface-2 text-muted" },
  none: { text: "—", title: "No history match", className: "bg-surface-2 text-muted" },
  manual: { text: "M", title: "Manually overridden by a director", className: "bg-accent text-background" },
};

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

/**
 * Fetch estimated lap times for a batch of riders, projecting 5-6 riders onto
 * the full-course scale exactly once (see projectToFullCourse in
 * lib/engine/history.ts — applying it more than once double-counts it, so
 * this is the ONLY place it's ever called). On any failure, returns riders
 * unchanged (no estimates) — team-building still works off seedLevel alone.
 */
async function withLapTimeEstimates(riders: Rider[], historyEstimation: RelayConfig["historyEstimation"]): Promise<Rider[]> {
  try {
    const candidates = riders.map((r) => ({
      firstName: r.firstName,
      lastName: r.lastName,
      ageOnRaceDay: r.ageOnRaceDay,
      gender: typeof r.gender === "string" ? r.gender : null,
    }));
    const res = await fetch("/api/history/estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates }),
    });
    if (!res.ok) return riders;
    const data: { estimates: { index: number; seconds: number | null; confidence: string }[] } = await res.json();
    const byIndex = new Map(data.estimates.map((e) => [e.index, e]));
    return riders.map((r, i) => {
      const e = byIndex.get(i);
      const raw = e?.seconds ?? null;
      const seconds =
        raw != null && historyEstimation && r.ageOnRaceDay != null
          ? projectToFullCourse(raw, r.ageOnRaceDay, historyEstimation.fiveSixCourseFactor)
          : raw;
      return {
        ...r,
        estimatedLapSeconds: seconds,
        estimatedLapConfidence: (e?.confidence as Rider["estimatedLapConfidence"]) ?? "none",
      };
    });
  } catch {
    return riders;
  }
}

/**
 * Give every estimate-less rider a visible default — the population median of
 * riders who DO have a real estimate — so the review table sorts them
 * somewhere reasonable and they still get a cup/team instead of being
 * silently left out of the ranking. Confidence stays "none" (not promoted to
 * "direct") so it's clear this is a placeholder, not a measurement. Only
 * applies when at least one real estimate exists; with zero history data
 * anywhere, buildRelayTeams' headcount/seedLevel fallback takes over exactly
 * as before.
 */
function withMedianDefault(riders: Rider[]): Rider[] {
  const real = riders.map((r) => r.estimatedLapSeconds).filter((t): t is number => t != null);
  if (real.length === 0) return riders;
  const mid = median(real);
  return riders.map((r) => (r.estimatedLapSeconds != null ? r : { ...r, estimatedLapSeconds: mid, estimatedLapConfidence: "none" as const }));
}

export function RelayBuilder({
  event,
  slug,
  raceDate,
  riders,
  onChange,
  projectId,
  season,
}: {
  event: RaceEvent;
  slug: string;
  raceDate: string;
  riders: Rider[];
  onChange: (riders: Rider[]) => void;
  projectId: string;
  season: string;
}) {
  const relay = event.relay;
  const [error, setError] = useState<string | null>(null);
  const [friendField, setFriendField] = useState<string>(relay?.friendRequestField ?? "");
  const [pendingRegs, setPendingRegs] = useState<Rider[] | null>(null);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<Pick<RelayResult, "unmatchedFriends" | "splitGroups"> | null>(null);
  const [rosterSource, setRosterSource] = useState<string[] | null>(null);

  // Rows for the post-build table, sorted Cup -> Team -> Leg. (Declared before
  // any early return so hooks run in a stable order.)
  const rows = useMemo(() => {
    if (!relay) return [];
    const cupIdx = new Map(relay.cups.map((c, i) => [c, i]));
    const charIdx = new Map(relay.characters.map((c, i) => [c, i]));
    return riders
      .map((rider, index) => ({ rider, index }))
      .filter((x) => x.rider.relay)
      .sort((a, b) => {
        const ra = a.rider.relay!;
        const rb = b.rider.relay!;
        return (
          (cupIdx.get(ra.cup) ?? 0) - (cupIdx.get(rb.cup) ?? 0) ||
          (charIdx.get(ra.character) ?? 0) - (charIdx.get(rb.character) ?? 0) ||
          ra.leg - rb.leg
        );
      });
  }, [riders, relay]);

  if (!relay) return <p className="text-muted">This event has no relay configuration.</p>;

  // Step 1: import → parse → transform (no categories) → estimate lap times (5-6-projected, once) → median-default → collect custom fields for friend mapping → review.
  async function handleImport(regFile: File, rosterFile: File | null) {
    setError(null);
    setImporting(true);
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
      const withEstimates = await withLapTimeEstimates(computed, relay!.historyEstimation);
      const fields = new Set<string>();
      for (const r of withEstimates) for (const k of Object.keys(r.custom ?? {})) fields.add(k);
      setCustomFields([...fields]);
      const guess = [...fields].find((f) => /friend|teammate|team request/i.test(f));
      if (guess && !friendField) setFriendField(guess);
      setPendingRegs(withMedianDefault(withEstimates));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  }

  function build() {
    if (!pendingRegs) return;
    const clone = pendingRegs.map((r) => ({ ...r }));
    const result = buildRelayTeams(clone, { ...relay!, friendRequestField: friendField || undefined });
    setWarnings({ unmatchedFriends: result.unmatchedFriends, splitGroups: result.splitGroups });
    onChange(clone);
  }

  /** Append a hand-entered rider onto a chosen cup/character team and renumber legs. */
  function addRider(fields: AddRiderFields) {
    const rider = createManualRider({ id: `manual-${crypto.randomUUID()}`, ...fields }, event);
    const next = [...riders, rider];
    renumberLegs(next);
    onChange(next);
    setAdding(false);
  }

  function reassign(index: number, cup: string, character: string) {
    const next = riders.map((r) => ({ ...r }));
    next[index].relay = { cup, character, leg: 1 };
    // Renumber legs within each affected team by seed.
    renumberLegs(next);
    onChange(next);
  }

  function renumberLegs(list: Rider[]) {
    const byTeam = new Map<string, Rider[]>();
    for (const r of list) {
      if (!r.relay) continue;
      const k = `${r.relay.cup}||${r.relay.character}`;
      (byTeam.get(k) ?? byTeam.set(k, []).get(k)!).push(r);
    }
    for (const team of byTeam.values()) {
      team.sort(compareLegOrder);
      team.forEach((r, i) => (r.relay!.leg = i + 1));
    }
  }

  if (riders.length === 0) {
    if (pendingRegs) {
      return (
        <RelayReviewPanel
          pendingRegs={pendingRegs}
          setPendingRegs={setPendingRegs}
          relay={relay}
          friendField={friendField}
          setFriendField={setFriendField}
          customFields={customFields}
          rosterSource={rosterSource}
          onBuild={build}
          onStartOver={() => {
            setPendingRegs(null);
            setCustomFields([]);
            setRosterSource(null);
          }}
        />
      );
    }
    return (
      <RelayImportPanel
        raceDate={raceDate}
        cups={relay.cups}
        characters={relay.characters}
        teamSize={relay.teamSize}
        onImport={handleImport}
        importing={importing}
        error={error}
      />
    );
  }

  const teamSizes = riders.reduce((m, r) => {
    if (!r.relay) return m;
    const k = `${r.relay.cup}||${r.relay.character}`;
    m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, new Map<string, number>());
  const sizes = [...teamSizes.values()];
  const minS = Math.min(...sizes), maxS = Math.max(...sizes);
  const hasWarnings = warnings && (warnings.unmatchedFriends.length > 0 || warnings.splitGroups.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">
          {riders.length} riders · {teamSizes.size} teams · sizes {minS}–{maxS}
        </span>
        <button
          onClick={async () => downloadBlob(await toRelayWebScorerXlsx(riders, event), `${slug}-relay-webscorer.xlsx`)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong"
        >
          Export relay WebScorer file
        </button>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
        >
          + Add rider
        </button>
        <ConfirmButton
          onConfirm={() => {
            setWarnings(null);
            onChange([]);
          }}
          prompt="Clear relay teams and re-import?"
          confirmLabel="Clear"
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Re-import
        </ConfirmButton>
        <Link href="/guide#webscorer" className="text-sm text-brand-strong hover:underline">
          How to upload to WebScorer →
        </Link>
      </div>

      {hasWarnings && (
        <div className="mt-4 rounded-lg border border-warning bg-surface p-4 text-sm">
          {warnings!.unmatchedFriends.length > 0 && (
            <div>
              <p className="font-semibold text-warning">
                {warnings!.unmatchedFriends.length} teammate request{warnings!.unmatchedFriends.length === 1 ? "" : "s"} didn&apos;t match a rider:
              </p>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {warnings!.unmatchedFriends.map((u, i) => (
                  <li key={i}>
                    {u.rider} requested &quot;{u.requested}&quot;
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warnings!.splitGroups.length > 0 && (
            <div className={warnings!.unmatchedFriends.length > 0 ? "mt-3" : ""}>
              <p className="font-semibold text-warning">
                {warnings!.splitGroups.length} friend group{warnings!.splitGroups.length === 1 ? "" : "s"} too big for one team, split across teams:
              </p>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {warnings!.splitGroups.map((g, i) => (
                  <li key={i}>
                    {g.riders.join(", ")} ({g.riders.length} riders, team size {g.teamSize})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {adding && (
        <div className="mt-4">
          <AddRiderForm variant="relay" event={event} onAdd={addRider} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Cup</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Leg</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Est. time</th>
              <th className="py-2 pr-3">Requested teammate</th>
              <th className="py-2 pr-3">Reassign</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rider, index }) => {
              const badge = CONFIDENCE_LABEL[rider.estimatedLapConfidence ?? "none"];
              const requested = friendField ? rider.custom?.[friendField]?.trim() : "";
              return (
                <tr key={index} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 text-foreground">{rider.relay!.cup}</td>
                  <td className="py-1.5 pr-3 text-foreground">{rider.relay!.character}</td>
                  <td className="py-1.5 pr-3 text-muted">{rider.relay!.leg}</td>
                  <td className="py-1.5 pr-3 text-foreground">
                    {rider.firstName} {rider.lastName}
                    {rider.playerId.startsWith("manual-") && (
                      <span className="ml-1.5 rounded-full bg-brand-deep px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                        manual
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-1">
                      {rider.estimatedLapSeconds != null && (
                        <span className="text-muted">{formatSeconds(rider.estimatedLapSeconds)}</span>
                      )}
                      <span title={badge.title} className={`rounded px-1 text-[10px] font-bold ${badge.className}`}>
                        {badge.text}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{requested || <span className="text-muted/50">—</span>}</td>
                  <td className="py-1.5 pr-3">
                    <select
                      className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                      value={`${rider.relay!.cup}||${rider.relay!.character}`}
                      onChange={(e) => {
                        const [c, ch] = e.target.value.split("||");
                        reassign(index, c, ch);
                      }}
                    >
                      {relay.cups.flatMap((c) =>
                        relay.characters.map((ch) => (
                          <option key={`${c}||${ch}`} value={`${c}||${ch}`}>
                            {c} · {ch}
                          </option>
                        )),
                      )}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Editable rankings review, inserted between "load riders" and "build teams".
 * One row per rider — extrapolated time (editable, the override mechanism —
 * editing live-reorders and live-recomputes the Cup column), confidence,
 * requested teammate, and which cup they'd land in — computed via
 * {@link assignCups}, the exact same function `buildRelayTeams` calls, so
 * this screen can never disagree with what the actual build does. Also hosts
 * the friend-request field selector, since grouping needs it.
 */
function RelayReviewPanel({
  pendingRegs,
  setPendingRegs,
  relay,
  friendField,
  setFriendField,
  customFields,
  rosterSource,
  onBuild,
  onStartOver,
}: {
  pendingRegs: Rider[];
  setPendingRegs: (r: Rider[]) => void;
  relay: RelayConfig;
  friendField: string;
  setFriendField: (v: string) => void;
  customFields: string[];
  rosterSource: string[] | null;
  onBuild: () => void;
  onStartOver: () => void;
}) {
  const { groups, riderCupIndex, unmatchedFriends } = useMemo(
    () => assignCups(pendingRegs, { ...relay, friendRequestField: friendField || undefined }),
    [pendingRegs, relay, friendField],
  );

  const mixedSpeedByRider = useMemo(() => {
    const flags = new Array<boolean>(pendingRegs.length).fill(false);
    for (const g of groups) if (g.mixedSpeed) for (const i of g.indices) flags[i] = true;
    return flags;
  }, [groups, pendingRegs.length]);

  const unmatchedByRider = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const u of unmatchedFriends) map.set(u.rider, [...(map.get(u.rider) ?? []), u.requested]);
    return map;
  }, [unmatchedFriends]);

  const sortedRows = useMemo(
    () =>
      pendingRegs
        .map((rider, index) => ({ rider, index }))
        .sort((a, b) => (b.rider.estimatedLapSeconds ?? -Infinity) - (a.rider.estimatedLapSeconds ?? -Infinity)),
    [pendingRegs],
  );

  function updateEstimate(index: number, seconds: number) {
    setPendingRegs(
      pendingRegs.map((r, i) => (i === index ? { ...r, estimatedLapSeconds: seconds, estimatedLapConfidence: "manual" as const } : r)),
    );
  }

  const label = "block text-sm font-semibold text-muted mb-1";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Review rankings</h2>
          <p className="mt-1 text-sm text-muted">
            Cups are progressively faster heats — {relay.cups[0]} is the slowest, {relay.cups[relay.cups.length - 1]} the fastest.
            Edit a time to override it (marked <span className="font-semibold">M</span> for manual); the table and Cup column
            re-sort live. Riders with no history match default to the field&apos;s median time (
            <span className="font-semibold">—</span>) so they still land somewhere reasonable.
          </p>
        </div>
        <button onClick={onStartOver} className="text-sm text-muted hover:text-foreground">
          ‹ Start over
        </button>
      </div>

      {rosterSource && (
        <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">
          No Player export uploaded — used roster data from {rosterSource.join(", ")} instead.
        </p>
      )}

      <div className="mt-4 max-w-md">
        <label className={label}>Friend / teammate-request column (optional)</label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
          value={friendField}
          onChange={(e) => setFriendField(e.target.value)}
        >
          <option value="">— none —</option>
          {customFields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Est. time</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Requested teammate</th>
              <th className="py-2 pr-3">Cup</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ rider, index }) => {
              const badge = CONFIDENCE_LABEL[rider.estimatedLapConfidence ?? "none"];
              const raw = friendField ? rider.custom?.[friendField]?.trim() : "";
              const notFound = unmatchedByRider.get(`${rider.firstName} ${rider.lastName}`);
              const cupIdx = riderCupIndex[index];
              return (
                // Keyed by playerId, not array index: sortedRows re-sorts on every edit
                // (editing a time moves the row), so an index-based key would let React
                // reuse this row's DOM node — including the time <input>'s defaultValue —
                // for a *different* rider after a re-sort, showing a stale value.
                <tr key={rider.playerId} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 text-foreground">
                    {rider.firstName} {rider.lastName}
                    {mixedSpeedByRider[index] && (
                      <span
                        title="Friend group spans more than one cup's worth of speed — placed together at the slowest member's tier."
                        className="ml-1.5 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning"
                      >
                        mixed-speed group
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="text"
                      defaultValue={rider.estimatedLapSeconds != null ? formatSeconds(rider.estimatedLapSeconds) : ""}
                      onBlur={(e) => {
                        const parsed = parseRaceTime(e.target.value);
                        if (parsed != null) updateEstimate(index, parsed);
                        else e.target.value = rider.estimatedLapSeconds != null ? formatSeconds(rider.estimatedLapSeconds) : "";
                      }}
                      className="w-24 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                      placeholder="m:ss.s"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <span title={badge.title} className={`rounded px-1 text-[10px] font-bold ${badge.className}`}>
                      {badge.text}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">
                    {raw || <span className="text-muted/50">—</span>}
                    {notFound && notFound.length > 0 && (
                      <span className="ml-1.5 text-warning">(not found: {notFound.join(", ")})</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-foreground">{cupIdx >= 0 ? relay.cups[cupIdx] : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <button onClick={onBuild} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong">
          Build teams ({pendingRegs.length} riders)
        </button>
      </div>
    </div>
  );
}

function RelayImportPanel(props: {
  raceDate: string;
  cups: string[];
  characters: string[];
  teamSize: number;
  onImport: (reg: File, roster: File | null) => void;
  importing: boolean;
  error: string | null;
}) {
  const [reg, setReg] = useState<File | null>(null);
  const [roster, setRoster] = useState<File | null>(null);
  const label = "block text-sm font-semibold text-muted mb-1";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold text-foreground">Build relay teams</h2>
      <p className="mt-1 text-sm text-muted">
        Riders are distributed across {props.cups.length} cups into {props.characters.length} character
        teams (~{props.teamSize} each), balanced by estimated Swamp Dash lap time (from{" "}
        <Link href="/history" className="text-brand-strong hover:underline">Race History</Link>, when imported)
        while keeping requested friends together. Files are parsed in your browser.{" "}
        <Link href="/guide#exports" className="text-brand-strong hover:underline">Where do I get these files? →</Link>
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label}>Relay registration export (CSV) *</label>
          <input type="file" accept=".csv" onChange={(e) => setReg(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-brand-deep file:px-3 file:py-1.5 file:text-foreground" />
        </div>
        <div>
          <label className={label}>Player export (CSV) — for bibs &amp; seeding</label>
          <input type="file" accept=".csv" onChange={(e) => setRoster(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-foreground" />
          <p className="mt-1 text-xs text-muted">
            Optional — leave blank to reuse bibs/teams/contacts already captured from another race this season.
          </p>
        </div>
      </div>
      {!props.raceDate && <p className="mt-4 text-warning">Set the race date above before importing.</p>}
      {props.error && <p className="mt-4 text-danger">{props.error}</p>}

      <button
        onClick={() => reg && props.onImport(reg, roster)}
        disabled={!reg || !props.raceDate || props.importing}
        className="mt-5 rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
      >
        {props.importing ? "Loading…" : "Load riders"}
      </button>
    </div>
  );
}
