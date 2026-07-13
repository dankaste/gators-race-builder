import "server-only";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "@/db";
import { raceDayPushSubscriptions } from "@/db/schema";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails("mailto:director@example.com", publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Fans out a real Web Push notification to every device subscribed for this
 * project — reaching spotters out of the hub's LAN range, and devices even
 * if their browser tab isn't open. Cloud-only: `race_day_push_subscriptions`
 * lives in the cloud DB, never the hub's PGlite (see db/schema.ts), so this
 * always operates against `getDb()` directly regardless of RACEDAY_MODE.
 * Silently a no-op if VAPID keys aren't configured, rather than throwing —
 * the LAN broadcast (the other EVAC channel) still works either way.
 */
export async function sendEvacPush(projectId: string): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await getDb()
    .select()
    .from(raceDayPushSubscriptions)
    .where(eq(raceDayPushSubscriptions.projectId, projectId));

  const payload = JSON.stringify({
    title: "🚨 EVACUATE",
    body: "Leave the course immediately and follow marshal instructions.",
  });

  await Promise.all(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } },
          payload,
        )
        .catch((err) => {
          // A dead/expired subscription shouldn't block alerting everyone else.
          console.error(`Push failed for subscription ${sub.id}:`, err);
        }),
    ),
  );
}
