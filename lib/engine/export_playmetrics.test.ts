import { describe, expect, it } from "vitest";
import type { Rider } from "./models";
import { PLAYMETRICS_BIB_HEADERS, toPlayMetricsBibCsv, toPlayMetricsBibRows } from "./export_playmetrics";

function rider(p: Partial<Rider> & { playerId: string }): Rider {
  return {
    firstName: "Ada", lastName: "Lovelace", gender: "F", birthDate: "",
    ageOnRaceDay: 9, packageName: "Pedal Bike", bib: 101, categoryLabel: "9-10 F",
    distanceLabel: "Pedal Bike", seedLevel: null, wave: 1, warnings: [], ...p,
  };
}

describe("toPlayMetricsBibRows", () => {
  it("maps player id + name + assigned bib, skipping bib-less riders", () => {
    const rows = toPlayMetricsBibRows([
      rider({ playerId: "4821", firstName: "Ada", lastName: "Lovelace", bib: 101 }),
      rider({ playerId: "4822", firstName: "Grace", lastName: "Hopper", bib: null }),
      rider({ playerId: "4823", firstName: "Edsger", lastName: "Dijkstra", bib: "" }),
    ]);
    expect(rows).toEqual([
      { id: "4821", player_first_name: "Ada", player_last_name: "Lovelace", number: "101" },
    ]);
  });

  it("stringifies numeric and string bibs alike", () => {
    const rows = toPlayMetricsBibRows([
      rider({ playerId: "1", bib: 7 }),
      rider({ playerId: "2", bib: "A12" }),
    ]);
    expect(rows.map((r) => r.number)).toEqual(["7", "A12"]);
  });
});

describe("toPlayMetricsBibCsv", () => {
  it("serializes with the PlayMetrics player-export headers", () => {
    const csv = toPlayMetricsBibCsv([rider({ playerId: "4821", firstName: "Ada", lastName: "Lovelace", bib: 101 })]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(PLAYMETRICS_BIB_HEADERS.join(","));
    expect(lines[1]).toBe("4821,Ada,Lovelace,101");
  });

  it("escapes names containing commas", () => {
    const csv = toPlayMetricsBibCsv([rider({ playerId: "9", firstName: "Mary", lastName: "Jones, III", bib: 5 })]);
    expect(csv.split("\n")[1]).toBe('9,Mary,"Jones, III",5');
  });
});
