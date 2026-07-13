import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { raceDayPushSubscriptions } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

const bodySchema = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  label: z.string().optional(),
});

/**
 * Registers a device's push subscription — called once per device during
 * pre-race prep, after "Add to Home Screen" + `PushManager.subscribe()`.
 * Cloud-only: always the real Postgres, never the hub's PGlite, since this
 * table only matters for the cloud-push EVAC channel.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { endpoint, keys, label } = parsed.data;

  await getDb()
    .insert(raceDayPushSubscriptions)
    .values({ projectId, endpoint, p256dhKey: keys.p256dh, authKey: keys.auth, label })
    .onConflictDoUpdate({
      target: raceDayPushSubscriptions.endpoint,
      set: { projectId, p256dhKey: keys.p256dh, authKey: keys.auth, label },
    });

  return NextResponse.json({ ok: true });
}
