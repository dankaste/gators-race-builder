import { NextResponse } from "next/server";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";
import { getRaceDaySnapshot } from "@/lib/raceday/snapshot";

/** The single polling target for every station. Read-only, computed on each request. */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const eventId = new URL(request.url).searchParams.get("eventId") ?? undefined;
  try {
    const snapshot = await getRaceDaySnapshot(projectId, eventId);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
