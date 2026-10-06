// NULLSPACE service worker (scope /nullspace): the deck opens with no network at all, and a silent push becomes a short alert.
// A push carries nothing and the relay can't read anything, so the alert can only say that something arrived.
const CACHE = "nullspace-v1", SHELL = ["/nullspace", "/assets/ns/ns.css", "/assets/ns/core.js", "/assets/ns/radio.js", "/assets/ns/net.js", "/assets/ns/deck.js", "/assets/icons/nullspace.png", "/assets/icons/nullspace-512.png", "/assets/manifests/nullspace.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("nullspace-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin === location.origin && req.mode === "navigate" && /^\/nullspace(\.html)?\/?$/.test(url.pathname)) { e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put("/nullspace", r.clone())); return r; }).catch(() => caches.match("/nullspace"))); return; }
  if (url.origin === location.origin && url.pathname.startsWith("/assets/ns/")) { e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req))); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(caches.match(req).then((r) => r || fetch(req).then((x) => { caches.open(CACHE).then((c) => c.put(req, x.clone())); return x; }))); return; } // the fonts too, so it still looks right off-grid
  if (SHELL.includes(url.pathname)) e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
self.addEventListener("push", (e) => { e.waitUntil(self.registration.showNotification("◈ INCOMING TRANSMISSION", { body: "A frequency you're tuned to moved.", tag: "nullspace", renotify: true, vibrate: [30, 40, 30, 40, 60], icon: "/assets/icons/nullspace.png", badge: "/assets/icons/nullspace.png" })); });
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil((async () => { const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true }); for (const c of all) if (/\/nullspace/.test(c.url)) { c.focus(); return; } await self.clients.openWindow("/nullspace"); })()); });
