import { describe, expect, it } from "vitest";
import type { RelayConfig, Rider } from "./models";
import { assignCups, buildRelayTeams, compareLegOrder } from "./relay";

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

  it("groups riders via a director-confirmed manual match, without clearing the original unmatched-request note", () => {
    const bob = rider({ firstName: "Bob", lastName: "Jones" });
    const solo = rider({
      firstName: "Solo",
      lastName: "Rider",
      custom: { "Teammate request": "Bobby" }, // free text that doesn't auto-match "Bob Jones"
      manualFriendMatches: [bob.playerId], // director resolved it by hand on the review screen
    });
    const { teams, unmatchedFriends } = buildRelayTeams([solo, bob, ...Array.from({ length: 10 }, () => rider())], config);
    // Still grouped together despite the name never auto-matching.
    const team = teams.find((t) => t.riders.some((r) => r.firstName === "Solo"))!;
    expect(team.riders.some((r) => r.firstName === "Bob")).toBe(true);
    // The raw request still shows up as unmatched — the manual match is additive, not a fix to the text itself.
    expect(unmatchedFriends).toEqual([{ rider: "Solo Rider", requested: "Bobby" }]);
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

  it("tiers cups slowest-to-fastest by estimated lap time, not converged to a single mean", () => {
    // Cups are time-staggered heats, not interchangeable bins: cups[0] should get the
    // slowest riders, the last cup the fastest — the opposite of the old mean-converging design.
    const tieredConfig: RelayConfig = { ...config, cups: ["Cup 1", "Cup 2", "Cup 3", "Cup 4"] };
    const seconds = [100, 120, 140, 160, 180, 200, 220, 240];
    const riders = seconds.map((s) => rider({ estimatedLapSeconds: s, estimatedLapConfidence: "direct" }));
    const { teams } = buildRelayTeams(riders, tieredConfig);
    const avgByCup = new Map<string, number>();
    for (const t of teams) {
      const times = t.riders.map((r) => r.estimatedLapSeconds!);
      const arr = [...(avgByCup.has(t.cup) ? [avgByCup.get(t.cup)!] : []), ...times];
      avgByCup.set(t.cup, arr.reduce((a, b) => a + b, 0) / arr.length);
    }
    const cupAverages = tieredConfig.cups.map((c) => avgByCup.get(c)).filter((a): a is number => a != null);
    // Strictly descending: Cup 1 slowest (highest seconds) through Cup 4 fastest (lowest).
    for (let i = 1; i < cupAverages.length; i++) expect(cupAverages[i]).toBeLessThan(cupAverages[i - 1]);
  });

  it("assignCups is the exact same source of truth buildRelayTeams uses (review screen can't disagree with the build)", () => {
    const tieredConfig: RelayConfig = { ...config, cups: ["Cup 1", "Cup 2", "Cup 3", "Cup 4"] };
    const alice = rider({ firstName: "Alice", lastName: "Smith", estimatedLapSeconds: 200, estimatedLapConfidence: "direct" });
    const bob = rider({
      firstName: "Bob",
      lastName: "Jones",
      estimatedLapSeconds: 120,
      estimatedLapConfidence: "direct",
      custom: { "Teammate request": "Alice Smith" },
    });
    const others = Array.from({ length: 10 }, (_, i) =>
      rider({ estimatedLapSeconds: 100 + i * 15, estimatedLapConfidence: "direct" }),
    );
    const riders = [alice, bob, ...others];
    const clone = riders.map((r) => ({ ...r }));
    const { riderCupIndex } = assignCups(clone, tieredConfig);
    const { teams } = buildRelayTeams(riders.map((r) => ({ ...r })), tieredConfig);
    // Rebuild "which cup index did each rider actually land in" from the real build's output, by identity (firstName+lastName is unique in this fixture).
    const cupIndexOf = new Map(tieredConfig.cups.map((c, i) => [c, i]));
    const actualCupIndex = new Map<string, number>();
    for (const t of teams) for (const r of t.riders) actualCupIndex.set(`${r.firstName} ${r.lastName}`, cupIndexOf.get(t.cup)!);
    riders.forEach((r, i) => {
      expect(riderCupIndex[i]).toBe(actualCupIndex.get(`${r.firstName} ${r.lastName}`));
    });
  });

  it("places a mixed-speed friend group at its slowest member's tier and flags it, instead of averaging them into a middle tier", () => {
    const tieredConfig: RelayConfig = { ...config, cups: ["Cup 1", "Cup 2", "Cup 3", "Cup 4"] };
    const slowKid = rider({ firstName: "Slow", lastName: "Kid", estimatedLapSeconds: 300, estimatedLapConfidence: "direct" });
    const fastFriend = rider({
      firstName: "Fast",
      lastName: "Friend",
      estimatedLapSeconds: 100,
      estimatedLapConfidence: "direct",
      custom: { "Teammate request": "Slow Kid" },
    });
    // Filler riders spanning the same 100-300 range so cup boundaries are meaningful.
    const filler = Array.from({ length: 10 }, (_, i) =>
      rider({ estimatedLapSeconds: 100 + i * 20, estimatedLapConfidence: "direct" }),
    );
    const riders = [slowKid, fastFriend, ...filler];
    const { groups, riderCupIndex } = assignCups(riders, tieredConfig);
    const group = groups.find((g) => g.indices.some((i) => riders[i] === slowKid))!;
    expect(group.mixedSpeed).toBe(true);
    // Both friends land in the SAME cup (kept together), and it's the slow kid's tier, not a faster one.
    const slowIdx = riders.indexOf(slowKid);
    const fastIdx = riders.indexOf(fastFriend);
    expect(riderCupIndex[slowIdx]).toBe(riderCupIndex[fastIdx]);
    // The group's rank is the slower member's time, not the (much faster) average.
    expect(group.rank).toBe(300);
  });

  it("keeps every cup at or under capacity AND stays tiered when group sizes don't divide the even-split target evenly", () => {
    // teamSize 4, 3 characters => capacity 12/cup. 7 groups of 3 (21 riders, all
    // ≤ teamSize so none get split) across 4 cups: 21/4 doesn't divide evenly
    // (target = ceil(21/4) = 6), so some cup boundary has to absorb a group that
    // pushes it past the soft target — this is exactly the branch `target` vs
    // `capacity` (two separate conditions, not Math.min) exists for.
    const tieredConfig: RelayConfig = { ...config, cups: ["Cup 1", "Cup 2", "Cup 3", "Cup 4"] };
    let seconds = 700;
    const groupsOfRiders: Rider[][] = Array.from({ length: 7 }, (_, g) => {
      seconds -= 50;
      const t = seconds;
      return Array.from({ length: 3 }, (_, m) =>
        rider({
          firstName: `G${g}M${m}`,
          lastName: "Fam",
          estimatedLapSeconds: t,
          estimatedLapConfidence: "direct",
          ...(m > 0 ? { custom: { "Teammate request": `G${g}M${m - 1} Fam` } } : {}),
        }),
      );
    });
    const riders = groupsOfRiders.flat();
    const { teams, splitGroups } = buildRelayTeams(riders, tieredConfig);
    expect(splitGroups).toHaveLength(0); // groups of 3 fit within teamSize 4 — never split

    const timesByCup = new Map<string, number[]>();
    for (const t of teams) {
      const arr = timesByCup.get(t.cup) ?? [];
      arr.push(...t.riders.map((r) => r.estimatedLapSeconds!));
      timesByCup.set(t.cup, arr);
    }
    const capacity = tieredConfig.teamSize * tieredConfig.characters.length;
    for (const times of timesByCup.values()) expect(times.length).toBeLessThanOrEqual(capacity);
    expect([...timesByCup.values()].reduce((n, arr) => n + arr.length, 0)).toBe(21);

    // Still tiered: non-increasing cup averages from Cup 1 (slowest) to Cup 4 (fastest).
    const cupAverages = tieredConfig.cups
      .map((c) => timesByCup.get(c))
      .filter((arr): arr is number[] => !!arr && arr.length > 0)
      .map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
    for (let i = 1; i < cupAverages.length; i++) expect(cupAverages[i]).toBeLessThanOrEqual(cupAverages[i - 1]);
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
