import type { CategoryDef, RaceConfig } from "@/lib/engine/models";

/**
 * Swamp Dash — the simplest race. Single individual event. Balance bikes race in
 * one wave per gender; pedal bikes split into age-band categories, with the 9-10
 * and older bands seeded slowest-first (sorted) per the 2024/2025 practice.
 *
 * Category labels here follow the 2024 prototype's scheme; exact WebScorer label
 * strings are confirmed/adjusted in the in-app config editor (an open item).
 */
const BALANCE = "Balance Bike";
const PEDAL = "Pedal Bike";

const categories: CategoryDef[] = [
  { label: "Balance F", distanceLabel: BALANCE, genders: ["F"], ages: [1, 2, 3, 4, 5, 6], packages: [BALANCE], maxSize: 100, ordering: "registration" },
  { label: "Balance M", distanceLabel: BALANCE, genders: ["M"], ages: [1, 2, 3, 4, 5, 6], packages: [BALANCE], maxSize: 100, ordering: "registration" },
  { label: "3-4", distanceLabel: PEDAL, genders: ["M", "F"], ages: [3, 4], packages: [PEDAL], maxSize: 100, ordering: "registration" },
  { label: "5-6 F", distanceLabel: PEDAL, genders: ["F"], ages: [5, 6], packages: [PEDAL], maxSize: 10, ordering: "registration" },
  { label: "5-6 M", distanceLabel: PEDAL, genders: ["M"], ages: [5, 6], packages: [PEDAL], maxSize: 10, ordering: "registration" },
  { label: "7-8 F", distanceLabel: PEDAL, genders: ["F"], ages: [7, 8], packages: [PEDAL], maxSize: 9, ordering: "registration" },
  { label: "7-8 M", distanceLabel: PEDAL, genders: ["M"], ages: [7, 8], packages: [PEDAL], maxSize: 9, ordering: "registration" },
  { label: "9-10 F", distanceLabel: PEDAL, genders: ["F"], ages: [9, 10], packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "9-10 M", distanceLabel: PEDAL, genders: ["M"], ages: [9, 10], packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "11-12 F", distanceLabel: PEDAL, genders: ["F"], ages: [11, 12], packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "11-12 M", distanceLabel: PEDAL, genders: ["M"], ages: [11, 12], packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "13-14 F", distanceLabel: PEDAL, genders: ["F"], ages: [13, 14], packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "13-14 M", distanceLabel: PEDAL, genders: ["M"], ages: [13, 14], packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "15+ F", distanceLabel: PEDAL, genders: ["F"], ageMin: 15, packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
  { label: "15+ M", distanceLabel: PEDAL, genders: ["M"], ageMin: 15, packages: [PEDAL], maxSize: 9, ordering: "isolate-slow-heat" },
];

export const swampDashConfig: RaceConfig = {
  slug: "sd",
  name: "Swamp Dash",
  events: [
    {
      id: "sd-individual",
      name: "Swamp Dash",
      type: "individual",
      order: 1,
      nameFormat: "{last} ,{first}",
      categories,
    },
  ],
};
