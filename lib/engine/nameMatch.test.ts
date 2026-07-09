import { describe, expect, it } from "vitest";
import { matchBibCandidates, nameKeys, normName, type BibSource } from "./nameMatch";

describe("normName", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normName("  Anna   Smith ")).toBe("anna smith");
    expect(normName("ANNA")).toBe("anna");
  });
});

describe("nameKeys", () => {
  it("produces both name-order permutations plus comma forms", () => {
    expect(nameKeys("Anna", "Smith")).toEqual(
      expect.arrayContaining(["anna smith", "smith anna", "smith, anna", "smith ,anna"]),
    );
  });

  it("still produces a usable key when only one piece is present", () => {
    expect(nameKeys("Anna", "")).toContain("anna");
  });
});

function source(partial: Partial<BibSource> & { riders: BibSource["riders"] }): BibSource {
  return { raceSlug: "sd", projectName: "Swamp Dash 2026", updatedAt: new Date("2026-01-01"), ...partial };
}

describe("matchBibCandidates", () => {
  it("matches a bib-less rider by name against another race's rider", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 42, birthDate: "" }] })];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith" }], sources);
    expect(result.get(0)).toMatchObject({ bib: 42, raceSlug: "sd", projectName: "Swamp Dash 2026" });
  });

  it("matches regardless of first/last order swap (data-entry mistake)", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 7, birthDate: "" }] })];
    const result = matchBibCandidates([{ firstName: "Smith", lastName: "Anna" }], sources);
    expect(result.get(0)?.bib).toBe(7);
  });

  it("does not match a different name", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 42, birthDate: "" }] })];
    const result = matchBibCandidates([{ firstName: "Bob", lastName: "Jones" }], sources);
    expect(result.has(0)).toBe(false);
  });

  it("ignores source riders with no bib", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: null, birthDate: "" }] })];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith" }], sources);
    expect(result.has(0)).toBe(false);
  });

  it("matches when birthDates agree", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 42, birthDate: "4/26/2021" }] })];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith", birthDate: "4/26/2021" }], sources);
    expect(result.get(0)?.bib).toBe(42);
  });

  it("skips the match when both birthDates parse cleanly and disagree (different person, same name)", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 42, birthDate: "4/26/2021" }] })];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith", birthDate: "5/1/2020" }], sources);
    expect(result.has(0)).toBe(false);
  });

  it("does not block a match on formatting differences that still parse to the same date", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 42, birthDate: "4/26/2021" }] })];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith", birthDate: "04/26/2021" }], sources);
    expect(result.get(0)?.bib).toBe(42);
  });

  it("treats an unparseable birthDate on either side as no information, not a mismatch", () => {
    const sources = [source({ riders: [{ firstName: "Anna", lastName: "Smith", bib: 42, birthDate: "not-a-date" }] })];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith", birthDate: "4/26/2021" }], sources);
    expect(result.get(0)?.bib).toBe(42);
  });

  it("prefers the most-recently-updated source when two sources disagree on the bib, and reports the conflict", () => {
    const older = source({
      raceSlug: "jb",
      projectName: "John Bryan 2026",
      updatedAt: new Date("2026-01-01"),
      riders: [{ firstName: "Anna", lastName: "Smith", bib: 10, birthDate: "" }],
    });
    const newer = source({
      raceSlug: "cs",
      projectName: "Chestnut Scorcher 2026",
      updatedAt: new Date("2026-02-01"),
      riders: [{ firstName: "Anna", lastName: "Smith", bib: 99, birthDate: "" }],
    });
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith" }], [older, newer]);
    expect(result.get(0)).toMatchObject({ bib: 99, raceSlug: "cs", conflict: { raceSlug: "jb", bib: 10 } });
  });

  it("does not report a conflict when multiple sources agree on the same bib", () => {
    const sources = [
      source({ raceSlug: "jb", riders: [{ firstName: "Anna", lastName: "Smith", bib: 10, birthDate: "" }] }),
      source({ raceSlug: "cs", riders: [{ firstName: "Anna", lastName: "Smith", bib: 10, birthDate: "" }] }),
    ];
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith" }], sources);
    expect(result.get(0)).toMatchObject({ bib: 10 });
    expect(result.get(0)?.conflict).toBeUndefined();
  });

  it("returns nothing when there are no sources", () => {
    const result = matchBibCandidates([{ firstName: "Anna", lastName: "Smith" }], []);
    expect(result.size).toBe(0);
  });
});
