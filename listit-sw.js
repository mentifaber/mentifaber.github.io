// List-It service worker (scope /listit): shows mood notifications. Pushes
// carry no payload, so it asks the server for the latest mood to show.
const NAMES = { anders: "Anders", adrianna: "Adrianna" };
const LABEL = { happy: "😊 happy", sad: "😢 sad", hungry: "😋 hungry", angry: "😠 angry", tired: "😴 tired", loving: "🥰 loving", anxious: "😰 anxious", sick: "🤒 sick", bored: "🥱 bored", hug: "🤗 needs a hug", stressed: "😤 stressed", excited: "🥳 excited", lonely: "🥺 lonely", silly: "🤪 silly" };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "List-It", body = "Someone updated how they're feeling 💗";
    try {
      const r = await fetch("/api/mood/listit", { credentials: "same-origin", cache: "no-store" });
      const j = await r.json(), m = j.moods && j.moods.find((x) => x.by !== j.me);
      if (m) {
        title = (NAMES[m.by] || "Someone") + " is feeling " + (m.moods.map((k) => LABEL[k] || k).join(", ") || "something");
        body = m.note || "Tap to see 💗";
      }
    } catch (err) {}
    await self.registration.showNotification(title, { body, tag: "listit-mood", renotify: true, icon: "/assets/listit-icon-192.png", badge: "/assets/listit-icon-192.png", data: { url: "/listit#mood" } });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (c.url.includes("/listit")) { c.focus(); c.postMessage("mood"); return; }
    await self.clients.openWindow("/listit#mood");
  })());
});
