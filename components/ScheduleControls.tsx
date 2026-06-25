"use client";

import type { ScheduleConfig } from "@/lib/engine/models";

/**
 * Editor for an event's wave-timing schedule: first-wave start, minutes per
 * wave, and a list of fixed breaks. Presentational — used both in the race
 * template editor (persists defaults) and the race-day handout panel (per-run
 * overrides). The parent owns the value; this just emits the next one.
 */
export function ScheduleControls({
  value,
  onChange,
}: {
  value: ScheduleConfig;
  onChange: (next: ScheduleConfig) => void;
}) {
  const breaks = value.breaks ?? [];
  const input = "rounded border border-border bg-background px-2 py-1 text-sm text-foreground";

  function setBreak(i: number, patch: Partial<{ afterWave: number; minutes: number; label: string }>) {
    const next = breaks.map((b, j) => (i === j ? { ...b, ...patch } : b));
    onChange({ ...value, breaks: next });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-semibold text-muted">
          First wave start
          <input
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value || "09:30" })}
            className={`ml-2 ${input}`}
          />
        </label>
        <label className="text-sm font-semibold text-muted">
          Minutes per wave
          <input
            type="number"
            min={1}
            value={value.minutesPerWave}
            onChange={(e) => onChange({ ...value, minutesPerWave: Number(e.target.value) || 1 })}
            className={`ml-2 w-20 ${input}`}
          />
        </label>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Breaks</div>
        {breaks.length === 0 && (
          <p className="mt-1 text-xs text-muted">No breaks. Add one to pause the clock after a wave (e.g. lunch).</p>
        )}
        <ul className="mt-2 space-y-2">
          {breaks.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">After wave</span>
              <input
                type="number"
                min={1}
                value={b.afterWave}
                onChange={(e) => setBreak(i, { afterWave: Number(e.target.value) || 1 })}
                className={`w-16 ${input}`}
              />
              <input
                type="number"
                min={1}
                value={b.minutes}
                onChange={(e) => setBreak(i, { minutes: Number(e.target.value) || 1 })}
                className={`w-16 ${input}`}
              />
              <span className="text-muted">min</span>
              <input
                placeholder="Label (e.g. Lunch)"
                value={b.label ?? ""}
                onChange={(e) => setBreak(i, { label: e.target.value })}
                className={`w-44 ${input}`}
              />
              <button
                onClick={() => onChange({ ...value, breaks: breaks.filter((_, j) => j !== i) })}
                className="px-1 text-muted hover:text-danger"
                title="Remove break"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => {
            const after = breaks.length ? Math.max(...breaks.map((b) => b.afterWave)) + 1 : 1;
            onChange({ ...value, breaks: [...breaks, { afterWave: after, minutes: 15, label: "" }] });
          }}
          className="mt-2 text-sm font-semibold text-brand-strong hover:underline"
        >
          + Add break
        </button>
      </div>
    </div>
  );
}
