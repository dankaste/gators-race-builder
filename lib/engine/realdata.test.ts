import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRegistrations } from "./parse";
import { transformEvent } from "./transform";
import { validate } from "./validate";
import { checkInTable, waveStagerTable, allHandouts } from "./handouts";
import { toWebScorerCsv } from "./export_webscorer";
import { swampDashConfig } from "@/lib/configs/sd";

/**
 * Golden / invariant test against the REAL 2025 Swamp Dash registration export.
 *
 * The data contains minors' PII and lives OUTSIDE the repo, so this test is
 * local-only: it reads from `$GATORS_DATA_DIR` (default: ../All 2025 Race Docs)
 * and is skipped automatically when the file isn't present (e.g. in CI). It
 * never imports PII into the repo.
 */
const DATA_DIR =
  process.env.GATORS_DATA_DIR ??
  path.resolve(__dirname, "../../../All 2025 Race Docs");
const SD_RAW = path.join(DATA_DIR, "2025 Race Plans/SD/Raw Reg 2025 SD.csv");
const present = existsSync(SD_RAW);

describe.skipIf(!present)("2025 Swamp Dash real-data invariants", () => {
  const event = swampDashConfig.events[0];
  const RACE_DATE = "2025-06-21";

  it("parses all 283 completed registrations", () => {
    const regs = parseRegistrations(readFileSync(SD_RAW, "utf8"));
    expect(regs.length).toBe(283);
  });

  it("categorizes every rider (config covers the real field)", () => {
    const regs = parseRegistrations(readFileSync(SD_RAW, "utf8"));
    const { riders, uncategorized } = transformEvent({
      registrations: regs,
      roster: [],
      event,
      raceDate: RACE_DATE,
    });
    expect(riders.length).toBe(283);
    if (uncategorized.length) {
      // Surface any gaps with detail so the config can be fixed.
      console.warn(
        "Uncategorized:",
        uncategorized.map((r) => `${r.gender}/${r.ageOnRaceDay}/${r.packageName}`),
      );
    }
    expect(uncategorized.length).toBe(0);
  });

  it("keeps every wave within its category max size", () => {
    const regs = parseRegistrations(readFileSync(SD_RAW, "utf8"));
    const { riders } = transformEvent({ registrations: regs, roster: [], event, raceDate: RACE_DATE });
    const maxByLabel = new Map(event.categories.map((c) => [c.label, c.maxSize]));
    const sizeByWave = new Map<number, { label: string; n: number }>();
    for (const r of riders) {
      if (r.wave == null || !r.categoryLabel) continue;
      const cur = sizeByWave.get(r.wave) ?? { label: r.categoryLabel, n: 0 };
      cur.n += 1;
      sizeByWave.set(r.wave, cur);
    }
    for (const { label, n } of sizeByWave.values()) {
      expect(n).toBeLessThanOrEqual(maxByLabel.get(label)!);
    }
  });

  it("full dry-run: transform -> validate -> export -> handouts reconcile", () => {
    const regs = parseRegistrations(readFileSync(SD_RAW, "utf8"));
    const { riders } = transformEvent({ registrations: regs, roster: [], event, raceDate: RACE_DATE });
    const summary = validate(riders, event);

    // counts reconcile to the registration total
    expect(summary.categorized).toBe(283);
    expect(summary.uncategorized).toBe(0);
    expect(summary.waveWarnings.length).toBe(0);

    // WebScorer export: 1 header + one row per rider
    expect(toWebScorerCsv(riders, event).trim().split("\n").length).toBe(284);

    // handouts cover everyone
    expect(checkInTable(riders).rows.length).toBe(283);
    expect(waveStagerTable(riders).rows.length).toBe(283);
    const handouts = allHandouts(riders, event, { startTime: "09:30", minutesPerWave: 5 });
    expect(handouts.map((h) => h.title)).toEqual(["Check-In", "Wave Stager", "Podium", "Schedule"]);
  });
});
