// Street Board's service worker (scope /street): keeps the page and its radio code, so the board opens with no signal
// (the notices themselves are already on the phone). The page is fetched fresh when there's a network.
const CACHE = "street-v1", KEEP = ["/street", "/assets/ns/radio.js", "/assets/icons/v2/street.svg", "/assets/icons/v2/street-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(KEEP.map((u) => c.add(u).catch(() => (u === "/street" ? c.add("/street.html").catch(() => {}) : null)))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("street-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url); if (u.origin !== location.origin || e.request.method !== "GET") return;
  if (e.request.mode === "navigate" && /^\/street(\.html)?\/?$/.test(u.pathname)) {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put("/street", r.clone())); return r; }).catch(() => caches.match("/street").then((r) => r || caches.match("/street.html"))));
  } else if (KEEP.includes(u.pathname)) e.respondWith(caches.match(u.pathname).then((r) => r || fetch(e.request)));
});
