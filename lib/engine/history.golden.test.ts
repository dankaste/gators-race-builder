import { describe, expect, it } from "vitest";
import { summarizeCells, type HistoryRow } from "./history";
import fixture from "./__fixtures__/history-golden.json";

/**
 * Golden test against the real 8-season history export. The fixture is
 * sanitized — event/season/category/age/gender/time/place/groupSize only,
 * `Name`/`Bib` dropped entirely — so it's safe to commit and run in CI,
 * matching `lib/configs/golden.test.ts`'s fixture posture.
 *
 * This pins cell-math (median/n per cohort) against real distributions, not
 * synthetic data. It deliberately does NOT cover `deriveFiveSixFactor` or
 * `estimateLapTimes`'s name-matching path — both require tracking the same
 * individual across seasons, which needs the name the fixture intentionally
 * omits. Those are covered by the (local-only, real-data) diagnostic test in
 * `realdata.test.ts` instead.
 */
describe("history cell math against the real dataset", () => {
  const history = fixture as HistoryRow[];
  const cells = summarizeCells(history);
  const cellByKey = new Map(cells.map((c) => [`${c.raceSlug}|${c.season}|${c.ageBand}|${c.gender}`, c]));

  it("classifies almost every row's event (regression guard on the header-variant patterns)", () => {
    const unclassified = history.filter((r) => r.raceSlug === null || r.season === null);
    expect(unclassified).toHaveLength(0);
  });

  it("puts every timed, age-recoverable row into exactly one race/season/age-band's widened ('*') bucket", () => {
    const usable = history.filter((r) => r.raceSlug && r.season && r.timeSeconds !== null);
    const totalInStarCells = cells.filter((c) => c.gender === "*").reduce((n, c) => n + c.n, 0);
    // A handful of rows (all-blank-Age John Bryan 2024 rows whose category label also has no age range)
    // can't be assigned an age band at all and are legitimately dropped — allow a small gap, not zero.
    expect(totalInStarCells).toBeGreaterThan(usable.length - 20);
    expect(totalInStarCells).toBeLessThanOrEqual(usable.length);
  });

  it("has a well-populated 2025 Swamp Dash 9-10 boys cell", () => {
    const cell = cellByKey.get("sd|2025|9-10|M");
    expect(cell).toBeTruthy();
    expect(cell!.n).toBeGreaterThanOrEqual(5);
    // Sanity band for a ~1-lap kids pump-track course, not an exact pin (times shift year to year).
    expect(cell!.median).toBeGreaterThan(60);
    expect(cell!.median).toBeLessThan(400);
  });

  it("keeps the 5-6 band's median well under the 7-8 band's for the same Swamp Dash season (shorter course)", () => {
    const five6 = cellByKey.get("sd|2025|5-6|*");
    const seven8 = cellByKey.get("sd|2025|7-8|*");
    expect(five6).toBeTruthy();
    expect(seven8).toBeTruthy();
    expect(five6!.median).toBeLessThan(seven8!.median);
  });
});
