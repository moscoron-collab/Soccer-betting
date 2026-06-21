// Service worker for Web Push notifications (chat).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "Soccer Predictor";
  const body = data.body || "New message in the chat";
  const url = data.url || "/";

  event.waitUntil(
    (async () => {
      // "Only while away": if a tab is already open and focused/visible, don't
      // buzz — the player is right there and the chat updates live anyway.
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = clientList.some(
        (c) => c.focused || c.visibilityState === "visible"
      );
      if (focused) return;

      await self.registration.showNotification(title, {
        body,
        tag: data.tag || "spg-chat",
        renotify: true,
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of clientList) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
