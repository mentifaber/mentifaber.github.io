// Cartograph service worker (scope /cartograph): the atlas is all local files, so it opens with no network at all.
const CACHE = "cartograph-v1", SHELL = ["/cartograph-app", "/assets/carto/ct.js", "/assets/carto/ct.css", "/assets/carto/data.js", "/assets/orbit/satellite.min.js", "/assets/orbit/land.js", "/assets/icons/v2/cartograph-192.png", "/assets/manifests/cartograph.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("cartograph-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /cartograph is its page, which opens the app
  if (req.mode === "navigate" && /^\/cartograph(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/cartograph-app", r.clone())); return r; }).catch(() => caches.match("/cartograph-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
