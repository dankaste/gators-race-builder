import { describe, expect, it } from "vitest";
import type { RaceEvent, Rider } from "./models";
import { formatName, serialize, toWebScorerCsv, toWebScorerRows, WEBSCORER_HEADERS } from "./export_webscorer";

const event = { nameFormat: "{last} ,{first}" } as RaceEvent;

function rider(p: Partial<Rider>): Rider {
  return {
    playerId: "1",
    firstName: "Keaton",
    lastName: "Saunders",
    gender: "M",
    birthDate: "",
    ageOnRaceDay: 4,
    packageName: "Balance Bike",
    bib: 719,
    email: "e@example.com",
    parentName: "Elizabeth Saunders",
    phone: "16143906542",
    categoryLabel: "Balance M",
    distanceLabel: "Balance",
    seedLevel: null,
    wave: 1,
    custom: { "Phonetic Pronunciation of Name": "Key-ton" },
    warnings: [],
    ...p,
  };
}

describe("formatName", () => {
  it("matches the 'Last ,First' convention used in the 2025 files", () => {
    expect(formatName({ firstName: "Keaton", lastName: "Saunders" }, "{last} ,{first}")).toBe(
      "Saunders ,Keaton",
    );
  });
});

describe("toWebScorerRows", () => {
  it("maps engine fields to WebScorer columns (custom -> Info)", () => {
    const [row] = toWebScorerRows([rider({})], event);
    expect(row).toMatchObject({
      Name: "Saunders ,Keaton",
      Bib: "719",
      Category: "Balance M",
      Distance: "Balance",
      Wave: "Wave 1",
      Age: "4",
      Gender: "M",
      "Info 1": "Elizabeth Saunders",
      "Info 2": "16143906542",
      "Info 3": "Key-ton",
    });
  });

  it("omits riders without a category or wave", () => {
    const rows = toWebScorerRows(
      [rider({}), rider({ playerId: "2", categoryLabel: null }), rider({ playerId: "3", wave: null })],
      event,
    );
    expect(rows).toHaveLength(1);
  });

  it("leaves bib blank when unassigned", () => {
    const [row] = toWebScorerRows([rider({ bib: null })], event);
    expect(row.Bib).toBe("");
  });
});

describe("serialize", () => {
  it("emits the WebScorer header row and escapes commas", () => {
    const csv = toWebScorerCsv([rider({})], event);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(WEBSCORER_HEADERS.join(","));
    // Name contains a comma -> must be quoted
    expect(lines[1]).toContain('"Saunders ,Keaton"');
  });

  it("supports tab-delimited output", () => {
    const tsv = serialize(toWebScorerRows([rider({})], event), "\t");
    expect(tsv.split("\n")[0]).toBe(WEBSCORER_HEADERS.join("\t"));
    expect(tsv.split("\n")[1].split("\t")[0]).toBe("Saunders ,Keaton");
  });
});
