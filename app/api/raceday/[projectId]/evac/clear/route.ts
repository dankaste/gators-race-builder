import { isNull, eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayEvacEvents } from "@/db/schema";
import { apiRequireDirector } from "@/lib/auth-dal";

/** Clearing an EVAC is director-only (or the local-hub bypass) — never left to whoever's near a station. */
export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { projectId } = await params;
  await getRaceDayDb()
    .update(raceDayEvacEvents)
    .set({ clearedAt: new Date(), clearedBy: director.email })
    .where(and(eq(raceDayEvacEvents.projectId, projectId), isNull(raceDayEvacEvents.clearedAt)));

  return NextResponse.json({ ok: true });
}
