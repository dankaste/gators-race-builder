import { NextResponse } from "next/server";
import { z } from "zod";
import type { RaceConfig } from "@/lib/engine/models";
import {
  deleteRaceConfig,
  resetRaceConfig,
  saveRaceConfig,
  updateEventHandoutTemplates,
} from "@/lib/raceConfigs";
import { handoutTemplateSchema, raceConfigSchema } from "@/lib/raceConfigSchema";

const patchSchema = z.union([
  // Full race-config save (slug must match the URL).
  z.object({ config: raceConfigSchema }),
  // Restore a seeded race to its built-in default.
  z.object({ reset: z.literal(true) }),
  // Handout-template-only update (used by the handout editor).
  z.object({ eventId: z.string().min(1), templates: z.array(handoutTemplateSchema) }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if ("config" in parsed.data) {
      if (parsed.data.config.slug !== slug) {
        return NextResponse.json({ error: "Slug cannot be changed" }, { status: 400 });
      }
      // Zod validates structure; `source` strings are intentionally looser than the union.
      return NextResponse.json(await saveRaceConfig(parsed.data.config as RaceConfig));
    }
    if ("reset" in parsed.data) {
      return NextResponse.json(await resetRaceConfig(slug));
    }
    return NextResponse.json(
      await updateEventHandoutTemplates(
        slug,
        parsed.data.eventId,
        parsed.data.templates as Parameters<typeof updateEventHandoutTemplates>[2],
      ),
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ok = await deleteRaceConfig(slug);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
