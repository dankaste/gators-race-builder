import { NextResponse } from "next/server";
import { z } from "zod";
import { findExistingBibs } from "@/lib/projects";
import { apiRequireDirector } from "@/lib/auth-dal";

const candidateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().optional(),
});

const bodySchema = z.object({
  projectId: z.string().min(1),
  season: z.string().min(1),
  candidates: z.array(candidateSchema).max(2000),
});

/** Look up existing bibs (by name) for bib-less riders, from other same-season races. */
export async function POST(request: Request) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, season, candidates } = parsed.data;
  const found = await findExistingBibs(candidates, { excludeProjectId: projectId, season });
  const matches = [...found.entries()].map(([index, m]) => ({ index, ...m }));
  return NextResponse.json({ matches });
}
