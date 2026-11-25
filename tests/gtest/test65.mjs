// Quiet Check-in with a motion sensor (src/checkin.js, /api/checkin/<id>/sense): the device key reports movement by room,
// and the day's first movement is the check-in; a heartbeat (motion off) only says the sensor is alive; only the room and
// the time are kept; a burst of reports is one write a minute; eight rooms at most. The person turns on "quiet" (2-12
// hours): the family is told once a day when no room has seen anyone that long between 07:00 and 22:00 their time (not
// at night, not while away), and gets an all-clear when movement returns. Only the device key can report, and it can't
// read anything back.
import assert from "node:assert/strict";
const { checkin, sweep, quietness } = await import(new URL("../../src/checkin.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map(); let writes = 0;
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { writes++; mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k),
  kvList: async (p) => [...mem].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const PUSH_HOSTS = /^https:\/\/fcm\.googleapis\.com\//, pushes = [];
const deps = { PUSH_HOSTS, vapid: async () => ({}), sendPush: async (sub) => { pushes.push(sub.endpoint); return 201; } };
let ip = 1;
const go = async (path, body, q = "", method) => { const r = await checkin(new Request("https://mentifaber.org/api/checkin" + path + q, { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113." + ip++ }, body: body ? JSON.stringify(body) : undefined }), env, json, deps); return { status: r.status, j: await r.json() }; };

const { j: c } = await go("", { name: "Ann", by: "10:00", tz: "UTC" }); const id = c.id;
const dev = (await go("/" + id + "/device", { t: c.me })).j.deviceKey; assert.match(dev, /^[0-9a-f]{32}$/);
await go("/" + id + "/watch", { t: c.fam, sub: { endpoint: "https://fcm.googleapis.com/fam" } });
// yesterday's check-in, so today hasn't happened yet
const rec = mem.get("ci:" + id); rec.last = Date.now() - 864e5 * 1.5; rec.days = []; mem.set("ci:" + id, rec);

assert.equal((await go("/" + id + "/sense", { t: c.fam, room: "kitchen" })).status, 403, "the family's key can't report");
assert.equal((await go("/" + id + "/sense", { t: c.me, room: "kitchen" })).status, 403, "nor the person's: only the device's");
assert.equal((await go("/" + id + "/sense", { t: dev })).status, 400, "a report names its room");
assert.equal((await go("/" + id, null, "?t=" + dev)).status, 403, "the device key reads nothing back");
let r = await go("/" + id + "/sense", { t: dev, room: "Kitchen!", motion: true }); assert.deepEqual(r.j, { ok: true });
let v = (await go("/" + id, null, "?t=" + c.fam)).j; assert.equal(v.today, true); assert.equal(v.via, "kitchen sensor"); assert.deepEqual(v.sensor.rooms.map((x) => x.room), ["kitchen"]);
assert.ok(!JSON.stringify(mem.get("ci:" + id)).includes("Kitchen!") && !("motion" in mem.get("ci:" + id)), "only the room's name and the time are kept");
ok("only the device key reports, and reads nothing; the day's first movement is the check-in (\"kitchen sensor\"); only the room and time are kept");

const w0 = writes; for (let i = 0; i < 5; i++) await go("/" + id + "/sense", null, "?t=" + dev + "&room=kitchen&motion=1"); assert.equal(writes, w0, "a burst of reports within a minute writes nothing more");
await go("/" + id + "/sense", null, "?t=" + dev + "&room=hall&motion=0"); v = (await go("/" + id, null, "?t=" + c.fam)).j;
assert.deepEqual(v.sensor.rooms.map((x) => x.room), ["kitchen"], "a heartbeat isn't movement"); assert.ok(v.sensor.seen, "but says the sensor is alive");
for (const room of ["hall", "bedroom", "bath", "lounge", "porch", "garage", "office"]) await go("/" + id + "/sense", { t: dev, room });
assert.equal((await go("/" + id + "/sense", { t: dev, room: "attic" })).status, 400, "eight rooms at most");
ok("GET or POST; a burst is one write a minute; a heartbeat (motion off) isn't movement; eight rooms at most");

assert.equal((await go("/" + id + "/settings", { t: c.me, quiet: 1 })).status, 400); assert.equal((await go("/" + id + "/settings", { t: c.fam, quiet: 4 })).status, 403);
assert.equal((await go("/" + id + "/settings", { t: c.me, quiet: 4 })).j.sensor.quiet, 4);
// the last movement anywhere: 08:00 UTC; she's in UTC
const day = new Date().toISOString().slice(0, 10), at = (h, m = 0) => Date.parse(day + "T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00Z");
const quiet = (t) => { const x = mem.get("ci:" + id); for (const k of Object.keys(x.rooms)) x.rooms[k] = t; x.last = t; x.days = [day]; delete x.quietTold; delete x.quietCleared; mem.set("ci:" + id, x); };
quiet(at(8)); pushes.length = 0;
assert.equal(await sweep(env, deps, at(11, 30)), 0, "3.5 hours: not yet");
assert.equal(await sweep(env, deps, at(12, 15)), 1, "4 hours without movement in the daytime: the family is told"); assert.deepEqual(pushes, ["https://fcm.googleapis.com/fam"]);
assert.equal(quietness(mem.get("ci:" + id), at(12, 15)).quietTold, true);
assert.equal(await sweep(env, deps, at(13)), 0, "once a day");
pushes.length = 0; await go("/" + id + "/sense", { t: dev, room: "lounge" });
assert.deepEqual(pushes, ["https://fcm.googleapis.com/fam"], "movement again after they were told: an all-clear");
assert.equal(quietness(mem.get("ci:" + id)).quietClear, true);
ok("quiet for 4 hours in the daytime: the family is told once; movement again sends an all-clear");

quiet(at(19)); pushes.length = 0; assert.equal(await sweep(env, deps, at(23, 30)), 0, "not at night (after 22:00)");
quiet(at(8)); const x = mem.get("ci:" + id); x.away = "2099-01-01"; mem.set("ci:" + id, x); assert.equal(await sweep(env, deps, at(14)), 0, "not while away");
delete x.away; x.quiet = undefined; mem.set("ci:" + id, x); assert.equal(await sweep(env, deps, at(14)), 0, "not when quiet is off");
assert.equal((await go("/" + id + "/settings", { t: c.me, rooms: null })).j.sensor.rooms.length, 0, "the person can forget the rooms");
ok("never at night, while away, or with quiet off; the person can forget the rooms");
console.log("check-in sensor: all checks passed");
