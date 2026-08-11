import { NextResponse } from "next/server";
import { z } from "zod";
import { clearHistory, getCurrentImport, importHistory } from "@/lib/raceHistory";
import { apiRequireDirector } from "@/lib/auth-dal";

/** Current import's summary — no rows, no PII. */
export async function GET() {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const current = await getCurrentImport();
  return NextResponse.json({ current: current ?? null });
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
  rows: z.array(historyRowSchema).max(20000),
});

/** Body = the CSV parsed client-side (parseHistoryCsv) — same "parse in browser" convention as registration/roster imports. Replaces any prior import wholesale. */
export async function POST(request: Request) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const imported = await importHistory(parsed.data.filename, parsed.data.rows, director.email);
  return NextResponse.json({ current: imported }, { status: 201 });
}

export async function DELETE() {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  await clearHistory();
  return NextResponse.json({ current: null });
}
