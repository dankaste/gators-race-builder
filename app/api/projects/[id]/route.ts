import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, updateProject } from "@/lib/projects";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

const patchSchema = z.object({
  // state is the project working data (jsonb); validated structurally at the edge only.
  state: z.record(z.string(), z.unknown()).optional(),
  status: z.string().optional(),
  lastEditedBy: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateProject(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
