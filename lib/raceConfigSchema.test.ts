import { describe, expect, it } from "vitest";
import { SEED_CONFIGS } from "@/lib/configs";
import { raceConfigSchema } from "./raceConfigSchema";

describe("raceConfigSchema", () => {
  it.each(SEED_CONFIGS.map((c) => [c.slug, c] as const))(
    "validates the seeded %s config (editor round-trip)",
    (_slug, config) => {
      const result = raceConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    },
  );

  it("rejects an invalid slug", () => {
    expect(raceConfigSchema.safeParse({ ...SEED_CONFIGS[0], slug: "Bad Slug!" }).success).toBe(false);
  });

  it("rejects a config with no events", () => {
    expect(raceConfigSchema.safeParse({ ...SEED_CONFIGS[0], events: [] }).success).toBe(false);
  });
});
