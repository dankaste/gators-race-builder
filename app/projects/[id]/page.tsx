import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, getHighestBib, type ProjectState } from "@/lib/projects";
import { getRaceConfig } from "@/lib/raceConfigs";
import { Workspace } from "@/components/Workspace";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { requireDirector } from "@/lib/auth-dal";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDirector();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const config = await getRaceConfig(project.raceSlug);
  if (!config) notFound();
  const highestBib = await getHighestBib();

  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/projects" className="text-sm text-muted hover:text-foreground">
          ← Projects
        </Link>
        <DeleteProjectButton projectId={project.id} name={project.name} />
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <h1 className="text-3xl font-black text-foreground">{project.name}</h1>
        <span className="text-muted">{config.name} · {project.season}</span>
      </div>
      <Workspace
        projectId={project.id}
        config={config}
        initialState={(project.state ?? {}) as ProjectState}
        highestBib={highestBib}
      />
    </main>
  );
}
