import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayDnfMarks } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  eventId: z.string(),
  playerId: z.string(),
  note: z.string().optional(),
  idempotencyKey: z.string(),
});

const undoBodySchema = z.object({
  eventId: z.string(),
  playerId: z.string(),
});

/** Marks a rider done-for-the-day without needing a finish tap — from the finish line or Course Watch. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, playerId, note, idempotencyKey } = parsed.data;

  const db = getRaceDayDb();
  const now = new Date();
  const markedBy = access.via === "director" ? access.email : "station";
  await db
    .insert(raceDayDnfMarks)
    .values({ projectId, eventId, playerId, markedAt: now, markedBy, note, idempotencyKey })
    .onConflictDoUpdate({
      target: [raceDayDnfMarks.projectId, raceDayDnfMarks.eventId, raceDayDnfMarks.playerId],
      set: { markedAt: now, markedBy, note, idempotencyKey },
    });

  return NextResponse.json({ ok: true });
}

/** Reverses a DNF mark — a volunteer tapped the wrong rider. */
export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = undoBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, playerId } = parsed.data;

  await getRaceDayDb()
    .delete(raceDayDnfMarks)
    .where(
      and(
        eq(raceDayDnfMarks.projectId, projectId),
        eq(raceDayDnfMarks.eventId, eventId),
        eq(raceDayDnfMarks.playerId, playerId),
      ),
    );

  return NextResponse.json({ ok: true });
}
