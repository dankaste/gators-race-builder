import type { CategoryDef, Gender, RaceConfig, WaveOrdering } from "@/lib/engine/models";

/**
 * Swamp Dash Relay — the unusual race. Two events:
 *   1. Standard Pedal Race (individual): young Balance + Novice riders, run like
 *      a normal age-band race at 9:30am.
 *   2. Relay (relay type): older riders distributed across 4 time-staggered cups,
 *      each cup split into Mario-Kart-character teams of ~4 riders (teamSize) —
 *      as many characters as that cup's headcount actually needs, not all 14;
 *      RELAY_CHARACTERS is a big enough roster to name teams for a much larger
 *      field than a typical season sees, not a per-cup quota. Team assignment
 *      (cup + character, honoring friend requests) is handled by the relay
 *      builder — see lib/engine/relay.ts.
 */

const NOVICE = ["Novice"];
const BALANCE = ["Balance"];
const REG: WaveOrdering = "registration";

function c(
  label: string,
  distanceLabel: string,
  genders: Gender[],
  packages: string[],
  band: { ageMin?: number; ageMax?: number },
  maxSize: number,
  ordering: WaveOrdering,
): CategoryDef {
  return { label, distanceLabel, genders, packages, ...band, maxSize, ordering };
}

// The standard pedal race is for the youngest riders only — Balance, Novice 2-4,
// and Novice 5-6 (the catch-all top group; older kids race the relay instead).
// In 2025 a stray 7yo was absorbed into 5-6, so it has no upper age cap.
const standardCategories: CategoryDef[] = [
  c("Balance F", "Balance", ["F"], BALANCE, {}, 100, REG),
  c("Balance M", "Balance", ["M"], BALANCE, {}, 100, REG),
];
for (const g of ["F", "M"] as Gender[]) {
  standardCategories.push(c(`Novice 2-4 ${g}`, "Novice 0.4", [g], NOVICE, { ageMin: 2, ageMax: 4 }, 100, REG));
  standardCategories.push(c(`Novice 5-6 ${g}`, "Novice 0.5", [g], NOVICE, { ageMin: 5, ageMax: 18 }, 10, REG));
}

export const RELAY_CUPS = [
  "Mushroom Cup #1",
  "Flower Cup #2",
  "Star Cup #3",
  "Lightning Cup #4",
];

export const RELAY_CHARACTERS = [
  "Link", "Mario", "Yoshi", "Wario", "Diddy Kong", "Princess Peach", "Toad",
  "Bowser", "Koopa Troopa", "Donkey Kong", "Luigi", "King Boo", "Daisy", "Dry Bones",
];

export const swampDashRelayConfig: RaceConfig = {
  slug: "sdr",
  name: "Swamp Dash Relay",
  events: [
    {
      id: "sdr-standard",
      name: "Standard Pedal Race",
      type: "individual",
      order: 1,
      nameFormat: "{last} ,{first}",
      categories: standardCategories,
    },
    {
      id: "sdr-relay",
      name: "Relay",
      type: "relay",
      order: 2,
      nameFormat: "{last} ,{first}",
      categories: [],
      relay: {
        teamSize: 4,
        cups: RELAY_CUPS,
        characters: RELAY_CHARACTERS,
        // friendRequestField: mapped from the relay registration export in M6.
        historyEstimation: {
          // Derived from lib/engine/history.ts's deriveFiveSixFactor() against the
          // real 2018-2025 export (paired 5-6→7-8 ratio ÷ SAME-AGE same-course
          // growth — riders who stayed in the 5-6 band a year apart, n=81 paired
          // riders, n=75 growth pairs) — best-effort, editable here as more
          // seasons land. An earlier version (1.78) used older riders' growth
          // rate as the baseline and understated this — see deriveFiveSixFactor's
          // doc comment for why age-matching the baseline matters.
          fiveSixCourseFactor: 2.03,
          minCellSize: 5,
        },
      },
    },
  ],
};
