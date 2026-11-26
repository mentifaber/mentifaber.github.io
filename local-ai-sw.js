// AutoFaber Offline's service worker (scope /local-ai): keeps the page, what it reads to answer with no network (the
// Blackout Kit's guides) and the model library, so it opens and answers in an outage. The model's weights are kept by
// the library itself in this browser's storage. The page is fetched fresh when there's a network.
const CACHE = "local-ai-v1", PAGE = "/local-ai", KEEP = ["/local-ai", "/assets/ai/know.js", "/blackout", "/assets/icons/v2/local-ai.svg", "/assets/icons/v2/local-ai-180.png"];
const LIB = /^https:\/\/cdn\.jsdelivr\.net\/npm\//; // the pinned model library and the modules it imports
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(KEEP.map((u) => c.add(u).catch(() => (u === PAGE || u === "/blackout" ? c.add(u + ".html").then(() => c.match(u + ".html")).then((r) => r && c.put(u, r)).catch(() => {}) : null)))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("local-ai-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const fresh = (req, key) => fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(key, c)); } return r; }).catch(() => caches.match(key));
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url); if (req.method !== "GET") return;
  if (u.origin === location.origin) {
    const key = /^\/local-ai(\.html)?\/?$/.test(u.pathname) ? PAGE : /^\/blackout(\.html)?\/?$/.test(u.pathname) ? "/blackout" : u.pathname;
    if (KEEP.includes(key)) e.respondWith(fresh(req, key)); // network first, so a newer page lands; the kept copy with no network
  } else if (LIB.test(req.url)) e.respondWith(caches.match(req.url).then((r) => r || fetch(req).then((x) => { if (x.ok) { const c = x.clone(); caches.open(CACHE).then((y) => y.put(req.url, c)); } return x; })));
});
