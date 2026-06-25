import type { RaceConfig } from "@/lib/engine/models";
import { swampDashConfig } from "./sd";
import { johnBryanConfig } from "./jb";
import { chestnutScorcherConfig } from "./cs";
import { swampDashRelayConfig } from "./sdr";

/** The four seeded race configurations, keyed by slug. */
export const SEED_CONFIGS: RaceConfig[] = [
  swampDashConfig,
  johnBryanConfig,
  chestnutScorcherConfig,
  swampDashRelayConfig,
];

export function getSeedConfig(slug: string): RaceConfig | undefined {
  return SEED_CONFIGS.find((c) => c.slug === slug);
}

export { swampDashConfig, johnBryanConfig, chestnutScorcherConfig, swampDashRelayConfig };
