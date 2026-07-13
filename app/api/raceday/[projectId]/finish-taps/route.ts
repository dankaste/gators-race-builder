import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayFinishTimeTaps } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";
import { isReplay } from "@/lib/raceday/idempotency";

const bodySchema = z.object({
  eventId: z.string(),
  idempotencyKey: z.string(),
});

/**
 * Insert-only, fire-and-forget friendly: the client optimistically increments
 * a local counter and doesn't wait on this response before the next tap.
 * `capturedAt` is assigned here at server receipt, not client-side — fine
 * given LAN latency is milliseconds. The idempotency ledger is load-bearing
 * here (unlike the upsert-by-natural-key endpoints) since there's no natural
 * key for "another tap happened."
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, idempotencyKey } = parsed.data;

  const db = getRaceDayDb();
  if (await isReplay(db, idempotencyKey, "finish-taps", projectId)) {
    return NextResponse.json({ ok: true, replay: true });
  }

  const [row] = await db
    .insert(raceDayFinishTimeTaps)
    .values({ projectId, eventId, idempotencyKey })
    .returning();

  return NextResponse.json({ ok: true, id: row.id, capturedAt: row.capturedAt.toISOString() });
}
