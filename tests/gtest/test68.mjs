// Sealed Letters' "quiet" lock (src/letters.js), for Digital Estate: a letter that opens only once the writer's Quiet
// Check-in (src/checkin.js) has gone quiet for its days.
//  - only the person can tie a letter to their check-in (their own link's key, checked and not stored); a check-in that
//    doesn't exist, or days outside 7–730, are refused
//  - it stays sealed while they keep checking in there, and while they've said they're away; it opens when they stop
//  - once the release secret has been handed out, a later check-in doesn't lock it again; if the check-in is deleted,
//    the last check-in seen is what counts; checking in on the letter itself is refused (it follows the check-in)
import assert from "node:assert/strict";
const { letters } = await import(new URL("../../src/letters.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map(), DAY = 864e5;
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
let ip = 1; const go = async (path, body) => { const r = await letters(new Request("https://mentifaber.org/api/letters" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100." + ip++ }, body: body ? JSON.stringify(body) : undefined }), env, json); return { status: r.status, j: await r.json() }; };
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const CI = "a1b2c3d4e5f60718", ME = "f".repeat(32), FAM = "e".repeat(32), CT = "A".repeat(40), IV = "B".repeat(16), S = "c".repeat(64);
mem.set("ci:" + CI, { name: "Ann", by: "10:00", tz: "UTC", last: Date.now() - 3 * DAY, days: [], mk: await sha(ME), fk: await sha(FAM), subs: [] });
const ci = (f) => { const c = mem.get("ci:" + CI); f(c); mem.set("ci:" + CI, c); };
const letter = (id, f) => { const L = mem.get("letter:" + id); f(L); mem.set("letter:" + id, L); };
const base = { ct: CT, iv: IV, k: 2, n: 3, S };

assert.equal((await go("", { ...base, lock: { type: "quiet", ci: CI, t: FAM, days: 30 } })).status, 403, "the family's key can't");
assert.equal((await go("", { ...base, lock: { type: "quiet", ci: "0".repeat(16), t: ME, days: 30 } })).status, 404);
assert.equal((await go("", { ...base, lock: { type: "quiet", ci: CI, t: ME, days: 3 } })).status, 400);
let r = await go("", { ...base, lock: { type: "quiet", ci: CI, t: ME, days: 30 } }); assert.equal(r.status, 200); const id = r.j.id, token = r.j.token;
assert.ok(Math.abs(r.j.opens - (Date.now() + 30 * DAY)) < 5000, "sealing it counts as being here now, whatever the last check-in was");
assert.ok(!JSON.stringify(mem.get("letter:" + id)).includes(ME), "the person's key isn't kept");
let g = await go("/" + id); assert.equal(g.j.open, false); assert.ok(!("S" in g.j)); assert.deepEqual(g.j.lock, { type: "quiet", days: 30 });
ok("only the person's own key ties a letter to their Quiet Check-in, and it isn't kept; a missing check-in or days under 7 are refused");

// 31 days on, still checking in: still sealed (the letter follows the check-in)
letter(id, (L) => (L.lock.last = Date.now() - 31 * DAY)); ci((c) => (c.last = Date.now() - 2 * DAY));
g = await go("/" + id); assert.equal(g.j.open, false); assert.ok(Math.abs(g.j.opens - (Date.now() + 28 * DAY)) < 5000);
// quiet for 31 days, but away through next week: still sealed
letter(id, (L) => (L.lock.last = Date.now() - 31 * DAY)); ci((c) => { c.last = Date.now() - 31 * DAY; c.away = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10); });
g = await go("/" + id); assert.equal(g.j.open, false, "away counts as checked in");
ok("it stays sealed while they keep checking in, and while they're away");

// quiet for 31 days: it opens, and the release secret comes out
ci((c) => { delete c.away; c.last = Date.now() - 31 * DAY; }); letter(id, (L) => (L.lock.last = Date.now() - 31 * DAY));
g = await go("/" + id); assert.equal(g.j.open, true); assert.equal(g.j.S, S);
ci((c) => (c.last = Date.now())); g = await go("/" + id); assert.equal(g.j.open, true, "released: a later check-in doesn't lock it again"); assert.equal(g.j.S, S);
assert.equal((await go("/" + id + "/checkin", { token })).status, 400, "it follows the check-in, not check-ins here");
ok("quiet for its days, it opens; once released, a later check-in doesn't lock it again; checking in on the letter itself is refused");

r = await go("", { ...base, lock: { type: "quiet", ci: CI, t: ME, days: 10 } }); const id2 = r.j.id;
letter(id2, (L) => (L.lock.last = Date.now() - 11 * DAY)); mem.delete("ci:" + CI);
g = await go("/" + id2); assert.equal(g.j.open, true, "the check-in deleted: the last check-in seen counts");
ok("if the Quiet Check-in is deleted, the last check-in seen is what counts");
console.log("letters quiet lock: all checks passed");
