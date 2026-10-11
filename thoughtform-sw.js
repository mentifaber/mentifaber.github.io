// Thoughtform service worker (scope /thoughtform): makes the game installable and lets
// the last loaded copy open offline (from either /thoughtform or /thoughtform-app). Network first, so updates land right away.
const CACHE = "thoughtform-v2";
const PAGE = "/thoughtform-app"; // the game; /thoughtform is its page, which opens the game
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate" && /^\/thoughtform(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname);
    e.respondWith((async () => {
      try { const res = await fetch(req); if (res.ok && app) (await caches.open(CACHE)).put(PAGE, res.clone()); return res; }
      catch (err) { return (await caches.match(PAGE)) || Response.error(); }
    })());
  } else if (/^\/assets\/(icons\/thoughtform|manifests\/thoughtform)/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
  }
});
