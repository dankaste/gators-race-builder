import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayFinishTimeTaps } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

/** Soft-deletes a phantom/duplicate tap — never reordered, per the single-list reconciliation model. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  await getRaceDayDb()
    .update(raceDayFinishTimeTaps)
    .set({ voidedAt: new Date(), voidedBy: access.via === "director" ? access.email : "station" })
    .where(and(eq(raceDayFinishTimeTaps.projectId, projectId), eq(raceDayFinishTimeTaps.id, id)));

  return NextResponse.json({ ok: true });
}
