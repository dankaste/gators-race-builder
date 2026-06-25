import { describe, expect, it } from "vitest";
import { ageOnRaceDay, parseDate } from "./age";

describe("parseDate", () => {
  it("parses US M/D/YYYY", () => {
    expect(parseDate("4/26/2021")?.toISOString()).toBe(
      "2021-04-26T00:00:00.000Z",
    );
  });
  it("parses ISO YYYY-MM-DD", () => {
    expect(parseDate("2021-04-26")?.toISOString()).toBe(
      "2021-04-26T00:00:00.000Z",
    );
  });
  it("returns null for junk", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe("ageOnRaceDay", () => {
  const raceDay = "6/21/2025"; // a 2025 Swamp Dash-style date

  it("counts completed years", () => {
    // born 2021-04-26 -> turned 4 on 2025-04-26, before race day
    expect(ageOnRaceDay("4/26/2021", raceDay)).toBe(4);
  });

  it("does not count a birthday that falls after race day", () => {
    // born 2021-08-01 -> still 3 on 2025-06-21
    expect(ageOnRaceDay("8/1/2021", raceDay)).toBe(3);
  });

  it("counts a birthday exactly on race day", () => {
    expect(ageOnRaceDay("6/21/2019", raceDay)).toBe(6);
  });

  it("returns null when a date is unparseable", () => {
    expect(ageOnRaceDay("", raceDay)).toBeNull();
    expect(ageOnRaceDay("4/26/2021", "")).toBeNull();
  });
});
