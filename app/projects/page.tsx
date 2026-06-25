import Link from "next/link";
import { hasDatabase } from "@/db";
import { listProjects } from "@/lib/projects";
import { requireDirector } from "@/lib/auth-dal";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireDirector();
  if (!hasDatabase()) {
    return (
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-black text-foreground">Race projects</h1>
        <p className="mt-4 rounded-lg border border-border bg-surface p-4 text-warning">
          No database connected. Set <code>DATABASE_URL</code> (run{" "}
          <code>docker compose up -d</code> locally) to create and share projects.
        </p>
      </main>
    );
  }

  const projects = await listProjects();

  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Home
          </Link>
          <h1 className="mt-2 text-3xl font-black text-foreground">Race projects</h1>
        </div>
        <Link
          href="/projects/new"
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-foreground transition-colors hover:bg-brand-strong"
        >
          + New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="mt-8 text-muted">No projects yet. Create one to import a registration export.</p>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-2"
              >
                <div>
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="ml-2 text-sm text-muted">
                    {p.raceSlug.toUpperCase()} · {p.season}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted">
                  <span className="rounded bg-surface-2 px-2 py-0.5 capitalize">{p.status}</span>
                  <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
