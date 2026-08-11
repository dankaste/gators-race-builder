import { NextResponse } from "next/server";
import { z } from "zod";
import { getHistoryStats, listImports, upsertHistory, wipeAllHistory } from "@/lib/raceHistory";
import { apiRequireDirector } from "@/lib/auth-dal";

/** Import log + aggregate coverage stats. No result rows, no PII. */
export async function GET() {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const [imports, stats] = await Promise.all([listImports(), getHistoryStats()]);
  return NextResponse.json({ imports, stats });
}

const historyRowSchema = z.object({
  bib: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  raceSlug: z.enum(["sd", "cs", "jb", "sdr"]).nullable(),
  season: z.number().int().nullable(),
  eventLabel: z.string(),
  category: z.string(),
  age: z.number().int().nullable(),
  gender: z.enum(["M", "F"]).nullable(),
  timeSeconds: z.number().nullable(),
  status: z.string(),
  place: z.number().int().nullable(),
  groupSize: z.number().int().nullable(),
  distanceLabel: z.string(),
});

const importSchema = z.object({
  filename: z.string().min(1),
  source: z.enum(["bulk-history", "race-result"]).default("bulk-history"),
  rows: z.array(historyRowSchema).max(20000),
});

/**
 * Body = a CSV/xlsx parsed client-side (parseHistoryCsv / parseRaceResultsXlsx)
 * — same "parse in browser" convention as registration/roster imports. Additive:
 * each row upserts by (raceSlug, season, bib), so importing the multi-season
 * baseline once and a fresh single race after every event just keeps building
 * up the same table (see lib/raceHistory.ts for the exact merge semantics).
 */
export async function POST(request: Request) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const imported = await upsertHistory(parsed.data.filename, parsed.data.rows, parsed.data.source, director.email);
  const stats = await getHistoryStats();
  return NextResponse.json({ imported, stats }, { status: 201 });
}

/** Nuclear reset — wipes every import and every result row. Rare; normal imports never need this. */
export async function DELETE() {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  await wipeAllHistory();
  return NextResponse.json({ ok: true });
}
