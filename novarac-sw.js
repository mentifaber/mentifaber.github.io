// NovarAC service worker (scope /novarac): the console opens with no network at all, which is the whole point of it.
const CACHE = "novarac-v1", SHELL = ["/novarac-app", "/assets/novarac/nv.js", "/assets/novarac/nv.css", "/assets/icons/v2/novarac-192.png", "/assets/manifests/novarac.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("novarac-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /novarac is its page, which opens the app
  if (req.mode === "navigate" && /^\/novarac(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/novarac-app", r.clone())); return r; }).catch(() => caches.match("/novarac-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
