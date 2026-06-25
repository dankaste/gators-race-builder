/**
 * Seed level from GBP team placement.
 *
 * GBP teams are ordered from most-beginner to most-advanced. A rider's index in
 * that ordered list is their seed level (lower = slower/more beginner). This is
 * available at registration time from the roster export's `team` column and is a
 * more reliable speed signal than parsing prior finish times.
 *
 * The order is data, not code — it can be overridden per race config. This is the
 * known 2024/2025 GBP progression.
 */
export const DEFAULT_TEAM_ORDER: string[] = [
  "Blue Balance",
  "Pink Balance",
  "Green Balance",
  "Red Rollers",
  "Orange Rollers",
  "Yellow Rollers",
  "Green Rollers",
  "Blue Rollers",
  "Purple Rollers",
  "Red Grinders",
  "Orange Grinders",
  "Yellow Grinders",
  "Green Grinders",
  "Blue Grinders",
  "Purple Grinders",
  "Red Advanced",
  "Orange Advanced",
  "Yellow Advanced",
  "Green Advanced",
  "Blue Advanced",
  "Purple Advanced",
  "Pink Advanced",
  "Neon Advanced",
  "White Advanced",
  "Black Advanced",
];

/**
 * Seed level for a team name: the index of the first ordered team whose name is
 * a substring of the rider's team (team names often carry suffixes like
 * "- Coach Name"). Returns null when there's no team / no match (unseeded).
 */
export function teamToLevel(
  team: string | null | undefined,
  order: string[] = DEFAULT_TEAM_ORDER,
): number | null {
  if (!team) return null;
  const idx = order.findIndex((t) => team.includes(t));
  return idx === -1 ? null : idx;
}
