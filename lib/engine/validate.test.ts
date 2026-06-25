import { describe, expect, it } from "vitest";
import type { RaceEvent, Rider } from "./models";
import { validate } from "./validate";

const event = {
  categories: [
    { label: "9-10 M", distanceLabel: "Pedal", genders: ["M"], maxSize: 9, ordering: "registration" },
  ],
} as RaceEvent;

function rider(p: Partial<Rider>): Rider {
  return {
    playerId: "", firstName: "", lastName: "", gender: "M", birthDate: "",
    ageOnRaceDay: 9, packageName: "Pedal", bib: 1, categoryLabel: "9-10 M",
    distanceLabel: "Pedal", seedLevel: null, wave: 1, warnings: [], ...p,
  };
}

describe("validate", () => {
  it("counts categorized / uncategorized / missing bib", () => {
    const s = validate(
      [rider({ bib: 1 }), rider({ bib: null }), rider({ categoryLabel: null, wave: null })],
      event,
    );
    expect(s.total).toBe(3);
    expect(s.categorized).toBe(2);
    expect(s.uncategorized).toBe(1);
    expect(s.missingBib).toBe(1);
  });

  it("flags duplicate bibs", () => {
    const s = validate([rider({ bib: 5 }), rider({ bib: 5 }), rider({ bib: 6 })], event);
    expect(s.duplicateBibs).toEqual([5]);
  });

  it("warns when a wave exceeds the category max size", () => {
    const riders = Array.from({ length: 11 }, () => rider({ wave: 1 }));
    const s = validate(riders, event);
    expect(s.waveWarnings).toEqual([{ wave: 1, categoryLabel: "9-10 M", size: 11, max: 9 }]);
  });

  it("reports per-category counts", () => {
    const s = validate([rider({}), rider({})], event);
    expect(s.categoryCounts).toEqual([{ label: "9-10 M", count: 2 }]);
  });
});
