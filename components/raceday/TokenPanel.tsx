"use client";

import { useEffect, useState } from "react";

const STATIONS = [
  { slug: "checkin", label: "Check-in" },
  { slug: "start", label: "Start line" },
  { slug: "finish-combined", label: "Finish line" },
  { slug: "finish-camera", label: "Finish — camera" },
  { slug: "course", label: "Course watch" },
  { slug: "podium", label: "Podium" },
];

interface SyncStatus {
  online: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export function TokenPanel({ projectId }: { projectId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/raceday/${projectId}/token`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Couldn't load the access token (${r.status})`);
        setToken((await r.json()).token);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    fetch(`/api/raceday/${projectId}/sync`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Couldn't load sync status (${r.status})`))))
      .then(setSync)
      .catch(() => {}); // sync status is informational — a failure here shouldn't block the rest of the panel
  }, [projectId]);

  async function regenerate() {
    try {
      const res = await fetch(`/api/raceday/${projectId}/token/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Regenerate failed (${res.status})`);
      setToken((await res.json()).token);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/raceday/${projectId}/sync`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      const status = await fetch(`/api/raceday/${projectId}/sync`, { credentials: "include" });
      if (status.ok) setSync(await status.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  function stationUrl(slug: string): string {
    if (typeof window === "undefined" || !token) return "";
    return `${window.location.origin}/raceday/${projectId}/${slug}?token=${encodeURIComponent(token)}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${sync?.online ? "bg-brand" : "bg-warning"}`}
        />
        <div className="flex-1 text-sm">
          <div className="font-bold text-foreground">{sync?.online ? "Hub online" : "Hub offline"}</div>
          <div className="text-xs text-muted">
            {sync?.lastSyncedAt
              ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
              : "Not yet synced"}
            {sync?.lastSyncError && ` · ${sync.lastSyncError}`}
          </div>
        </div>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-background disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      <div>
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Access token</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs">
            {token ?? "…"}
          </code>
          <button
            onClick={regenerate}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-brand-strong"
          >
            ↻ Regenerate
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Regenerating invalidates every link below — share a fresh set before the next event.
        </p>
      </div>

      <div>
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Station links</div>
        <div className="flex flex-col gap-2">
          {STATIONS.map((s) => (
            <div key={s.slug} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <span className="w-32 shrink-0 text-sm font-semibold">{s.label}</span>
              <span className="flex-1 truncate text-xs text-muted">{stationUrl(s.slug)}</span>
              <button
                onClick={() => token && navigator.clipboard.writeText(stationUrl(s.slug))}
                className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs font-semibold"
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
