import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/lib/projects";
import { getRaceConfig } from "@/lib/raceConfigs";

export async function GET() {
  const all = await listProjects();
  return NextResponse.json(all);
}

const createSchema = z.object({
  raceSlug: z.string().min(1),
  name: z.string().min(1),
  season: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // Guard against projects for unknown races.
  if (!(await getRaceConfig(parsed.data.raceSlug))) {
    return NextResponse.json({ error: "Unknown race" }, { status: 400 });
  }
  const project = await createProject(parsed.data);
  return NextResponse.json(project, { status: 201 });
}
