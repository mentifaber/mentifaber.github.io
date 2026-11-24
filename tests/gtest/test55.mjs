// Sealed Letters, the server side (src/letters.js, /api/letters/*):
//  - a date lock: the ciphertext is readable any time (useless without the friends' shares), the release secret only
//    from the date on
//  - a check-in lock opens once the writer misses the deadline; a check-in moves it; checking in needs the writer key
//  - bad k of n, past or far dates, short check-ins, missing secrets and oversized letters are refused
//  - six letters a day per connection; deleting needs the writer key
import assert from "node:assert/strict";
const { letters, opensAt } = await import(new URL("../../src/letters.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
let ip = 1; const go = async (path, body, fresh = true) => { const r = await letters(new Request("https://mentifaber.org/api/letters" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100." + (fresh ? ip++ : 1) }, body: body ? JSON.stringify(body) : undefined }), env, json); return { status: r.status, j: await r.json() }; };
const CT = "A".repeat(40), IV = "B".repeat(16), S = "c".repeat(64), DAY = 864e5;

for (const bad of [{ ct: CT, iv: IV, k: 3, n: 2 }, { ct: CT, iv: IV, k: 1, n: 13 }, { ct: "short", iv: IV, k: 1, n: 1 }, { ct: "A".repeat(90001), iv: IV, k: 1, n: 1 },
  { ct: CT, iv: IV, k: 1, n: 1, lock: { type: "date", at: new Date(Date.now() - DAY).toISOString() }, S }, { ct: CT, iv: IV, k: 1, n: 1, lock: { type: "date", at: new Date(Date.now() + 60 * 365 * DAY).toISOString() }, S },
  { ct: CT, iv: IV, k: 1, n: 1, lock: { type: "checkin", days: 3 }, S }, { ct: CT, iv: IV, k: 1, n: 1, lock: { type: "date", at: new Date(Date.now() + DAY).toISOString() } }]) assert.equal((await go("", bad)).status, 400, JSON.stringify(bad).slice(0, 120));
ok("k more than n, more than 12 friends, a too-short or oversized letter, a past or 60-year date, a 3-day check-in and a lock without its secret are refused");

let r = await go("", { ct: CT, iv: IV, k: 2, n: 3, lock: { type: "date", at: new Date(Date.now() + 10 * DAY).toISOString() }, S });
assert.equal(r.status, 200); const id = r.j.id, token = r.j.token; assert.ok(!("S" in r.j));
let g = await go("/" + id); assert.equal(g.j.ct, CT); assert.equal(g.j.open, false); assert.ok(!("S" in g.j), "no secret before the date"); assert.equal(g.j.k, 2);
const L = mem.get("letter:" + id); L.lock.at = Date.now() - 1000; mem.set("letter:" + id, L);
g = await go("/" + id); assert.equal(g.j.open, true); assert.equal(g.j.S, S);
assert.ok(!JSON.stringify(mem.get("letter:" + id)).includes(token), "only a hash of the writer key is kept");
ok("a date lock: the sealed letter is readable any time, its release secret only from the date; the writer key is kept only as a hash");

r = await go("", { ct: CT, iv: IV, k: 1, n: 2, lock: { type: "checkin", days: 30 }, S }); const cid = r.j.id, ctok = r.j.token;
assert.ok(Math.abs(r.j.opens - (Date.now() + 30 * DAY)) < 5000);
assert.equal((await go("/" + cid + "/checkin", { token: "0".repeat(32) })).status, 403);
const C = mem.get("letter:" + cid); C.lock.last -= 29 * DAY; mem.set("letter:" + cid, C);
r = await go("/" + cid + "/checkin", { token: ctok }); assert.ok(r.j.ok && Math.abs(r.j.opens - (Date.now() + 30 * DAY)) < 5000, JSON.stringify(r.j));
const C2 = mem.get("letter:" + cid); C2.lock.last -= 31 * DAY; mem.set("letter:" + cid, C2);
g = await go("/" + cid); assert.equal(g.j.open, true); assert.equal(g.j.S, S);
assert.equal((await go("/" + cid + "/checkin", { token: ctok })).status, 409, "too late to check in once it has opened");
assert.equal(opensAt({ lock: { type: "checkin", days: 7, last: 0 } }), 7 * DAY);
ok("a check-in lock: the writer key moves the deadline (a wrong key can't); missed, the secret is released and a late check-in can't take it back");

assert.equal((await go("/" + id + "/delete", { token: ctok })).status, 403); assert.equal((await go("/" + id + "/delete", { token })).status, 200); assert.equal((await go("/" + id)).status, 404);
for (let i = 0; i < 6; i++) assert.equal((await go("", { ct: CT, iv: IV, k: 1, n: 1 }, false)).status, 200);
assert.equal((await go("", { ct: CT, iv: IV, k: 1, n: 1 }, false)).status, 429);
ok("deleting needs that letter's writer key; a connection gets six letters a day");
console.log("test55: " + n + " checks passed");
