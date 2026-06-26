import { describe, expect, it } from "vitest";
import type { CategoryDef, RaceEvent } from "./models";
import { createManualRider } from "./manualRider";

const categories: CategoryDef[] = [
  // Package-gated: only matches PlayMetrics packages containing "Novice".
  { label: "Novice 9-10 F", distanceLabel: "1 Lap", genders: ["F"], ages: [9, 10], packages: ["Novice"], maxSize: 9, ordering: "seed-ascending" },
  // Age + gender only — matches without a package.
  { label: "9-10 F", distanceLabel: "Pedal Bike", genders: ["F"], ages: [9, 10], maxSize: 9, ordering: "seed-ascending" },
  { label: "9-10 M", distanceLabel: "Pedal Bike", genders: ["M"], ages: [9, 10], maxSize: 9, ordering: "seed-ascending" },
];

const event = {
  id: "e1",
  name: "Test",
  type: "individual",
  order: 0,
  nameFormat: "{last}, {first}",
  categories,
} as RaceEvent;

describe("createManualRider", () => {
  it("stores the entered age as ageOnRaceDay with no birth date or package", () => {
    const r = createManualRider({ id: "manual-1", firstName: "Maya", lastName: "Okafor", gender: "F", age: 9 }, event);
    expect(r.ageOnRaceDay).toBe(9);
    expect(r.birthDate).toBe("");
    expect(r.packageName).toBe("");
    expect(r.playerId).toBe("manual-1");
    expect(r.wave).toBeNull();
    expect(r.seedLevel).toBeNull();
  });

  it("auto-matches a non-package category on age + gender", () => {
    const r = createManualRider({ id: "manual-2", firstName: "A", lastName: "B", gender: "F", age: 9 }, event);
    // Package-gated "Novice 9-10 F" can't match (empty package) → falls to "9-10 F".
    expect(r.categoryLabel).toBe("9-10 F");
    expect(r.distanceLabel).toBe("Pedal Bike");
  });

  it("honors an explicit category override (including package-gated ones)", () => {
    const r = createManualRider(
      { id: "manual-3", firstName: "A", lastName: "B", gender: "F", age: 9, categoryLabel: "Novice 9-10 F" },
      event,
    );
    expect(r.categoryLabel).toBe("Novice 9-10 F");
    expect(r.distanceLabel).toBe("1 Lap");
  });

  it("leaves category null when nothing matches and no override given", () => {
    const r = createManualRider({ id: "manual-4", firstName: "A", lastName: "B", gender: "M", age: 40 }, event);
    expect(r.categoryLabel).toBeNull();
    expect(r.distanceLabel).toBeNull();
  });

  it("sets a relay assignment when cup + character are provided", () => {
    const r = createManualRider(
      { id: "manual-5", firstName: "A", lastName: "B", gender: "M", cup: "Mushroom Cup #1", character: "Mario" },
      event,
    );
    expect(r.relay).toEqual({ cup: "Mushroom Cup #1", character: "Mario", leg: 1 });
  });
});
