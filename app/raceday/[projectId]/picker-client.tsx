"use client";

import Link from "next/link";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";

const STATIONS = [
  { slug: "checkin", label: "Check-in", icon: "🖊️" },
  { slug: "start", label: "Start line", icon: "🏁" },
  { slug: "finish-combined", label: "Finish line", icon: "⏱️" },
  { slug: "finish-camera", label: "Finish — camera", icon: "🎥" },
  { slug: "course", label: "Course watch", icon: "🚑" },
  { slug: "podium", label: "Podium", icon: "🏆" },
];

/**
 * Fallback entry point — not the primary way in (coaches normally get a
 * direct pre-authed link per station). Useful for a spare device or a lost
 * link: paste the project link with `?token=`, then pick a station.
 */
export function PickerClient({ projectId }: { projectId: string }) {
  const token = useRaceDayToken(projectId);

  if (!token) {
    return (
      <div className="mx-auto max-w-sm p-6 text-center text-sm text-muted">
        Open this page with the link a director shared with you (it includes <code>?token=</code>).
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-2 p-6">
      <h1 className="mb-2 text-center text-lg font-bold text-foreground">Pick your station</h1>
      {STATIONS.map((s) => (
        <Link
          key={s.slug}
          href={`/raceday/${projectId}/${s.slug}?token=${encodeURIComponent(token)}`}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground hover:border-brand-strong"
        >
          <span>{s.icon}</span>
          {s.label}
        </Link>
      ))}
    </div>
  );
}
