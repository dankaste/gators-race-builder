import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayWaveStarts } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  eventId: z.string(),
  wave: z.number().int(),
  idempotencyKey: z.string(),
});

/** Records the real, as-it-happened clock time a wave rolled. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, wave, idempotencyKey } = parsed.data;

  const db = getRaceDayDb();
  const now = new Date();
  await db
    .insert(raceDayWaveStarts)
    .values({ projectId, eventId, wave, startedAt: now, idempotencyKey })
    .onConflictDoUpdate({
      target: [raceDayWaveStarts.projectId, raceDayWaveStarts.eventId, raceDayWaveStarts.wave],
      set: { startedAt: now, idempotencyKey, updatedAt: now },
    });

  return NextResponse.json({ ok: true, startedAt: now.toISOString() });
}
