import { describe, expect, it } from "vitest";
import {
  ageBandOf,
  classifyEvent,
  deriveFiveSixFactor,
  estimateLapTimes,
  mostRecentSwampDashSeason,
  normalizeGender,
  parseHistoryCsv,
  parseRaceTime,
  type HistoryRow,
} from "./history";

describe("parseRaceTime", () => {
  it("parses M:SS.s", () => expect(parseRaceTime("3:31.41")).toBeCloseTo(211.41));
  it("parses MM:SS.ss with a 2-digit minute", () => expect(parseRaceTime("12:05.30")).toBeCloseTo(725.3));
  it("parses H:MM:SS with no fraction", () => expect(parseRaceTime("0:02:15")).toBeCloseTo(135));
  it("parses H:MM:SS.ss", () => expect(parseRaceTime("1:02:15.50")).toBeCloseTo(3735.5));
  it("treats DNS/DNF/blank/dash as no time", () => {
    expect(parseRaceTime("DNS")).toBeNull();
    expect(parseRaceTime("DNF")).toBeNull();
    expect(parseRaceTime("")).toBeNull();
    expect(parseRaceTime("-")).toBeNull();
    expect(parseRaceTime(null)).toBeNull();
    expect(parseRaceTime(undefined)).toBeNull();
  });
  it("rejects garbage without crashing", () => {
    expect(parseRaceTime("not a time")).toBeNull();
    expect(parseRaceTime("1:2:3:4")).toBeNull();
  });
});

describe("classifyEvent", () => {
  it("classifies every real header variant", () => {
    expect(classifyEvent("2018 Swamp Dash")).toEqual({ raceSlug: "sd", season: 2018 });
    expect(classifyEvent("2025 Gator Race Series Swamp Dash")).toEqual({ raceSlug: "sd", season: 2025 });
    expect(classifyEvent("2022  Gator Race Series Chestnut Scorcher")).toEqual({ raceSlug: "cs", season: 2022 });
    expect(classifyEvent("2024 Gator Race Series John Bryan Trail Magic")).toEqual({ raceSlug: "jb", season: 2024 });
    // "relay" must win over the generic "swamp dash" match, and both spellings appear in the real export.
    expect(classifyEvent("2024 Swamp Dash Relays Standard Races")).toEqual({ raceSlug: "sdr", season: 2024 });
    expect(classifyEvent("2025 Swamp Dash Relay Standard Races")).toEqual({ raceSlug: "sdr", season: 2025 });
  });
  it("returns nulls for an unrecognized label", () => {
    expect(classifyEvent("Some Other Race")).toEqual({ raceSlug: null, season: null });
  });
});

describe("normalizeGender", () => {
  it("maps Male/Female", () => {
    expect(normalizeGender("Male")).toBe("M");
    expect(normalizeGender("Female")).toBe("F");
  });
  it("treats anything else as unknown", () => {
    expect(normalizeGender("Female/Male")).toBeNull();
    expect(normalizeGender("")).toBeNull();
  });
});

describe("ageBandOf", () => {
  it("buckets into the standard bands", () => {
    expect(ageBandOf(3)).toBe("3-4");
    expect(ageBandOf(6)).toBe("5-6");
    expect(ageBandOf(7)).toBe("7-8");
    expect(ageBandOf(10)).toBe("9-10");
    expect(ageBandOf(12)).toBe("11-12");
    expect(ageBandOf(14)).toBe("13-14");
    expect(ageBandOf(15)).toBe("15+");
  });
});

describe("parseHistoryCsv", () => {
  const csv = [
    "Bib,Name,Event,Event Date,Category,Age,Gender,Time,Status,Start,Finish,Place,Group_Size,Distance",
    '100,"Smith, Alice",2025 Gator Race Series Swamp Dash,,7 - 8,7,Female,3:00.00,OK,0:00,3:00,1,10,Pedal Bike',
    '101,"Jones, Bob",2025 Gator Race Series Chestnut Scorcher,,Novice 7-8 M,7,Male,DNS,DNS,,,,5,Novice',
  ].join("\n");

  it("splits name, classifies event, and parses fields", () => {
    const rows = parseHistoryCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      firstName: "Alice",
      lastName: "Smith",
      raceSlug: "sd",
      season: 2025,
      age: 7,
      gender: "F",
      timeSeconds: 180,
      place: 1,
      groupSize: 10,
    });
    expect(rows[1].timeSeconds).toBeNull();
  });
});

describe("deriveFiveSixFactor", () => {
  function sdRow(name: string, season: number, age: number, timeSeconds: number): HistoryRow {
    const [lastName, firstName] = name.split(", ");
    return {
      bib: "1",
      firstName,
      lastName,
      raceSlug: "sd",
      season,
      eventLabel: `${season} Gator Race Series Swamp Dash`,
      category: "",
      age,
      gender: "M",
      timeSeconds,
      status: "OK",
      place: 1,
      groupSize: 10,
      distanceLabel: "Pedal Bike",
    };
  }

  it("de-confounds the 5-6 course jump from ordinary same-course growth", () => {
    // Every rider: 5-6 time is exactly 1.8x their 7-8 time the following year;
    // every rider also has a same-course (7-8→9-10) leg that's flat (ratio 1.0),
    // so the derived factor should land close to 1.8 (growth ≈ 1.0).
    const rows: HistoryRow[] = [];
    for (let i = 0; i < 6; i++) {
      const name = `Rider${i}, R`;
      rows.push(sdRow(name, 2022, 6, 100));
      rows.push(sdRow(name, 2023, 8, 180));
      rows.push(sdRow(name, 2024, 10, 180));
    }
    const { factor, n } = deriveFiveSixFactor(rows);
    expect(n).toBe(6);
    expect(factor).toBeCloseTo(1.8, 1);
  });

  it("returns a null factor when there's no paired data", () => {
    expect(deriveFiveSixFactor([])).toEqual({ factor: null, n: 0 });
  });
});

describe("estimateLapTimes", () => {
  function sdRow(first: string, last: string, season: number, age: number, gender: "M" | "F", timeSeconds: number | null): HistoryRow {
    return {
      bib: "1",
      firstName: first,
      lastName: last,
      raceSlug: "sd",
      season,
      eventLabel: `${season} Gator Race Series Swamp Dash`,
      category: "",
      age,
      gender,
      timeSeconds,
      status: timeSeconds === null ? "DNF" : "OK",
      place: 1,
      groupSize: 10,
      distanceLabel: "Pedal Bike",
    };
  }
  function csRow(first: string, last: string, season: number, age: number, gender: "M" | "F", timeSeconds: number, place: number, groupSize: number): HistoryRow {
    return {
      bib: "1",
      firstName: first,
      lastName: last,
      raceSlug: "cs",
      season,
      eventLabel: `${season} Gator Race Series Chestnut Scorcher`,
      category: "Novice",
      age,
      gender,
      timeSeconds,
      status: "OK",
      place,
      groupSize,
      distanceLabel: "Novice",
    };
  }
  // A same-age-band cohort of five 9-10yo boys, times 200..240s, so every cell has enough n.
  const cohort = Array.from({ length: 5 }, (_, i) => sdRow(`Cohort${i}`, "M", 2025, 9, "M", 200 + i * 10));
  const config = { targetSeason: 2025, minCellSize: 5 };

  it("gives a rider with their own recent Swamp Dash time 'direct' confidence, close to their own time", () => {
    const target = sdRow("Alice", "Smith", 2025, 9, "M", 210);
    const history = [...cohort, target];
    const est = estimateLapTimes([{ firstName: "Alice", lastName: "Smith", ageOnRaceDay: 9, gender: "M" }], history, config);
    expect(est.get(0)!.confidence).toBe("direct");
    expect(est.get(0)!.seconds).toBeCloseTo(210, 0);
  });

  it("falls back to a cross-event estimate when there's no Swamp Dash history", () => {
    // Bob's CS field is the same cohort shape; he sits mid-pack, so his SD estimate should land mid-cohort.
    const csRows = Array.from({ length: 5 }, (_, i) => csRow(`CsPeer${i}`, "M", 2025, 9, "M", 300 + i * 10, i + 1, 5));
    const bob = csRow("Bob", "Jones", 2025, 9, "M", 320, 3, 5); // dead-middle of the CS field
    const history = [...cohort, ...csRows, bob];
    const est = estimateLapTimes([{ firstName: "Bob", lastName: "Jones", ageOnRaceDay: 9, gender: "M" }], history, config);
    expect(est.get(0)!.confidence).toBe("cross-event");
    expect(est.get(0)!.seconds).toBeCloseTo(220, 0); // cohort median
  });

  it("returns 'none' with no numeric estimate for a rider with zero history", () => {
    const est = estimateLapTimes([{ firstName: "Nobody", lastName: "Here", ageOnRaceDay: 9, gender: "M" }], cohort, config);
    expect(est.get(0)).toEqual({ seconds: null, confidence: "none", ambiguousName: false, detail: "no history match" });
  });

  it("flags a name whose implied birth year spans more than one year as ambiguous", () => {
    // Same name, two rows three years apart with ages that don't imply the same birth year — a name collision, not drift.
    const collision = [sdRow("Sam", "Lee", 2020, 6, "M", 150), sdRow("Sam", "Lee", 2023, 6, "M", 150)];
    const history = [...cohort, ...collision];
    const est = estimateLapTimes([{ firstName: "Sam", lastName: "Lee", ageOnRaceDay: 9, gender: "M" }], history, config);
    expect(est.get(0)!.ambiguousName).toBe(true);
  });

  it("widens (drops gender) when the exact-gender cell is too small", () => {
    // Only 2 girls this season/age band — below minCellSize(5) — but the combined boy+girl cell clears it.
    const girls = [sdRow("Girl1", "X", 2025, 9, "F", 205), sdRow("Girl2", "X", 2025, 9, "F", 215)];
    const target = sdRow("Alice", "Smith", 2025, 9, "F", 210);
    const history = [...cohort, ...girls, target];
    const est = estimateLapTimes([{ firstName: "Alice", lastName: "Smith", ageOnRaceDay: 9, gender: "F" }], history, config);
    expect(est.get(0)!.confidence).toBe("widened");
  });

  it("skips a target with no age or gender rather than throwing", () => {
    const est = estimateLapTimes([{ firstName: "No", lastName: "Data", ageOnRaceDay: null, gender: "M" }], cohort, config);
    expect(est.get(0)!.confidence).toBe("none");
  });
});

describe("mostRecentSwampDashSeason", () => {
  it("finds the max season with a Swamp Dash time", () => {
    const rows: HistoryRow[] = [
      { bib: "1", firstName: "A", lastName: "B", raceSlug: "sd", season: 2022, eventLabel: "", category: "", age: 9, gender: "M", timeSeconds: 200, status: "OK", place: 1, groupSize: 5, distanceLabel: "" },
      { bib: "1", firstName: "A", lastName: "B", raceSlug: "sd", season: 2025, eventLabel: "", category: "", age: 9, gender: "M", timeSeconds: 200, status: "OK", place: 1, groupSize: 5, distanceLabel: "" },
      { bib: "1", firstName: "A", lastName: "B", raceSlug: "cs", season: 2026, eventLabel: "", category: "", age: 9, gender: "M", timeSeconds: 200, status: "OK", place: 1, groupSize: 5, distanceLabel: "" },
    ];
    expect(mostRecentSwampDashSeason(rows)).toBe(2025);
  });
  it("returns null with no data", () => {
    expect(mostRecentSwampDashSeason([])).toBeNull();
  });
});
