import Link from "next/link";
import { notFound } from "next/navigation";
import { getRaceConfig } from "@/lib/raceConfigs";
import { defaultHandoutTemplates } from "@/lib/engine/handouts";
import { HandoutTemplateEditor, type EditorEvent } from "@/components/HandoutTemplateEditor";

export const dynamic = "force-dynamic";

export default async function HandoutTemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = await getRaceConfig(slug);
  if (!config) notFound();

  const events: EditorEvent[] = config.events
    .filter((e) => e.type !== "relay")
    .map((e) => ({
      id: e.id,
      name: e.name,
      templates: e.handoutTemplates?.length ? e.handoutTemplates : defaultHandoutTemplates(),
    }));

  return (
    <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-12">
      <Link href={`/config/${slug}`} className="text-sm text-muted hover:text-foreground">
        ← {config.name}
      </Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">Handout templates</h1>
      <p className="mt-2 text-muted">
        Customize the columns, order, and sorting of each handout. Saved per race and shared with
        the director team; changes apply the next time you generate handouts in a project.
      </p>
      {events.length === 0 ? (
        <p className="mt-8 text-muted">This race has no individual events with handouts.</p>
      ) : (
        <HandoutTemplateEditor slug={slug} events={events} />
      )}
    </main>
  );
}
