import { describe, expect, it } from "vitest";
import { matchCategory } from "./categorize";
import type { CategoryDef } from "./models";
import { swampDashConfig } from "@/lib/configs/sd";

const cats = swampDashConfig.events[0].categories;

describe("matchCategory (Swamp Dash)", () => {
  it("routes a balance girl to Balance F", () => {
    const c = matchCategory(
      { gender: "F", ageOnRaceDay: 4, packageName: "Balance Bike" },
      cats,
    );
    expect(c?.label).toBe("Balance F");
  });

  it("routes a 9yo pedal boy to 9-10 M (sorted/slow-heat)", () => {
    const c = matchCategory(
      { gender: "M", ageOnRaceDay: 9, packageName: "Pedal Bike" },
      cats,
    );
    expect(c?.label).toBe("9-10 M");
    expect(c?.ordering).toBe("isolate-slow-heat");
  });

  it("combines 3-4 across genders", () => {
    const f = matchCategory({ gender: "F", ageOnRaceDay: 3, packageName: "Pedal Bike" }, cats);
    const m = matchCategory({ gender: "M", ageOnRaceDay: 4, packageName: "Pedal Bike" }, cats);
    expect(f?.label).toBe("3-4");
    expect(m?.label).toBe("3-4");
  });

  it("routes an older pedal rider to the open-ended 15+ band", () => {
    expect(matchCategory({ gender: "M", ageOnRaceDay: 16, packageName: "Pedal Bike" }, cats)?.label).toBe("15+ M");
    expect(matchCategory({ gender: "F", ageOnRaceDay: 25, packageName: "Pedal Bike" }, cats)?.label).toBe("15+ F");
  });

  it("keeps 13-14 distinct from 15+", () => {
    expect(matchCategory({ gender: "M", ageOnRaceDay: 14, packageName: "Pedal Bike" }, cats)?.label).toBe("13-14 M");
    expect(matchCategory({ gender: "M", ageOnRaceDay: 15, packageName: "Pedal Bike" }, cats)?.label).toBe("15+ M");
  });

  it("returns null when nothing matches (age below the pedal minimum)", () => {
    const c = matchCategory(
      { gender: "M", ageOnRaceDay: 2, packageName: "Pedal Bike" },
      cats,
    );
    expect(c).toBeNull();
  });

  it("respects package predicate", () => {
    const onlyNovice: CategoryDef[] = [
      { label: "Novice", distanceLabel: "0.5", genders: ["M"], ageMin: 5, ageMax: 8, packages: ["Novice"], maxSize: 9, ordering: "registration" },
    ];
    expect(matchCategory({ gender: "M", ageOnRaceDay: 6, packageName: "Novice" }, onlyNovice)?.label).toBe("Novice");
    expect(matchCategory({ gender: "M", ageOnRaceDay: 6, packageName: "Advanced 1 Lap" }, onlyNovice)).toBeNull();
  });
});
