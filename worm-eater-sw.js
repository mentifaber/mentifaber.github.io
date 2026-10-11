// Worm Eater service worker (scope /worm-eater): the scanner opens offline (lookups need the network).
const CACHE = "worm-eater-v1", SHELL = ["/worm-eater-app", "/assets/worm/table.js", "/assets/worm/we.js", "/assets/worm/we.css", "/assets/icons/v2/worm-eater-192.png", "/assets/manifests/worm-eater.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("worm-eater-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /worm-eater is its page, which opens the app
  if (req.mode === "navigate" && /^\/worm-eater(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/worm-eater-app", r.clone())); return r; }).catch(() => caches.match("/worm-eater-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
