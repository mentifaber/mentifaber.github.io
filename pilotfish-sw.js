// Pilotfish service worker (scope /pilotfish; /listit-sw.js loads this too).
// Pushes carry no payload, so it asks the server for the latest signal and
// turns it into words.
const NAMES = { anders: "Anders", adrianna: "Adrianna" };
const L = {
  happy: "😊 happy", sad: "😢 sad", hungry: "😋 hungry", angry: "😠 angry", tired: "😴 tired", loving: "🥰 loving", anxious: "😰 anxious", sick: "🤒 sick", bored: "🥱 bored", hug: "🤗 like she needs a hug",
  stressed: "😤 stressed", excited: "🥳 excited", lonely: "🥺 lonely", silly: "🤪 silly", nauseous: "🤢 nauseous", achy: "🫠 achy", emotional: "🥹 emotional", cozy: "☺️ cozy",
  water: "💧 water", snack: "🍪 a snack", meal: "🍽️ a real meal", cold: "🧊 something cold", tea: "🫖 tea", craving: "🍓 a craving", vitamins: "💊 vitamins/meds", rub: "💆 a back or foot rub",
  cuddle: "🫂 cuddles", quiet: "🤫 quiet time", nap: "🛌 a nap", bath: "🛁 a bath", chores: "🧺 help with chores", callme: "📞 a call", comehome: "🏠 you home", pickup: "🚗 a pickup", temp: "🌡️ the temperature fixed", company: "🛋️ company",
  omw: "🚗 On my way", gotit: "👍 Got it", soon: "⏱️ 10 minutes", love: "❤️ Love you", callsoon: "📞 Calling you", done: "✅ Done",
};
const words = (a) => (a || []).map((k) => L[k] || k).join(", ");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "Pilotfish", body = "Something new from the reef 🦈", urgent = false;
    try {
      const r = await fetch("/api/mood/listit", { credentials: "same-origin", cache: "no-store" });
      const j = await r.json(), m = j.moods && j.moods.find((x) => x.by !== j.me);
      if (m) {
        const n = NAMES[m.by] || "Someone", feel = m.feel || m.moods || [], need = m.need || [];
        if (m.kind === "urgent") { urgent = true; title = "🚨 " + n + " needs you now"; body = m.note || "Please call or come right away."; }
        else if (m.kind === "reply") { title = n + ": " + (L[m.reply] || "replied"); body = m.note || ""; }
        else if (m.kind === "kick") { title = "👶 Baby's kicking!"; body = m.note || n + " felt the baby move"; }
        else {
          title = n + (feel.length ? " is feeling " + words(feel) : "") + (need.length ? (feel.length ? " · needs " : " needs ") + words(need) : "");
          if (!feel.length && !need.length) title = n + " sent you a note";
          body = m.note || "Tap to answer 🦈";
        }
      }
    } catch (err) {}
    await self.registration.showNotification(title, {
      body, tag: urgent ? "pilotfish-urgent" : "pilotfish", renotify: true, requireInteraction: urgent,
      vibrate: urgent ? [300, 120, 300, 120, 600] : [120], icon: "/assets/pilotfish-icon-192.png", badge: "/assets/pilotfish-icon-192.png",
    });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (/\/(pilotfish|listit)/.test(c.url)) { c.focus(); c.postMessage("talk"); return; }
    await self.clients.openWindow("/pilotfish#talk");
  })());
});
