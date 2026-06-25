import { describe, expect, it } from "vitest";
import type { CategoryDef, Rider } from "./models";
import { buildWaves, waveCountFor } from "./waves";

function rider(partial: Partial<Rider> & { categoryLabel: string }): Rider {
  return {
    playerId: "",
    firstName: "",
    lastName: "",
    gender: "M",
    birthDate: "",
    ageOnRaceDay: 9,
    packageName: "Pedal Bike",
    bib: null,
    seedLevel: null,
    wave: null,
    distanceLabel: null,
    warnings: [],
    ...partial,
  };
}

describe("waveCountFor", () => {
  it("ceil-divides by max size", () => {
    expect(waveCountFor(11, 9)).toBe(2);
    expect(waveCountFor(9, 9)).toBe(1);
    expect(waveCountFor(0, 9)).toBe(0);
    expect(waveCountFor(19, 9)).toBe(3);
  });
});

describe("buildWaves", () => {
  const slowHeat: CategoryDef[] = [
    { label: "9-10 M", distanceLabel: "Pedal Bike", genders: ["M"], ages: [9, 10], maxSize: 9, ordering: "isolate-slow-heat" },
  ];

  it("splits evenly and numbers waves globally", () => {
    const riders = Array.from({ length: 11 }, (_, i) =>
      rider({ categoryLabel: "9-10 M", seedLevel: 11 - i, firstName: `r${i}` }),
    );
    const waves = buildWaves(riders, slowHeat);
    // 11 riders, max 9 -> 2 waves, even split 6 + 5
    expect(waves.map((w) => w.riders.length)).toEqual([6, 5]);
    expect(waves.map((w) => w.wave)).toEqual([1, 2]);
  });

  it("puts lowest seed (slowest) in the first wave", () => {
    const riders = Array.from({ length: 11 }, (_, i) =>
      rider({ categoryLabel: "9-10 M", seedLevel: 11 - i, firstName: `r${i}` }),
    );
    const waves = buildWaves(riders, slowHeat);
    const firstWaveSeeds = waves[0].riders.map((r) => r.seedLevel!);
    const secondWaveSeeds = waves[1].riders.map((r) => r.seedLevel!);
    expect(Math.max(...firstWaveSeeds)).toBeLessThanOrEqual(Math.min(...secondWaveSeeds));
  });

  it("preserves registration order when ordering is 'registration'", () => {
    const cats: CategoryDef[] = [{ ...slowHeat[0], ordering: "registration" }];
    const riders = [
      rider({ categoryLabel: "9-10 M", seedLevel: 5, firstName: "a" }),
      rider({ categoryLabel: "9-10 M", seedLevel: 1, firstName: "b" }),
    ];
    const waves = buildWaves(riders, cats);
    expect(waves[0].riders.map((r) => r.firstName)).toEqual(["a", "b"]);
  });
});
