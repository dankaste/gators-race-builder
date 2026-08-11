"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { assignCups, buildRelayTeams, compareLegOrder, type RelayResult } from "@/lib/engine/relay";
import { DEFAULT_FIVE_SIX_COURSE_FACTOR, median, parseRaceTime, projectToFullCourse } from "@/lib/engine/history";
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
  // Fall back to the known-good default when a project's persisted config predates
  // this field (see DEFAULT_FIVE_SIX_COURSE_FACTOR) — never silently skip the
  // projection just because historyEstimation is missing from the saved config.
  const fiveSixFactor = historyEstimation?.fiveSixCourseFactor ?? DEFAULT_FIVE_SIX_COURSE_FACTOR;
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
      const seconds = raw != null && r.ageOnRaceDay != null ? projectToFullCourse(raw, r.ageOnRaceDay, fiveSixFactor) : raw;
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

/** "Mushroom Cup #1" -> "Mushroom Cup #1 — Tier 1 (slowest)" / "... — Tier 2" / "... — Tier 4 (fastest)". Cup NAMES alone don't say which end of the speed range they are; always pair a cup name with its tier. */
function cupTierLabel(cups: string[], idx: number): string {
  if (idx < 0) return "—";
  const tier = `Tier ${idx + 1}`;
  if (idx === 0) return `${cups[idx]} — ${tier} (slowest)`;
  if (idx === cups.length - 1) return `${cups[idx]} — ${tier} (fastest)`;
  return `${cups[idx]} — ${tier}`;
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
  pendingReview,
  onPendingReviewChange,
  projectId,
  season,
}: {
  event: RaceEvent;
  slug: string;
  raceDate: string;
  riders: Rider[];
  onChange: (riders: Rider[]) => void;
  /** The review screen's in-progress state (imported riders + estimates + overrides), lifted up to Workspace so it persists through a reload instead of living only in this component's local state. */
  pendingReview: Rider[] | undefined;
  /**
   * Accepts either a value or a React-style updater function. Always use the
   * updater form when the next state is derived from the current one (e.g.
   * `.map(...)` over pendingRegs) — it's threaded straight through to
   * Workspace's setPendingReviewState, so it's safe against edits fired in
   * quick succession, unlike computing the next array from this render's
   * (possibly stale) pendingReview prop.
   */
  onPendingReviewChange: (update: Rider[] | undefined | ((prev: Rider[] | undefined) => Rider[] | undefined)) => void;
  projectId: string;
  season: string;
}) {
  const relay = event.relay;
  const [error, setError] = useState<string | null>(null);
  // Lazy initializer (not an effect) so this also guesses correctly when pendingReview
  // arrives already-populated on first render — restored from a reload, see the
  // pendingReview prop — not just on a fresh "Load riders" click (handleImport does its
  // own guess for that case, since it's a normal event handler, not render/mount timing).
  const [friendField, setFriendField] = useState<string>(() => {
    if (relay?.friendRequestField) return relay.friendRequestField;
    const fields = new Set<string>();
    for (const r of pendingReview ?? []) for (const k of Object.keys(r.custom ?? {})) fields.add(k);
    return [...fields].find((f) => /friend|teammate|team request/i.test(f)) ?? "";
  });
  const pendingRegs = pendingReview ?? null;
  // Plain-value overwrite, for call sites in this component that don't derive
  // the next array from the current one (fresh import, start-over, post-build
  // clear). RelayReviewPanel's own setPendingRegs (below) is the
  // updater-only form for edits that DO derive from the current state.
  const setPendingRegs = (next: Rider[] | null) => onPendingReviewChange(() => next ?? undefined);
  // Derived from pendingRegs (not separate state) so it survives a reload — pendingRegs
  // is now persisted (see the pendingReview prop), but a plain useState here would still
  // reset to [] on remount even though the underlying custom-field data is right there.
  const customFields = useMemo(() => {
    const fields = new Set<string>();
    for (const r of pendingRegs ?? []) for (const k of Object.keys(r.custom ?? {})) fields.add(k);
    return [...fields];
  }, [pendingRegs]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<Pick<RelayResult, "unmatchedFriends" | "splitGroups"> | null>(null);
  const [rosterSource, setRosterSource] = useState<string[] | null>(null);
  // Post-build table display only — doesn't touch `riders`, so it's plain local
  // state (nothing to persist). Reassigning a rider's cup/team via the "Reassign"
  // dropdown works the same in both views; it calls onChange(next) either way,
  // which flows up to Workspace's eventsState and autosaves (see reassign() below).
  const [groupByTeam, setGroupByTeam] = useState(true);

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

  // Same rows, bucketed by cup — grouped headers with a rider count, like the review screen.
  const rowsByCup = useMemo(() => {
    const byCup = new Map<number, typeof rows>();
    if (!relay) return byCup;
    for (const row of rows) {
      const ci = relay.cups.indexOf(row.rider.relay!.cup);
      const arr = byCup.get(ci) ?? [];
      arr.push(row);
      byCup.set(ci, arr);
    }
    return byCup;
  }, [rows, relay]);

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
      if (!friendField) {
        const fields = new Set<string>();
        for (const r of withEstimates) for (const k of Object.keys(r.custom ?? {})) fields.add(k);
        const guess = [...fields].find((f) => /friend|teammate|team request/i.test(f));
        if (guess) setFriendField(guess);
      }
      setPendingRegs(withMedianDefault(withEstimates));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  }

  function build() {
    if (!pendingRegs) return;
    try {
      const clone = pendingRegs.map((r) => ({ ...r }));
      const result = buildRelayTeams(clone, { ...relay!, friendRequestField: friendField || undefined });
      setWarnings({ unmatchedFriends: result.unmatchedFriends, splitGroups: result.splitGroups });
      onChange(clone);
      // Only clear the review state once the build has actually succeeded and
      // landed in `riders` — otherwise a failure here would silently discard
      // the director's in-progress edits with no way to get them back.
      setPendingRegs(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build teams");
    }
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
          setPendingRegs={(updater) => onPendingReviewChange((prev) => updater(prev ?? []))}
          relay={relay}
          friendField={friendField}
          setFriendField={setFriendField}
          customFields={customFields}
          rosterSource={rosterSource}
          error={error}
          onBuild={build}
          onStartOver={() => {
            setPendingRegs(null);
            setRosterSource(null);
            setError(null);
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
        <div className="flex items-center rounded-lg border border-border p-0.5 text-sm">
          <button
            onClick={() => setGroupByTeam(false)}
            className={`rounded px-3 py-1 ${!groupByTeam ? "bg-brand text-foreground" : "text-muted hover:text-foreground"}`}
          >
            Flat
          </button>
          <button
            onClick={() => setGroupByTeam(true)}
            className={`rounded px-3 py-1 ${groupByTeam ? "bg-brand text-foreground" : "text-muted hover:text-foreground"}`}
          >
            By team
          </button>
        </div>
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

      <p className="mt-4 text-xs text-muted">
        Confidence: <b>D</b> direct (their own recent Swamp Dash time) · <b>X</b> cross-event (from Chestnut
        Scorcher/John Bryan) · <b>W</b> widened (sparse data, gender/season merged) · <b>—</b> no history match ·{" "}
        <b>M</b> manually overridden.
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Cup</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Leg</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Age</th>
              <th className="py-2 pr-3">Est. time</th>
              <th className="py-2 pr-3">Requested teammate</th>
              <th className="py-2 pr-3">Reassign</th>
            </tr>
          </thead>
          {relay.cups.map((cupLabel, cupIdx) => {
            const cupRows = rowsByCup.get(cupIdx) ?? [];
            if (cupRows.length === 0) return null;
            // Sub-group cupRows by team (character), preserving the cup's Team -> Leg
            // sort order from `rows` above — so this is just a run-length split, not
            // a fresh grouping pass.
            const teamGroups: { character: string; rows: typeof cupRows }[] = [];
            for (const row of cupRows) {
              const character = row.rider.relay!.character;
              const last = teamGroups[teamGroups.length - 1];
              if (last?.character === character) last.rows.push(row);
              else teamGroups.push({ character, rows: [row] });
            }
            return (
              <Fragment key={cupLabel}>
                <tbody>
                  <tr className="border-b border-border bg-surface-2">
                    <td colSpan={8} className="py-1.5 px-1 text-xs font-semibold text-foreground">
                      {cupTierLabel(relay.cups, cupIdx)} · <span className="text-muted">{cupRows.length} rider{cupRows.length === 1 ? "" : "s"}</span>
                    </td>
                  </tr>
                </tbody>
                {teamGroups.map(({ character, rows: teamRows }) => {
                  const times = teamRows.map(({ rider }) => rider.estimatedLapSeconds).filter((t): t is number => t != null);
                  const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null;
                  return (
                    <tbody key={`${cupLabel}||${character}`}>
                      {groupByTeam && (
                        <tr className="border-b border-border/60 bg-background">
                          <td colSpan={8} className="py-1 pl-4 pr-1 text-[11px] font-semibold text-muted">
                            {character} · {teamRows.length} rider{teamRows.length === 1 ? "" : "s"}
                            {avg != null && <> · avg {formatSeconds(avg)}</>}
                          </td>
                        </tr>
                      )}
                      {teamRows.map(({ rider, index }) => {
                        const badge = CONFIDENCE_LABEL[rider.estimatedLapConfidence ?? "none"];
                        const requested = friendField ? rider.custom?.[friendField]?.trim() : "";
                        return (
                          <tr key={index} className="border-b border-border/60">
                            <td className="py-1.5 pr-3 text-foreground" title={cupTierLabel(relay.cups, cupIdx)}>
                              {rider.relay!.cup}
                            </td>
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
                            <td className="py-1.5 pr-3 text-muted">{rider.ageOnRaceDay ?? "—"}</td>
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
                                {relay.cups.flatMap((c, ci) =>
                                  relay.characters.map((ch) => (
                                    <option key={`${c}||${ch}`} value={`${c}||${ch}`}>
                                      {cupTierLabel(relay.cups, ci)} · {ch}
                                    </option>
                                  )),
                                )}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </Fragment>
            );
          })}
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
  error,
  onBuild,
  onStartOver,
}: {
  pendingRegs: Rider[];
  /** Always the updater form — every edit here derives the next array from the current one, so a stale closure over `pendingRegs` from an earlier render must never be the source of truth (see onPendingReviewChange in RelayBuilder). */
  setPendingRegs: (updater: (prev: Rider[]) => Rider[]) => void;
  relay: RelayConfig;
  friendField: string;
  setFriendField: (v: string) => void;
  customFields: string[];
  rosterSource: string[] | null;
  error: string | null;
  onBuild: () => void;
  onStartOver: () => void;
}) {
  const { groups, riderCupIndex, matchedFriends, unmatchedFriends } = useMemo(
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

  // Successful auto-matches (a free-text request that DID resolve to a rider by
  // name) — labeled the same way as a manual match, so a director sees confirmation
  // either way instead of only ever seeing failures called out.
  const matchedByRider = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of matchedFriends) map.set(m.rider, [...(map.get(m.rider) ?? []), m.matchedRider]);
    return map;
  }, [matchedFriends]);

  // Rows grouped by cup (slowest cup first), each sorted slowest-first within
  // itself — the "group by cup, show me the count" view, replacing one flat sort.
  const rowsByCup = useMemo(() => {
    const byCup = new Map<number, { rider: Rider; index: number }[]>();
    pendingRegs.forEach((rider, index) => {
      // -1 should be unreachable (every rider belongs to some group, and every group
      // gets a clamped cup index) — bucketed separately anyway so a bug here shows up
      // as a visible "unassigned" row instead of silently dropping someone from a
      // screen whose whole job is "show me everyone before I commit."
      const cupIdx = riderCupIndex[index];
      const key = cupIdx >= 0 && cupIdx < relay.cups.length ? cupIdx : -1;
      const arr = byCup.get(key) ?? [];
      arr.push({ rider, index });
      byCup.set(key, arr);
    });
    for (const arr of byCup.values()) {
      arr.sort((a, b) => (b.rider.estimatedLapSeconds ?? -Infinity) - (a.rider.estimatedLapSeconds ?? -Infinity));
    }
    return byCup;
  }, [pendingRegs, riderCupIndex, relay.cups.length]);

  // Rider index -> the group (from assignCups) they belong to, so moving one
  // rider to a different cup can move their whole friend group with them.
  const groupIndexOfRider = useMemo(() => {
    const map = new Array<number>(pendingRegs.length).fill(-1);
    groups.forEach((g, gi) => {
      for (const i of g.indices) map[i] = gi;
    });
    return map;
  }, [groups, pendingRegs.length]);

  // Whether a rider's whole group currently has a director-pinned cup — shown
  // as a badge on every member's row, not just whoever set the override.
  const groupPinned = useMemo(() => {
    const flags = new Array<boolean>(pendingRegs.length).fill(false);
    for (const g of groups) {
      if (g.indices.some((i) => pendingRegs[i].manualCupOverride != null)) {
        for (const i of g.indices) flags[i] = true;
      }
    }
    return flags;
  }, [groups, pendingRegs]);

  /** Move a rider AND their whole friend group to `cupIndex` (or back to automatic placement when null). */
  function moveGroupToCup(riderIndex: number, cupIndex: number | null) {
    const gi = groupIndexOfRider[riderIndex];
    const memberIndices = new Set(gi >= 0 ? groups[gi].indices : [riderIndex]);
    setPendingRegs((prev) => prev.map((r, i) => (memberIndices.has(i) ? { ...r, manualCupOverride: cupIndex ?? undefined } : r)));
  }

  // Sanity check, not a hard rule: flag any estimate under half or over double the
  // field's median as worth a second look — catches bad source data or a missed
  // scale correction (e.g. a 5-6 rider's time that never got the full-course
  // projection applied) rather than trusting every number silently.
  const implausibleByRider = useMemo(() => {
    const real = pendingRegs.map((r) => r.estimatedLapSeconds).filter((t): t is number => t != null);
    if (real.length < 2) return new Array<boolean>(pendingRegs.length).fill(false);
    const mid = median(real);
    return pendingRegs.map((r) => r.estimatedLapSeconds != null && (r.estimatedLapSeconds < mid * 0.5 || r.estimatedLapSeconds > mid * 2));
  }, [pendingRegs]);

  function updateEstimate(index: number, seconds: number) {
    setPendingRegs((prev) =>
      prev.map((r, i) => (i === index ? { ...r, estimatedLapSeconds: seconds, estimatedLapConfidence: "manual" as const } : r)),
    );
  }

  // Name lookup for the manual-match dropdown/chips, and add/remove helpers — see
  // Rider.manualFriendMatches in lib/engine/models.ts.
  const riderByPlayerId = useMemo(() => new Map(pendingRegs.map((r) => [r.playerId, r])), [pendingRegs]);
  const sortedForPicker = useMemo(
    () => [...pendingRegs].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [pendingRegs],
  );

  function addManualMatch(index: number, targetPlayerId: string) {
    setPendingRegs((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, manualFriendMatches: [...(r.manualFriendMatches ?? []), targetPlayerId] } : r,
      ),
    );
  }
  function removeManualMatch(index: number, targetPlayerId: string) {
    setPendingRegs((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, manualFriendMatches: (r.manualFriendMatches ?? []).filter((id) => id !== targetPlayerId) } : r,
      ),
    );
  }

  const label = "block text-sm font-semibold text-muted mb-1";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Review rankings</h2>
          <p className="mt-1 text-sm text-muted">
            Cups are progressively faster heats — {cupTierLabel(relay.cups, 0)} is the slowest,{" "}
            {cupTierLabel(relay.cups, relay.cups.length - 1)} the fastest. Edit a time to override it (marked{" "}
            <span className="font-semibold">M</span> for manual); the table and Cup column re-sort live. Riders with no
            history match default to the field&apos;s median time so they still land somewhere reasonable.
          </p>
          <p className="mt-2 text-xs text-muted">
            Confidence: <b>D</b> direct (their own recent Swamp Dash time) · <b>X</b> cross-event (from Chestnut
            Scorcher/John Bryan) · <b>W</b> widened (sparse data, gender/season merged) · <b>—</b> no history match
            (defaulted to the field median) · <b>M</b> manually overridden. A{" "}
            <span className="font-semibold text-warning">mixed-speed group</span> badge means a friend group spans more
            than one cup&apos;s worth of speed — they&apos;re kept together at the slowest member&apos;s tier. A{" "}
            <span className="font-semibold text-danger">⚠ check</span> flag means the time looks unusually fast or slow
            next to the field — worth a second look before building. A{" "}
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-deep px-1.5 py-0.5 text-[10px] font-semibold text-foreground">✓ Name</span>{" "}
            chip under a request confirms who it matched to — automatically by name, or by your own pick from the
            &quot;+ match to a rider…&quot; dropdown (manual matches also get a × to remove).
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
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Age</th>
              <th className="py-2 pr-3">Est. time</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Requested teammate</th>
              <th className="py-2 pr-3">Cup</th>
            </tr>
          </thead>
          {relay.cups.map((cupName, cupIdx) => {
            const rows = rowsByCup.get(cupIdx) ?? [];
            const capacity = relay.teamSize * relay.characters.length;
            return (
              <tbody key={cupName}>
                <tr className="border-b border-border bg-surface-2">
                  <td colSpan={6} className="py-1.5 px-1 text-xs font-semibold text-foreground">
                    {cupTierLabel(relay.cups, cupIdx)} ·{" "}
                    <span className={rows.length > capacity ? "text-warning" : "text-muted"}>
                      {rows.length} rider{rows.length === 1 ? "" : "s"}
                      {rows.length > capacity && ` (over capacity — ${capacity})`}
                    </span>
                  </td>
                </tr>
                {rows.map(({ rider, index }) => {
                  const badge = CONFIDENCE_LABEL[rider.estimatedLapConfidence ?? "none"];
                  const raw = friendField ? rider.custom?.[friendField]?.trim() : "";
                  const notFound = unmatchedByRider.get(`${rider.firstName} ${rider.lastName}`);
                  return (
                    // Keyed by playerId, not array index: rows re-sort on every edit
                    // (editing a time or moving a cup moves the row), so an index-based
                    // key would let React reuse this row's DOM node — including the time
                    // <input>'s defaultValue — for a *different* rider, showing a stale value.
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
                      <td className="py-1.5 pr-3 text-muted">{rider.ageOnRaceDay ?? "—"}</td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1">
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
                          {implausibleByRider[index] && (
                            <span title="This time looks unusually fast or slow compared to the field — double check it." className="text-danger">
                              ⚠
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <span title={badge.title} className={`rounded px-1 text-[10px] font-bold ${badge.className}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-muted">
                        <div>
                          {raw || <span className="text-muted/50">—</span>}
                          {notFound && notFound.length > 0 && (
                            <span className="ml-1.5 text-warning">(not found: {notFound.join(", ")})</span>
                          )}
                        </div>
                        {(matchedByRider.get(`${rider.firstName} ${rider.lastName}`)?.length ?? 0) > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {matchedByRider.get(`${rider.firstName} ${rider.lastName}`)!.map((name, i) => (
                              <span
                                key={i}
                                title="Matched by name — resolved automatically from the request text."
                                className="inline-flex items-center gap-1 rounded-full bg-brand-deep px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                              >
                                ✓ {name}
                              </span>
                            ))}
                          </div>
                        )}
                        {(rider.manualFriendMatches ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {rider.manualFriendMatches!.map((pid) => {
                              const match = riderByPlayerId.get(pid);
                              return (
                                <span
                                  key={pid}
                                  className="inline-flex items-center gap-1 rounded-full bg-brand-deep px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                                >
                                  ✓ {match ? `${match.firstName} ${match.lastName}` : "unknown rider"}
                                  <button
                                    type="button"
                                    onClick={() => removeManualMatch(index, pid)}
                                    className="ml-0.5 text-foreground/70 hover:text-foreground"
                                    title="Remove this manual match"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {raw && (
                          <select
                            className="mt-1 rounded border border-border bg-background px-1 py-0.5 text-[11px] text-muted"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) addManualMatch(index, e.target.value);
                            }}
                          >
                            <option value="">+ match to a rider…</option>
                            {sortedForPicker
                              .filter((r) => r.playerId !== rider.playerId && !(rider.manualFriendMatches ?? []).includes(r.playerId))
                              .map((r) => (
                                <option key={r.playerId} value={r.playerId}>
                                  {r.firstName} {r.lastName}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1">
                          <select
                            className="rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground"
                            value={groupPinned[index] ? String(cupIdx) : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              moveGroupToCup(index, v === "" ? null : Number(v));
                            }}
                          >
                            <option value="">Auto — {relay.cups[cupIdx]}</option>
                            {relay.cups.map((c, ci) => (
                              <option key={ci} value={ci}>
                                {cupTierLabel(relay.cups, ci)}
                              </option>
                            ))}
                          </select>
                          {groupPinned[index] && (
                            <span title="Moved here by hand — along with their whole friend group." className="text-xs">
                              📌
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          {(rowsByCup.get(-1)?.length ?? 0) > 0 && (
            <tbody>
              <tr className="border-b border-border bg-danger/10">
                <td colSpan={6} className="py-1.5 px-1 text-xs font-semibold text-danger">
                  Unassigned — {rowsByCup.get(-1)!.length} rider(s) didn&apos;t land in a cup (unexpected — please flag this)
                </td>
              </tr>
              {rowsByCup.get(-1)!.map(({ rider }) => (
                <tr key={rider.playerId} className="border-b border-border/60">
                  <td colSpan={6} className="py-1.5 pr-3 text-foreground">
                    {rider.firstName} {rider.lastName}
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      <div className="mt-5">
        <button onClick={onBuild} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong">
          Build teams ({pendingRegs.length} riders)
        </button>
        {error && <p className="mt-2 text-danger">{error}</p>}
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
