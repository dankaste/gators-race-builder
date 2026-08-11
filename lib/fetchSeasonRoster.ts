import type { RosterEntry } from "@/lib/engine/models";

/**
 * Client-side fetch for the season-wide roster derived from other same-season
 * projects' already-imported riders (see lib/projects.ts's deriveSeasonRoster)
 * — lets an import skip asking for a Player export CSV once any race this
 * season has had one uploaded. Fails safe: returns an empty roster on any
 * network/server error, same convention as IndividualReview's fetchBibMatches.
 */
export async function fetchSeasonRoster(
  season: string,
  excludeProjectId: string,
): Promise<{ roster: RosterEntry[]; sourceProjectNames: string[] }> {
  try {
    const res = await fetch(
      `/api/projects/season-roster?season=${encodeURIComponent(season)}&excludeProjectId=${encodeURIComponent(excludeProjectId)}`,
    );
    if (!res.ok) return { roster: [], sourceProjectNames: [] };
    return await res.json();
  } catch {
    return { roster: [], sourceProjectNames: [] };
  }
}
