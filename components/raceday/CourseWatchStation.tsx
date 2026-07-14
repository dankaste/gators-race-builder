"use client";

import { useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";
import { computeRaceStatuses, type IncidentType } from "@/lib/engine/raceDay";
import type { RaceDaySnapshot } from "@/lib/raceday/snapshot";

const INCIDENT_TYPES: IncidentType[] = ["crash", "injury", "mechanical", "other"];

function CourseWatchBody({
  projectId,
  token,
  eventId,
  snapshot,
}: {
  projectId: string;
  token: string;
  eventId: string;
  snapshot: RaceDaySnapshot;
}) {
  const [reportFor, setReportFor] = useState<{ playerId: string | null; label: string } | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType>("crash");
  const [note, setNote] = useState("");

  const statuses = computeRaceStatuses(
    snapshot.roster,
    snapshot.waves,
    snapshot.startMarks,
    snapshot.finishResults,
    snapshot.dnfMarks,
  );
  const onCourse = snapshot.roster.filter((r) => statuses.get(r.playerId) === "started");
  const activeIncidentCount = snapshot.incident ? 1 : 0;

  // DNF'd riders otherwise vanish from "Still on course" with no trace —
  // surfaced here (most recent first) so a mis-tap is easy to spot and undo.
  const rosterByPlayer = new Map(snapshot.roster.map((r) => [r.playerId, r]));
  const dnfList = snapshot.dnfMarks
    .map((mark) => ({ mark, rider: rosterByPlayer.get(mark.playerId) }))
    .filter((x): x is { mark: (typeof snapshot.dnfMarks)[number]; rider: NonNullable<typeof x.rider> } => x.rider != null)
    .sort((a, b) => new Date(b.mark.markedAt).getTime() - new Date(a.mark.markedAt).getTime());

  async function sendReport() {
    await fetch(`/api/raceday/${projectId}/incidents`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        playerId: reportFor?.playerId ?? null,
        type: incidentType,
        note: note.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setReportFor(null);
    setNote("");
  }

  async function markDnf(playerId: string) {
    await fetch(`/api/raceday/${projectId}/dnf`, {
      method: "POST",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId, idempotencyKey: crypto.randomUUID() }),
    });
  }

  async function undoDnf(playerId: string) {
    await fetch(`/api/raceday/${projectId}/dnf`, {
      method: "DELETE",
      headers: { "x-raceday-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId }),
    });
  }

  async function resolve() {
    if (!snapshot.incident) return;
    await fetch(`/api/raceday/${projectId}/incidents/${snapshot.incident.id}/resolve`, {
      method: "POST",
      headers: { "x-raceday-token": token },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
          <div className="text-lg font-bold text-foreground">{onCourse.length}</div>
          <div className="text-xs text-muted">Still on course</div>
        </div>
        <div className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
          <div className="text-lg font-bold text-foreground">{activeIncidentCount}</div>
          <div className="text-xs text-muted">Active incidents</div>
        </div>
      </div>

      <button
        onClick={() => setReportFor({ playerId: null, label: "General / unspecified location" })}
        className="rounded-lg border border-danger px-3 py-2 text-sm font-semibold text-danger"
      >
        🚨 Report incident — rider unknown
      </button>

      {reportFor && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="text-xs font-bold text-muted">What happened? — {reportFor.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {INCIDENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setIncidentType(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  incidentType === t ? "bg-danger text-background" : "border border-border text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
            placeholder="Optional note (location, what you saw)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={sendReport} className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-background">
              Send alert to all stations
            </button>
            <button onClick={() => setReportFor(null)} className="text-xs text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-muted">Still on course</div>
      <div className="flex flex-col gap-1.5">
        {onCourse.map((r) => (
          <div key={r.playerId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm">
            <span className="w-10 shrink-0 font-bold text-brand-strong">{r.bib ?? "—"}</span>
            <span className="flex-1 truncate">{r.firstName} {r.lastName}</span>
            <button
              onClick={() => setReportFor({ playerId: r.playerId, label: `${r.firstName} ${r.lastName} · #${r.bib}` })}
              className="rounded-lg border border-border px-2 py-1 text-xs font-semibold"
            >
              Crash
            </button>
            <button onClick={() => markDnf(r.playerId)} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold">
              DNF
            </button>
          </div>
        ))}
        {onCourse.length === 0 && <p className="text-sm text-muted">Nobody currently out on course.</p>}
      </div>

      {dnfList.length > 0 && (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">DNF&rsquo;d ({dnfList.length})</div>
          <div className="flex flex-col gap-1.5">
            {dnfList.map(({ mark, rider }) => (
              <div key={mark.playerId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm">
                <span className="w-10 shrink-0 font-bold text-brand-strong">{rider.bib ?? "—"}</span>
                <span className="flex-1 truncate">{rider.firstName} {rider.lastName}</span>
                <span className="shrink-0 text-xs text-muted">{new Date(mark.markedAt).toLocaleTimeString()}</span>
                <button
                  onClick={() => undoDnf(mark.playerId)}
                  title="Reverse this DNF"
                  className="rounded-lg bg-brand/20 px-2 py-1 text-xs font-bold text-brand-strong"
                >
                  Undo
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {snapshot.incident && (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Incident log</div>
          <div className="flex items-center gap-2 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm">
            <span className="flex-1">🚑 {snapshot.incident.type}{snapshot.incident.note ? ` · ${snapshot.incident.note}` : ""}</span>
            <button onClick={resolve} className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-bold">
              Resolve
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function CourseWatchStation({ projectId }: { projectId: string }) {
  const token = useRaceDayToken(projectId);

  return (
    <StationShell projectId={projectId} title="Course watch">
      {(snapshot) =>
        token && snapshot.event ? (
          <CourseWatchBody projectId={projectId} token={token} eventId={snapshot.event.id} snapshot={snapshot} />
        ) : (
          <p className="text-sm text-muted">No event configured for this project.</p>
        )
      }
    </StationShell>
  );
}
