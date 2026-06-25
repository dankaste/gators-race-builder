import { NextResponse } from "next/server";
import { z } from "zod";
import type { RaceConfig } from "@/lib/engine/models";
import { createRaceConfig, getRaceConfig, getRaceConfigs } from "@/lib/raceConfigs";

export async function GET() {
  return NextResponse.json(await getRaceConfigs());
}

const cloneSchema = z.object({
  sourceSlug: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and hyphens only"),
  name: z.string().min(1),
});

/** Create a new race by cloning an existing one (regenerating event ids). */
export async function POST(request: Request) {
  const parsed = cloneSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sourceSlug, slug, name } = parsed.data;

  const source = await getRaceConfig(sourceSlug);
  if (!source) return NextResponse.json({ error: "Unknown source race" }, { status: 400 });

  const clone: RaceConfig = structuredClone(source);
  clone.slug = slug;
  clone.name = name;
  clone.events = clone.events.map((e, i) => ({ ...e, id: `${slug}-${e.type}-${i + 1}` }));

  try {
    const created = await createRaceConfig(clone);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
