import type { Rider } from "./models";
import { serialize } from "./export_webscorer";

/**
 * PlayMetrics bib write-back export.
 *
 * PlayMetrics has no API, so updating plate numbers means re-uploading a CSV.
 * This mirrors the PlayMetrics *player export* columns (`id` is the player id),
 * with `number` set to each rider's assigned bib — so the file lines up with
 * what PlayMetrics produced. Only riders that actually have a bib are included.
 */
export const PLAYMETRICS_BIB_HEADERS = [
  "id",
  "player_first_name",
  "player_last_name",
  "number",
] as const;

export function toPlayMetricsBibRows(riders: Rider[]): Record<string, string>[] {
  return riders
    .filter((r) => r.bib != null && r.bib !== "")
    .map((r) => ({
      id: r.playerId,
      player_first_name: r.firstName,
      player_last_name: r.lastName,
      number: String(r.bib),
    }));
}

export function toPlayMetricsBibCsv(riders: Rider[]): string {
  return serialize(toPlayMetricsBibRows(riders), ",", PLAYMETRICS_BIB_HEADERS);
}
