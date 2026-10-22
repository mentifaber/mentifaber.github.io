// Big Buttons service worker (scope /big-buttons): the buttons open with no network, so the phone and the voice
// commands still work in a dead zone; the page itself is fetched fresh whenever there is a connection.
const CACHE = "big-buttons-v1", PAGE = "/big-buttons";
const SHELL = [PAGE, "/assets/fonts/AtkinsonHyperlegibleNext-800.woff2", "/assets/fonts/AtkinsonHyperlegibleNext-700.woff2",
  "/assets/icons/v2/big-buttons-192.png", "/assets/icons/v2/big-buttons-180.png", "/assets/manifests/big-buttons.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("big-buttons-") && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate" && /^\/big-buttons(\.html)?\/?$/.test(url.pathname)) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(PAGE, copy)); } return r; }).catch(() => caches.match(PAGE)));
    return;
  }
  if (SHELL.includes(url.pathname)) e.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(req)));
});
