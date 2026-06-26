import { matchCategory } from "./categorize";
import type { RaceEvent, Rider } from "./models";

/** Fields a director supplies when adding a rider by hand (no PlayMetrics row). */
export interface ManualRiderInput {
  /** Caller-generated unique id; use a `manual-` prefix so the UI can tag it. */
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  /** Age on race day, entered directly (we don't ask for a birth date). */
  age?: number | null;
  bib?: number | string | null;
  /** Explicit category override; when omitted we auto-match on age + gender. */
  categoryLabel?: string | null;
  /** Relay assignment (relay events only). Legs are renumbered by the caller. */
  cup?: string;
  character?: string;
}

/**
 * Build a {@link Rider} from director-entered fields, mirroring what the import
 * pipeline produces so a manual rider is indistinguishable downstream (waves,
 * export, handouts). Pure — wave/relay placement is left to the caller.
 *
 * Category: an explicit `categoryLabel` wins; otherwise we run the same
 * {@link matchCategory} the import uses. Manual riders carry no PlayMetrics
 * package, so package-gated categories won't auto-match (the form lists them all
 * for manual selection).
 */
export function createManualRider(input: ManualRiderInput, event: RaceEvent): Rider {
  const age = input.age ?? null;

  const rider: Rider = {
    playerId: input.id,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    gender: input.gender,
    birthDate: "",
    ageOnRaceDay: age,
    packageName: "",
    bib: input.bib ?? null,
    team: undefined,
    categoryLabel: null,
    distanceLabel: null,
    seedLevel: null,
    wave: null,
    warnings: [],
  };

  const label =
    input.categoryLabel ??
    matchCategory({ gender: rider.gender, ageOnRaceDay: age, packageName: "" }, event.categories)
      ?.label ??
    null;
  if (label) {
    const cat = event.categories.find((c) => c.label === label);
    rider.categoryLabel = label;
    rider.distanceLabel = cat?.distanceLabel ?? null;
  }

  if (input.cup && input.character) {
    rider.relay = { cup: input.cup, character: input.character, leg: 1 };
  }

  return rider;
}
