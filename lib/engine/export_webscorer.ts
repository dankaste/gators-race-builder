import type { RaceEvent, Rider } from "./models";

/**
 * WebScorer start-list export.
 *
 * WebScorer accepts XLSX / CSV / tab-delimited TXT uploaded manually via
 * "Post start list from file". Headers must match WebScorer's known names
 * exactly; column order doesn't matter and unused columns can be omitted.
 * Wave starts require the Wave column plus Distance or Category.
 *
 * Custom fields (Parent, Phone, Phonetic) map onto WebScorer's "Info N" columns.
 */

export const WEBSCORER_HEADERS = [
  "Name",
  "Bib",
  "Category",
  "Distance",
  "Wave",
  "Age",
  "Gender",
  "Email",
  "Info 1", // Parent
  "Info 2", // Phone
  "Info 3", // Phonetic pronunciation
] as const;

/** Format a rider name per the event's convention, e.g. "{last} ,{first}". */
export function formatName(rider: Pick<Rider, "firstName" | "lastName">, nameFormat: string): string {
  return nameFormat
    .replaceAll("{first}", rider.firstName ?? "")
    .replaceAll("{last}", rider.lastName ?? "");
}

/** A WebScorer row keyed by header. Only categorized, waved riders are exported. */
export function toWebScorerRows(
  riders: Rider[],
  event: RaceEvent,
): Record<string, string>[] {
  return riders
    .filter((r) => r.categoryLabel && r.wave != null)
    .map((r) => ({
      Name: formatName(r, event.nameFormat),
      Bib: r.bib == null ? "" : String(r.bib),
      Category: r.categoryLabel ?? "",
      Distance: r.distanceLabel ?? "",
      Wave: `Wave ${r.wave}`,
      Age: r.ageOnRaceDay == null ? "" : String(r.ageOnRaceDay),
      Gender: String(r.gender ?? ""),
      Email: r.email ?? "",
      "Info 1": r.parentName ?? "",
      "Info 2": r.phone ?? "",
      "Info 3": r.custom?.["Phonetic Pronunciation of Name"] ?? "",
    }));
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Serialize rows to a delimited string with the WebScorer header order. */
export function serialize(
  rows: Record<string, string>[],
  delimiter: "," | "\t" = ",",
  headers: readonly string[] = WEBSCORER_HEADERS,
): string {
  const esc = delimiter === "," ? escapeCsv : (v: string) => v;
  const lines = [headers.join(delimiter)];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h] ?? "")).join(delimiter));
  }
  return lines.join("\n");
}

export function toWebScorerCsv(riders: Rider[], event: RaceEvent): string {
  return serialize(toWebScorerRows(riders, event), ",");
}

export const WEBSCORER_RELAY_HEADERS = [
  "Team name",
  "Name",
  "Leg",
  "Distance",
  "Bib",
  "Age",
  "Gender",
  "Email",
] as const;

/** Relay rows: one per rider, with the character as Team name and cup as Distance. */
export function toRelayWebScorerRows(
  riders: Rider[],
  event: RaceEvent,
): Record<string, string>[] {
  return riders
    .filter((r) => r.relay)
    .map((r) => ({
      "Team name": r.relay!.character,
      Name: formatName(r, event.nameFormat),
      Leg: String(r.relay!.leg),
      Distance: r.relay!.cup,
      Bib: r.bib == null ? "" : String(r.bib),
      Age: r.ageOnRaceDay == null ? "" : String(r.ageOnRaceDay),
      Gender: String(r.gender ?? ""),
      Email: r.email ?? "",
    }));
}

export function toRelayWebScorerCsv(riders: Rider[], event: RaceEvent): string {
  return serialize(toRelayWebScorerRows(riders, event), ",", WEBSCORER_RELAY_HEADERS);
}
