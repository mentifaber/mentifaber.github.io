// Barycenter service worker (scope /barycenter): opens offline, and turns a silent push into a gentle alert.
// A push carries no payload and the server can't read messages anyway, so the alert only ever says who and how urgent.
const CACHE = "barycenter-v1", SHELL = ["/barycenter", "/assets/seal.js", "/assets/icons/barycenter.png", "/assets/icons/barycenter-512.png", "/assets/manifests/barycenter.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("barycenter-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate" && /^\/barycenter(\.html)?\/?$/.test(url.pathname)) { e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put("/barycenter", r.clone())); return r; }).catch(() => caches.match("/barycenter"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "✦ A signal", body = "Something new in your sky", sos = false;
    try {
      const j = await (await fetch("/api/us/peek", { credentials: "same-origin", cache: "no-store" })).json();
      if (j && j.from) {
        if (j.lvl >= 2) { sos = true; title = "🚨 " + j.from + " needs you"; body = "Open Barycenter and tap I'm here"; }
        else { title = "✦ " + j.from; body = j.n > 1 ? j.n + " new signals" : j.lvl ? "A message that wants to be seen" : "A new signal arrived"; }
      }
    } catch (err) {}
    await self.registration.showNotification(title, { body, tag: sos ? "bary-sos" : "bary", renotify: true, requireInteraction: sos, vibrate: sos ? [400, 150, 400, 150, 800] : [80], icon: "/assets/icons/barycenter.png", badge: "/assets/icons/barycenter.png" });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => { const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true }); for (const c of all) if (/\/barycenter/.test(c.url)) { c.focus(); return; } await self.clients.openWindow("/barycenter"); })());
});
