import Link from "next/link";
import { requireDirector } from "@/lib/auth-dal";

const RACES = [
  { code: "SD", name: "Swamp Dash", note: "Individual · age-band categories" },
  { code: "JB", name: "John Bryan", note: "Individual · Novice / Adv 1-Lap / Adv 2-Lap" },
  { code: "CS", name: "Chestnut Scorcher", note: "Individual · Novice / Advanced" },
  { code: "SDR", name: "Swamp Dash Relay", note: "Relay + standard pedal race" },
];

export default async function Home() {
  await requireDirector();
  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-16">
      <header className="mb-12">
        <p className="text-accent font-semibold tracking-wide uppercase text-sm">
          Gators Race Series
        </p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-black text-foreground">
          Race Director
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Turn a PlayMetrics registration export into a WebScorer start list and
          race-day handouts — categorize, seed waves, build relay teams, review
          and correct, then export.
        </p>
      </header>

      <section aria-labelledby="races-heading">
        <h2
          id="races-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted mb-4"
        >
          Races
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {RACES.map((race) => (
            <li key={race.code}>
              <Link
                href={`/config/${race.code.toLowerCase()}`}
                className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand-strong"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-deep font-black text-foreground">
                  {race.code}
                </span>
                <div>
                  <h3 className="font-bold text-foreground">{race.name}</h3>
                  <p className="text-sm text-muted">{race.note}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 flex flex-wrap items-center gap-3">
        <Link
          href="/projects"
          className="inline-flex items-center rounded-lg bg-brand px-5 py-3 font-semibold text-foreground transition-colors hover:bg-brand-strong"
        >
          Open race projects →
        </Link>
        <Link
          href="/config"
          className="inline-flex items-center rounded-lg border border-border px-5 py-3 font-semibold text-muted transition-colors hover:text-foreground hover:border-brand-strong"
        >
          Race configurations
        </Link>
        <Link
          href="/guide"
          className="inline-flex items-center rounded-lg border border-border px-5 py-3 font-semibold text-muted transition-colors hover:text-foreground hover:border-brand-strong"
        >
          Guide
        </Link>
      </section>
    </main>
  );
}
