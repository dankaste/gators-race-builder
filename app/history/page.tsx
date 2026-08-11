import Link from "next/link";
import { hasDatabase } from "@/db";
import { requireDirector } from "@/lib/auth-dal";
import { getCurrentImport } from "@/lib/raceHistory";
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
        Import the multi-season WebScorer &quot;Rider History Race Result&quot; export once here — it&apos;s
        reused automatically every time relay teams are built to estimate each rider&apos;s Swamp Dash lap
        time. Re-importing replaces the current data (it&apos;s a periodic re-export, not something to
        accumulate). Parsed in your browser; only derived per-rider estimates ever leave the server
        when a relay project uses it.
      </p>

      {!hasDatabase() ? (
        <p className="mt-8 rounded-lg border border-border bg-surface p-4 text-warning">
          No database connected. Set <code>DATABASE_URL</code> to manage race history.
        </p>
      ) : (
        <RaceHistoryManager initial={(await getCurrentImport()) ?? null} />
      )}
    </main>
  );
}
