import { buildLapRace } from "./lapRace";

/**
 * John Bryan. Uses a single "Balance" category (not gender-split), a closed
 * "13-14M" oldest Advanced-1 male band, and "Adv 2 Lap 13-14F" for the female
 * Advanced-2 13-14 band. The 2025 JB upload used Category only (no Distance
 * column); distance strings here are kept for handouts/reference.
 */
export const johnBryanConfig = buildLapRace({
  slug: "jb",
  name: "John Bryan",
  balance: "single",
  distances: {
    balance: "Balance",
    novice04: "Novice 0.4",
    novice05: "Novice 0.5",
    novice11: "Novice 1.1",
    adv1: "Adv 1 Lap 3.3",
    adv2: "Adv 2 Lap 6.6",
  },
  adv1MaleOldest: { label: "Adv 1 Lap 13-14M", ageMin: 13, ageMax: 14 },
  adv2Female1314: { label: "Adv 2 Lap 13-14F", ageMin: 13, ageMax: 14 },
});
