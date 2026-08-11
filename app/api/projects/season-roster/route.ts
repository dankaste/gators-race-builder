import { NextResponse } from "next/server";
import { deriveSeasonRoster } from "@/lib/projects";
import { apiRequireDirector } from "@/lib/auth-dal";

/**
 * A season-wide roster derived from every other same-season project's
 * already-imported riders (bib, GBP team, contact info) — lets a director
 * skip re-uploading the Player export once any race this season has it.
 */
export async function GET(request: Request) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const excludeProjectId = searchParams.get("excludeProjectId") ?? undefined;
  if (!season) {
    return NextResponse.json({ error: "season is required" }, { status: 400 });
  }

  const { roster, sourceProjectNames } = await deriveSeasonRoster(season, { excludeProjectId });
  return NextResponse.json({ roster, sourceProjectNames });
}
