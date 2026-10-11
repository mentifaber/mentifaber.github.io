// Tether service worker (scope /tether): makes the game installable and lets
// the last loaded copy open offline (from either /tether or /tether-app). Network first, so updates land right away.
const CACHE = "tether-v2";
const PAGE = "/tether-app"; // the game; /tether is its page, which opens the game
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate" && /^\/tether(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname);
    e.respondWith((async () => {
      try { const res = await fetch(req); if (res.ok && app) (await caches.open(CACHE)).put(PAGE, res.clone()); return res; }
      catch (err) { return (await caches.match(PAGE)) || Response.error(); }
    })());
  } else if (/^\/assets\/(icons\/tether|manifests\/tether)/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
  }
});
