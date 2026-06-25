import { ageOnRaceDay } from "./age";
import { matchCategory } from "./categorize";
import type {
  RaceEvent,
  RegistrationRow,
  Rider,
  RosterEntry,
} from "./models";
import { teamToLevel } from "./seed";
import { buildWaves } from "./waves";

export interface TransformInput {
  registrations: RegistrationRow[];
  roster: RosterEntry[];
  event: RaceEvent;
  raceDate: string;
  teamOrder?: string[];
}

export interface TransformResult {
  riders: Rider[];
  /** Riders that matched no category (need attention before export). */
  uncategorized: Rider[];
}

/**
 * Full individual-event pipeline: registrations + roster + config → riders with
 * age, category, distance, bib, seed, and wave assigned. Drops canceled
 * registrations. Each rider carries `warnings` for director review.
 */
export function transformEvent(input: TransformInput): TransformResult {
  const { registrations, roster, event, raceDate, teamOrder } = input;

  const rosterById = new Map<string, RosterEntry>();
  for (const r of roster) if (r.id) rosterById.set(r.id, r);

  const riders: Rider[] = [];

  for (const reg of registrations) {
    if (reg.status && reg.status.toLowerCase() === "canceled") continue;

    const warnings: string[] = [];
    const match = reg.playerId ? rosterById.get(reg.playerId) : undefined;

    const age = ageOnRaceDay(reg.birthDate || match?.birthDate, raceDate);
    if (age === null) warnings.push("Could not compute age (bad birth date)");

    const bib = match?.bib ?? null;
    if (bib === null) warnings.push("No bib match in roster — assign manually");

    const seedLevel = teamToLevel(match?.team, teamOrder);

    const rider: Rider = {
      playerId: reg.playerId,
      firstName: reg.firstName || match?.firstName || "",
      lastName: reg.lastName || match?.lastName || "",
      gender: reg.gender || match?.gender || "",
      birthDate: reg.birthDate || match?.birthDate || "",
      ageOnRaceDay: age,
      packageName: reg.packageName,
      bib,
      email: reg.accountEmail || match?.email,
      parentName:
        [reg.accountFirstName, reg.accountLastName].filter(Boolean).join(" ") ||
        match?.parentName,
      phone: reg.accountPhone || match?.phone,
      team: match?.team,
      categoryLabel: null,
      distanceLabel: null,
      seedLevel,
      wave: null,
      custom: reg.custom,
      warnings,
    };

    const cat = matchCategory(rider, event.categories);
    if (cat) {
      rider.categoryLabel = cat.label;
      rider.distanceLabel = cat.distanceLabel;
    } else if (age !== null) {
      rider.warnings.push("No matching category");
    }

    riders.push(rider);
  }

  buildWaves(riders, event.categories);

  return {
    riders,
    uncategorized: riders.filter((r) => r.categoryLabel === null),
  };
}
