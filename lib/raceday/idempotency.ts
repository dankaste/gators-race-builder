import "server-only";
import type { getRaceDayDb } from "@/db/racedayDb";
import { raceDayIdempotencyKeys } from "@/db/schema";

/**
 * Generic replay guard for endpoints with no natural key to upsert against
 * (the append-only finish-tap/finish-order writes specifically — see
 * lib/engine/raceDay.ts's docs on why those can't just be upserted). Returns
 * `true` if this key has already been recorded (a retry/replay — the caller
 * should skip re-processing), `false` on first use.
 */
export async function isReplay(
  db: ReturnType<typeof getRaceDayDb>,
  key: string,
  route: string,
  projectId: string,
): Promise<boolean> {
  const inserted = await db.insert(raceDayIdempotencyKeys).values({ key, route, projectId }).onConflictDoNothing().returning();
  return inserted.length === 0;
}
