"use client";

import { useMemo, useState } from "react";
import type { CategoryDef, Rider } from "@/lib/engine/models";
import {
  flattenWaveGroups,
  groupRidersIntoWaves,
  rebalanceCategoryWaves,
  splitEvenly,
  type WaveGroup,
} from "@/lib/engine/waves";

/**
 * Grouped, hands-on wave manager. Reconstructs the current layout from riders'
 * `wave` values, lets the director move riders between waves, add/remove a wave,
 * split an oversized wave, and rebalance a whole category — then projects the
 * edits back to contiguous global wave numbers via {@link flattenWaveGroups}.
 *
 * Local `groups` state is authoritative while mounted; `onChange` pushes the
 * flattened rider list up so validation/CSV/handouts stay live. It seeds from
 * props once on mount, so the parent re-mounts it (changing its React `key`) to
 * re-seed after a re-import or "Re-suggest waves".
 */
export function WaveEditor({
  riders,
  categories,
  onChange,
}: {
  riders: Rider[];
  categories: CategoryDef[];
  onChange: (riders: Rider[]) => void;
}) {
  // Uncategorized riders aren't shown here but must survive the round-trip.
  const [otherRiders] = useState<Rider[]>(() => riders.filter((r) => !r.categoryLabel));
  const [groups, setGroups] = useState<WaveGroup[]>(() =>
    groupRidersIntoWaves(riders, categories),
  );
  // Native drag-and-drop (desktop). Touch falls back to the "Move to…" select.
  const [drag, setDrag] = useState<{ gi: number; idx: number; label: string } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const catDefs = useMemo(
    () => new Map(categories.map((c) => [c.label, c])),
    [categories],
  );

  function commit(next: WaveGroup[]) {
    setGroups(next);
    onChange(flattenWaveGroups(next, otherRiders));
  }

  // Display wave numbers: contiguous over non-empty groups, matching the export.
  const displayNum = useMemo(() => {
    const m = new Map<number, number>();
    let n = 0;
    groups.forEach((g, i) => {
      if (g.riders.length > 0) m.set(i, ++n);
    });
    return m;
  }, [groups]);

  // Category sections (groups are kept category-contiguous by grouping/flatten).
  const sections = useMemo(() => {
    const out: { label: string; indices: number[] }[] = [];
    groups.forEach((g, i) => {
      const last = out[out.length - 1];
      if (last && last.label === g.categoryLabel) last.indices.push(i);
      else out.push({ label: g.categoryLabel, indices: [i] });
    });
    return out;
  }, [groups]);

  function moveRider(srcGi: number, riderIdx: number, target: number | "new") {
    const next = groups.map((g) => ({ ...g, riders: g.riders.slice() }));
    const [moved] = next[srcGi].riders.splice(riderIdx, 1);
    if (target === "new") {
      // Insert a fresh wave right after the source category's last wave.
      const label = next[srcGi].categoryLabel;
      let insertAt = 0;
      next.forEach((g, i) => {
        if (g.categoryLabel === label) insertAt = i + 1;
      });
      next.splice(insertAt, 0, { categoryLabel: label, riders: [moved] });
    } else {
      next[target].riders.push(moved);
    }
    commit(next);
  }

  function addEmptyWave(label: string) {
    const next = groups.map((g) => ({ ...g, riders: g.riders.slice() }));
    let insertAt = next.length;
    next.forEach((g, i) => {
      if (g.categoryLabel === label) insertAt = i + 1;
    });
    next.splice(insertAt, 0, { categoryLabel: label, riders: [] });
    commit(next);
  }

  function removeWave(gi: number) {
    const next = groups.map((g) => ({ ...g, riders: g.riders.slice() }));
    const { categoryLabel: label, riders: moving } = next[gi];
    if (moving.length > 0) {
      // Merge into a sibling wave of the same category (previous, else next).
      const siblings = next
        .map((g, i) => ({ g, i }))
        .filter(({ g, i }) => g.categoryLabel === label && i !== gi);
      const prev = siblings.filter((s) => s.i < gi).pop();
      const dest = (prev ?? siblings[0])?.i;
      if (dest == null) return; // sole wave with riders — guarded in UI too
      next[dest].riders.push(...moving);
    }
    next.splice(gi, 1);
    commit(next);
  }

  function splitWave(gi: number) {
    const next = groups.map((g) => ({ ...g, riders: g.riders.slice() }));
    const label = next[gi].categoryLabel;
    const parts = splitEvenly(next[gi].riders, 2).map((riders) => ({
      categoryLabel: label,
      riders,
    }));
    next.splice(gi, 1, ...parts);
    commit(next);
  }

  function rebalanceCategory(label: string, indices: number[]) {
    const cat = catDefs.get(label);
    if (!cat) return;
    const all = indices.flatMap((i) => groups[i].riders);
    const fresh = rebalanceCategoryWaves(all, cat).map((riders) => ({
      categoryLabel: label,
      riders,
    }));
    const next = groups
      .slice(0, indices[0])
      .concat(fresh, groups.slice(indices[indices.length - 1] + 1));
    commit(next);
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        No categorized riders yet. Assign categories in the table view, then manage waves here.
      </p>
    );
  }

  const btn =
    "rounded border border-border bg-surface-2 px-2 py-1 text-xs font-semibold hover:border-brand-strong";

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        Drag riders between waves, or use the <span className="text-foreground">Move to…</span> menu on touch devices.
      </p>
      {sections.map((section) => {
        const cat = catDefs.get(section.label);
        const max = cat?.maxSize;
        const total = section.indices.reduce((n, i) => n + groups[i].riders.length, 0);
        const nonEmpty = section.indices.filter((i) => groups[i].riders.length > 0).length;
        return (
          <section key={section.label} className="rounded-xl border border-border bg-background">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2">
              <div className="text-sm font-bold text-foreground">
                {section.label}
                <span className="ml-2 font-normal text-muted">
                  {total} rider{total === 1 ? "" : "s"}
                  {max != null && ` · max ${max}/wave`}
                </span>
              </div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => addEmptyWave(section.label)}>
                  + Add wave
                </button>
                {cat && (
                  <button
                    className={btn}
                    onClick={() => rebalanceCategory(section.label, section.indices)}
                    title="Re-split this category evenly across waves"
                  >
                    Rebalance
                  </button>
                )}
              </div>
            </header>

            <div className="divide-y divide-border">
              {section.indices.map((gi) => {
                const group = groups[gi];
                const num = displayNum.get(gi);
                const over = max != null && group.riders.length > max;
                const soleWithRiders = nonEmpty <= 1 && group.riders.length > 0;
                // Move targets: other waves in this category, by display number.
                const targets = section.indices.filter((i) => i !== gi);
                const canDrop = drag != null && drag.label === group.categoryLabel && drag.gi !== gi;
                const activeDrop = canDrop && dragOver === gi;
                return (
                  <div
                    key={gi}
                    onDragOver={(e) => {
                      if (!canDrop) return; // no preventDefault → browser shows "no-drop"
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOver !== gi) setDragOver(gi);
                    }}
                    onDragLeave={(e) => {
                      // Ignore leaves into child nodes; only clear on real exit.
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((d) => (d === gi ? null : d));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag && canDrop) moveRider(drag.gi, drag.idx, gi);
                      setDrag(null);
                      setDragOver(null);
                    }}
                    className={`px-4 py-3 transition-colors ${
                      activeDrop ? "bg-brand-deep/40 ring-1 ring-inset ring-brand-strong" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {num != null ? (
                          <span className={over ? "text-warning" : "text-foreground"}>
                            Wave {num} — {group.riders.length}
                            {max != null && `/${max}`} {over ? "⚠ over max" : "✓"}
                          </span>
                        ) : (
                          <span className="text-muted">New wave — empty</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {group.riders.length > 1 && (
                          <button className={btn} onClick={() => splitWave(gi)}>
                            Split
                          </button>
                        )}
                        <button
                          className={`${btn} ${soleWithRiders ? "opacity-40" : ""}`}
                          disabled={soleWithRiders}
                          onClick={() => removeWave(gi)}
                          title={
                            soleWithRiders
                              ? "Can't remove the only wave holding riders"
                              : "Remove this wave (riders merge into a sibling)"
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {group.riders.length === 0 ? (
                      <p className="mt-2 text-xs text-muted">Move riders here from another wave.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {group.riders.map((r, ri) => (
                          <li
                            key={`${r.playerId}-${ri}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", `${gi}:${ri}`); // Firefox needs data
                              setDrag({ gi, idx: ri, label: group.categoryLabel });
                            }}
                            onDragEnd={() => {
                              setDrag(null);
                              setDragOver(null);
                            }}
                            className={`flex cursor-grab items-center justify-between gap-3 rounded px-1 text-sm active:cursor-grabbing ${
                              drag?.gi === gi && drag?.idx === ri ? "opacity-40" : "hover:bg-surface-2"
                            }`}
                          >
                            <span className="text-foreground">
                              <span className="mr-1.5 text-muted" aria-hidden>⠿</span>
                              {r.lastName}, {r.firstName}
                              <span className="ml-2 text-xs text-muted">
                                {r.bib != null && r.bib !== "" ? `#${r.bib}` : "no bib"}
                                {r.seedLevel != null && ` · seed ${r.seedLevel}`}
                              </span>
                            </span>
                            <select
                              className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted hover:border-border focus:border-brand-strong focus:outline-none"
                              value=""
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "") return;
                                moveRider(gi, ri, v === "new" ? "new" : Number(v));
                                e.target.value = "";
                              }}
                            >
                              <option value="">Move to…</option>
                              {targets.map((ti) => (
                                <option key={ti} value={ti}>
                                  {displayNum.get(ti) != null
                                    ? `Wave ${displayNum.get(ti)}`
                                    : "New (empty) wave"}
                                </option>
                              ))}
                              <option value="new">+ New wave</option>
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
