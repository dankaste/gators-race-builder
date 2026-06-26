"use client";

import { useMemo, useState } from "react";
import { matchCategory } from "@/lib/engine/categorize";
import type { RaceEvent } from "@/lib/engine/models";

/** Director-entered fields for a manual rider; the parent adds the id + placement. */
export interface AddRiderFields {
  firstName: string;
  lastName: string;
  gender: string;
  age: number | null;
  bib: number | string | null;
  categoryLabel?: string | null;
  cup?: string;
  character?: string;
}

const labelCls = "block text-sm font-semibold text-muted mb-1";
const fieldCls =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand-strong focus:outline-none";

/**
 * Inline "add a rider" form for riders not in the PlayMetrics export. Renders a
 * category picker for individual events (pre-filled from the same matchCategory
 * the import uses) or cup/character pickers for relay events.
 */
export function AddRiderForm({
  variant,
  event,
  onAdd,
  onCancel,
}: {
  variant: "individual" | "relay";
  event: RaceEvent;
  onAdd: (fields: AddRiderFields) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("F");
  const [ageStr, setAgeStr] = useState("");
  const [bibStr, setBibStr] = useState("");

  const age = ageStr.trim() === "" ? null : Number(ageStr);

  // Individual: suggested category from age + gender (no package, like a manual entry).
  const suggested = useMemo(
    () =>
      variant === "individual"
        ? matchCategory({ gender, ageOnRaceDay: age, packageName: "" }, event.categories)?.label ?? ""
        : "",
    [variant, gender, age, event.categories],
  );
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const effCategory = categoryTouched ? categoryLabel : suggested;

  // Relay: cup/character pickers default to the first configured slot.
  const cups = event.relay?.cups ?? [];
  const characters = event.relay?.characters ?? [];
  const [cup, setCup] = useState(cups[0] ?? "");
  const [character, setCharacter] = useState(characters[0] ?? "");

  const canAdd = firstName.trim() !== "" && lastName.trim() !== "";

  function submit() {
    if (!canAdd) return;
    onAdd({
      firstName,
      lastName,
      gender,
      age: age != null && Number.isFinite(age) ? age : null,
      bib: bibStr.trim() === "" ? null : bibStr.trim(),
      categoryLabel: variant === "individual" ? effCategory || null : undefined,
      cup: variant === "relay" ? cup : undefined,
      character: variant === "relay" ? character : undefined,
    });
  }

  const distanceOf = (label: string) => event.categories.find((c) => c.label === label)?.distanceLabel;

  return (
    <div className="rounded-xl border border-brand-deep bg-surface p-5">
      <h2 className="text-base font-bold text-foreground">Add a rider manually</h2>
      <p className="mt-1 text-sm text-muted">
        Walk-ups and paper registrations. Enter the age and we suggest a category just like the import — you can override anything.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls}>First name *</label>
          <input className={fieldCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Last name *</label>
          <input className={fieldCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Gender *</label>
          <select className={fieldCls} value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="F">F</option>
            <option value="M">M</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Age on race day</label>
          <input
            className={fieldCls}
            type="number"
            min={1}
            value={ageStr}
            onChange={(e) => setAgeStr(e.target.value)}
            placeholder="e.g. 9"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelCls}>Bib</label>
          <input className={fieldCls} value={bibStr} onChange={(e) => setBibStr(e.target.value)} placeholder="optional" />
        </div>

        {variant === "individual" ? (
          <div>
            <label className={labelCls}>Category</label>
            <select
              className={fieldCls}
              value={effCategory}
              onChange={(e) => {
                setCategoryTouched(true);
                setCategoryLabel(e.target.value);
              }}
            >
              <option value="">— none —</option>
              {event.categories.map((c) => (
                <option key={c.label} value={c.label}>
                  {c.label} · {c.distanceLabel}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Cup</label>
              <select className={fieldCls} value={cup} onChange={(e) => setCup(e.target.value)}>
                {cups.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Character team</label>
              <select className={fieldCls} value={character} onChange={(e) => setCharacter(e.target.value)}>
                {characters.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted sm:col-span-2 lg:col-span-1">
          {variant === "individual" ? (
            effCategory ? (
              <>
                <span className="font-semibold text-brand-strong">{effCategory}</span>
                {distanceOf(effCategory) && <> · {distanceOf(effCategory)}</>}. Joins that category&apos;s last wave —
                move it in Manage waves or Re-suggest.
              </>
            ) : (
              <>No category — pick one above, or the rider stays uncategorized and won&apos;t export.</>
            )
          ) : (
            <>
              Joins <span className="font-semibold text-brand-strong">{cup || "—"} · {character || "—"}</span>;
              leg order is renumbered automatically.
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canAdd}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          Add rider
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-muted">Saved with the rest of the roster.</span>
      </div>
    </div>
  );
}
