// DocCrawler service worker (scope /doccrawler): the library opens and searches with no network at all.
const CACHE = "doccrawler-v1", SHELL = ["/doccrawler-app", "/assets/doc/dc.js", "/assets/doc/dc.css", "/assets/icons/v2/doccrawler-192.png", "/assets/manifests/doccrawler.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("doccrawler-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /doccrawler is its page, which opens the app
  if (req.mode === "navigate" && /^\/doccrawler(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/doccrawler-app", r.clone())); return r; }).catch(() => caches.match("/doccrawler-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
