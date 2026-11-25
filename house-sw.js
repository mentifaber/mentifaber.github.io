// House Manual's service worker (scope /house): keeps the page and the little it needs, so the manual opens with no
// signal (the entries themselves are already on the device). The page is fetched fresh when there's a network.
const CACHE = "house-v1", KEEP = ["/house", "/assets/os/faber.js", "/assets/icons/v2/house.svg", "/assets/icons/v2/house-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(KEEP.map((u) => c.add(u).catch(() => (u === "/house" ? c.add("/house.html").catch(() => {}) : null)))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("house-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url); if (u.origin !== location.origin || e.request.method !== "GET") return;
  if (e.request.mode === "navigate" && /^\/house(\.html)?\/?$/.test(u.pathname)) {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put("/house", r.clone())); return r; }).catch(() => caches.match("/house").then((r) => r || caches.match("/house.html"))));
  } else if (KEEP.includes(u.pathname)) e.respondWith(caches.match(u.pathname).then((r) => r || fetch(e.request)));
});
