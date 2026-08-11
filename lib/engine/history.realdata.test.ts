import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveFiveSixFactor, estimateLapTimes, mostRecentSwampDashSeason, parseHistoryCsv, summarizeCells } from "./history";

/**
 * Diagnostic against the REAL multi-season "Rider History Race Result" export
 * (minors' PII, lives outside the repo). Local-only, same pattern as
 * `realdata.test.ts`: reads from `$GATORS_DATA_DIR` (default
 * `../All 2025 Race Docs`), skipped automatically when the file isn't present
 * (e.g. in CI). Never imports PII into the repo.
 *
 * This isn't pinning exact numbers (the CSV gets re-exported/updated
 * periodically) — it's a fast, director-reviewable report on estimator
 * coverage and the derived 5-6 course factor, runnable with zero DB/UI built.
 */
const DATA_DIR = process.env.GATORS_DATA_DIR ?? path.resolve(__dirname, "../../../All 2025 Race Docs");
const HISTORY_CSV = path.join(DATA_DIR, "Rider History Race Result.csv");
const present = existsSync(HISTORY_CSV);

describe.skipIf(!present)("Rider history real-data diagnostics", () => {
  const history = parseHistoryCsv(readFileSync(HISTORY_CSV, "utf8"));

  it("classifies effectively every row's event", () => {
    const unclassified = history.filter((r) => r.raceSlug === null || r.season === null);
    if (unclassified.length) console.warn("Unclassified events:", [...new Set(unclassified.map((r) => r.eventLabel))]);
    expect(unclassified.length).toBeLessThan(history.length * 0.01);
  });

  it("derives a 5-6 course factor with a reasonable sample size", () => {
    const { factor, n } = deriveFiveSixFactor(history);
    console.log(`5-6 course factor: ${factor?.toFixed(3)} (n=${n} paired riders)`);
    expect(factor).not.toBeNull();
    expect(n).toBeGreaterThan(20);
    expect(factor!).toBeGreaterThan(1); // shorter course → 5-6 times are always faster than the correction predicts for 7+
  });

  it("reports estimate coverage for the most recent season's Swamp Dash field", () => {
    const targetSeason = mostRecentSwampDashSeason(history)!;
    const targets = history
      .filter((r) => r.raceSlug === "sd" && r.season === targetSeason)
      .map((r) => ({ firstName: r.firstName, lastName: r.lastName, ageOnRaceDay: r.age, gender: r.gender }));
    const estimates = estimateLapTimes(targets, history, { targetSeason, minCellSize: 5 });
    const byConfidence: Record<string, number> = {};
    let ambiguous = 0;
    for (const e of estimates.values()) {
      byConfidence[e.confidence] = (byConfidence[e.confidence] ?? 0) + 1;
      if (e.ambiguousName) ambiguous++;
    }
    console.log(`${targetSeason} SD field (n=${targets.length}) confidence breakdown:`, byConfidence, `ambiguous names: ${ambiguous}`);
    // Every rider in this season's own field should get at least a "direct" estimate — this is a
    // near-tautological floor (they ARE the data the target cell is built from), so a big miss
    // here means the age/gender/season parsing broke, not that the data is genuinely sparse.
    expect((byConfidence.direct ?? 0) + (byConfidence.widened ?? 0)).toBeGreaterThan(targets.length * 0.8);
  });

  it("prints per-cell coverage for Swamp Dash's most recent season (director-reviewable sanity check)", () => {
    const targetSeason = mostRecentSwampDashSeason(history)!;
    const cells = summarizeCells(history).filter((c) => c.raceSlug === "sd" && c.season === targetSeason && c.gender !== "*");
    console.log(
      `${targetSeason} Swamp Dash cells:`,
      cells.map((c) => `${c.ageBand} ${c.gender}: n=${c.n} median=${c.median.toFixed(1)}s`),
    );
    expect(cells.length).toBeGreaterThan(0);
  });
});
