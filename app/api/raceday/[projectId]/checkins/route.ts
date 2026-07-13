import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayCheckIns } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  eventId: z.string(),
  playerId: z.string(),
  checkedIn: z.boolean(),
  idempotencyKey: z.string(),
});

/** Upsert a rider's check-in state — the client always sends the desired end-state. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, playerId, checkedIn, idempotencyKey } = parsed.data;

  const db = getRaceDayDb();
  const now = new Date();
  await db
    .insert(raceDayCheckIns)
    .values({ projectId, eventId, playerId, checkedIn, checkedInAt: checkedIn ? now : null, idempotencyKey })
    .onConflictDoUpdate({
      target: [raceDayCheckIns.projectId, raceDayCheckIns.eventId, raceDayCheckIns.playerId],
      set: { checkedIn, checkedInAt: checkedIn ? now : null, idempotencyKey, updatedAt: now },
    });

  return NextResponse.json({ ok: true });
}
