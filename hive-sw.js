// Hive service worker (scope /hive): the page opens instantly and offline; the swarm itself is always live.
const CACHE = "hive-v1", SHELL = ["/hive", "/assets/icons/hive.png", "/assets/icons/hive-512.png", "/assets/manifests/hive.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("hive-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return; // live data never comes from cache
  if (req.mode === "navigate" && /^\/hive(\.html)?\/?$/.test(url.pathname)) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put("/hive", res.clone())); return res; }).catch(() => caches.match("/hive")));
    return;
  }
  if (SHELL.includes(url.pathname)) e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
