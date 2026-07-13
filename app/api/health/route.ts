import { NextResponse } from "next/server";

/**
 * Trivial liveness check the race-day hub pings to detect connectivity to
 * the real cloud deployment (see `lib/raceday/syncLoop.ts`). No auth, no DB
 * touch — just confirms the network path to this deployment works.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
