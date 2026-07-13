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
 * A transactional delete+reinsert; naturally idempotent since resending the
 * same list produces the same end state.
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

  await db.transaction(async (tx) => {
    await tx
      .delete(raceDayFinishOrder)
      .where(and(eq(raceDayFinishOrder.projectId, projectId), eq(raceDayFinishOrder.eventId, eventId)));
    if (rows.length > 0) {
      await tx.insert(raceDayFinishOrder).values(
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
  });

  return NextResponse.json({ ok: true });
}
