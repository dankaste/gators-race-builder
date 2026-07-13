import { NextResponse } from "next/server";
import { getRaceDayDb, isLocalHub } from "@/db/racedayDb";
import { raceDayEvacEvents } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";
import { sendEvacPush } from "@/lib/raceday/push";

/**
 * Trigger an EVAC. Deliberately NOT director-only — every legitimate user
 * already holds the station token, and seconds matter. The partial unique
 * index on `race_day_evac_events` (one active row per project) means a
 * second concurrent trigger is a harmless no-op, not a duplicate alert.
 *
 * Two channels: this always writes the LAN-broadcast row (whichever DB this
 * process is pointed at). It ALSO fans out real Web Push — but only when
 * NOT running as the offline hub, since push requires the internet the hub
 * doesn't have; on the real cloud deployment this reaches every subscribed
 * device regardless of Wi-Fi range, including ones with the app closed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  await getRaceDayDb()
    .insert(raceDayEvacEvents)
    .values({ projectId, triggeredBy: access.via === "director" ? access.email : "station" })
    .onConflictDoNothing();

  if (!isLocalHub()) {
    await sendEvacPush(projectId);
  }

  return NextResponse.json({ ok: true });
}
