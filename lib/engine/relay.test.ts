import { describe, expect, it } from "vitest";
import type { RelayConfig, Rider } from "./models";
import { buildRelayTeams } from "./relay";

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
});
