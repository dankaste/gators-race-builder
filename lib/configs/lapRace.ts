import type { CategoryDef, Gender, RaceConfig, WaveOrdering } from "@/lib/engine/models";

/**
 * Builder for the multi-distance lap races (John Bryan, Chestnut Scorcher).
 *
 * These share a category structure — Balance, Novice (2-4 / 5-6 / 7-8 / 9-10 /
 * 11+), Advanced 1 Lap, Advanced 2 Lap — keyed off the PlayMetrics package
 * (skill tier) plus gender + age band. They differ only in a few spots, which
 * are the builder's parameters:
 *   - balance split (CS: "Balance F"/"Balance M"; JB: single "Balance")
 *   - the oldest male Advanced-1 band (CS: "Adv 1 Lap 13+ M" 13+; JB: "13-14M")
 *   - the oldest female Advanced-2 13-14 band (CS: "Adv 2 Lap 13+F"; JB: "13-14F")
 *
 * Age bands model the ACTUAL ranges used in 2025, not the (sometimes inconsistent)
 * label text — e.g. CS "Adv 2 Lap 13+F" actually held only ages 13-14.
 */

const NOVICE = ["Novice"];
const ADV1 = ["Advanced 1 Lap"];
const ADV2 = ["Advanced 2 Lap"];
const BALANCE = ["Balance"];

const OPEN = 18; // open-ended "+" upper bound

interface BandSpec {
  label: string;
  ageMin: number;
  ageMax?: number;
}

export interface LapRaceParams {
  slug: string;
  name: string;
  balance: "split" | "single";
  distances: {
    balance: string;
    novice04: string;
    novice05: string;
    novice11: string;
    adv1: string;
    adv2: string;
  };
  /** Oldest male Advanced-1 Lap band. */
  adv1MaleOldest: BandSpec;
  /** Female Advanced-2 Lap 13-14 band (label differs by race). */
  adv2Female1314: BandSpec;
}

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

const SLOW: WaveOrdering = "isolate-slow-heat";
const REG: WaveOrdering = "registration";

export function buildLapRace(p: LapRaceParams): RaceConfig {
  const d = p.distances;
  const cats: CategoryDef[] = [];

  // Balance
  if (p.balance === "split") {
    cats.push(c("Balance F", d.balance, ["F"], BALANCE, {}, 100, REG));
    cats.push(c("Balance M", d.balance, ["M"], BALANCE, {}, 100, REG));
  } else {
    cats.push(c("Balance", d.balance, ["F", "M"], BALANCE, {}, 100, REG));
  }

  // Novice
  for (const g of ["F", "M"] as Gender[]) {
    cats.push(c(`Novice 2-4 ${g}`, d.novice04, [g], NOVICE, { ageMin: 2, ageMax: 4 }, 100, REG));
    cats.push(c(`Novice 5-6 ${g}`, d.novice05, [g], NOVICE, { ageMin: 5, ageMax: 6 }, 10, REG));
    cats.push(c(`Novice 7-8 ${g}`, d.novice11, [g], NOVICE, { ageMin: 7, ageMax: 8 }, 9, REG));
    cats.push(c(`Novice 9-10 ${g}`, d.novice11, [g], NOVICE, { ageMin: 9, ageMax: 10 }, 9, SLOW));
    cats.push(c(`Novice 11+ ${g}`, d.novice11, [g], NOVICE, { ageMin: 11, ageMax: OPEN }, 9, SLOW));
  }

  // Advanced 1 Lap — female: 9-10, 11+; male: 9-10, 11-12, <oldest>
  cats.push(c("Adv 1 Lap 9-10F", d.adv1, ["F"], ADV1, { ageMin: 9, ageMax: 10 }, 9, SLOW));
  cats.push(c("Adv 1 Lap 11+F", d.adv1, ["F"], ADV1, { ageMin: 11, ageMax: OPEN }, 9, SLOW));
  cats.push(c("Adv 1 Lap 9-10M", d.adv1, ["M"], ADV1, { ageMin: 9, ageMax: 10 }, 9, SLOW));
  cats.push(c("Adv 1 Lap 11-12M", d.adv1, ["M"], ADV1, { ageMin: 11, ageMax: 12 }, 9, SLOW));
  cats.push(
    c(p.adv1MaleOldest.label, d.adv1, ["M"], ADV1, { ageMin: p.adv1MaleOldest.ageMin, ageMax: p.adv1MaleOldest.ageMax ?? OPEN }, 9, SLOW),
  );

  // Advanced 2 Lap — female: 9-10, 11-12, <13-14 band>, 15+; male: 9-10, 11-12, 13-14, 15+
  cats.push(c("Adv 2 Lap 9-10F", d.adv2, ["F"], ADV2, { ageMin: 9, ageMax: 10 }, 9, SLOW));
  cats.push(c("Adv 2 Lap 11-12F", d.adv2, ["F"], ADV2, { ageMin: 11, ageMax: 12 }, 9, SLOW));
  cats.push(
    c(p.adv2Female1314.label, d.adv2, ["F"], ADV2, { ageMin: p.adv2Female1314.ageMin, ageMax: p.adv2Female1314.ageMax ?? 14 }, 9, SLOW),
  );
  cats.push(c("Adv 2 Lap 15+F", d.adv2, ["F"], ADV2, { ageMin: 15, ageMax: OPEN }, 9, SLOW));
  cats.push(c("Adv 2 Lap 9-10M", d.adv2, ["M"], ADV2, { ageMin: 9, ageMax: 10 }, 9, SLOW));
  cats.push(c("Adv 2 Lap 11-12M", d.adv2, ["M"], ADV2, { ageMin: 11, ageMax: 12 }, 9, SLOW));
  cats.push(c("Adv 2 Lap 13-14M", d.adv2, ["M"], ADV2, { ageMin: 13, ageMax: 14 }, 9, SLOW));
  cats.push(c("Adv 2 Lap 15+M", d.adv2, ["M"], ADV2, { ageMin: 15, ageMax: OPEN }, 9, SLOW));

  return {
    slug: p.slug,
    name: p.name,
    events: [
      {
        id: `${p.slug}-individual`,
        name: p.name,
        type: "individual",
        order: 1,
        nameFormat: "{last} ,{first}",
        categories: cats,
      },
    ],
  };
}
