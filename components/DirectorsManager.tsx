"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Director } from "@/db/schema";

export function DirectorsManager({
  initial,
  bootstrapEmails,
  currentEmail,
}: {
  initial: Director[];
  bootstrapEmails: string[];
  currentEmail: string;
}) {
  const router = useRouter();
  const [directors, setDirectors] = useState(initial);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/directors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not add director.");
        return;
      }
      setEmail("");
      setDirectors((prev) =>
        prev.some((d) => d.email === data.email) ? prev : [...prev, data].sort((a, b) => a.email.localeCompare(b.email)),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    if (!confirm(`Remove ${target} from the director allowlist?`)) return;
    setError(null);
    const res = await fetch(`/api/directors/${encodeURIComponent(target)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Could not remove director.");
      return;
    }
    setDirectors((prev) => prev.filter((d) => d.email !== target));
    router.refresh();
  }

  return (
    <div className="mt-8">
      <form onSubmit={add} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="director@example.com"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-foreground transition-colors hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add director"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {directors.map((d) => {
          const isBootstrap = bootstrapEmails.includes(d.email);
          return (
            <li key={d.email} className="flex items-center justify-between px-5 py-3">
              <div>
                <span className="font-medium text-foreground">{d.email}</span>
                {d.email === currentEmail && <span className="ml-2 text-xs text-muted">(you)</span>}
                {isBootstrap && (
                  <span className="ml-2 rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">bootstrap</span>
                )}
              </div>
              {isBootstrap ? (
                <span className="text-xs text-muted" title="Set via DIRECTOR_BOOTSTRAP">
                  managed by env
                </span>
              ) : (
                <button onClick={() => remove(d.email)} className="text-sm text-muted hover:text-danger">
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
