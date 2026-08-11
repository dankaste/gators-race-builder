"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RaceHistoryImport } from "@/db/schema";
import { parseHistoryCsv } from "@/lib/engine/history";
import { ConfirmButton } from "./ConfirmButton";

/** Import/replace/clear the persisted multi-season history used to estimate relay lap times. Mirrors DirectorsManager's shape. */
export function RaceHistoryManager({ initial }: { initial: RaceHistoryImport | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const rows = parseHistoryCsv(await file.text());
      if (rows.length === 0) {
        setError("No rows found in that file.");
        return;
      }
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not import.");
        return;
      }
      setCurrent(data.current);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse/import that file.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setError(null);
    const res = await fetch("/api/history", { method: "DELETE" });
    if (!res.ok) {
      setError("Could not clear history.");
      return;
    }
    setCurrent(null);
    router.refresh();
  }

  return (
    <div className="mt-8">
      {current ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-foreground">
            <span className="font-semibold">{current.filename}</span> — {current.rowCount.toLocaleString()} rows
          </p>
          <p className="mt-1 text-sm text-muted">
            Imported {new Date(current.importedAt).toLocaleString()}
            {current.importedByEmail ? ` by ${current.importedByEmail}` : ""}
          </p>
          <div className="mt-4">
            <ConfirmButton
              onConfirm={clear}
              prompt="Clear the imported history? Relay lap-time estimates will fall back to team-level seeding until a new file is imported."
              confirmLabel="Clear"
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-danger"
            >
              Clear history
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-5 text-muted">
          No history imported yet. Relay team-building will fall back to GBP team seeding until one is.
        </p>
      )}

      <form onSubmit={importFile} className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-muted">
          {current ? "Replace with a new export (CSV)" : "Import a WebScorer \"Rider History\" export (CSV)"}
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-brand-deep file:px-3 file:py-1.5 file:text-foreground"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
