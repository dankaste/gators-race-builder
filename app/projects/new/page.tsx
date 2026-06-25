import Link from "next/link";
import { getRaceConfigs } from "@/lib/raceConfigs";
import { NewProjectForm } from "@/components/NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const configs = await getRaceConfigs();
  const races = configs.map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/projects" className="text-sm text-muted hover:text-foreground">
        ← Projects
      </Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">New race project</h1>
      <p className="mt-2 text-muted">Pick a race and season, then import the registration export.</p>
      <NewProjectForm races={races} />
    </main>
  );
}
