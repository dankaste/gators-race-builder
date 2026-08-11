import { describe, expect, it } from "vitest";
import type { RelayConfig, Rider } from "./models";
import { buildRelayTeams, compareLegOrder } from "./relay";

const config: RelayConfig = {
  teamSize: 4,
  cups: ["Cup A", "Cup B"],
  characters: ["Link", "Mario", "Yoshi"],
  friendRequestField: "Teammate request",
};

let nextId = 1;
function rider(p: Partial<Rider> = {}): Rider {
  return {
    playerId: String(nextId++),
    firstName: "R",
    lastName: String(nextId),
    gender: "M",
    birthDate: "",
    ageOnRaceDay: 9,
    packageName: "Relay",
    bib: null,
    seedLevel: null,
    wave: null,
    categoryLabel: null,
    distanceLabel: null,
    warnings: [],
    ...p,
  };
}

describe("buildRelayTeams", () => {
  it("distributes riders across cup × character teams within teamSize", () => {
    const riders = Array.from({ length: 24 }, () => rider());
    const { teams } = buildRelayTeams(riders, config);
    expect(teams.every((t) => t.riders.length <= config.teamSize)).toBe(true);
    // every rider assigned
    expect(riders.every((r) => r.relay)).toBe(true);
    // 24 riders / teamSize 4 = 6 teams used (of 2×3=6 slots)
    expect(teams.length).toBe(6);
  });

  it("keeps requested friends on the same team", () => {
    const alice = rider({ firstName: "Alice", lastName: "Smith" });
    const bob = rider({ firstName: "Bob", lastName: "Jones", custom: { "Teammate request": "Alice Smith" } });
    const others = Array.from({ length: 10 }, () => rider());
    const { teams } = buildRelayTeams([bob, alice, ...others], config);
    const aliceTeam = teams.find((t) => t.riders.some((r) => r.firstName === "Alice"))!;
    expect(aliceTeam.riders.some((r) => r.firstName === "Bob")).toBe(true);
  });

  it("reports unmatched friend requests", () => {
    const a = rider({ firstName: "Solo", lastName: "Rider", custom: { "Teammate request": "Nobody Here" } });
    const { unmatchedFriends } = buildRelayTeams([a, rider(), rider()], config);
    expect(unmatchedFriends).toEqual([{ rider: "Solo Rider", requested: "Nobody Here" }]);
  });

  it("splits a multi-name request and matches every name found, even when some don't match", () => {
    const alice = rider({ firstName: "Alice", lastName: "Smith" });
    const bob = rider({ firstName: "Bob", lastName: "Jones" });
    const req = rider({
      firstName: "Req",
      lastName: "Ester",
      custom: { "Teammate request": "Alice Smith, Bob Jones and Nobody Here" },
    });
    const { teams, unmatchedFriends } = buildRelayTeams([req, alice, bob, ...Array.from({ length: 9 }, () => rider())], config);
    const team = teams.find((t) => t.riders.some((r) => r.firstName === "Req"))!;
    // The one unfindable name doesn't stop the two real matches from grouping.
    expect(team.riders.map((r) => r.firstName).sort()).toEqual(["Alice", "Bob", "Req"]);
    expect(unmatchedFriends).toEqual([{ rider: "Req Ester", requested: "Nobody Here" }]);
  });

  it("treats a non-answer (NA/none/etc) as no request at all, not an unmatched one", () => {
    for (const nonAnswer of ["NA", "N/A", "none", "None", "no one", "nobody", "-", "TBD"]) {
      const a = rider({ firstName: "Solo", lastName: "Rider", custom: { "Teammate request": nonAnswer } });
      const { unmatchedFriends } = buildRelayTeams([a, rider(), rider()], config);
      expect(unmatchedFriends).toEqual([]);
    }
  });

  it("assigns sequential legs within a team", () => {
    // A chain of friend requests forces all four onto one team (teamSize 4).
    const a = rider({ firstName: "A", lastName: "X", seedLevel: 3 });
    const b = rider({ firstName: "B", lastName: "X", seedLevel: 1, custom: { "Teammate request": "A X" } });
    const c = rider({ firstName: "C", lastName: "X", seedLevel: 0, custom: { "Teammate request": "B X" } });
    const d = rider({ firstName: "D", lastName: "X", seedLevel: 2, custom: { "Teammate request": "C X" } });
    const { teams } = buildRelayTeams([a, b, c, d, ...Array.from({ length: 8 }, () => rider())], config);
    const team = teams.find((t) => t.riders.length === 4 && t.riders.every((r) => r.lastName === "X"))!;
    expect(team).toBeTruthy();
    expect(team.riders.map((r) => r.relay!.leg)).toEqual([1, 2, 3, 4]);
    // legs ordered by seed (slowest/lowest first)
    expect(team.riders.map((r) => r.seedLevel)).toEqual([0, 1, 2, 3]);
  });

  it("falls back to seedLevel-sum balancing (identical placement rule) when no rider has a lap-time estimate", () => {
    // Same 24-singleton shape as the first test, but with varied seedLevel — the
    // pre-history signal. This exercises the (count, skillSum) fallback tie-break
    // directly, not just the "everyone identical" case the first test covers.
    const riders = Array.from({ length: 24 }, (_, i) => rider({ seedLevel: i % 5 }));
    const { teams } = buildRelayTeams(riders, config);
    expect(teams.length).toBe(6);
    expect(teams.every((t) => t.riders.length === 4)).toBe(true);
    expect(riders.every((r) => r.relay)).toBe(true);
  });

  it("balances cup and team averages around estimated lap time, not just headcount", () => {
    const seconds = [100, 120, 140, 160, 180, 200, 220, 240];
    const riders = seconds.map((s) => rider({ estimatedLapSeconds: s, estimatedLapConfidence: "direct" }));
    const { teams } = buildRelayTeams(riders, config);
    const byCup = new Map<string, number[]>();
    for (const t of teams) {
      const arr = byCup.get(t.cup) ?? [];
      arr.push(...t.riders.map((r) => r.estimatedLapSeconds!));
      byCup.set(t.cup, arr);
    }
    const overallMean = seconds.reduce((a, b) => a + b, 0) / seconds.length;
    for (const times of byCup.values()) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeCloseTo(overallMean, 5);
    }
  });

  it("interleaves no-estimate riders by headcount rather than dumping them all in one cup/team", () => {
    const estimated = [100, 200].map((s) => rider({ estimatedLapSeconds: s, estimatedLapConfidence: "direct" }));
    const unestimated = Array.from({ length: 10 }, () => rider());
    const { teams } = buildRelayTeams([...estimated, ...unestimated], config);
    const cupCounts = new Map<string, number>();
    for (const t of teams) cupCounts.set(t.cup, (cupCounts.get(t.cup) ?? 0) + t.riders.length);
    const counts = [...cupCounts.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("splits a friend group larger than teamSize into team-sized chunks and flags it", () => {
    const names = ["A", "B", "C", "D", "E"]; // 5 friends, teamSize is 4
    const riders = names.map((n, i) =>
      rider({
        firstName: n,
        lastName: "Big",
        ...(i > 0 ? { custom: { "Teammate request": `${names[i - 1]} Big` } } : {}),
      }),
    );
    const { teams, splitGroups } = buildRelayTeams([...riders, ...Array.from({ length: 7 }, () => rider())], config);
    expect(splitGroups).toHaveLength(1);
    expect(splitGroups[0].riders.sort()).toEqual(names.map((n) => `${n} Big`).sort());
    // No team ever silently overflows past teamSize.
    expect(teams.every((t) => t.riders.length <= config.teamSize)).toBe(true);
    // All 5 friends still placed somewhere.
    const placedNames = teams.flatMap((t) => t.riders.map((r) => `${r.firstName} ${r.lastName}`));
    for (const n of names) expect(placedNames).toContain(`${n} Big`);
  });

  it("ranks legs by estimated lap time (slowest/highest-seconds first) when present", () => {
    const a = rider({ firstName: "A", lastName: "X", estimatedLapSeconds: 150, estimatedLapConfidence: "direct" });
    const b = rider({
      firstName: "B",
      lastName: "X",
      estimatedLapSeconds: 100,
      estimatedLapConfidence: "direct",
      custom: { "Teammate request": "A X" },
    });
    const c = rider({
      firstName: "C",
      lastName: "X",
      estimatedLapSeconds: 200,
      estimatedLapConfidence: "direct",
      custom: { "Teammate request": "B X" },
    });
    const d = rider({
      firstName: "D",
      lastName: "X",
      estimatedLapSeconds: 175,
      estimatedLapConfidence: "direct",
      custom: { "Teammate request": "C X" },
    });
    const { teams } = buildRelayTeams([a, b, c, d, ...Array.from({ length: 8 }, () => rider())], config);
    const team = teams.find((t) => t.riders.length === 4 && t.riders.every((r) => r.lastName === "X"))!;
    expect(team.riders.map((r) => r.estimatedLapSeconds)).toEqual([200, 175, 150, 100]);
  });
});

describe("compareLegOrder", () => {
  it("preserves seedLevel-ascending order (slowest first) when nobody has an estimate", () => {
    const a = rider({ seedLevel: 3 });
    const b = rider({ seedLevel: 1 });
    const c = rider({ seedLevel: 0 });
    expect([a, b, c].sort(compareLegOrder)).toEqual([c, b, a]);
  });

  it("ranks estimated riders before unestimated ones regardless of seedLevel", () => {
    const fast = rider({ estimatedLapSeconds: 100, seedLevel: 20 }); // "fast" by time, but high seedLevel
    const slowNoEstimate = rider({ seedLevel: 0 });
    // Estimated riders form their own leading bucket even though their raw seedLevel would otherwise sort them last.
    expect([slowNoEstimate, fast].sort(compareLegOrder)).toEqual([fast, slowNoEstimate]);
  });
});
