import { NextResponse } from "next/server";
import { z } from "zod";
import { addDirector, listDirectors } from "@/lib/directors";
import { apiRequireDirector } from "@/lib/auth-dal";

export async function GET() {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  return NextResponse.json(await listDirectors());
}

const addSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const parsed = addSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const added = await addDirector({
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      addedByEmail: director.email,
    });
    return NextResponse.json(added, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
