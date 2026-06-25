import Link from "next/link";
import { hasDatabase } from "@/db";
import { requireDirector } from "@/lib/auth-dal";
import { bootstrapEmails, listDirectors } from "@/lib/directors";
import { DirectorsManager } from "@/components/DirectorsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Directors — Gators Race Director" };

export default async function DirectorsPage() {
  const current = await requireDirector();

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">Directors</h1>
      <p className="mt-2 text-muted">
        Directors on this list can sign in with Google and access all race data. Removing a
        director revokes their access immediately.
      </p>

      {!hasDatabase() ? (
        <p className="mt-8 rounded-lg border border-border bg-surface p-4 text-warning">
          No database connected. Set <code>DATABASE_URL</code> to manage directors.
        </p>
      ) : (
        <DirectorsManager
          initial={await listDirectors()}
          bootstrapEmails={bootstrapEmails()}
          currentEmail={current.email}
        />
      )}
    </main>
  );
}
