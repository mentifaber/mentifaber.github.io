// Hive service worker (scope /hive): the page opens fast and offline; the swarm itself is always live.
// Page files come fresh from the network, but if it takes longer than a moment the cached copy answers instead
// (and the fresh one still lands in the cache for next time).
const CACHE = "hive-v13", SHELL = ["/hive", "/assets/hive/hive.css", "/assets/hive/studio.js", "/assets/hive/swarm.js", "/assets/hive/field.js", "/assets/icons/hive-bee-192.png", "/assets/icons/hive-bee-512.png", "/assets/icons/hive-mark.png", "/assets/manifests/hive.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("hive-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
function fresh(req, key, e) {
  const net = fetch(req).then((res) => { if (res.ok) { const c = res.clone(); e.waitUntil(caches.open(CACHE).then((k) => k.put(key, c))); } return res; });
  const slow = new Promise((ok) => setTimeout(ok, 2500)).then(() => caches.match(key)).then((r) => r || net);
  return Promise.race([net.catch(() => caches.match(key)), slow]);
}
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return; // live data never comes from cache
  if (req.mode === "navigate" && /^\/hive(\.html)?\/?$/.test(url.pathname)) { e.respondWith(fresh(req, "/hive", e)); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fresh(req, url.pathname, e));
});
