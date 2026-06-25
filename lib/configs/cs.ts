import { buildLapRace } from "./lapRace";

/**
 * Chestnut Scorcher. Splits Balance by gender, uses an open-ended "13+ M" for
 * the oldest Advanced-1 males, and labels the female Advanced-2 13-14 band as
 * "Adv 2 Lap 13+F". Distance strings carry the " mi" suffix used in 2025.
 */
export const chestnutScorcherConfig = buildLapRace({
  slug: "cs",
  name: "Chestnut Scorcher",
  balance: "split",
  distances: {
    balance: "Balance",
    novice04: "Novice 0.4 mi",
    novice05: "Novice 0.5 mi",
    novice11: "Novice 1.1 mi",
    adv1: "Adv 1 Lap 3.3 mi",
    adv2: "Adv 2 Lap 6.6 mi",
  },
  adv1MaleOldest: { label: "Adv 1 Lap 13+ M", ageMin: 13 },
  adv2Female1314: { label: "Adv 2 Lap 13+F", ageMin: 13, ageMax: 14 },
});
