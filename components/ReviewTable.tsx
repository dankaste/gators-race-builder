"use client";

import { useMemo, useState } from "react";
import type { CategoryDef, Rider } from "@/lib/engine/models";

type SortKey = "wave" | "name" | "category" | "seed" | "bib";

/** Strip case + diacritics so search is forgiving ("nuñez" matches "nunez"). */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Every whitespace-separated token must appear in the rider's name. */
function nameMatches(query: string, r: Rider): boolean {
  const q = norm(query).trim();
  if (!q) return true;
  const target = norm(`${r.lastName} ${r.firstName}`);
  return q.split(/\s+/).every((tok) => target.includes(tok));
}

/** Sort rank for a bib: numeric first (ascending), then other strings, blanks last. */
function bibRank(bib: number | string | null): [number, number, string] {
  if (bib == null || bib === "") return [2, 0, ""];
  const s = String(bib);
  if (/^\d+$/.test(s)) return [0, Number(s), ""];
  return [1, 0, s.toLowerCase()];
}
function bibCmp(a: Rider, b: Rider): number {
  const [ta, na, sa] = bibRank(a.bib);
  const [tb, nb, sb] = bibRank(b.bib);
  return ta - tb || na - nb || sa.localeCompare(sb);
}

export function ReviewTable({
  riders,
  categories,
  onEdit,
}: {
  riders: Rider[];
  categories: CategoryDef[];
  onEdit: (index: number, patch: Partial<Rider>) => void;
}) {
  const [sort, setSort] = useState<SortKey>("wave");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const indexed = riders.map((r, i) => ({ r, i })).filter(({ r }) => nameMatches(query, r));
    const cmp: Record<SortKey, (a: { r: Rider }, b: { r: Rider }) => number> = {
      wave: (a, b) => (a.r.wave ?? 1e9) - (b.r.wave ?? 1e9),
      seed: (a, b) => (a.r.seedLevel ?? 1e9) - (b.r.seedLevel ?? 1e9),
      name: (a, b) => a.r.lastName.localeCompare(b.r.lastName),
      category: (a, b) => (a.r.categoryLabel ?? "").localeCompare(b.r.categoryLabel ?? ""),
      bib: (a, b) => bibCmp(a.r, b.r),
    };
    return [...indexed].sort(cmp[sort]);
  }, [riders, sort, query]);

  function changeCategory(index: number, label: string) {
    const cat = categories.find((c) => c.label === label);
    onEdit(index, {
      categoryLabel: label || null,
      distanceLabel: cat?.distanceLabel ?? null,
    });
  }

  const th = "px-3 py-2 font-semibold text-left whitespace-nowrap";
  const td = "px-3 py-1.5 align-middle";
  const input =
    "w-full bg-transparent rounded border border-transparent px-1 py-0.5 hover:border-border focus:border-brand-strong focus:outline-none";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name…"
          className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-brand-strong focus:outline-none"
        />
        {query && (
          <span className="text-xs text-muted">
            {rows.length} of {riders.length}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              {(["wave", "name", "category", "seed", "bib"] as SortKey[]).map((k) => (
                <th key={k} className={`${th} cursor-pointer`} onClick={() => setSort(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                  {sort === k ? " ↓" : ""}
                </th>
              ))}
              <th className={th}>Gender</th>
              <th className={th}>Age</th>
              <th className={th}>Distance</th>
              <th className={th}>Flags</th>
            </tr>
          </thead>
        <tbody>
          {rows.map(({ r, i }) => {
            const problem = r.warnings.length > 0 || !r.categoryLabel || r.bib == null || r.bib === "";
            return (
              <tr key={`${r.playerId}-${i}`} className={i % 2 ? "bg-surface" : "bg-background"}>
                <td className={`${td} w-16`}>
                  <input
                    type="number"
                    className={input}
                    value={r.wave ?? ""}
                    onChange={(e) => onEdit(i, { wave: e.target.value ? Number(e.target.value) : null })}
                  />
                </td>
                <td className={`${td} font-medium text-foreground whitespace-nowrap`}>
                  {r.lastName}, {r.firstName}
                </td>
                <td className={td}>
                  <select
                    className={input}
                    value={r.categoryLabel ?? ""}
                    onChange={(e) => changeCategory(i, e.target.value)}
                  >
                    <option value="">— none —</option>
                    {categories.map((c) => (
                      <option key={c.label} value={c.label}>{c.label}</option>
                    ))}
                  </select>
                </td>
                <td className={`${td} text-muted`}>{r.seedLevel ?? "—"}</td>
                <td className={`${td} w-20`}>
                  <input
                    className={input}
                    value={r.bib ?? ""}
                    onChange={(e) => onEdit(i, { bib: e.target.value || null })}
                  />
                </td>
                <td className={`${td} text-muted`}>{String(r.gender)}</td>
                <td className={`${td} text-muted`}>{r.ageOnRaceDay ?? "—"}</td>
                <td className={`${td} text-muted whitespace-nowrap`}>{r.distanceLabel ?? "—"}</td>
                <td className={td} title={r.warnings.join("; ")}>
                  {problem ? <span className="text-warning">⚠</span> : <span className="text-brand-strong">✓</span>}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
