"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewProjectForm({ races }: { races: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [raceSlug, setRaceSlug] = useState(races[0]?.slug ?? "");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultName = () => {
    const race = races.find((r) => r.slug === raceSlug);
    return race ? `${race.name} ${season}` : "";
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raceSlug, season, name: name.trim() || defaultName() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create project");
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setSubmitting(false);
    }
  }

  const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground";
  const label = "block text-sm font-semibold text-muted mb-1";

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label className={label} htmlFor="race">Race</label>
        <select id="race" className={field} value={raceSlug} onChange={(e) => setRaceSlug(e.target.value)}>
          {races.map((r) => (
            <option key={r.slug} value={r.slug}>{r.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="season">Season</label>
        <input id="season" className={field} value={season} onChange={(e) => setSeason(e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="name">Project name</label>
        <input
          id="name"
          className={field}
          placeholder={defaultName()}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {error && <p className="text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !raceSlug}
        className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-brand-strong disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
