import Link from "next/link";
import { getRaceConfigs } from "@/lib/raceConfigs";
import { NewRaceForm } from "@/components/NewRaceForm";
import { requireDirector } from "@/lib/auth-dal";

export const dynamic = "force-dynamic";

export default async function NewRacePage() {
  await requireDirector();
  const configs = await getRaceConfigs();
  const races = configs.map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/config" className="text-sm text-muted hover:text-foreground">
        ← Race configurations
      </Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">New race type</h1>
      <p className="mt-2 text-muted">
        Start from a copy of an existing race, then edit its categories and settings.
      </p>
      <NewRaceForm races={races} />
    </main>
  );
}
