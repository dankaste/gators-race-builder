import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayIncidents } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  await getRaceDayDb()
    .update(raceDayIncidents)
    .set({ resolvedAt: new Date(), resolvedBy: access.via === "director" ? access.email : "station" })
    .where(and(eq(raceDayIncidents.projectId, projectId), eq(raceDayIncidents.id, id)));

  return NextResponse.json({ ok: true });
}
