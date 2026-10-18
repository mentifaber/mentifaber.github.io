// Genesis phone alerts: subscriptions, VAPID-signed pushes, preferences, quiet hours + summary, rate limit, dead devices.
import assert from "node:assert/strict";
import { webcrypto as wc } from "node:crypto";
import { upstream } from "../vg/mocks.mjs";
const pushes = [];
globalThis.fetch = async (u, o = {}) => {
  const url = typeof u === "string" ? u : u.url;
  if (url.startsWith("https://fcm.googleapis.com/fcm/send/")) { pushes.push({ url, headers: o.headers }); return new Response("", { status: url.endsWith("/gone") ? 410 : 201 }); }
  return upstream(url, o);
};
const H = await import("./harness.mjs"); const { call, calls, db } = H;
const { Genesis } = await import("./src/hive-genesis.js");
// the push key the Worker's Store object keeps
const kp = await wc.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const b64u = (b) => Buffer.from(b).toString("base64url");
const V = { priv: await wc.subtle.exportKey("jwk", kp.privateKey), pub: b64u(await wc.subtle.exportKey("raw", kp.publicKey)) };
H.env.STORE = { idFromName: (n) => n, get: () => ({ vapid: async () => V }) };
const ok = (m) => console.log("  ✓ " + m);
const off = (h) => { let d = ((new Date().getUTCHours() - h) % 24 + 24) % 24; if (d > 12) d -= 24; return d * 60; }, midday = () => off(12), night = () => off(2); // getTimezoneOffset-style minutes, always a real zone (−12…+12 h)
const EP = "https://fcm.googleapis.com/fcm/send/phone-1";

let r = await call("/genesis/push"); assert.equal(r.key, V.pub); assert.equal(r.devices.length, 0); assert.equal(r.prefs.quiet.on, true); assert.equal(r.prefs.level, "all"); ok("status: push key, defaults, no devices");
r = await call("/genesis/push/subscribe", { sub: { endpoint: "https://evil.example/collect" } }); assert.ok(r.error); ok("a subscription to an unknown push service is refused");
r = await call("/genesis/push/subscribe", { sub: { endpoint: EP }, label: "Android · Chrome", tz: midday() }); assert.equal(r.devices, 1);
assert.match(db.prepare("SELECT text FROM journal WHERE kind='milestone' ORDER BY id DESC LIMIT 1").get().text, /turned on phone alerts \(Android · Chrome\)/); ok("subscribe: one device, and Genesis notes it");
r = await call("/genesis/push/subscribe", { sub: { endpoint: EP }, label: "Android · Chrome" }); assert.equal(r.devices, 1); ok("subscribing again doesn't duplicate");
r = await call("/genesis/push", null, false); assert.equal(r.error && r.error.length > 0, true); ok("visitors can't see or change it");

r = await call("/genesis/push/test", {}); assert.equal(r.sent, 1); assert.equal(r.devices, 1); assert.equal(pushes.length, 1);
const hd = pushes[0].headers, [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(hd.Authorization);
assert.equal(k, V.pub); assert.equal(hd["Content-Length"], "0");
const [h64, p64, s64] = jwt.split("."), claims = JSON.parse(Buffer.from(p64, "base64url"));
assert.equal(claims.aud, "https://fcm.googleapis.com"); assert.ok(claims.exp > Date.now() / 1e3);
const pubKey = await wc.subtle.importKey("raw", Buffer.from(V.pub, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
assert.ok(await wc.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, Buffer.from(s64, "base64url"), new TextEncoder().encode(h64 + "." + p64)));
ok("test alert: one push, VAPID JWT signed with the Store's key (verified), aud = the push service");
r = await call("/genesis/alerts"); assert.equal(r.alerts.length, 1); assert.match(r.alerts[0].body, /Phone alerts work/); assert.equal(r.alerts[0].url, "/vigil-app#brief"); ok("the phone's service worker reads it back from /genesis/alerts");

pushes.length = 0;
const wr = await call("/genesis/watch", {}); assert.ok(wr.noted >= 2, JSON.stringify(wr)); assert.equal(wr.pushed.sent, wr.noted); assert.equal(pushes.length, 1);
r = await call("/genesis/alerts"); const titles = r.alerts.map((a) => a.title);
assert.ok(titles.some((t) => /Squawk 7700 · TAM3054/.test(t)), titles); assert.ok(titles.some((t) => /M6\.1 earthquake/.test(t)), titles);
assert.ok(r.alerts.find((a) => /TAM3054/.test(a.title)).url === "/vigil-app#air"); assert.ok(r.alerts.find((a) => /M6\.1/.test(a.title)).url === "/vigil-app#earth");
ok("watch: " + wr.noted + " new events → " + wr.pushed.sent + " alerts in one push per device, each opening its view");
pushes.length = 0; r = await call("/genesis/watch", {}); assert.equal(r.noted, 0); assert.equal(pushes.length, 0); ok("nothing new → no push");

// preferences
await call("/genesis/push/prefs", { prefs: { cats: { quakes: false } } });
Genesis.queueAlert(H.hive, { cat: "quakes", level: "notable", title: "q", body: "b" }); Genesis.queueAlert(H.hive, { cat: "air", level: "notable", title: "a", body: "b" });
r = await Genesis.flush(H.hive); assert.equal(r.sent, 1); assert.equal(db.prepare("SELECT state FROM alert WHERE title='q'").get().state, "skipped"); ok("a category switched off is skipped");
await call("/genesis/push/prefs", { prefs: { cats: { quakes: true }, level: "critical" } });
Genesis.queueAlert(H.hive, { cat: "air", level: "notable", title: "n1", body: "b" }); Genesis.queueAlert(H.hive, { cat: "air", level: "critical", title: "c1", body: "b" });
pushes.length = 0; r = await Genesis.flush(H.hive); assert.equal(r.sent, 1); assert.equal(db.prepare("SELECT state FROM alert WHERE title='n1'").get().state, "skipped");
assert.equal(pushes[0].headers.Urgency, "high"); assert.equal(pushes[0].headers.TTL, "3600"); ok("critical-only: notable skipped, critical sent with high urgency");
await call("/genesis/push/prefs", { prefs: { level: "all" } });

// quiet hours: notable waits, critical doesn't; afterwards one summary
await call("/genesis/push/prefs", { prefs: { tz: night() } });
for (const t of ["h1", "h2", "h3"]) Genesis.queueAlert(H.hive, { cat: "space", level: "notable", title: "☀ " + t, body: "b", url: "/vigil-app#space" });
pushes.length = 0; r = await Genesis.flush(H.hive); assert.equal(r.sent, 0); assert.equal(r.held, 3); assert.equal(pushes.length, 0); ok("quiet hours: notable alerts are held");
Genesis.queueAlert(H.hive, { cat: "hazards", level: "critical", title: "🌊 Tsunami warning", body: "b" });
r = await Genesis.flush(H.hive); assert.equal(r.sent, 1); ok("…but a critical one comes through");
await call("/genesis/push/prefs", { prefs: { tz: midday() } });
pushes.length = 0; r = await Genesis.flush(H.hive); assert.equal(r.sent, 1); assert.equal(pushes.length, 1);
const dg = db.prepare("SELECT * FROM alert WHERE cat='digest' ORDER BY id DESC LIMIT 1").get();
assert.match(dg.title, /While alerts were held: 3 things/); assert.match(dg.body, /• h1\n• h2\n• h3/); assert.equal(dg.url, "/vigil-app#space");
assert.equal(db.prepare("SELECT COUNT(*) c FROM alert WHERE state='summed'").get().c, 3); ok("after quiet hours: one summary push (" + dg.title + ")");

// rate limit: at most 6 non-critical an hour, the rest summarised later
db.prepare("UPDATE alert SET sent_ts = sent_ts - 7200000").run();
for (let i = 0; i < 9; i++) Genesis.queueAlert(H.hive, { cat: "air", level: "notable", title: "r" + i, body: "b" });
r = await Genesis.flush(H.hive); assert.equal(r.sent, 6); assert.equal(r.held, 3); ok("rate limit: 6 sent, 3 held");
db.prepare("UPDATE alert SET sent_ts = sent_ts - 7200000").run();
r = await Genesis.flush(H.hive); assert.equal(r.sent, 1); assert.match(db.prepare("SELECT title FROM alert WHERE cat='digest' ORDER BY id DESC LIMIT 1").get().title, /3 things/); ok("…and summarised once the hour has room");

// a device that's gone is dropped
await call("/genesis/push/subscribe", { sub: { endpoint: "https://fcm.googleapis.com/fcm/send/gone" }, label: "old phone" });
r = await call("/genesis/push/test", {}); assert.equal(r.dropped, 1); r = await call("/genesis/push"); assert.equal(r.devices.length, 1); ok("a device the push service says is gone is removed");

// its own work
db.prepare("INSERT INTO idea(ts,title,detail,status,pid,by_) VALUES(?,?,?,?,?,?)").run(Date.now(), "Voice memos", "d", "building", "nope", "genesis");
pushes.length = 0; r = await call("/genesis/tick", {}); 
const w = db.prepare("SELECT * FROM alert WHERE cat='work' ORDER BY id DESC LIMIT 1").get();
assert.match(w.title, /The Swarm didn't finish “Voice memos”/); assert.equal(w.state, "sent"); assert.equal(w.url, "/hive-app#mind/genesis"); ok("a failed mission alerts him on the next tick");

// Genesis knows
await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", cid: "p", messages: [{ role: "user", text: "hey" }] });
const sys = calls.at(-1).sys; assert.match(sys, /PHONE ALERTS: when Anders has them on/); assert.match(sys, /You sent him \d+ phone alerts? in the last day/); ok("Genesis knows about its phone alerts");
r = await call("/genesis"); assert.equal(r.push.devices, 1); ok("panel data carries the alert status");
r = await call("/genesis/push/unsubscribe", { endpoint: EP }); assert.equal(r.devices, 0); ok("unsubscribe");
Genesis.queueAlert(H.hive, { cat: "air", level: "critical", title: "x", body: "b" }); pushes.length = 0; r = await Genesis.flush(H.hive); assert.equal(pushes.length, 0); assert.equal(r.devices, 0); ok("no devices → nothing sent, nothing piles up");
console.log("all passed");
