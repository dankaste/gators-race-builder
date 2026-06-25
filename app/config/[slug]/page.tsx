import Link from "next/link";
import { notFound } from "next/navigation";
import type { CategoryDef } from "@/lib/engine/models";
import { getRaceConfig } from "@/lib/raceConfigs";

export const dynamic = "force-dynamic";

function ageRange(cat: CategoryDef): string {
  if (cat.ages && cat.ages.length) return cat.ages.join(", ");
  const min = cat.ageMin ?? null;
  const max = cat.ageMax ?? null;
  if (min === null && max === null) return "any";
  if (max === null || max >= 18) return `${min ?? "?"}+`;
  if (min === null) return `≤${max}`;
  return min === max ? `${min}` : `${min}–${max}`;
}

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cfg = await getRaceConfig(slug);
  if (!cfg) notFound();

  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/config" className="text-sm text-muted hover:text-foreground">
        ← All races
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-foreground">{cfg.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/config/${slug}/edit`}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-strong"
          >
            Edit race →
          </Link>
          <Link
            href={`/config/${slug}/handouts`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-foreground hover:border-brand-strong"
          >
            Edit handout templates →
          </Link>
        </div>
      </div>

      {cfg.events.map((event) => (
        <section key={event.id} className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{event.name}</h2>
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold uppercase text-muted">
              {event.type}
            </span>
          </div>

          {event.type === "relay" && event.relay ? (
            <div className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm">
              <p className="text-muted">
                Riders are distributed across {event.relay.cups.length} cups into{" "}
                {event.relay.characters.length} character teams (~{event.relay.teamSize}{" "}
                riders each), honoring friend requests. Built in the relay builder.
              </p>
              <p className="mt-2">
                <span className="font-semibold text-foreground">Cups:</span>{" "}
                {event.relay.cups.join(" · ")}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Teams:</span>{" "}
                {event.relay.characters.join(", ")}
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Distance</th>
                    <th className="px-3 py-2 font-semibold">Gender</th>
                    <th className="px-3 py-2 font-semibold">Age</th>
                    <th className="px-3 py-2 font-semibold">Package</th>
                    <th className="px-3 py-2 font-semibold">Max</th>
                    <th className="px-3 py-2 font-semibold">Wave order</th>
                  </tr>
                </thead>
                <tbody>
                  {event.categories.map((cat, i) => (
                    <tr key={cat.label} className={i % 2 ? "bg-surface" : "bg-background"}>
                      <td className="px-3 py-2 font-medium text-foreground">{cat.label}</td>
                      <td className="px-3 py-2 text-muted">{cat.distanceLabel}</td>
                      <td className="px-3 py-2 text-muted">{cat.genders.join("/")}</td>
                      <td className="px-3 py-2 text-muted">{ageRange(cat)}</td>
                      <td className="px-3 py-2 text-muted">{cat.packages?.join(", ") ?? "any"}</td>
                      <td className="px-3 py-2 text-muted">{cat.maxSize}</td>
                      <td className="px-3 py-2 text-muted">{cat.ordering}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
