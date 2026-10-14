// Vigil service worker (scope /vigil): Genesis's phone alerts. A push carries no words (src/push.js), so on each
// one this asks Hive which alerts went out and shows the ones this phone hasn't shown yet. Nothing is cached:
// Vigil is a sealed page and always comes fresh from the network.
const ICON = "/assets/icons/vigil.png", BADGE = "/assets/icons/v2/vigil-48.png", SEEN = "vigil-alerts";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function seen() { try { const r = await (await caches.open(SEEN)).match("/seen"); return r ? await r.json() : []; } catch (e) { return []; } }
async function remember(ids) { try { await (await caches.open(SEEN)).put("/seen", new Response(JSON.stringify(ids.slice(-100)))); } catch (e) {} }

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let list = null, name = "Genesis";
    try {
      const r = await fetch("/api/hive/genesis/alerts", { credentials: "same-origin", cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j.alerts)) { list = j.alerts; name = j.name || name; }
    } catch (err) {}
    if (!list) { // signed out, or offline: still say something happened
      await self.registration.showNotification(name, { body: "Something on Vigil's board needs a look.", tag: "genesis", icon: ICON, badge: BADGE, data: { url: "/vigil-app#brief" } });
      return;
    }
    const done = await seen(), fresh = list.filter((a) => !done.includes(a.id)).reverse().slice(-4); // oldest first, at most four
    for (const a of fresh) {
      const critical = a.level === "critical";
      await self.registration.showNotification(a.title, {
        body: a.body, tag: "genesis-" + a.id, timestamp: a.sent_ts || a.ts, icon: ICON, badge: BADGE,
        requireInteraction: critical, vibrate: critical ? [300, 120, 300, 120, 600] : [120], data: { url: a.url || "/vigil-app#brief" },
      });
    }
    if (fresh.length) await remember(done.concat(fresh.map((a) => a.id)));
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/vigil-app#brief", self.location.origin);
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { // an open Vigil (or Hive) switches to the right view instead of opening another copy
      const cu = new URL(c.url);
      if (cu.pathname.replace(/\.html$/, "") === url.pathname) { await c.focus(); c.postMessage({ type: "vigil-go", hash: url.hash.slice(1) }); return; }
    }
    await self.clients.openWindow(url.pathname + url.hash);
  })());
});

// The push service can rotate a subscription; tell Hive about the new one so alerts keep arriving.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    try {
      const sub = e.newSubscription || (await self.registration.pushManager.subscribe(e.oldSubscription && e.oldSubscription.options));
      if (sub) await fetch("/api/hive/genesis/push/subscribe", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON(), label: "renewed subscription" }) });
    } catch (err) {}
  })());
});
