import { describe, expect, it } from "vitest";
import type { CategoryDef, RaceEvent, Rider } from "./models";
import {
  addWalkUpRider,
  computeFinishResults,
  computePodium,
  computeRaceStatus,
  computeRaceStatuses,
  groupResultsByCategory,
  toRaceDayRoster,
  type DnfMark,
  type FinishOrderRow,
  type FinishResult,
  type FinishTimeTap,
  type RaceDayRosterEntry,
  type StartMark,
  type WaveStart,
} from "./raceDay";

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

function rosterEntry(partial: Partial<RaceDayRosterEntry> & { playerId: string }): RaceDayRosterEntry {
  return {
    bib: null,
    firstName: "",
    lastName: "",
    categoryLabel: null,
    distanceLabel: null,
    wave: null,
    ...partial,
  };
}

function tap(id: string, capturedAt: string, voided = false): FinishTimeTap {
  return { id, capturedAt, voided };
}

function orderRow(id: string, bib: string, playerId: string | null, editedTime: string | null = null): FinishOrderRow {
  return { id, bib, playerId, editedTime };
}

describe("toRaceDayRoster", () => {
  it("strips PII down to what a station needs", () => {
    const riders: Rider[] = [
      rider({
        playerId: "p1",
        categoryLabel: "Boys 10-12",
        distanceLabel: "Pedal Bike",
        firstName: "Maddox",
        lastName: "Reyes",
        bib: 104,
        wave: 5,
        email: "parent@example.com",
        phone: "555-1234",
        parentName: "Jane Reyes",
        team: "Team Gators",
      }),
    ];
    const [entry] = toRaceDayRoster(riders);
    expect(entry).toEqual({
      playerId: "p1",
      bib: 104,
      firstName: "Maddox",
      lastName: "Reyes",
      categoryLabel: "Boys 10-12",
      distanceLabel: "Pedal Bike",
      wave: 5,
    });
    expect(entry).not.toHaveProperty("email");
    expect(entry).not.toHaveProperty("phone");
    expect(entry).not.toHaveProperty("parentName");
    expect(entry).not.toHaveProperty("team");
  });
});

describe("computeFinishResults", () => {
  it("pairs equal-length order and taps by position", () => {
    const order = [orderRow("o1", "104", "p1"), orderRow("o2", "107", "p2")];
    const taps = [tap("t1", "2026-07-11T13:38:41.000Z"), tap("t2", "2026-07-11T13:38:55.000Z")];
    const { results, extraTaps } = computeFinishResults(order, taps);
    expect(results.map((r) => r.finishTime)).toEqual([
      "2026-07-11T13:38:41.000Z",
      "2026-07-11T13:38:55.000Z",
    ]);
    expect(results.every((r) => r.origin === "auto")).toBe(true);
    expect(extraTaps).toEqual([]);
  });

  it("surfaces taps beyond the order list's length as extraTaps rather than dropping them", () => {
    const order = [orderRow("o1", "104", "p1")];
    const taps = [tap("t1", "2026-07-11T13:38:41.000Z"), tap("t2", "2026-07-11T13:38:55.000Z")];
    const { results, extraTaps } = computeFinishResults(order, taps);
    expect(results).toHaveLength(1);
    expect(extraTaps).toEqual([tap("t2", "2026-07-11T13:38:55.000Z")]);
  });

  it("gives trailing order rows a null finishTime when there's no matching tap", () => {
    const order = [orderRow("o1", "104", "p1"), orderRow("o2", "107", "p2")];
    const taps = [tap("t1", "2026-07-11T13:38:41.000Z")];
    const { results, extraTaps } = computeFinishResults(order, taps);
    expect(results[0].finishTime).toBe("2026-07-11T13:38:41.000Z");
    expect(results[1].finishTime).toBeNull();
    expect(extraTaps).toEqual([]);
  });

  it("skips voided taps entirely rather than treating them as a position", () => {
    const order = [orderRow("o1", "104", "p1"), orderRow("o2", "107", "p2")];
    const taps = [
      tap("t1", "2026-07-11T13:38:41.000Z"),
      tap("t-phantom", "2026-07-11T13:38:50.000Z", true),
      tap("t2", "2026-07-11T13:38:55.000Z"),
    ];
    const { results } = computeFinishResults(order, taps);
    expect(results.map((r) => r.finishTime)).toEqual([
      "2026-07-11T13:38:41.000Z",
      "2026-07-11T13:38:55.000Z",
    ]);
  });

  it("pins a manually-edited time regardless of position and tags it manual", () => {
    const order = [orderRow("o1", "104", "p1", "2026-07-11T13:39:10.000Z")];
    const taps = [tap("t1", "2026-07-11T13:38:41.000Z")];
    const { results } = computeFinishResults(order, taps);
    expect(results[0].finishTime).toBe("2026-07-11T13:39:10.000Z");
    expect(results[0].origin).toBe("manual");
  });
});

describe("computeRaceStatus", () => {
  const waves: WaveStart[] = [{ wave: 5, startedAt: "2026-07-11T13:14:02.000Z" }];

  it("defaults to not-started before the rider's wave has rolled", () => {
    const r = rosterEntry({ playerId: "p1", wave: 6 });
    expect(computeRaceStatus(r, waves, [], [], [])).toBe("not-started");
  });

  it("defaults to started once the rider's wave has rolled, with no explicit mark", () => {
    const r = rosterEntry({ playerId: "p1", wave: 5 });
    expect(computeRaceStatus(r, waves, [], [], [])).toBe("started");
  });

  it("honors an explicit DNS mark", () => {
    const r = rosterEntry({ playerId: "p1", wave: 5 });
    const marks: StartMark[] = [{ playerId: "p1", wave: 5, status: "dns", recordedAt: "" }];
    expect(computeRaceStatus(r, waves, marks, [], [])).toBe("dns");
  });

  it("reports finished once a finish result exists", () => {
    const r = rosterEntry({ playerId: "p1", wave: 5 });
    const results: FinishResult[] = [
      { rowId: "o1", bib: "104", playerId: "p1", finishTime: "2026-07-11T13:20:00.000Z", origin: "auto" },
    ];
    expect(computeRaceStatus(r, waves, [], results, [])).toBe("finished");
  });

  it("DNF wins even over a finish result — a deliberate human call overrides a stray tap", () => {
    const r = rosterEntry({ playerId: "p1", wave: 5 });
    const results: FinishResult[] = [
      { rowId: "o1", bib: "104", playerId: "p1", finishTime: "2026-07-11T13:20:00.000Z", origin: "auto" },
    ];
    const dnf: DnfMark[] = [{ playerId: "p1", markedAt: "" }];
    expect(computeRaceStatus(r, waves, [], results, dnf)).toBe("dnf");
  });

  it("computeRaceStatuses batches the same logic across a roster", () => {
    const roster = [rosterEntry({ playerId: "p1", wave: 5 }), rosterEntry({ playerId: "p2", wave: 6 })];
    const statuses = computeRaceStatuses(roster, waves, [], [], []);
    expect(statuses.get("p1")).toBe("started");
    expect(statuses.get("p2")).toBe("not-started");
  });
});

describe("computePodium", () => {
  const waves: WaveStart[] = [
    { wave: 5, startedAt: "2026-07-11T13:14:02.000Z" },
    { wave: 9, startedAt: "2026-07-11T13:20:00.000Z" }, // a "makeup" wave for the same category
  ];
  const roster: RaceDayRosterEntry[] = [
    rosterEntry({ playerId: "p1", categoryLabel: "Boys 10-12", wave: 5, bib: 104, firstName: "Maddox" }),
    rosterEntry({ playerId: "p2", categoryLabel: "Boys 10-12", wave: 9, bib: 142, firstName: "Dashiell" }),
    rosterEntry({ playerId: "p3", categoryLabel: "Girls 10-12", wave: 5, bib: 107, firstName: "Noa" }),
  ];
  const finishResult = (playerId: string, bib: string, finishTime: string): FinishResult => ({
    rowId: `o-${playerId}`,
    bib,
    playerId,
    finishTime,
    origin: "auto",
  });

  it("ranks a single wave's category by elapsed time", () => {
    const results = [finishResult("p1", "104", "2026-07-11T13:19:00.000Z")];
    const podium = computePodium("Boys 10-12", [waves[0]], roster, results, []);
    expect(podium.ranked).toHaveLength(1);
    expect(podium.ranked[0].elapsedMs).toBe(4 * 60 * 1000 + 58 * 1000); // 13:14:02 -> 13:19:00 = 4:58
    expect(podium.ranked[0].place).toBe(1);
  });

  it("ranks combined/makeup waves in the same category fairly by elapsed time, not raw clock time", () => {
    const results = [
      finishResult("p1", "104", "2026-07-11T13:19:00.000Z"), // wave 5, 5:00 elapsed
      finishResult("p2", "142", "2026-07-11T13:24:00.000Z"), // wave 9, 4:00 elapsed — actually faster
    ];
    const podium = computePodium("Boys 10-12", waves, roster, results, []);
    expect(podium.ranked.map((e) => e.rider.playerId)).toEqual(["p2", "p1"]);
  });

  it("holds a rider out as pendingStart when their wave has no recorded start time", () => {
    const results = [finishResult("p1", "104", "2026-07-11T13:19:00.000Z")];
    const podium = computePodium("Boys 10-12", [], roster, results, []); // no wave starts at all
    expect(podium.ranked).toEqual([]);
    expect(podium.pendingStart.map((r) => r.playerId)).toEqual(["p1"]);
  });

  it("surfaces a bib with no matching rider as unresolved rather than dropping it", () => {
    const results = [finishResult("nobody", "999", "2026-07-11T13:19:00.000Z")];
    const podium = computePodium("Boys 10-12", waves, roster, results, []);
    expect(podium.unresolved).toEqual([{ bib: "999", finishTime: "2026-07-11T13:19:00.000Z" }]);
  });

  it("excludes a DNF rider from ranking instead of leaving them pending forever", () => {
    const results = [finishResult("p1", "104", "2026-07-11T13:19:00.000Z")];
    const dnf: DnfMark[] = [{ playerId: "p1", markedAt: "" }];
    const podium = computePodium("Boys 10-12", waves, roster, results, dnf);
    expect(podium.ranked).toEqual([]);
    expect(podium.pendingStart).toEqual([]);
    expect(podium.dnf.map((r) => r.playerId)).toEqual(["p1"]);
  });

  it("flags a negative elapsed time as a warning rather than crashing or hiding it", () => {
    // finish time before the wave's start — a data error, must not throw
    const results = [finishResult("p1", "104", "2026-07-11T13:00:00.000Z")];
    const podium = computePodium("Boys 10-12", [waves[0]], roster, results, []);
    expect(podium.ranked[0].elapsedMs).toBeLessThan(0);
    expect(podium.ranked[0].warning).toBeTruthy();
  });

  it("does not let a DNS-but-somehow-finished contradiction crash — finish result still wins for ranking", () => {
    const results = [finishResult("p1", "104", "2026-07-11T13:19:00.000Z")];
    const podium = computePodium("Boys 10-12", [waves[0]], roster, results, []);
    expect(podium.ranked).toHaveLength(1);
  });
});

describe("groupResultsByCategory", () => {
  const categories: CategoryDef[] = [
    { label: "Boys 10-12", distanceLabel: "Pedal Bike", genders: ["M"], ageMin: 10, ageMax: 12, maxSize: 9, ordering: "seed-ascending" },
    { label: "Girls 10-12", distanceLabel: "Pedal Bike", genders: ["F"], ageMin: 10, ageMax: 12, maxSize: 9, ordering: "seed-ascending" },
  ];
  const waves: WaveStart[] = [{ wave: 5, startedAt: "2026-07-11T13:14:02.000Z" }, { wave: 6, startedAt: "2026-07-11T13:20:15.000Z" }];
  const roster: RaceDayRosterEntry[] = [
    rosterEntry({ playerId: "p1", categoryLabel: "Boys 10-12", wave: 5, bib: 104 }),
    rosterEntry({ playerId: "p2", categoryLabel: "Boys 10-12", wave: 6, bib: 118 }), // overlapping wave, same category
    rosterEntry({ playerId: "p3", categoryLabel: "Girls 10-12", wave: 5, bib: 107 }),
  ];
  const startMarks: StartMark[] = [{ playerId: "p3", wave: 5, status: "dns", recordedAt: "" }];

  it("lists every wave number contributing to a category, even when waves overlap on course", () => {
    const results: FinishResult[] = [
      { rowId: "o1", bib: "104", playerId: "p1", finishTime: "2026-07-11T13:19:00.000Z", origin: "auto" },
      { rowId: "o2", bib: "118", playerId: "p2", finishTime: "2026-07-11T13:26:00.000Z", origin: "auto" },
    ];
    const standings = groupResultsByCategory(categories, waves, roster, results, [], startMarks);
    const boys = standings.find((s) => s.categoryLabel === "Boys 10-12")!;
    expect(boys.waveNumbers).toEqual([5, 6]);
    expect(boys.finishedCount).toBe(2);
  });

  it("reports a category with zero finishers yet without erroring", () => {
    const standings = groupResultsByCategory(categories, waves, roster, [], [], []);
    const girls = standings.find((s) => s.categoryLabel === "Girls 10-12")!;
    expect(girls.finishedCount).toBe(0);
    expect(girls.podium.ranked).toEqual([]);
  });

  it("counts DNS separately from DNF and finished", () => {
    const standings = groupResultsByCategory(categories, waves, roster, [], [], startMarks);
    const girls = standings.find((s) => s.categoryLabel === "Girls 10-12")!;
    expect(girls.dnsCount).toBe(1);
    expect(girls.totalCount).toBe(1);
  });
});

describe("addWalkUpRider", () => {
  const event: RaceEvent = {
    id: "individual",
    name: "Individual",
    type: "individual",
    order: 1,
    nameFormat: "{last} ,{first}",
    categories: [
      { label: "Boys 10-12", distanceLabel: "Pedal Bike", genders: ["M"], ageMin: 10, ageMax: 12, maxSize: 9, ordering: "seed-ascending" },
    ],
  };

  it("uses the explicit bib when given, ignoring nextBib", () => {
    const r = addWalkUpRider(
      { id: "walkup-1", firstName: "Wren", lastName: "Castellano", categoryLabel: "Boys 10-12", bib: "150" },
      event,
      999,
    );
    expect(r.bib).toBe("150");
  });

  it("falls back to nextBib when no explicit bib is given", () => {
    const r = addWalkUpRider(
      { id: "walkup-1", firstName: "Wren", lastName: "Castellano", categoryLabel: "Boys 10-12" },
      event,
      143,
    );
    expect(r.bib).toBe(143);
  });

  it("resolves the category's distanceLabel and leaves wave unassigned", () => {
    const r = addWalkUpRider(
      { id: "walkup-1", firstName: "Wren", lastName: "Castellano", categoryLabel: "Boys 10-12" },
      event,
      143,
    );
    expect(r.distanceLabel).toBe("Pedal Bike");
    expect(r.wave).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("warns when the category label doesn't match anything configured", () => {
    const r = addWalkUpRider(
      { id: "walkup-1", firstName: "Wren", lastName: "Castellano", categoryLabel: "Nonexistent Category" },
      event,
      143,
    );
    expect(r.warnings).toContain("Unknown category — director should verify");
  });
});
