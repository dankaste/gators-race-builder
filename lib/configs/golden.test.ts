import { describe, expect, it } from "vitest";
import { matchCategory } from "@/lib/engine/categorize";
import type { Gender } from "@/lib/engine/models";
import { chestnutScorcherConfig } from "./cs";
import { johnBryanConfig } from "./jb";
import { swampDashRelayConfig } from "./sdr";
import csGolden from "./__fixtures__/cs-golden.json";
import jbGolden from "./__fixtures__/jb-golden.json";
import sdrStandardGolden from "./__fixtures__/sdr-standard-golden.json";

interface CsTuple {
  package: string;
  gender: string;
  age: number;
  label: string;
  distance: string;
}
interface JbTuple {
  package: string;
  gender: string;
  age: number;
  label: string;
}

/**
 * Golden tests: every (package, gender, age) tuple observed in the real 2025
 * output must reproduce the exact WebScorer category label. Fixtures are
 * sanitized — demographics + labels only, no PII — so they are safe to commit
 * and run in CI. This is the strongest guard that per-race configs are correct.
 */
describe("Chestnut Scorcher golden categorization", () => {
  const cats = chestnutScorcherConfig.events[0].categories;
  it.each(csGolden as CsTuple[])(
    "$package $gender age $age -> $label",
    ({ package: pkg, gender, age, label, distance }) => {
      const cat = matchCategory(
        { gender: gender as Gender, ageOnRaceDay: age, packageName: pkg },
        cats,
      );
      expect(cat?.label).toBe(label);
      expect(cat?.distanceLabel).toBe(distance);
    },
  );
});

describe("John Bryan golden categorization", () => {
  const cats = johnBryanConfig.events[0].categories;
  it.each(jbGolden as JbTuple[])(
    "$package $gender age $age -> $label",
    ({ package: pkg, gender, age, label }) => {
      const cat = matchCategory(
        { gender: gender as Gender, ageOnRaceDay: age, packageName: pkg },
        cats,
      );
      expect(cat?.label).toBe(label);
    },
  );
});

describe("Swamp Dash Relay — standard race golden categorization", () => {
  // The standard pedal race is event[0]; the relay (event[1]) is assigned separately.
  const cats = swampDashRelayConfig.events[0].categories;
  it.each(sdrStandardGolden as JbTuple[])(
    "$package $gender age $age -> $label",
    ({ package: pkg, gender, age, label }) => {
      const cat = matchCategory(
        { gender: gender as Gender, ageOnRaceDay: age, packageName: pkg },
        cats,
      );
      expect(cat?.label).toBe(label);
    },
  );
});
