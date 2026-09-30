// Flutterbloom service worker (scope /flutterbloom): keeps the garden working
// offline and shows the daily reminder pushed by the server (src/worker.js).
const CACHE = "flutterbloom-v1";
const PAGE = "/flutterbloom";
const STATIC = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/three@|fonts\.(googleapis|gstatic)\.com\/)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// The page is only worth keeping offline when it carries the garden itself
// (the server leaves the garden out until she has signed in).
const hasGarden = (html) => /id="mf-blob">\s*[A-Za-z0-9+/=]{100}/.test(html);

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (req.mode === "navigate" && url.origin === location.origin && /^\/flutterbloom(\.html)?\/?$/.test(url.pathname)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const html = await res.clone().text();
          if (hasGarden(html)) (await caches.open(CACHE)).put(PAGE, new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
        }
        return res;
      } catch (err) {
        return (await caches.match(PAGE)) || Response.error();
      }
    })());
    return;
  }
  const same = url.origin === location.origin && url.pathname.startsWith("/assets/");
  if (same || STATIC.test(req.url)) {
    // Stale-while-revalidate for the page's scripts, fonts, icons and three.js.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE), hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});

const HELLOS = [
  "Your garden missed you 🌷",
  "The butterflies are out — come say hello 🦋",
  "Something's blooming in the seed bed 🌱",
  "The bunny is looking for you 🐰",
  "A quiet moment in the garden? 🍃",
];
self.addEventListener("push", (e) => {
  let body = HELLOS[Math.floor(Math.random() * HELLOS.length)];
  try { const d = e.data && e.data.json(); if (d && d.body) body = d.body; } catch (err) {}
  e.waitUntil(self.registration.showNotification("Flutterbloom", {
    body, tag: "flutterbloom-daily", icon: "/assets/flutterbloom-icon-192.png", badge: "/assets/flutterbloom-icon-192.png",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (new URL(c.url).pathname.startsWith(PAGE)) return c.focus();
    return self.clients.openWindow(PAGE);
  })());
});
