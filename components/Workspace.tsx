"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectState, RaceConfig, Rider, ScheduleConfig } from "@/lib/engine/models";
import { IndividualReview } from "./IndividualReview";
import { RelayBuilder } from "./RelayBuilder";

type SaveState = "idle" | "saving" | "saved" | "error";

export function Workspace({
  projectId,
  config,
  initialState,
  highestBib,
}: {
  projectId: string;
  config: RaceConfig;
  initialState: ProjectState;
  highestBib: number;
}) {
  const [raceDate, setRaceDate] = useState(initialState.raceDate ?? config.raceDate ?? "");
  const [eventsState, setEventsState] = useState<Record<string, Rider[]>>(() => {
    const m: Record<string, Rider[]> = {};
    for (const e of config.events) m[e.id] = initialState.events?.[e.id]?.riders ?? [];
    return m;
  });
  // Per-event wave schedule (start time, default + per-category minutes, breaks).
  // Seeded from the saved project state, falling back to the race template default.
  const [schedulesState, setSchedulesState] = useState<Record<string, ScheduleConfig | undefined>>(() => {
    const m: Record<string, ScheduleConfig | undefined> = {};
    for (const e of config.events) m[e.id] = initialState.events?.[e.id]?.schedule ?? e.schedule;
    return m;
  });
  const [activeId, setActiveId] = useState(config.events[0]?.id);
  const [save, setSave] = useState<SaveState>("idle");
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSave("saving");
    const handle = setTimeout(async () => {
      const events = Object.fromEntries(
        Object.entries(eventsState).map(([id, riders]) => [id, { riders, schedule: schedulesState[id] }]),
      );
      const anyRiders = Object.values(eventsState).some((r) => r.length > 0);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            state: { raceDate, events } satisfies ProjectState,
            status: anyRiders ? "review" : "draft",
          }),
        });
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [eventsState, schedulesState, raceDate, projectId]);

  const setEventRiders = useCallback((eventId: string, riders: Rider[]) => {
    setEventsState((prev) => ({ ...prev, [eventId]: riders }));
  }, []);

  const setEventSchedule = useCallback((eventId: string, schedule: ScheduleConfig) => {
    setSchedulesState((prev) => ({ ...prev, [eventId]: schedule }));
  }, []);

  const activeEvent = config.events.find((e) => e.id === activeId) ?? config.events[0];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-semibold text-muted">
          Race date{" "}
          <input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="ml-1 rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
          />
        </label>
        <span className="ml-auto text-sm text-muted">
          {save === "saving" && "Saving…"}
          {save === "saved" && "All changes saved"}
          {save === "error" && <span className="text-danger">Save failed</span>}
        </span>
      </div>

      {config.events.length > 1 && (
        <div className="mt-4 flex gap-2 border-b border-border">
          {config.events.map((e) => (
            <button
              key={e.id}
              onClick={() => setActiveId(e.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${
                e.id === activeEvent.id
                  ? "border-brand-strong text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {e.name}
              <span className="ml-1 text-xs text-muted">({e.type})</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {activeEvent.type === "relay" ? (
          <RelayBuilder
            event={activeEvent}
            slug={config.slug}
            raceDate={raceDate}
            riders={eventsState[activeEvent.id] ?? []}
            onChange={(r) => setEventRiders(activeEvent.id, r)}
          />
        ) : (
          <IndividualReview
            event={activeEvent}
            slug={config.slug}
            raceDate={raceDate}
            riders={eventsState[activeEvent.id] ?? []}
            onChange={(r) => setEventRiders(activeEvent.id, r)}
            schedule={schedulesState[activeEvent.id]}
            onScheduleChange={(s) => setEventSchedule(activeEvent.id, s)}
            highestBib={highestBib}
          />
        )}
      </div>
    </div>
  );
}
