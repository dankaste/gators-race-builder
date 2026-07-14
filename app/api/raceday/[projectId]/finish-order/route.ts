import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayFinishOrder } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  eventId: z.string(),
  rows: z.array(
    z.object({
      bib: z.string(),
      playerId: z.string().nullable(),
      editedTime: z.string().datetime().nullable(),
    }),
  ),
});

/**
 * Replaces the whole believed-crossing-order list for an event with the
 * client's current drag-ordered list — the client computes this locally
 * (drag to reorder, click a time to hand-edit it) and PUTs the full result.
 * Sequential delete + reinsert, not a `db.transaction()` — the neon-http
 * driver used in production has no transaction support at all (it throws
 * unconditionally), unlike the PGlite driver used on the local race-day hub.
 * Naturally idempotent (resending the same list produces the same end
 * state), the same atomicity-via-idempotency approach `lib/raceday/sync.ts`
 * already relies on.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, rows } = parsed.data;

  const db = getRaceDayDb();
  const now = new Date();
  const editorEmail = access.via === "director" ? access.email : "station";

  await db
    .delete(raceDayFinishOrder)
    .where(and(eq(raceDayFinishOrder.projectId, projectId), eq(raceDayFinishOrder.eventId, eventId)));
  if (rows.length > 0) {
    await db.insert(raceDayFinishOrder).values(
      rows.map((row, i) => ({
        projectId,
        eventId,
        sortOrder: i,
        bib: row.bib,
        playerId: row.playerId,
        editedTime: row.editedTime ? new Date(row.editedTime) : null,
        updatedBy: editorEmail,
        updatedAt: now,
      })),
    );
  }

  return NextResponse.json({ ok: true });
}
