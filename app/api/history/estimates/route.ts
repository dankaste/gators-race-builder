import { NextResponse } from "next/server";
import { z } from "zod";
import { estimateLapTimes, mostRecentSwampDashSeason } from "@/lib/engine/history";
import { getAllHistoryResults } from "@/lib/raceHistory";
import { apiRequireDirector } from "@/lib/auth-dal";

const candidateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  ageOnRaceDay: z.number().int().nullable(),
  gender: z.string().nullable(),
});

const bodySchema = z.object({
  candidates: z.array(candidateSchema).max(2000),
  minCellSize: z.number().int().positive().optional(),
});

/**
 * Estimated Swamp Dash lap times for a batch of riders, from the persisted
 * Race History. Index-keyed, no names echoed back — same PII posture as
 * `/api/projects/match-bibs` (source data never leaves the server, only the
 * small per-rider result crosses the wire).
 */
export async function POST(request: Request) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const history = await getAllHistoryResults();
  const targetSeason = mostRecentSwampDashSeason(history) ?? new Date().getFullYear();
  const estimates = estimateLapTimes(parsed.data.candidates, history, {
    targetSeason,
    minCellSize: parsed.data.minCellSize ?? 5,
  });

  const results = parsed.data.candidates.map((_, index) => ({ index, ...estimates.get(index)! }));
  return NextResponse.json({ targetSeason, estimates: results });
}
