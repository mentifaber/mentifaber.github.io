// In Case's service worker (scope /incase): keeps the page and what it draws with, so a family's cards open with no
// network. The cards themselves live in the page's own storage on the phone. The page is fetched fresh when there's a
// network; a shared card a paramedic opens still needs one (it's fetched, then decrypted on their phone).
const CACHE = "incase-v1", PAGE = "/incase", KEEP = ["/incase", "/assets/js/qr.js", "/assets/os/faber.js", "/assets/icons/v2/incase.svg", "/assets/icons/v2/incase-180.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(KEEP.map((u) => c.add(u).catch(() => (u === PAGE ? c.add(u + ".html").then(() => c.match(u + ".html")).then((r) => r && c.put(u, r)).catch(() => {}) : null)))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("incase-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const fresh = (req, key) => fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(key, c)); } return r; }).catch(() => caches.match(key));
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url); if (req.method !== "GET" || u.origin !== location.origin) return;
  const key = /^\/incase(\.html)?\/?$/.test(u.pathname) ? PAGE : u.pathname;
  if (KEEP.includes(key)) e.respondWith(fresh(req, key)); // network first, so a newer page lands; the kept copy with no network
});
