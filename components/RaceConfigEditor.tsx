"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryDef, Gender, RaceConfig, RaceEvent, WaveOrdering } from "@/lib/engine/models";

const ORDERINGS: WaveOrdering[] = ["isolate-slow-heat", "seed-ascending", "registration", "manual"];

function numOrUndef(v: string): number | undefined {
  return v.trim() === "" ? undefined : Number(v);
}
function listToText(a?: (string | number)[]): string {
  return (a ?? []).join(", ");
}
function textToStrList(v: string): string[] | undefined {
  const a = v.split(",").map((s) => s.trim()).filter(Boolean);
  return a.length ? a : undefined;
}
function textToNumList(v: string): number[] | undefined {
  const a = v.split(",").map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
  return a.length ? a : undefined;
}

export function RaceConfigEditor({ config, seeded }: { config: RaceConfig; seeded: boolean }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<RaceConfig>(() => structuredClone(config));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function patch(updater: (c: RaceConfig) => void) {
    setCfg((prev) => {
      const next = structuredClone(prev);
      updater(next);
      return next;
    });
    setStatus("idle");
  }

  const setCat = (ei: number, ci: number, p: Partial<CategoryDef>) =>
    patch((c) => Object.assign(c.events[ei].categories[ci], p));
  const addCat = (ei: number) =>
    patch((c) => c.events[ei].categories.push({ label: "New category", distanceLabel: "", genders: ["M"], maxSize: 9, ordering: "registration" }));
  const removeCat = (ei: number, ci: number) => patch((c) => c.events[ei].categories.splice(ci, 1));
  const moveCat = (ei: number, ci: number, dir: -1 | 1) =>
    patch((c) => {
      const arr = c.events[ei].categories;
      const j = ci + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[ci], arr[j]] = [arr[j], arr[ci]];
    });
  const toggleGender = (ei: number, ci: number, g: Gender) =>
    patch((c) => {
      const cat = c.events[ei].categories[ci];
      cat.genders = cat.genders.includes(g) ? cat.genders.filter((x) => x !== g) : [...cat.genders, g];
    });

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch(`/api/races/${cfg.slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: cfg }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Validation failed");
        setStatus("error");
        return;
      }
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  async function reset() {
    if (!confirm("Reset this race to its built-in default? Your edits will be discarded.")) return;
    const res = await fetch(`/api/races/${cfg.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    if (res.ok) setCfg(structuredClone(await res.json()));
  }

  async function del() {
    if (!confirm(`Delete the "${cfg.name}" race type? This cannot be undone.`)) return;
    const res = await fetch(`/api/races/${cfg.slug}`, { method: "DELETE" });
    if (res.ok) router.push("/config");
  }

  const input = "rounded border border-border bg-background px-2 py-1 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-wide text-muted mb-1";

  return (
    <div className="mt-6 space-y-8">
      {/* Race-level fields */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Name</label>
            <input className={`${input} w-full`} value={cfg.name} onChange={(e) => patch((c) => { c.name = e.target.value; })} />
          </div>
          <div>
            <label className={label}>Default race date</label>
            <input type="date" className={`${input} w-full`} value={cfg.raceDate ?? ""} onChange={(e) => patch((c) => { c.raceDate = e.target.value || undefined; })} />
          </div>
          <div>
            <label className={label}>Slug (fixed)</label>
            <input className={`${input} w-full opacity-60`} value={cfg.slug} readOnly title="Slug links existing projects and can't be changed" />
          </div>
        </div>
      </section>

      {/* Events */}
      {cfg.events.map((event, ei) => (
        <section key={event.id} className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className={`${input} font-bold text-foreground`}
              value={event.name}
              onChange={(e) => patch((c) => { c.events[ei].name = e.target.value; })}
            />
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs uppercase text-muted">{event.type}</span>
            <label className="text-xs text-muted">
              name format{" "}
              <input className={input} value={event.nameFormat} onChange={(e) => patch((c) => { c.events[ei].nameFormat = e.target.value; })} />
            </label>
            {cfg.events.length > 1 && (
              <button onClick={() => patch((c) => c.events.splice(ei, 1))} className="ml-auto text-xs text-muted hover:text-danger">
                Remove event
              </button>
            )}
          </div>

          {event.type === "relay" && event.relay ? (
            <RelayEditor event={event} ei={ei} patch={patch} input={input} label={label} />
          ) : (
            <CategoryEditor
              event={event}
              ei={ei}
              setCat={setCat}
              addCat={addCat}
              removeCat={removeCat}
              moveCat={moveCat}
              toggleGender={toggleGender}
              input={input}
            />
          )}
        </section>
      ))}

      <button
        onClick={() => patch((c) => c.events.push(newEvent(c.slug, c.events.length)))}
        className="text-sm font-semibold text-brand-strong hover:underline"
      >
        + Add event
      </button>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button onClick={save} disabled={status === "saving"} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50">
          {status === "saving" ? "Saving…" : "Save race"}
        </button>
        {seeded && (
          <button onClick={reset} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
            Reset to built-in default
          </button>
        )}
        <button onClick={del} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-danger">
          Delete race
        </button>
        {status === "saved" && <span className="text-sm text-brand-strong">Saved</span>}
        {status === "error" && <span className="text-sm text-danger">{error ?? "Save failed"}</span>}
      </div>
    </div>
  );
}

function newEvent(slug: string, i: number): RaceEvent {
  return {
    id: `${slug}-individual-${i + 1}`,
    name: "New event",
    type: "individual",
    order: i + 1,
    nameFormat: "{last} ,{first}",
    categories: [],
  };
}

function CategoryEditor({
  event, ei, setCat, addCat, removeCat, moveCat, toggleGender, input,
}: {
  event: RaceEvent;
  ei: number;
  setCat: (ei: number, ci: number, p: Partial<CategoryDef>) => void;
  addCat: (ei: number) => void;
  removeCat: (ei: number, ci: number) => void;
  moveCat: (ei: number, ci: number, dir: -1 | 1) => void;
  toggleGender: (ei: number, ci: number, g: Gender) => void;
  input: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted">
          <tr>
            <th className="px-2 py-1">Label</th>
            <th className="px-2 py-1">Distance</th>
            <th className="px-2 py-1">Gender</th>
            <th className="px-2 py-1">Min</th>
            <th className="px-2 py-1">Max</th>
            <th className="px-2 py-1">Ages (list)</th>
            <th className="px-2 py-1">Packages</th>
            <th className="px-2 py-1">Max wave</th>
            <th className="px-2 py-1">Wave order</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {event.categories.map((cat, ci) => (
            <tr key={ci} className="border-t border-border">
              <td className="px-2 py-1"><input className={`${input} w-32`} value={cat.label} onChange={(e) => setCat(ei, ci, { label: e.target.value })} /></td>
              <td className="px-2 py-1"><input className={`${input} w-28`} value={cat.distanceLabel} onChange={(e) => setCat(ei, ci, { distanceLabel: e.target.value })} /></td>
              <td className="px-2 py-1 whitespace-nowrap">
                {(["M", "F"] as Gender[]).map((g) => (
                  <label key={g} className="mr-1 text-xs">
                    <input type="checkbox" checked={cat.genders.includes(g)} onChange={() => toggleGender(ei, ci, g)} /> {g}
                  </label>
                ))}
              </td>
              <td className="px-2 py-1"><input className={`${input} w-12`} value={cat.ageMin ?? ""} onChange={(e) => setCat(ei, ci, { ageMin: numOrUndef(e.target.value) })} /></td>
              <td className="px-2 py-1"><input className={`${input} w-12`} value={cat.ageMax ?? ""} onChange={(e) => setCat(ei, ci, { ageMax: numOrUndef(e.target.value) })} /></td>
              <td className="px-2 py-1"><input className={`${input} w-24`} placeholder="e.g. 3,4" value={listToText(cat.ages)} onChange={(e) => setCat(ei, ci, { ages: textToNumList(e.target.value) })} /></td>
              <td className="px-2 py-1"><input className={`${input} w-32`} placeholder="e.g. Novice" value={listToText(cat.packages)} onChange={(e) => setCat(ei, ci, { packages: textToStrList(e.target.value) })} /></td>
              <td className="px-2 py-1"><input className={`${input} w-16`} value={cat.maxSize} onChange={(e) => setCat(ei, ci, { maxSize: Number(e.target.value) || 1 })} /></td>
              <td className="px-2 py-1">
                <select className={input} value={cat.ordering} onChange={(e) => setCat(ei, ci, { ordering: e.target.value as WaveOrdering })}>
                  {ORDERINGS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td className="px-2 py-1 whitespace-nowrap">
                <button onClick={() => moveCat(ei, ci, -1)} className="px-1 text-muted hover:text-foreground">↑</button>
                <button onClick={() => moveCat(ei, ci, 1)} className="px-1 text-muted hover:text-foreground">↓</button>
                <button onClick={() => removeCat(ei, ci)} className="px-1 text-muted hover:text-danger">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => addCat(ei)} className="mt-2 text-sm font-semibold text-brand-strong hover:underline">+ Add category</button>
      <p className="mt-2 text-xs text-muted">Use Min/Max for an age range, or the Ages list for specific ages (the list wins if set). Leave both blank to match any age.</p>
    </div>
  );
}

function RelayEditor({
  event, ei, patch, input, label,
}: {
  event: RaceEvent;
  ei: number;
  patch: (u: (c: RaceConfig) => void) => void;
  input: string;
  label: string;
}) {
  const relay = event.relay!;
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <label className={label}>Team size</label>
        <input className={`${input} w-20`} value={relay.teamSize} onChange={(e) => patch((c) => { c.events[ei].relay!.teamSize = Number(e.target.value) || 1; })} />
      </div>
      <div>
        <label className={label}>Friend-request field</label>
        <input className={`${input} w-full`} value={relay.friendRequestField ?? ""} onChange={(e) => patch((c) => { c.events[ei].relay!.friendRequestField = e.target.value || undefined; })} />
      </div>
      <div>
        <label className={label}>Cups (one per line)</label>
        <textarea className={`${input} w-full h-28`} value={relay.cups.join("\n")} onChange={(e) => patch((c) => { c.events[ei].relay!.cups = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); })} />
      </div>
      <div>
        <label className={label}>Character teams (one per line)</label>
        <textarea className={`${input} w-full h-28`} value={relay.characters.join("\n")} onChange={(e) => patch((c) => { c.events[ei].relay!.characters = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); })} />
      </div>
    </div>
  );
}
