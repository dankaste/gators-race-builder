import { NextResponse } from "next/server";
import { z } from "zod";
import { updateEventHandoutTemplates } from "@/lib/raceConfigs";

const columnSchema = z.object({
  header: z.string(),
  source: z.string(),
});

const templateSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["roster", "podium", "schedule"]),
  columns: z.array(columnSchema).min(1),
  sort: z.enum(["name", "wave", "category", "none"]).optional(),
  filter: z.enum(["all", "hasWave"]).optional(),
});

const patchSchema = z.object({
  eventId: z.string().min(1),
  templates: z.array(templateSchema),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    // The Zod-validated templates structurally match HandoutTemplate[].
    const config = await updateEventHandoutTemplates(
      slug,
      parsed.data.eventId,
      parsed.data.templates as Parameters<typeof updateEventHandoutTemplates>[2],
    );
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
