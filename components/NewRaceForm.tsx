"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function NewRaceForm({ races }: { races: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [sourceSlug, setSourceSlug] = useState(races[0]?.slug ?? "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/races", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceSlug, slug: effectiveSlug, name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Failed to create race");
      }
      const created = await res.json();
      router.push(`/config/${created.slug}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create race");
      setSubmitting(false);
    }
  }

  const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground";
  const label = "block text-sm font-semibold text-muted mb-1";

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label className={label} htmlFor="source">Copy from</label>
        <select id="source" className={field} value={sourceSlug} onChange={(e) => setSourceSlug(e.target.value)}>
          {races.map((r) => (
            <option key={r.slug} value={r.slug}>{r.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="name">New race name</label>
        <input id="name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fall Classic" />
      </div>
      <div>
        <label className={label} htmlFor="slug">Slug (URL id, can&rsquo;t change later)</label>
        <input
          id="slug"
          className={field}
          value={effectiveSlug}
          onChange={(e) => { setSlug(slugify(e.target.value)); setSlugEdited(true); }}
          placeholder="fall-classic"
        />
      </div>
      {error && <p className="text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name.trim() || !effectiveSlug}
        className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create & edit"}
      </button>
    </form>
  );
}
