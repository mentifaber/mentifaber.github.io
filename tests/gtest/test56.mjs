// Quiet Check-in (src/checkin.js, /api/checkin/*), with fixed clocks across time zones:
//  - a circle's deadline is in the person's own time zone; checking in any time that local day counts
//  - the sweep tells the family once, on the first sweep after a missed deadline, and not again that day; a phone
//    whose subscription has gone (410) is dropped; nothing is sent while the person has checked in or has time left
//  - the person's key checks in and changes settings; the family's key watches; neither can do the other's part
//  - away dates pause alerts; a check-in after an alert sends one all-clear; a device link only checks in
//  - bad names, times and time zones, non-push endpoints and an eleventh phone are refused
import assert from "node:assert/strict";
const { checkin, sweep, local, status } = await import(new URL("../../src/checkin.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), kvList: async (p) => [...mem].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const PUSH_HOSTS = /^https:\/\/fcm\.googleapis\.com\//; let ip = 1;
const go = async (path, body, q = "") => { const r = await checkin(new Request("https://mentifaber.org/api/checkin" + path + q, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100." + ip++ }, body: body ? JSON.stringify(body) : undefined }), env, json, { PUSH_HOSTS }); return { status: r.status, j: await r.json() }; };

assert.deepEqual(local("America/Chicago", Date.UTC(2026, 10, 24, 5, 30)), { date: "2026-11-23", hm: "23:30" }); assert.deepEqual(local("Asia/Tokyo", Date.UTC(2026, 10, 24, 5, 30)), { date: "2026-11-24", hm: "14:30" });
for (const bad of [{ by: "10:00", tz: "America/Chicago" }, { name: "Gran", by: "25:00", tz: "America/Chicago" }, { name: "Gran", by: "10:00", tz: "Mars/Olympus" }]) assert.equal((await go("", bad)).status, 400, JSON.stringify(bad));
ok("local dates and times follow the person's time zone; no name, a bad time or an unknown time zone are refused");

const { j: c } = await go("", { name: "Gran", by: "10:00", tz: "America/Chicago" }); const id = c.id;
assert.match(c.me, /^[0-9a-f]{32}$/); assert.match(c.fam, /^[0-9a-f]{32}$/); assert.ok(!JSON.stringify(mem.get("ci:" + id)).includes(c.me), "keys are kept only as hashes");
assert.equal((await go("/" + id + "/ok", { t: c.fam })).status, 403, "the family's key can't check in for her");
assert.equal((await go("/" + id + "/watch", { t: c.me, sub: { endpoint: "https://fcm.googleapis.com/x" } })).status, 403, "her key isn't for watching");
assert.equal((await go("/" + id, null, "?t=" + "0".repeat(32))).status, 403);
assert.equal((await go("/" + id + "/watch", { t: c.fam, sub: { endpoint: "https://evil.example/collect" } })).status, 400, "only real push services");
for (const e of ["a", "b", "c"]) assert.equal((await go("/" + id + "/watch", { t: c.fam, sub: { endpoint: "https://fcm.googleapis.com/" + e } })).status, 200);
ok("two keys: hers checks in, the family's watches (three phones here); neither does the other's part, and only real push services are taken");

// the day: Chicago, deadline 10:00 local (16:00 UTC in November)
const C = mem.get("ci:" + id); C.last = Date.UTC(2026, 10, 23, 15, 0); mem.set("ci:" + id, C); // she checked in yesterday morning
const pushes = []; let gone = "https://fcm.googleapis.com/b";
const deps = { vapid: async () => ({ pub: "k", priv: {} }), sendPush: async (sub) => { pushes.push(sub.endpoint); return sub.endpoint === gone ? 410 : 201; } };
const at = (h, m = 0) => Date.UTC(2026, 10, 24, h, m);
assert.equal(await sweep(env, deps, at(15, 45)), 0); assert.equal(status(mem.get("ci:" + id), at(15, 45)).late, false); // 09:45 her time: she still has time
let sent = await sweep(env, deps, at(16, 1)); assert.equal(sent, 2); assert.deepEqual(pushes.sort(), ["https://fcm.googleapis.com/a", "https://fcm.googleapis.com/b", "https://fcm.googleapis.com/c"]);
assert.equal(mem.get("ci:" + id).subs.length, 2, "the phone that's gone (410) is dropped");
pushes.length = 0; assert.equal(await sweep(env, deps, at(16, 16)), 0); assert.equal(await sweep(env, deps, at(23, 0)), 0); assert.equal(pushes.length, 0, "told once a day, not every 15 minutes");
ok("09:45 her time: nothing; 10:01 with no check-in today: the family's phones are told; a phone that's gone is dropped; not told again that day");

// she checks in the next morning: nothing next day; and a check-in after her time still stops the alert
const C2 = mem.get("ci:" + id); C2.last = Date.UTC(2026, 10, 25, 14, 0); mem.set("ci:" + id, C2);
assert.equal(await sweep(env, deps, Date.UTC(2026, 10, 25, 16, 30)), 0);
const r = await go("/" + id, null, "?t=" + c.fam); assert.deepEqual([r.j.name, r.j.by, r.j.watchers], ["Gran", "10:00", 2]);
ok("a day she checks in, nobody is told; the family's view says whose it is, her time and how many phones watch");

// away: no alerts through the date she's away until; the family's view says so; bad dates refused
const A = mem.get("ci:" + id); A.last = Date.UTC(2026, 10, 20, 15, 0); A.alerted = null; A.away = "2026-11-26"; mem.set("ci:" + id, A); pushes.length = 0;
assert.equal(await sweep(env, deps, Date.UTC(2026, 10, 26, 17, 0)), 0); assert.equal(status(mem.get("ci:" + id), Date.UTC(2026, 10, 26, 17, 0)).away, "2026-11-26");
assert.equal(await sweep(env, deps, Date.UTC(2026, 10, 27, 17, 0)), 2, "the day after she's back, a missed check-in tells them again");
for (const bad of ["2020-01-01", "2026-13-40", "soon", "2099-01-01"]) assert.equal((await go("/" + id + "/settings", { t: c.me, away: bad })).status, 400, bad);
assert.equal((await go("/" + id + "/settings", { t: c.fam, away: "2099-01-01" })).status, 403, "the family can't set her away");
const far = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10); assert.equal((await go("/" + id + "/settings", { t: c.me, away: far })).j.away, far);
assert.equal((await go("/" + id + "/settings", { t: c.me, away: null })).j.away, null);
ok("away through a date: no alert while away, alerts again after; only today on and three months at most; only her key sets it");

// all-clear: she checks in after the family was told today, so their phones are told again (once); history kept
const B = mem.get("ci:" + id); B.last = Date.now() - 3 * 864e5; B.by = "00:00"; B.alerted = null; B.days = []; mem.set("ci:" + id, B); pushes.length = 0;
const cdeps = { PUSH_HOSTS, ...deps }, goD = async (path, body, q = "") => { const r = await checkin(new Request("https://mentifaber.org/api/checkin" + path + q, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), env, json, cdeps); return { status: r.status, j: await r.json() }; };
assert.equal(await sweep(env, deps, Date.now()), 2); pushes.length = 0; gone = null;
let v = (await goD("/" + id + "/ok", { t: c.me })).j; assert.equal(v.today, true); assert.equal(v.via, "button"); assert.equal(pushes.length, 2, "the family gets an all-clear");
await goD("/" + id + "/ok", { t: c.me }); assert.equal(pushes.length, 2, "one all-clear a day"); assert.equal(v.days.length, 1); assert.match(v.days[0], /^\d{4}-\d\d-\d\d$/);
ok("a check-in after the family was told sends them one all-clear; the day is kept in her history");

// a device link: made by her key only; checks in by GET or POST; can't read or change anything; replaced or turned off
assert.equal((await goD("/" + id + "/device", { t: c.fam })).status, 403);
const dk = (await goD("/" + id + "/device", { t: c.me })).j.deviceKey; assert.match(dk, /^[0-9a-f]{32}$/); assert.ok(!JSON.stringify(mem.get("ci:" + id)).includes(dk));
const D = mem.get("ci:" + id); D.last = Date.now() - 2 * 864e5; mem.set("ci:" + id, D);
assert.deepEqual((await goD("/" + id + "/ok", null, "?t=" + dk)).j, { ok: true }); assert.equal(mem.get("ci:" + id).via, "device"); assert.ok(Date.now() - mem.get("ci:" + id).last < 5000);
const t1 = mem.get("ci:" + id).last; await goD("/" + id + "/ok", { t: dk }); assert.equal(mem.get("ci:" + id).last, t1, "a busy sensor writes at most once an hour");
assert.equal((await goD("/" + id, null, "?t=" + dk)).status, 403, "a device can't read her status"); assert.equal((await goD("/" + id + "/settings", { t: dk, by: "23:00" })).status, 403); assert.equal((await goD("/" + id + "/delete", { t: dk })).status, 403);
const dk2 = (await goD("/" + id + "/device", { t: c.me })).j.deviceKey; assert.equal((await goD("/" + id + "/ok", null, "?t=" + dk)).status, 403, "a replaced device link stops working");
assert.equal((await goD("/" + id + "/device", { t: c.me, off: true })).j.device, false); assert.equal((await goD("/" + id + "/ok", null, "?t=" + dk2)).status, 403, "turned off");
ok("a device link checks in by GET or POST (at most a write an hour), can't read or change anything, and stops when replaced or turned off");

assert.equal((await go("/" + id + "/settings", { t: c.me, by: "09:30", tz: "Europe/London" })).j.by, "09:30");
for (let i = 0; i < 8; i++) await go("/" + id + "/watch", { t: c.fam, sub: { endpoint: "https://fcm.googleapis.com/z" + i } });
assert.equal((await go("/" + id + "/watch", { t: c.fam, sub: { endpoint: "https://fcm.googleapis.com/eleven" } })).status, 409);
assert.equal((await go("/" + id + "/delete", { t: c.fam })).status, 403); assert.equal((await go("/" + id + "/delete", { t: c.me })).status, 200); assert.equal((await go("/" + id, null, "?t=" + c.fam)).status, 404);
ok("she can change her time and zone; ten phones at most; only her key deletes the circle");
console.log("test56: " + n + " checks passed");
