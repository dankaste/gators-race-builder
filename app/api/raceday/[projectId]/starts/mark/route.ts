import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayStartMarks } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  eventId: z.string(),
  playerId: z.string(),
  wave: z.number().int(),
  status: z.enum(["started", "dns"]),
  idempotencyKey: z.string(),
});

/** Riders default to "started" with no row at all — this only exists to flag/undo a DNS. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, playerId, wave, status, idempotencyKey } = parsed.data;

  const db = getRaceDayDb();
  const now = new Date();
  await db
    .insert(raceDayStartMarks)
    .values({ projectId, eventId, playerId, wave, status, recordedAt: now, idempotencyKey })
    .onConflictDoUpdate({
      target: [raceDayStartMarks.projectId, raceDayStartMarks.eventId, raceDayStartMarks.playerId],
      set: { wave, status, recordedAt: now, idempotencyKey, updatedAt: now },
    });

  return NextResponse.json({ ok: true });
}
