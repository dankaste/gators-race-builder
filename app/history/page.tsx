import Link from "next/link";
import { hasDatabase } from "@/db";
import { requireDirector } from "@/lib/auth-dal";
import { getHistoryStats, listImports } from "@/lib/raceHistory";
import { RaceHistoryManager } from "@/components/RaceHistoryManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Race History — Gators Race Director" };

export default async function HistoryPage() {
  await requireDirector();

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">Race History</h1>
      <p className="mt-2 text-muted">
        Import results here to build up a history that&apos;s reused automatically every time relay teams
        are built, to estimate each rider&apos;s Swamp Dash lap time. Import a multi-season &quot;Rider
        History Race Result&quot; export as a baseline, then a fresh single-race results export after each
        race — every import adds/updates, it never erases what&apos;s already there. Parsed in your
        browser; only derived per-rider estimates ever leave the server when a relay project uses it.
      </p>

      {!hasDatabase() ? (
        <p className="mt-8 rounded-lg border border-border bg-surface p-4 text-warning">
          No database connected. Set <code>DATABASE_URL</code> to manage race history.
        </p>
      ) : (
        <RaceHistoryManager initialImports={await listImports()} initialStats={await getHistoryStats()} />
      )}
    </main>
  );
}
