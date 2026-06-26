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

  it("emits per-row wave+category groups for stager separators", () => {
    const t = waveStagerTable([
      rider({ wave: 1, categoryLabel: "5-6 M", lastName: "A" }),
      rider({ wave: 1, categoryLabel: "9-10 M", lastName: "B" }),
      rider({ wave: 2, categoryLabel: "9-10 M", lastName: "C" }),
    ]);
    expect(t.rowGroups).toEqual([
      { wave: 1, category: "5-6 M" },
      { wave: 1, category: "9-10 M" },
      { wave: 2, category: "9-10 M" },
    ]);
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

  it("inserts a break row and pushes later waves out by its length", () => {
    const t = scheduleTable(
      [
        rider({ wave: 1, categoryLabel: "5-6 M" }),
        rider({ wave: 2, categoryLabel: "9-10 M" }),
      ],
      event,
      { startTime: "09:30", minutesPerWave: 10, breaks: [{ afterWave: 1, minutes: 20, label: "Lunch" }] },
    );
    // Columns: Wave | Approx. start | Category | Riders
    expect(t.rows[0]).toEqual(["Wave 1", "9:30 AM", "5-6 M", 1]);
    // break row: no wave/count, starts when wave 1's slot ends
    expect(t.rows[1]).toEqual(["", "9:40 AM", "Lunch — 20 min", ""]);
    // wave 2 shoved from 9:40 to 10:00 by the 20-min break
    expect(t.rows[2]).toEqual(["Wave 2", "10:00 AM", "9-10 M", 1]);
  });

  it("appends breaks pointing past the last wave", () => {
    const t = scheduleTable(
      [rider({ wave: 1, categoryLabel: "5-6 M" })],
      event,
      { startTime: "09:30", minutesPerWave: 10, breaks: [{ afterWave: 9, minutes: 15 }] },
    );
    expect(t.rows[1]).toEqual(["", "9:40 AM", "Break — 15 min", ""]);
  });

  it("honors per-category minutes-per-wave overrides, falling back to the default", () => {
    const t = scheduleTable(
      [
        rider({ wave: 1, categoryLabel: "5-6 M" }),
        rider({ wave: 2, categoryLabel: "9-10 M" }),
        rider({ wave: 3, categoryLabel: "9-10 M" }),
      ],
      event,
      { startTime: "09:30", minutesPerWave: 10, minutesPerWaveByCategory: { "5-6 M": 5 } },
    );
    // wave 1 (5-6 M) consumes its 5-min override; 9-10 M falls back to the 10-min default.
    expect(t.rows.map((r) => r[1])).toEqual(["9:30 AM", "9:35 AM", "9:45 AM"]);
  });
});
