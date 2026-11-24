// Quiet Check-in's service worker (scope /checkin): a push carries no words (src/push.js), so on each one this asks
// the site about every check-in this phone watches, and says which haven't happened. It keeps the page too, so the
// "I'm OK" button opens with a weak signal. A push after a missed check-in has been answered is the all-clear.
const CACHE = "checkin-v1"; // the name is also used by the page for the list of circles; bump only with the page
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/checkin"]).catch(() => c.add("/checkin.html")))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url); if (e.request.mode !== "navigate" || !/^\/checkin(\.html)?\/?$/.test(u.pathname)) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put("/checkin", r.clone())); return r; }).catch(() => caches.match("/checkin").then((r) => r || caches.match("/checkin.html"))));
});
const circles = async () => { const r = await (await caches.open(CACHE)).match("/checkin/circles"); return r ? r.json() : []; };
self.addEventListener("push", (e) => e.waitUntil((async () => {
  let shown = 0;
  for (const c of await circles()) {
    try { const s = await (await fetch("/api/checkin/" + c.id + "?t=" + c.t)).json();
      if (s && s.late) { shown++; await self.registration.showNotification(s.name + " hasn't checked in today", { body: "Their time was " + s.by + ". Give them a call.", tag: "checkin-" + c.id, renotify: true, requireInteraction: true, data: { url: "/checkin#fam." + c.id + "." + c.t }, icon: "/assets/icons/v2/checkin-192.png" }); }
      else if (s && s.today && s.alerted) { shown++; await self.registration.showNotification("✓ " + s.name + " has checked in", { body: "All clear: they checked in after their time today.", tag: "checkin-" + c.id, renotify: true, data: { url: "/checkin#fam." + c.id + "." + c.t }, icon: "/assets/icons/v2/checkin-192.png" }); } } catch (x) {}
  }
  if (!shown) await self.registration.showNotification("Quiet Check-in", { body: "Open it to see how everyone is.", tag: "checkin", data: { url: "/checkin" } });
})()));
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow((e.notification.data && e.notification.data.url) || "/checkin")); });
