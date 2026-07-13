import Link from "next/link";
import { requireDirector } from "@/lib/auth-dal";
import { ReconciliationEditor } from "@/components/raceday/ReconciliationEditor";

export const dynamic = "force-dynamic";

export default async function ReconcilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDirector();
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
        ← Project
      </Link>
      <h1 className="mt-2 text-2xl font-black text-foreground">Finish reconciliation</h1>
      <div className="mt-6">
        <ReconciliationEditor projectId={id} />
      </div>
    </main>
  );
}
