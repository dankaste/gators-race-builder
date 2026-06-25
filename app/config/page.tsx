import Link from "next/link";
import { getRaceConfigs, configsAreLive } from "@/lib/raceConfigs";

export const dynamic = "force-dynamic";

export default async function ConfigListPage() {
  const [configs, live] = await Promise.all([getRaceConfigs(), configsAreLive()]);

  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Home
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-black text-foreground">Race configurations</h1>
          <Link
            href="/config/new"
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-foreground transition-colors hover:bg-brand-strong"
          >
            + New race
          </Link>
        </div>
        <p className="mt-2 text-muted">
          The category, distance, and wave rules for each race. Seeded with the four
          GRS races; click a race to view or edit it.
        </p>
        <p className="mt-3 inline-block rounded-md border border-border bg-surface px-3 py-1 text-sm">
          {live ? (
            <span className="text-brand-strong">● Live from database</span>
          ) : (
            <span className="text-warning">
              ● Showing built-in seed configs (database not connected yet)
            </span>
          )}
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {configs.map((cfg) => {
          const totalCats = cfg.events.reduce((n, e) => n + e.categories.length, 0);
          return (
            <li key={cfg.slug}>
              <Link
                href={`/config/${cfg.slug}`}
                className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand-strong"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-foreground">{cfg.name}</h2>
                  <span className="rounded bg-brand-deep px-2 py-0.5 text-xs font-bold uppercase">
                    {cfg.slug}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {cfg.events.length} event{cfg.events.length > 1 ? "s" : ""} ·{" "}
                  {totalCats} categor{totalCats === 1 ? "y" : "ies"}
                  {cfg.events.some((e) => e.type === "relay") && " · includes relay"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
