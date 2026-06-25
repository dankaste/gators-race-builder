import { describe, expect, it } from "vitest";
import type { RaceEvent, Rider } from "./models";
import { checkInTable, podiumTable, scheduleTable, waveStagerTable } from "./handouts";

const event = {
  categories: [
    { label: "5-6 M", distanceLabel: "Pedal", genders: ["M"], maxSize: 10, ordering: "registration" },
    { label: "9-10 M", distanceLabel: "Pedal", genders: ["M"], maxSize: 9, ordering: "isolate-slow-heat" },
  ],
} as RaceEvent;

function rider(p: Partial<Rider>): Rider {
  return {
    playerId: "", firstName: "Zed", lastName: "Young", gender: "M", birthDate: "",
    ageOnRaceDay: 9, packageName: "Pedal", bib: 100, categoryLabel: "9-10 M",
    distanceLabel: "Pedal", seedLevel: null, wave: 2, warnings: [], ...p,
  };
}

describe("checkInTable", () => {
  it("sorts alphabetically and includes a blank Here? column", () => {
    const t = checkInTable([
      rider({ firstName: "Zed", lastName: "Young" }),
      rider({ firstName: "Amy", lastName: "Adams" }),
    ]);
    expect(t.headers[0]).toBe("Here?");
    expect(t.rows.map((r) => r[2])).toEqual(["Adams, Amy", "Young, Zed"]);
    expect(t.rows[0][0]).toBe("");
  });
});

describe("waveStagerTable", () => {
  it("orders by wave then name", () => {
    const t = waveStagerTable([
      rider({ wave: 2, lastName: "B" }),
      rider({ wave: 1, lastName: "A" }),
      rider({ wave: 1, lastName: "C" }),
    ]);
    expect(t.rows.map((r) => r[0])).toEqual(["Wave 1", "Wave 1", "Wave 2"]);
  });
});

describe("podiumTable", () => {
  it("lists categories in config order with counts and blank places", () => {
    const t = podiumTable(
      [rider({ categoryLabel: "9-10 M", wave: 2 }), rider({ categoryLabel: "5-6 M", wave: 1 })],
      event,
    );
    expect(t.rows.map((r) => r[0])).toEqual(["5-6 M", "9-10 M"]);
    expect(t.rows[0]).toEqual(["5-6 M", "W1", 1, "", "", ""]);
  });
});

describe("scheduleTable", () => {
  it("computes wave start times from a start + interval", () => {
    const t = scheduleTable(
      [rider({ wave: 1, categoryLabel: "5-6 M" }), rider({ wave: 2, categoryLabel: "9-10 M" })],
      event,
      { startTime: "09:30", minutesPerWave: 10 },
    );
    expect(t.rows[0][1]).toBe("9:30 AM");
    expect(t.rows[1][1]).toBe("9:40 AM");
  });
});
