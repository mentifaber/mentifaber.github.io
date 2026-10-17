// Overhead service worker (scope /orbit): the tracker opens with no network and propagates from the element sets the
// page kept, so a pass can still be checked in a field with no signal. Leaflet comes from cdnjs and is kept too.
const CACHE = "orbit-v1", SHELL = ["/orbit-app", "/assets/orbit/ow.js", "/assets/orbit/ow.css", "/assets/orbit/satellite.min.js", "/assets/orbit/land.js", "/assets/icons/v2/orbit-192.png", "/assets/manifests/orbit.webmanifest"];
const CDN = ["https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all([c.addAll(SHELL), ...CDN.map((u) => c.add(new Request(u, { mode: "no-cors" })))])).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("orbit-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (CDN.includes(req.url)) { e.respondWith(caches.match(req.url).then((r) => r || fetch(req))); return; }
  if (url.origin !== location.origin) return;
  // the app (network first, so updates land; the cache when there's no network); /orbit is its page, which opens the app
  if (req.mode === "navigate" && /^\/orbit(-app)?(\.html)?\/?$/.test(url.pathname)) { const app = /-app/.test(url.pathname); e.respondWith(fetch(req).then((r) => { if (r.ok && app) caches.open(CACHE).then((c) => c.put("/orbit-app", r.clone())); return r; }).catch(() => caches.match("/orbit-app"))); return; }
  if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
});
