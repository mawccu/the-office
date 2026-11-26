/* The Office — service worker: shows phone notifications and makes the
   site installable. It does not cache pages (always fresh from the web). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // network only

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "The Office", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "The Office", {
    body: d.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "fund.html" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "fund.html", self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) { await c.focus(); if ("navigate" in c) c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
