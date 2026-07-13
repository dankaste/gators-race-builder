import "server-only";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayTokens } from "@/db/schema";
import { getCurrentDirector } from "./auth-dal";
import { isAllowedDirector } from "./directors";

export type RaceDayAccess = { via: "token" } | { via: "director"; email: string };

/**
 * Route-handler gate for every station read/write route — mirrors
 * `apiRequireDirector`'s shape, but accepts a valid `x-raceday-token` header
 * (checked against `race_day_tokens` for this project, against whichever DB
 * this process is currently pointed at — hub or cloud) as well as a real
 * director session. Never use `apiRequireDirector` for station routes.
 */
export async function apiRequireRaceDayAccess(
  projectId: string,
  request: Request,
): Promise<RaceDayAccess | NextResponse> {
  const token = request.headers.get("x-raceday-token");
  if (token) {
    const [row] = await getRaceDayDb()
      .select()
      .from(raceDayTokens)
      .where(and(eq(raceDayTokens.projectId, projectId), eq(raceDayTokens.token, token)));
    if (row) return { via: "token" };
  }

  const director = await getCurrentDirector();
  if (director && (await isAllowedDirector(director.email))) {
    return { via: "director", email: director.email };
  }

  // Physical presence on the hub's own network stands in for director login
  // when there's no internet to reach Google OAuth — scoped strictly to
  // RACEDAY_MODE=local, never set on the real Vercel deployment.
  if (process.env.RACEDAY_MODE === "local") {
    return { via: "director", email: "local-hub" };
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
