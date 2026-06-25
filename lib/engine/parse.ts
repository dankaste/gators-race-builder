import Papa from "papaparse";
import type { RegistrationRow, RosterEntry } from "./models";

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const result = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return result.data.filter((r) => Object.keys(r).length > 0);
}

/** First non-empty value among candidate header names (tolerant of variants). */
function pick(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

const KNOWN_REG_HEADERS = new Set([
  "player_id",
  "player_first_name",
  "player_last_name",
  "gender",
  "birth_date",
  "account_first_name",
  "account_last_name",
  "account_email",
  "account_phone",
  "status",
  "package_name",
  "package_acct_code",
]);

/** Parse a PlayMetrics registration export. Unknown columns become `custom`. */
export function parseRegistrations(csvText: string): RegistrationRow[] {
  return parseCsv(csvText).map((row) => {
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!KNOWN_REG_HEADERS.has(k) && v != null && String(v).trim() !== "") {
        custom[k] = String(v).trim();
      }
    }
    return {
      playerId: pick(row, "player_id"),
      firstName: pick(row, "player_first_name"),
      lastName: pick(row, "player_last_name"),
      gender: pick(row, "gender"),
      birthDate: pick(row, "birth_date"),
      packageName: pick(row, "package_name"),
      status: pick(row, "status"),
      accountFirstName: pick(row, "account_first_name"),
      accountLastName: pick(row, "account_last_name"),
      accountEmail: pick(row, "account_email"),
      accountPhone: pick(row, "account_phone"),
      custom: Object.keys(custom).length ? custom : undefined,
    };
  });
}

/** Parse a PlayMetrics player/roster export (source of bib, team, contact). */
export function parseRoster(csvText: string): RosterEntry[] {
  return parseCsv(csvText).map((row) => {
    const bibRaw = pick(row, "number");
    const bib = bibRaw === "" ? null : /^\d+$/.test(bibRaw) ? Number(bibRaw) : bibRaw;
    const parentFirst = pick(row, "parent1_first_name");
    const parentLast = pick(row, "parent1_last_name");
    return {
      id: pick(row, "id", "player_id"),
      firstName: pick(row, "player_first_name"),
      lastName: pick(row, "player_last_name"),
      bib,
      gender: pick(row, "gender"),
      birthDate: pick(row, "birth_date"),
      team: pick(row, "team") || undefined,
      email: pick(row, "parent1_email", "parent2_email") || undefined,
      parentName: [parentFirst, parentLast].filter(Boolean).join(" ") || undefined,
      phone:
        pick(row, "parent1_mobile_num", "parent1_mobile_number", "parent2_mobile_num", "parent2_mobile_number") ||
        undefined,
    };
  });
}
