"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_SCHEDULE,
  type CategoryDef,
  type Rider,
  type ScheduleConfig,
} from "@/lib/engine/models";
import {
  flattenWaveGroups,
  groupRidersIntoWaves,
  splitEvenly,
  type WaveGroup,
} from "@/lib/engine/waves";

/** Format a clock time from a start ("HH:MM" 24h) plus an offset in minutes. */
function fmtTime(startTime: string, offsetMin: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  if (!m) return "";
  const total = +m[1] * 60 + +m[2] + offsetMin;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/** A wave for display: one or more category blocks (combined) sharing a number. */
interface WaveView {
  no: number | null; // contiguous display number (null = empty wave)
  blocks: { gi: number; group: WaveGroup }[];
  key: string; // stable-ish key for collapse state
}

/**
 * Wave-centric editor. Each section is a wave (one or more category blocks when
 * combined), collapsible to a one-line summary. Owns the schedule too: the
 * first-wave start, per-category minutes-per-wave (shown on each wave), computed
 * start times, and breaks between waves. Riders drag between waves; "Combine up"
 * merges a wave into the one above (renumbering downstream), "Split apart" undoes
 * it. Local `groups` state is authoritative while mounted; `onChange` pushes the
 * flattened rider list up. Re-mount (via React `key`) to re-seed after re-import.
 */
export function WaveEditor({
  riders,
  categories,
  onChange,
  schedule,
  onScheduleChange,
}: {
  riders: Rider[];
  categories: CategoryDef[];
  onChange: (riders: Rider[]) => void;
  schedule?: ScheduleConfig;
  onScheduleChange: (next: ScheduleConfig) => void;
}) {
  const [otherRiders] = useState<Rider[]>(() => riders.filter((r) => !r.categoryLabel));
  const [groups, setGroups] = useState<WaveGroup[]>(() => groupRidersIntoWaves(riders, categories));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<{ gi: number; idx: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const sched = schedule ?? DEFAULT_SCHEDULE;
  const catDefs = useMemo(() => new Map(categories.map((c) => [c.label, c])), [categories]);

  function commit(next: WaveGroup[]) {
    setGroups(next);
    onChange(flattenWaveGroups(next, otherRiders));
  }
  const clone = () => groups.map((g) => ({ ...g, riders: g.riders.slice() }));

  // --- derive waves (consecutive blocks sharing a flatten number) ---
  const waves = useMemo<WaveView[]>(() => {
    const blockNo: (number | null)[] = [];
    let n = 0;
    groups.forEach((g) => {
      if (g.riders.length === 0) return blockNo.push(null);
      if (!g.combinedWithPrev || n === 0) n += 1;
      blockNo.push(n);
    });
    const out: WaveView[] = [];
    groups.forEach((group, gi) => {
      const no = blockNo[gi];
      const last = out[out.length - 1];
      if (no != null && last && last.no === no) last.blocks.push({ gi, group });
      else out.push({ no, blocks: [{ gi, group }], key: `w-${gi}` });
    });
    // Stable-ish key from the first rider present, so collapse survives edits.
    for (const w of out) {
      const firstRider = w.blocks.flatMap((b) => b.group.riders)[0];
      if (firstRider) w.key = `r-${firstRider.playerId}`;
    }
    return out;
  }, [groups]);

  const minsFor = (cat: string) => sched.minutesPerWaveByCategory?.[cat] ?? sched.minutesPerWave;

  // --- interleave waves + breaks with cumulative start times ---
  const breaksByWave = useMemo(() => {
    const m = new Map<number, { i: number; afterWave: number; minutes: number; label?: string }[]>();
    (sched.breaks ?? []).forEach((b, i) => {
      const arr = m.get(b.afterWave) ?? [];
      arr.push({ ...b, i });
      m.set(b.afterWave, arr);
    });
    return m;
  }, [sched.breaks]);

  type Item =
    | { kind: "wave"; wave: WaveView; time: string | null }
    | { kind: "break"; i: number; afterWave: number; minutes: number; label?: string; time: string };
  const items: Item[] = [];
  {
    let offset = 0;
    for (const wave of waves) {
      const leadCat = wave.blocks[0].group.categoryLabel;
      items.push({ kind: "wave", wave, time: wave.no != null ? fmtTime(sched.startTime, offset) : null });
      if (wave.no != null) {
        offset += minsFor(leadCat);
        for (const b of breaksByWave.get(wave.no) ?? []) {
          items.push({ kind: "break", time: fmtTime(sched.startTime, offset), ...b });
          offset += b.minutes;
        }
      }
    }
    // Breaks pointing past the last wave still show.
    const lastNo = waves.reduce((mx, w) => Math.max(mx, w.no ?? 0), 0);
    for (const [aw, bs] of [...breaksByWave.entries()].sort((a, b) => a[0] - b[0])) {
      if (aw <= lastNo) continue;
      for (const b of bs) {
        items.push({ kind: "break", time: fmtTime(sched.startTime, offset), ...b });
        offset += b.minutes;
      }
    }
  }

  // --- operations ---
  function moveRider(srcGi: number, riderIdx: number, target: WaveView | "new") {
    const next = clone();
    const [moved] = next[srcGi].riders.splice(riderIdx, 1);
    if (target === "new") {
      next.push({ categoryLabel: moved.categoryLabel!, riders: [moved], combinedWithPrev: false });
    } else {
      // Merge into a same-category block in the target wave, else add a combined block.
      const sameCat = target.blocks.find((b) => b.group.categoryLabel === moved.categoryLabel);
      if (sameCat) {
        next[sameCat.gi].riders.push(moved);
      } else {
        const afterGi = target.blocks[target.blocks.length - 1].gi;
        next.splice(afterGi + 1, 0, {
          categoryLabel: moved.categoryLabel!,
          riders: [moved],
          combinedWithPrev: true,
        });
      }
    }
    commit(next);
  }

  function combineUp(wave: WaveView) {
    const next = clone();
    next[wave.blocks[0].gi].combinedWithPrev = true; // share the previous wave's number
    commit(next);
  }
  function splitApart(wave: WaveView) {
    const next = clone();
    for (const b of wave.blocks) next[b.gi].combinedWithPrev = false;
    commit(next);
  }
  function splitBlock(gi: number) {
    const next = clone();
    const parts = splitEvenly(next[gi].riders, 2).map((rs, k) => ({
      categoryLabel: next[gi].categoryLabel,
      riders: rs,
      combinedWithPrev: k > 0 ? false : next[gi].combinedWithPrev,
    }));
    next.splice(gi, 1, ...parts);
    commit(next);
  }
  function removeWave(wave: WaveView) {
    const next = clone();
    const gis = wave.blocks.map((b) => b.gi).sort((a, b) => b - a);
    for (const gi of gis) {
      const { categoryLabel, riders: moving } = next[gi];
      if (moving.length > 0) {
        const dest = next.find((g, i) => i !== gi && g.categoryLabel === categoryLabel && g.riders.length > 0);
        if (!dest) continue; // can't strand riders — guarded in UI
        dest.riders.push(...moving);
      }
      next.splice(gi, 1);
    }
    commit(next);
  }
  function addEmptyWave() {
    const cat = categories[0];
    if (!cat) return;
    commit([...clone(), { categoryLabel: cat.label, riders: [], combinedWithPrev: false }]);
  }

  // --- schedule edits ---
  function setStartTime(v: string) {
    onScheduleChange({ ...sched, startTime: v || "09:30" });
  }
  function setCatMinutes(cat: string, v: string) {
    const map = { ...(sched.minutesPerWaveByCategory ?? {}) };
    if (v.trim() === "") delete map[cat];
    else map[cat] = Math.max(1, Number(v) || 1);
    onScheduleChange({ ...sched, minutesPerWaveByCategory: Object.keys(map).length ? map : undefined });
  }
  function setBreak(i: number, patch: Partial<{ afterWave: number; minutes: number; label: string }>) {
    const breaks = (sched.breaks ?? []).map((b, j) => (i === j ? { ...b, ...patch } : b));
    onScheduleChange({ ...sched, breaks });
  }
  function addBreak() {
    const lastNo = waves.reduce((mx, w) => Math.max(mx, w.no ?? 0), 0) || 1;
    onScheduleChange({ ...sched, breaks: [...(sched.breaks ?? []), { afterWave: lastNo, minutes: 15, label: "" }] });
  }
  function removeBreak(i: number) {
    onScheduleChange({ ...sched, breaks: (sched.breaks ?? []).filter((_, j) => j !== i) });
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        No categorized riders yet. Assign categories in the table view, then manage waves here.
      </p>
    );
  }

  const numberedWaves = waves.filter((w) => w.no != null).length;
  const totalRiders = groups.reduce((n, g) => n + g.riders.length, 0);
  const lastTime = items.length ? items[items.length - 1] : null;
  const btn = "rounded border border-border bg-surface-2 px-2 py-1 text-xs font-semibold hover:border-brand-strong";
  const mini = "rounded border border-border bg-surface px-2 py-0.5 text-xs font-semibold hover:border-brand-strong";

  return (
    <div className="space-y-3">
      {/* toolbar: schedule start + bulk collapse + add */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-muted">
          First wave start{" "}
          <input
            type="time"
            value={sched.startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="ml-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <button className={btn} onClick={addBreak}>+ Add break</button>
          <button className={btn} onClick={() => setCollapsed(new Set(waves.map((w) => w.key)))}>Collapse all</button>
          <button className={btn} onClick={() => setCollapsed(new Set())}>Expand all</button>
          <button className={btn} onClick={addEmptyWave}>+ Add wave</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{numberedWaves} waves · {totalRiders} riders</span>
        <span>min/wave blank = default {sched.minutesPerWave}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        {items.map((item, idx) => {
          if (item.kind === "break") {
            return (
              <div key={`brk-${item.i}`} className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/60 px-4 py-2 text-sm" style={{ borderLeft: "3px solid var(--accent)" }}>
                <span className="text-muted">☕ Break</span>
                <input
                  value={item.label ?? ""}
                  placeholder="Label (e.g. Lunch)"
                  onChange={(e) => setBreak(item.i, { label: e.target.value })}
                  className="rounded border border-border bg-background px-2 py-0.5 text-sm text-foreground"
                />
                <input
                  type="number"
                  min={1}
                  value={item.minutes}
                  onChange={(e) => setBreak(item.i, { minutes: Number(e.target.value) || 1 })}
                  className="w-16 rounded border border-border bg-background px-2 py-0.5 text-sm text-foreground"
                />
                <span className="text-muted">min · after Wave {item.afterWave} · {item.time}</span>
                <button className={`${mini} ml-auto`} onClick={() => removeBreak(item.i)} title="Remove break">✕</button>
              </div>
            );
          }

          const wave = item.wave;
          const isCollapsed = collapsed.has(wave.key);
          const combined = wave.blocks.length > 1;
          const leadCat = wave.blocks[0].group.categoryLabel;
          const count = wave.blocks.reduce((n, b) => n + b.group.riders.length, 0);
          const over = wave.blocks.some((b) => {
            const max = catDefs.get(b.group.categoryLabel)?.maxSize;
            return max != null && b.group.riders.length > max;
          });
          const singleMax = !combined ? catDefs.get(leadCat)?.maxSize : undefined;
          const catLabel = combined ? wave.blocks.map((b) => b.group.categoryLabel).join(" + ") : leadCat;
          const isFirstWave = idx === 0 || !items.slice(0, idx).some((it) => it.kind === "wave" && it.wave.no != null);
          const canDrop = drag != null && drag.gi !== -1;

          return (
            <div
              key={wave.key}
              className={`border-t border-border first:border-t-0 ${combined ? "ring-1 ring-inset ring-brand-strong/40" : ""}`}
            >
              <div
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 ${dragOver === idx && canDrop ? "bg-brand-deep/40" : ""}`}
                onDragOver={(e) => {
                  if (!canDrop) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== idx) setDragOver(idx);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((d) => (d === idx ? null : d));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag) moveRider(drag.gi, drag.idx, wave);
                  setDrag(null);
                  setDragOver(null);
                }}
              >
                <button className="text-muted" onClick={() => toggleCollapse(wave.key)} title={isCollapsed ? "Expand" : "Collapse"}>
                  {isCollapsed ? "▸" : "▾"}
                </button>
                <span className={`text-sm font-bold ${combined ? "text-brand-strong" : "text-foreground"}`}>
                  {wave.no != null ? `Wave ${wave.no}` : "New wave"}
                </span>
                {item.time && <span className="text-xs text-muted">{item.time}</span>}
                <span className="text-sm">{catLabel}{combined ? " · combined" : ""}</span>
                <span className={`text-xs ${over ? "text-warning" : "text-muted"}`}>
                  {count}{singleMax != null ? `/${singleMax}` : ""} {over ? "⚠ over max" : count > 0 ? "✓" : ""}
                </span>
                <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                  min/wave
                  <input
                    type="number"
                    min={1}
                    value={sched.minutesPerWaveByCategory?.[leadCat] ?? ""}
                    placeholder={String(sched.minutesPerWave)}
                    onChange={(e) => setCatMinutes(leadCat, e.target.value)}
                    className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right text-foreground"
                  />
                </label>
                <span className="flex gap-1.5">
                  {!isFirstWave && !combined && (
                    <button className={`${mini} border-accent text-accent`} onClick={() => combineUp(wave)} title="Merge this wave into the one above">↑ Combine up</button>
                  )}
                  {combined && (
                    <button className={`${mini} border-accent text-accent`} onClick={() => splitApart(wave)} title="Split this combined wave back into separate waves">⤢ Split apart</button>
                  )}
                  {!combined && wave.blocks[0].group.riders.length > 1 && (
                    <button className={mini} onClick={() => splitBlock(wave.blocks[0].gi)}>Split</button>
                  )}
                  <button className={mini} onClick={() => removeWave(wave)} title="Remove this wave">Remove</button>
                </span>
              </div>

              {!isCollapsed && (
                <div className="px-4 pb-3 pl-10">
                  {wave.blocks.map((b, bi) => (
                    <div key={b.gi}>
                      {combined && (
                        <div className={`text-xs font-bold uppercase tracking-wide text-muted ${bi > 0 ? "mt-3 border-t border-dashed border-accent pt-3" : "mb-1"}`}>
                          {b.group.categoryLabel} — {b.group.riders.length}
                        </div>
                      )}
                      {b.group.riders.length === 0 ? (
                        <p className="text-xs text-muted">Drag riders here from another wave.</p>
                      ) : (
                        <ul className="space-y-1">
                          {b.group.riders.map((r, ri) => (
                            <li
                              key={`${r.playerId}-${ri}`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", `${b.gi}:${ri}`);
                                setDrag({ gi: b.gi, idx: ri });
                              }}
                              onDragEnd={() => { setDrag(null); setDragOver(null); }}
                              className={`flex cursor-grab items-center justify-between gap-3 rounded px-1 text-sm active:cursor-grabbing ${drag?.gi === b.gi && drag?.idx === ri ? "opacity-40" : "hover:bg-surface-2"}`}
                            >
                              <span className="text-foreground">
                                <span className="mr-1.5 text-muted" aria-hidden>⠿</span>
                                {r.lastName}, {r.firstName}
                                <span className="ml-2 text-xs text-muted">
                                  {r.bib != null && r.bib !== "" ? `#${r.bib}` : "no bib"}
                                  {` · ${String(r.gender) || "?"} · age ${r.ageOnRaceDay ?? "—"}`}
                                  {r.seedLevel != null && ` · seed ${r.seedLevel}`}
                                </span>
                              </span>
                              <select
                                className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted hover:border-border focus:border-brand-strong focus:outline-none"
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "") return;
                                  moveRider(b.gi, ri, v === "new" ? "new" : waves.find((w) => w.key === v)!);
                                  e.target.value = "";
                                }}
                              >
                                <option value="">Move to…</option>
                                {waves.filter((w) => w.key !== wave.key).map((w) => (
                                  <option key={w.key} value={w.key}>
                                    {w.no != null ? `Wave ${w.no} (${w.blocks.map((bb) => bb.group.categoryLabel).join(" + ")})` : "New (empty) wave"}
                                  </option>
                                ))}
                                <option value="new">+ New wave</option>
                              </select>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lastTime && (
        <p className="text-xs text-muted">
          Start times cascade from the first-wave start, each wave’s min/wave, and any breaks.
        </p>
      )}
    </div>
  );
}
