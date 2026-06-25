import { describe, expect, it } from "vitest";
import type { CategoryDef, Rider } from "./models";
import {
  buildWaves,
  flattenWaveGroups,
  groupRidersIntoWaves,
  rebalanceCategoryWaves,
  splitEvenly,
  waveCountFor,
} from "./waves";

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

  it("numbers waves globally across categories in config order", () => {
    const cats: CategoryDef[] = [
      { label: "A", distanceLabel: "x", genders: ["M"], maxSize: 9, ordering: "registration" },
      { label: "B", distanceLabel: "x", genders: ["M"], maxSize: 2, ordering: "registration" },
    ];
    const riders = [
      rider({ categoryLabel: "A", firstName: "a1" }),
      rider({ categoryLabel: "B", firstName: "b1" }),
      rider({ categoryLabel: "B", firstName: "b2" }),
      rider({ categoryLabel: "B", firstName: "b3" }),
    ];
    const waves = buildWaves(riders, cats);
    // A -> wave 1; B (3 riders, max 2) -> waves 2 & 3
    expect(waves.map((w) => [w.wave, w.categoryLabel])).toEqual([
      [1, "A"], [2, "B"], [3, "B"],
    ]);
  });
});

describe("splitEvenly", () => {
  const r = (n: string) => rider({ categoryLabel: "x", firstName: n });
  it("splits a bucket into balanced parts preserving order", () => {
    const out = splitEvenly([r("a"), r("b"), r("c"), r("d"), r("e")], 2);
    expect(out.map((w) => w.map((x) => x.firstName))).toEqual([
      ["a", "b", "c"], ["d", "e"],
    ]);
  });
  it("returns a single bucket when parts <= 1 or one rider", () => {
    expect(splitEvenly([r("a"), r("b")], 1)).toEqual([[expect.any(Object), expect.any(Object)]]);
    expect(splitEvenly([r("a")], 3).length).toBe(1);
  });
});

describe("rebalanceCategoryWaves", () => {
  it("matches buildWaves' even split for one category", () => {
    const cat: CategoryDef = {
      label: "9-10 M", distanceLabel: "Pedal Bike", genders: ["M"], ages: [9, 10],
      maxSize: 9, ordering: "isolate-slow-heat",
    };
    const riders = Array.from({ length: 11 }, (_, i) =>
      rider({ categoryLabel: "9-10 M", seedLevel: 11 - i, firstName: `r${i}` }));
    expect(rebalanceCategoryWaves(riders, cat).map((w) => w.length)).toEqual([6, 5]);
  });
});

describe("groupRidersIntoWaves / flattenWaveGroups round-trip", () => {
  const cats: CategoryDef[] = [
    { label: "A", distanceLabel: "x", genders: ["M"], maxSize: 9, ordering: "manual" },
    { label: "B", distanceLabel: "x", genders: ["M"], maxSize: 9, ordering: "manual" },
  ];

  it("groups by current wave, ordering categories per config", () => {
    const riders = [
      rider({ categoryLabel: "B", wave: 3, firstName: "b1" }),
      rider({ categoryLabel: "A", wave: 1, firstName: "a1" }),
      rider({ categoryLabel: "A", wave: 2, firstName: "a2" }),
    ];
    const groups = groupRidersIntoWaves(riders, cats);
    expect(groups.map((g) => [g.categoryLabel, g.riders.map((r) => r.firstName)])).toEqual([
      ["A", ["a1"]], ["A", ["a2"]], ["B", ["b1"]],
    ]);
  });

  it("renumbers contiguously, skips empty groups, keeps uncategorized aside", () => {
    const a1 = rider({ categoryLabel: "A", wave: 5, firstName: "a1" });
    const a2 = rider({ categoryLabel: "A", wave: 9, firstName: "a2" });
    const un = rider({ categoryLabel: null as unknown as string, wave: null, firstName: "u" });
    const out = flattenWaveGroups(
      [
        { categoryLabel: "A", riders: [a1] },
        { categoryLabel: "A", riders: [] }, // empty -> skipped, no number burned
        { categoryLabel: "A", riders: [a2] },
      ],
      [un],
    );
    expect(out.map((r) => [r.firstName, r.wave])).toEqual([
      ["a1", 1], ["a2", 2], ["u", null],
    ]);
  });

  it("survives a no-op round trip", () => {
    const riders = [
      rider({ categoryLabel: "A", wave: 1, firstName: "a1" }),
      rider({ categoryLabel: "A", wave: 2, firstName: "a2" }),
      rider({ categoryLabel: "B", wave: 3, firstName: "b1" }),
    ];
    const out = flattenWaveGroups(groupRidersIntoWaves(riders, cats));
    expect(out.map((r) => [r.firstName, r.wave])).toEqual([
      ["a1", 1], ["a2", 2], ["b1", 3],
    ]);
  });
});
