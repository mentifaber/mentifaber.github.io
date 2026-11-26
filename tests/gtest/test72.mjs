// Care Circle, the server side (src/care.js, /api/care/<id>): it keeps a circle's ciphertext, IV, a version and a hash of
// its token, and nothing it could read the circle with:
//  - version 0 makes a circle; the token that made it is the only one that reads, writes or deletes it
//  - a write names the version it was made from; one from an older version is refused (409) with the current one, so
//    the browser can apply its change on top; nothing is overwritten
//  - malformed ids, tokens, ciphertext, IVs and versions are refused; 10 new circles a day per connection (a refused one
//    doesn't count); 800 changes a day per circle
//  - what's stored holds no token, only its hash
import assert from "node:assert/strict";
const { care } = await import(new URL("../../src/care.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => { mem.delete(k); }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (path, body, { token, ip = "203.0.113.9" } = {}) => { const h = { "content-type": "application/json", "cf-connecting-ip": ip }; if (token) h["x-care-token"] = token;
  const r = await care(new Request("https://mentifaber.org/api/care/" + path, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, json); return { s: r.status, j: await r.json() }; };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const ID = hex(8), T = hex(16), CT = "A".repeat(40), IV = "B".repeat(16);

let r = await call(ID, { t: T, v: 0, ct: CT, iv: IV }); assert.equal(r.s, 200); assert.equal(r.j.v, 1);
assert.deepEqual(Object.keys(mem.get("care:" + ID)).sort(), ["at", "created", "ct", "iv", "th", "v"]); assert.ok(!JSON.stringify(mem.get("care:" + ID)).includes(T), "no token kept, only its hash");
r = await call(ID, undefined, { token: T }); assert.deepEqual([r.s, r.j.v, r.j.ct, r.j.iv], [200, 1, CT, IV]);
for (const bad of [hex(16), undefined, "x".repeat(32)]) { r = await call(ID, undefined, { token: bad }); assert.equal(r.s, 403, String(bad)); }
r = await call(ID, { t: hex(16), v: 1, ct: CT, iv: IV }); assert.equal(r.s, 403, "another token can't write"); r = await call(ID + "/delete", { t: hex(16) }); assert.equal(r.s, 403, "or delete");
ok("version 0 makes a circle; only its token reads, writes or deletes it; only the token's hash is kept");

r = await call(ID, { t: T, v: 1, ct: "C".repeat(40), iv: IV }); assert.deepEqual([r.s, r.j.v], [200, 2]);
r = await call(ID, { t: T, v: 1, ct: "D".repeat(40), iv: IV }); assert.equal(r.s, 409, "made from version 1, but it's at 2"); assert.deepEqual([r.j.v, r.j.ct], [2, "C".repeat(40)], "with the current one");
assert.equal(mem.get("care:" + ID).ct, "C".repeat(40), "nothing overwritten");
r = await call(ID, { t: T, v: 2, ct: "D".repeat(40), iv: IV }); assert.deepEqual([r.s, r.j.v], [200, 3]);
r = await call(ID, { t: T, v: 0, ct: CT, iv: IV }); assert.equal(r.s, 409, "version 0 can't remake a circle that exists");
ok("a write names its version: one made from an older version is refused with the current circle, and nothing is lost");

for (const [b, why] of [[{ t: T, v: 3, ct: "short", iv: IV }, "ciphertext"], [{ t: T, v: 3, ct: "E".repeat(170000), iv: IV }, "too big"], [{ t: T, v: 3, ct: CT, iv: "short" }, "IV"], [{ t: T, v: "3", ct: CT, iv: IV }, "version"], [{ t: T, v: -1, ct: CT, iv: IV }, "version"]]) {
  r = await call(ID, b); assert.equal(r.s, 400, why); }
for (const id of ["nope", "ABCDEF0123456789", hex(8) + "00"]) { r = await call(id, undefined, { token: T }); assert.equal(r.s, 404, id); }
r = await call(hex(8), { t: T, v: 4, ct: CT, iv: IV }); assert.equal(r.s, 404, "only version 0 makes one");
ok("malformed ids, ciphertext, IVs and versions are refused; a circle that doesn't exist is only made from version 0");

hits.clear(); let made = 0; for (let i = 0; i < 12; i++) { r = await call(hex(8), { t: hex(16), v: 0, ct: CT, iv: IV }, { ip: "198.51.100.4" }); if (r.s === 200) made++; else assert.equal(r.s, 429); }
assert.equal(made, 10, "10 new circles a day per connection");
hits.clear(); for (let i = 0; i < 3; i++) await call(hex(8), { t: hex(16), v: 0, ct: "x", iv: IV }, { ip: "198.51.100.5" }); assert.equal(hits.get("care-new:198.51.100.5"), undefined, "a refused circle doesn't count");
hits.set("care-w:" + ID, 800); r = await call(ID, { t: T, v: 3, ct: CT, iv: IV }); assert.equal(r.s, 429, "800 changes a day per circle");
ok("10 new circles a day per connection (a refused one doesn't count); 800 changes a day per circle");

r = await call(ID + "/delete", { t: T }); assert.equal(r.s, 200); assert.equal(mem.has("care:" + ID), false); r = await call(ID, undefined, { token: T }); assert.equal(r.s, 404);
ok("the circle's own token deletes it, for everyone");
console.log("care circle: all checks passed");
