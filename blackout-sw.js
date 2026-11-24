// Blackout Kit service worker (scope /blackout): the page, the site's own Leaflet and world map are kept so the kit
// opens with no network. The apps it lists keep themselves offline with their own workers, which the page registers.
const CACHE = "blackout-v1", SHELL = ["/blackout", "/assets/maps/leaflet/leaflet.js", "/assets/maps/leaflet/leaflet.css", "/assets/maps/basemap.js", "/assets/maps/world-110m.json", "/assets/maps/world-50m.json", "/assets/favicon.png", "/assets/manifests/blackout.webmanifest"];
// each file on its own, so one that fails (a flaky connection) doesn't stop the rest; the page is also tried by its file name
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => fetch(u).then((r) => (r.ok ? r : u === "/blackout" ? fetch("/blackout.html") : r)).then((r) => { if (!r.ok) throw new Error(u); return c.put(u, r); }))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("blackout-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const key = req.mode === "navigate" && /^\/blackout(\.html)?\/?$/.test(url.pathname) ? "/blackout" : url.pathname;
  if (!SHELL.includes(key)) return;
  // network first, so a newer kit lands; the kept copy when there's no network
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(key, c)); } return r; }).catch(() => caches.match(key)));
});
