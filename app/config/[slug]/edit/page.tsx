import Link from "next/link";
import { notFound } from "next/navigation";
import { getRaceConfig } from "@/lib/raceConfigs";
import { getSeedConfig } from "@/lib/configs";
import { RaceConfigEditor } from "@/components/RaceConfigEditor";
import { requireDirector } from "@/lib/auth-dal";

export const dynamic = "force-dynamic";

export default async function EditRacePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireDirector();
  const { slug } = await params;
  const config = await getRaceConfig(slug);
  if (!config) notFound();

  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-12">
      <Link href={`/config/${slug}`} className="text-sm text-muted hover:text-foreground">
        ← {config.name}
      </Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">Edit race type</h1>
      <p className="mt-2 text-muted">
        Edit categories (label, distance, gender, age band, package, wave size and ordering),
        events, and relay settings. Changes apply the next time you compute a project.
      </p>
      <RaceConfigEditor config={config} seeded={Boolean(getSeedConfig(slug))} />
    </main>
  );
}
