// Watch Your Grass service worker (scope /watchyourgrass): the lawn opens with no network at all.
const CACHE = "watchyourgrass-v1", SHELL = ["/watchyourgrass-app", "/assets/wyg/wyg.js", "/assets/wyg/wyg.css", "/assets/icons/v2/watchyourgrass-192.png", "/assets/manifests/watchyourgrass.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("watchyourgrass-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /watchyourgrass is its page, which opens the app
  if (req.mode === "navigate" && /^\/watchyourgrass(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/watchyourgrass-app", r.clone())); return r; }).catch(() => caches.match("/watchyourgrass-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
