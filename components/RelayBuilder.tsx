"use client";

import { useMemo, useState } from "react";
import { parseRegistrations, parseRoster } from "@/lib/engine/parse";
import { transformEvent } from "@/lib/engine/transform";
import { buildRelayTeams } from "@/lib/engine/relay";
import { toRelayWebScorerCsv } from "@/lib/engine/export_webscorer";
import { downloadText } from "@/lib/download";
import type { RaceEvent, Rider } from "@/lib/engine/models";

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

  if (!relay) return <p className="text-muted">This event has no relay configuration.</p>;

  // Step 1: import → parse → transform (no categories) → collect custom fields for friend mapping.
  async function handleImport(regFile: File, rosterFile: File | null) {
    setError(null);
    try {
      const registrations = parseRegistrations(await regFile.text());
      const roster = rosterFile ? parseRoster(await rosterFile.text()) : [];
      const { riders: computed } = transformEvent({ registrations, roster, event, raceDate });
      const fields = new Set<string>();
      for (const r of computed) for (const k of Object.keys(r.custom ?? {})) fields.add(k);
      setCustomFields([...fields]);
      const guess = [...fields].find((f) => /friend|teammate|team request/i.test(f));
      if (guess && !friendField) setFriendField(guess);
      setPendingRegs(computed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    }
  }

  function build() {
    if (!pendingRegs) return;
    const clone = pendingRegs.map((r) => ({ ...r }));
    buildRelayTeams(clone, { ...relay!, friendRequestField: friendField || undefined });
    onChange(clone);
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
      team.sort((a, b) => (a.seedLevel ?? 1e9) - (b.seedLevel ?? 1e9));
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">
          {riders.length} riders · {teamSizes.size} teams · sizes {minS}–{maxS}
        </span>
        <button
          onClick={() => downloadText(toRelayWebScorerCsv(riders, event), `${slug}-relay-webscorer.csv`)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong"
        >
          Export relay WebScorer CSV
        </button>
        <button
          onClick={() => { if (confirm("Clear relay teams and re-import?")) onChange([]); }}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Re-import
        </button>
      </div>

      <div className="mt-5 space-y-6">
        {relay.cups.map((cup) => {
          const cupTeams = grouped.get(cup);
          const cupCount = cupTeams ? [...cupTeams.values()].reduce((n, t) => n + t.length, 0) : 0;
          return (
            <section key={cup}>
              <h3 className="font-bold text-foreground">{cup} <span className="text-sm font-normal text-muted">({cupCount} riders)</span></h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {relay.characters.map((character) => {
                  const team = cupTeams?.get(character) ?? [];
                  const over = team.length > relay.teamSize;
                  return (
                    <div key={character} className={`rounded-lg border bg-surface p-3 ${over ? "border-warning" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{character}</span>
                        <span className={`text-xs ${over ? "text-warning" : "text-muted"}`}>{team.length}/{relay.teamSize}</span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {team.sort((a, b) => a.rider.relay!.leg - b.rider.relay!.leg).map(({ rider, index }) => (
                          <li key={index} className="flex items-center gap-1 text-sm">
                            <span className="w-5 text-muted">{rider.relay!.leg}.</span>
                            <span className="flex-1 truncate text-foreground">{rider.firstName} {rider.lastName}</span>
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
                        ))}
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
        teams (~{props.teamSize} each), keeping requested friends together. Files are parsed in your browser.
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
          disabled={!reg || !props.raceDate}
          className="mt-5 rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
        >
          Load riders
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
