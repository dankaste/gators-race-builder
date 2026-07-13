import Link from "next/link";
import { requireDirector } from "@/lib/auth-dal";
import { OverviewPanel } from "@/components/raceday/OverviewPanel";
import { TokenPanel } from "@/components/raceday/TokenPanel";

export const dynamic = "force-dynamic";

export default async function RaceDayOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDirector();
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
          ← Project
        </Link>
        <Link href={`/projects/${id}/raceday/reconcile`} className="text-sm text-muted hover:text-foreground">
          Reconciliation →
        </Link>
      </div>
      <h1 className="mt-2 text-2xl font-black text-foreground">Race day overview</h1>

      <div className="mt-6">
        <OverviewPanel projectId={id} />
      </div>

      <h2 className="mt-8 text-lg font-bold text-foreground">Sync &amp; station links</h2>
      <div className="mt-3">
        <TokenPanel projectId={id} />
      </div>
    </main>
  );
}
