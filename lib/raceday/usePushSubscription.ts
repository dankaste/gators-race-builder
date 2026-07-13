"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64Safe);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSubscribeState = "unsupported" | "unsubscribed" | "subscribed" | "subscribing";

/**
 * Registers the service worker and reports/handles push subscription state.
 * Requires the app to have been "Added to Home Screen" on iOS — see
 * RACEDAY.md — otherwise `subscribe()` will fail silently there.
 */
export function usePushSubscription(projectId: string, token: string | null) {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const [state, setState] = useState<PushSubscribeState>(supported ? "unsubscribed" : "unsupported");

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setState("unsupported"));
  }, [supported]);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey || !token) return;
    setState("subscribing");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch(`/api/raceday/${projectId}/push-subscriptions`, {
        method: "POST",
        headers: { "x-raceday-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, label: navigator.userAgent.slice(0, 40) }),
      });
      setState("subscribed");
    } catch {
      setState("unsubscribed");
    }
  }

  return { state, subscribe };
}
