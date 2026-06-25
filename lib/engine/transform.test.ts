import { describe, expect, it } from "vitest";
import type { RegistrationRow, RosterEntry } from "./models";
import { transformEvent } from "./transform";
import { swampDashConfig } from "@/lib/configs/sd";

const RACE_DATE = "2025-06-21";
const event = swampDashConfig.events[0];

function reg(p: Partial<RegistrationRow> & { playerId: string }): RegistrationRow {
  return {
    firstName: "Test",
    lastName: "Rider",
    gender: "M",
    birthDate: "1/1/2016", // age 9 on race date
    packageName: "Pedal Bike",
    status: "Completed",
    ...p,
  };
}

function roster(p: Partial<RosterEntry> & { id: string }): RosterEntry {
  return {
    firstName: "Test",
    lastName: "Rider",
    bib: 100,
    gender: "M",
    birthDate: "1/1/2016",
    ...p,
  };
}

describe("transformEvent (Swamp Dash pipeline)", () => {
  it("categorizes, pulls bib from roster, and assigns waves", () => {
    const registrations = [
      reg({ playerId: "1", gender: "F", birthDate: "1/1/2021", packageName: "Balance Bike" }),
      reg({ playerId: "2", gender: "M", birthDate: "1/1/2021", packageName: "Balance Bike" }),
    ];
    const rosterData = [
      roster({ id: "1", bib: 701, gender: "F" }),
      roster({ id: "2", bib: 702, gender: "M" }),
    ];
    const { riders } = transformEvent({ registrations, roster: rosterData, event, raceDate: RACE_DATE });

    expect(riders).toHaveLength(2);
    const f = riders.find((r) => r.playerId === "1")!;
    expect(f.categoryLabel).toBe("Balance F");
    expect(f.bib).toBe(701);
    expect(f.ageOnRaceDay).toBe(4);
    expect(f.wave).toBe(1);
  });

  it("drops canceled registrations", () => {
    const registrations = [
      reg({ playerId: "1" }),
      reg({ playerId: "2", status: "Canceled" }),
    ];
    const { riders } = transformEvent({ registrations, roster: [roster({ id: "1" })], event, raceDate: RACE_DATE });
    expect(riders.map((r) => r.playerId)).toEqual(["1"]);
  });

  it("warns when no bib match exists in roster", () => {
    const { riders } = transformEvent({ registrations: [reg({ playerId: "99" })], roster: [], event, raceDate: RACE_DATE });
    expect(riders[0].bib).toBeNull();
    expect(riders[0].warnings).toContain("No bib match in roster — assign manually");
  });

  it("seeds 9-10 waves slowest-first from team level", () => {
    // 11 nine-year-old boys; teams span beginner->advanced.
    const teams = [
      "Blue Balance", "Red Rollers", "Green Rollers", "Red Grinders", "Blue Grinders",
      "Red Advanced", "Green Advanced", "Blue Advanced", "Pink Advanced", "White Advanced", "Black Advanced",
    ];
    const registrations = teams.map((_, i) => reg({ playerId: String(i + 1), firstName: `r${i}` }));
    const rosterData = teams.map((team, i) => roster({ id: String(i + 1), team, bib: 200 + i }));

    const { riders } = transformEvent({ registrations, roster: rosterData, event, raceDate: RACE_DATE });
    const wave1 = riders.filter((r) => r.wave === 1);
    const wave2 = riders.filter((r) => r.wave === 2);
    expect(wave1).toHaveLength(6);
    expect(wave2).toHaveLength(5);
    // slowest (lowest team level) all in wave 1
    const maxW1 = Math.max(...wave1.map((r) => r.seedLevel!));
    const minW2 = Math.min(...wave2.map((r) => r.seedLevel!));
    expect(maxW1).toBeLessThanOrEqual(minW2);
  });

  it("flags riders that match no category", () => {
    const { uncategorized } = transformEvent({
      registrations: [reg({ playerId: "1", birthDate: "1/1/2000" })], // age 25
      roster: [roster({ id: "1", birthDate: "1/1/2000" })],
      event,
      raceDate: RACE_DATE,
    });
    expect(uncategorized).toHaveLength(1);
    expect(uncategorized[0].warnings).toContain("No matching category");
  });
});
