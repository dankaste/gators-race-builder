import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayIncidents } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  eventId: z.string(),
  playerId: z.string().nullable(),
  type: z.enum(["crash", "injury", "mechanical", "other"]),
  note: z.string().optional(),
  idempotencyKey: z.string(),
});

/**
 * Report a crash/incident — against a specific rider, or `playerId: null` for
 * "unknown rider / general location." Same route works from the hub's LAN or
 * the real cloud deployment (Course Watch's two links) — whichever DB
 * `getRaceDayDb()` resolves to is where this lands.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, playerId, type, note, idempotencyKey } = parsed.data;

  const [row] = await getRaceDayDb()
    .insert(raceDayIncidents)
    .values({
      projectId,
      eventId,
      playerId,
      type,
      note,
      reportedBy: access.via === "director" ? access.email : "station",
      idempotencyKey,
    })
    .returning();

  return NextResponse.json({ ok: true, id: row.id });
}
