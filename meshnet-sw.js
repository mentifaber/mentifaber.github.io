// Hopline service worker (scope /meshnet): the console opens with no network at all, which is the whole point of it.
const CACHE = "meshnet-v1", SHELL = ["/meshnet-app", "/assets/ns/radio.js", "/assets/meshnet/mn.js", "/assets/meshnet/mn.css", "/assets/icons/v2/meshnet-192.png", "/assets/manifests/meshnet.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("meshnet-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /meshnet is its page, which opens the app
  if (req.mode === "navigate" && /^\/meshnet(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/meshnet-app", r.clone())); return r; }).catch(() => caches.match("/meshnet-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
