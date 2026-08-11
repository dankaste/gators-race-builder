"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { buildRelayTeams, compareLegOrder, type RelayResult } from "@/lib/engine/relay";
import { createManualRider } from "@/lib/engine/manualRider";
import { toRelayWebScorerXlsx } from "@/lib/render/webscorerXlsx";
import { downloadBlob } from "@/lib/download";
import type { RaceEvent, Rider } from "@/lib/engine/models";
import { AddRiderForm, type AddRiderFields } from "./AddRiderForm";
import { ConfirmButton } from "./ConfirmButton";

/** Badge shown next to a rider's estimated lap time — mirrors EstimateConfidence in lib/engine/history.ts. */
const CONFIDENCE_LABEL: Record<string, { text: string; title: string; className: string }> = {
  direct: { text: "D", title: "Direct — their own recent Swamp Dash time", className: "bg-brand-deep text-foreground" },
  "cross-event": { text: "X", title: "Cross-event — estimated from Chestnut Scorcher/John Bryan", className: "bg-surface-2 text-foreground" },
  widened: { text: "W", title: "Widened cohort — sparse data, gender/season merged", className: "bg-surface-2 text-muted" },
  none: { text: "—", title: "No history match", className: "bg-surface-2 text-muted" },
};

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

/** Fetch estimated lap times for a batch of riders. On any failure, returns riders unchanged (no estimates) — team-building still works off seedLevel alone. */
async function withLapTimeEstimates(riders: Rider[]): Promise<Rider[]> {
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
      return {
        ...r,
        estimatedLapSeconds: e?.seconds ?? null,
        estimatedLapConfidence: (e?.confidence as Rider["estimatedLapConfidence"]) ?? "none",
      };
    });
  } catch {
    return riders;
  }
}

export function RelayBuilder({
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
  const relay = event.relay;
  const [error, setError] = useState<string | null>(null);
  const [friendField, setFriendField] = useState<string>(relay?.friendRequestField ?? "");
  const [pendingRegs, setPendingRegs] = useState<Rider[] | null>(null);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<Pick<RelayResult, "unmatchedFriends" | "splitGroups"> | null>(null);

  // Group assigned riders by cup -> character for display. (Declared before any
  // early return so hooks run in a stable order.)
  const grouped = useMemo(() => {
    const byCup = new Map<string, Map<string, { rider: Rider; index: number }[]>>();
    riders.forEach((r, index) => {
      if (!r.relay) return;
      const cup = byCup.get(r.relay.cup) ?? new Map();
      const team = cup.get(r.relay.character) ?? [];
      team.push({ rider: r, index });
      cup.set(r.relay.character, team);
      byCup.set(r.relay.cup, cup);
    });
    return byCup;
  }, [riders]);

  // Average estimated lap time per team and per cup — riders with no estimate don't count toward it.
  const averages = useMemo(() => {
    const of = (rs: Rider[]) => {
      const times = rs.map((r) => r.estimatedLapSeconds).filter((t): t is number => t != null);
      return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    };
    const perCup = new Map<string, number | null>();
    for (const [cup, teams] of grouped) perCup.set(cup, of([...teams.values()].flat().map((x) => x.rider)));
    return { perCup, of };
  }, [grouped]);

  if (!relay) return <p className="text-muted">This event has no relay configuration.</p>;

  // Step 1: import → parse → transform (no categories) → estimate lap times → collect custom fields for friend mapping.
  async function handleImport(regFile: File, rosterFile: File | null) {
    setError(null);
    setImporting(true);
    try {
      const registrations = parseRegistrations(await regFile.text());
      const roster = rosterFile ? parseRoster(await rosterFile.text()) : [];
      const { riders: computed } = transformEvent({ registrations, roster, event, raceDate });
      const withEstimates = await withLapTimeEstimates(computed);
      const fields = new Set<string>();
      for (const r of withEstimates) for (const k of Object.keys(r.custom ?? {})) fields.add(k);
      setCustomFields([...fields]);
      const guess = [...fields].find((f) => /friend|teammate|team request/i.test(f));
      if (guess && !friendField) setFriendField(guess);
      setPendingRegs(withEstimates);
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
    return (
      <RelayImportPanel
        raceDate={raceDate}
        cups={relay.cups}
        characters={relay.characters}
        teamSize={relay.teamSize}
        onImport={handleImport}
        importing={importing}
        error={error}
        pending={pendingRegs}
        customFields={customFields}
        friendField={friendField}
        setFriendField={setFriendField}
        onBuild={build}
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

      <div className="mt-5 space-y-6">
        {relay.cups.map((cup) => {
          const cupTeams = grouped.get(cup);
          const cupCount = cupTeams ? [...cupTeams.values()].reduce((n, t) => n + t.length, 0) : 0;
          const cupAvg = averages.perCup.get(cup);
          return (
            <section key={cup}>
              <h3 className="font-bold text-foreground">
                {cup} <span className="text-sm font-normal text-muted">({cupCount} riders{cupAvg != null ? ` · avg ${formatSeconds(cupAvg)}` : ""})</span>
              </h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {relay.characters.map((character) => {
                  const team = cupTeams?.get(character) ?? [];
                  const over = team.length > relay.teamSize;
                  const teamAvg = averages.of(team.map((x) => x.rider));
                  return (
                    <div key={character} className={`rounded-lg border bg-surface p-3 ${over ? "border-warning" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{character}</span>
                        <span className={`text-xs ${over ? "text-warning" : "text-muted"}`}>
                          {team.length}/{relay.teamSize}
                          {teamAvg != null && ` · ${formatSeconds(teamAvg)}`}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {team.sort((a, b) => a.rider.relay!.leg - b.rider.relay!.leg).map(({ rider, index }) => {
                          const badge = CONFIDENCE_LABEL[rider.estimatedLapConfidence ?? "none"];
                          return (
                            <li key={index} className="flex items-center gap-1 text-sm">
                              <span className="w-5 text-muted">{rider.relay!.leg}.</span>
                              <span className="flex-1 truncate text-foreground">
                                {rider.firstName} {rider.lastName}
                                {rider.playerId.startsWith("manual-") && (
                                  <span className="ml-1.5 rounded-full bg-brand-deep px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                                    manual
                                  </span>
                                )}
                              </span>
                              {rider.estimatedLapSeconds != null && (
                                <span className="text-xs text-muted" title={badge.title}>
                                  {formatSeconds(rider.estimatedLapSeconds)}
                                </span>
                              )}
                              <span
                                title={badge.title}
                                className={`rounded px-1 text-[10px] font-bold ${badge.className}`}
                              >
                                {badge.text}
                              </span>
                              <select
                                className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                                value={`${cup}||${character}`}
                                onChange={(e) => {
                                  const [c, ch] = e.target.value.split("||");
                                  reassign(index, c, ch);
                                }}
                              >
                                {relay.cups.flatMap((c) =>
                                  relay.characters.map((ch) => (
                                    <option key={`${c}||${ch}`} value={`${c}||${ch}`}>{c.replace(/ Cup.*/, "")} · {ch}</option>
                                  )),
                                )}
                              </select>
                            </li>
                          );
                        })}
                        {team.length === 0 && <li className="text-xs text-muted">empty</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
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
  pending: Rider[] | null;
  customFields: string[];
  friendField: string;
  setFriendField: (v: string) => void;
  onBuild: () => void;
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
        </div>
      </div>
      {!props.raceDate && <p className="mt-4 text-warning">Set the race date above before importing.</p>}
      {props.error && <p className="mt-4 text-danger">{props.error}</p>}

      {!props.pending ? (
        <button
          onClick={() => reg && props.onImport(reg, roster)}
          disabled={!reg || !props.raceDate || props.importing}
          className="mt-5 rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
        >
          {props.importing ? "Loading…" : "Load riders"}
        </button>
      ) : (
        <div className="mt-5">
          <label className={label}>Friend / teammate-request column (optional)</label>
          <select
            className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2"
            value={props.friendField}
            onChange={(e) => props.setFriendField(e.target.value)}
          >
            <option value="">— none —</option>
            {props.customFields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <div className="mt-4">
            <button onClick={props.onBuild} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong">
              Build teams ({props.pending.length} riders)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
