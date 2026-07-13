// Minimal service worker whose only job is to receive Web Push and show a
// notification — required for "Add to Home Screen" installability (see
// RACEDAY.md), which is what iOS Safari needs before it will deliver push
// to this app at all.

self.addEventListener("push", (event) => {
  let data = { title: "Race day alert", body: "" };
  try {
    data = event.data.json();
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      requireInteraction: true,
      tag: "raceday-evac",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    }),
  );
});
