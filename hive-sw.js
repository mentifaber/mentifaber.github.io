// Genesis service worker (scope /hive): the page opens fast and offline; the swarm itself is always live.
// Page files come fresh from the network, but if it takes longer than a moment the cached copy answers instead
// (and the fresh one still lands in the cache for next time).
const CACHE = "hive-v34", SHELL = ["/hive-app", "/assets/hive/hive.css", "/assets/hive/ears.js", "/assets/hive/studio.js", "/assets/hive/runner.js", "/assets/hive/swarm.js", "/assets/hive/field.js", "/assets/hive/genesis-ring.webp", "/assets/hive/genesis-mark-64.webp", "/assets/hive/genesis-logo-420.webp", "/assets/icons/hive-genesis-192.png", "/assets/icons/hive-genesis-512.png", "/assets/manifests/hive.webmanifest",
  "/assets/fonts/HiveStrata-Light.woff2", "/assets/fonts/HiveStrata-Regular.woff2", "/assets/fonts/HiveStrata-SemiBold.woff2", "/assets/fonts/AzeretMono-var.woff2"];
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
  // the app lives at /hive-app; /hive is its page (which opens the app). Offline, either one opens the app.
  if (req.mode === "navigate" && /^\/hive-app(\.html)?\/?$/.test(url.pathname)) { e.respondWith(fresh(req, "/hive-app", e)); return; }
  if (req.mode === "navigate" && /^\/hive(\.html)?\/?$/.test(url.pathname)) { e.respondWith(fetch(req).catch(() => caches.match("/hive-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fresh(req, url.pathname, e));
});
