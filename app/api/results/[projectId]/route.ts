import { NextResponse } from "next/server";
import { getPublicResults } from "@/lib/raceday/publicResults";

/** Genuinely public — no token, no session, no auth check at all. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const results = await getPublicResults(projectId);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
