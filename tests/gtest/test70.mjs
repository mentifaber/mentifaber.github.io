// Move-in, Move-out, the server side (src/seal.js, POST /api/seal/inventory): the workshop signs an inspection (a
// property, the move-in or move-out walk, and room by room each item's condition and note and each photo's fingerprint),
// never the photos; a walk with no property, no phase, no rooms, a nameless room, too many rooms, items or photos, or a
// photo without its SHA-256 is refused before it counts; inspections and Claim Kits share 20 a day per connection.
import assert from "node:assert/strict";
const { seal, INV_ROOMS, INV_ITEMS, INV_PHOTOS } = await import(new URL("../../src/seal.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
let keyRec = null; const hits = new Map();
const env = { STORE: { idFromName: (x) => x, get: () => ({
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()),
  hit: async (k, limit) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= limit; } }) } };
const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const go = async (path, body, ip = "203.0.113.20") => { const r = await seal(new Request("https://mentifaber.org/api/seal/" + path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) }), env, json, false); return { status: r.status, j: await r.json() }; };
const unb = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const SHA = (c) => c.repeat(64);
const walk = { property: "Flat 4B, 12 Elm Street", phase: "in", date: "2026-11-01", landlord: "Elm Street Lettings", tenant: "Robin", extra: "dropped", rooms: [
  { name: "Kitchen", items: [{ what: "Oven and hob", cond: "good", note: "Clean, all rings work" }, { what: "Worktop", cond: "scorched" }], photos: [{ name: "oven.jpg", sha256: SHA("a"), bytes: 2048 }] },
  { name: "Hall", items: [{ what: "Walls", cond: "worn", note: "Scuff by the door" }], photos: [] }] };
let r = await go("inventory", walk); assert.equal(r.status, 200, JSON.stringify(r.j));
const body = JSON.parse(unb(r.j.record.split(".")[0]).toString()); assert.equal(body.kind, "inventory");
assert.deepEqual(body.data, { property: "Flat 4B, 12 Elm Street", phase: "in", date: "2026-11-01", landlord: "Elm Street Lettings", tenant: "Robin", rooms: [
  { name: "Kitchen", items: [{ what: "Oven and hob", cond: "good", note: "Clean, all rings work" }, { what: "Worktop" }], photos: [{ name: "oven.jpg", sha256: SHA("a"), bytes: 2048 }] },
  { name: "Hall", items: [{ what: "Walls", cond: "worn", note: "Scuff by the door" }], photos: [] }] });
ok("an inspection is signed room by room, with conditions, notes and photo fingerprints; an unknown condition and stray fields are dropped");

const before = hits.get("claim:203.0.113.21") || 0;
for (const [b, why] of [[{ ...walk, property: "" }, /which property/], [{ ...walk, phase: "mid" }, /move-in or the move-out/], [{ ...walk, rooms: [] }, /add a room/],
  [{ ...walk, rooms: [{ name: " ", items: [] }] }, /room 1 needs a name/], [{ ...walk, rooms: Array(INV_ROOMS + 1).fill({ name: "Room", items: [] }) }, /at most 30 rooms/],
  [{ ...walk, rooms: [{ name: "Kitchen", items: Array(INV_ITEMS + 1).fill({ what: "x" }) }] }, /Kitchen: at most 20 items/],
  [{ ...walk, rooms: Array(16).fill({ name: "Room", items: [], photos: Array(10).fill({ name: "p.jpg", sha256: SHA("b") }) }) }, /at most 150 photos/],
  [{ ...walk, rooms: [{ name: "Kitchen", items: [], photos: [{ name: "p.jpg", data: "AAAA" }] }] }, /Kitchen, photo 1: send its SHA-256, not the photo/]]) {
  const x = await go("inventory", b, "203.0.113.21"); assert.equal(x.status, 400); assert.match(x.j.error, why); }
assert.equal(hits.get("claim:203.0.113.21") || 0, before, "a refused walk doesn't count");
assert.equal(INV_PHOTOS, 150);
ok("no property, no phase, no rooms, a nameless room, over 30 rooms, 20 items in a room or 150 photos, or a photo without its SHA-256 is refused, and doesn't count");

for (let i = 0; i < 20; i++) assert.equal((await go(i % 2 ? "inventory" : "claim", i % 2 ? walk : { title: "x", items: [{ sha256: SHA("c") }] }, "203.0.113.22")).status, 200);
assert.equal((await go("inventory", walk, "203.0.113.22")).status, 429);
ok("inspections and Claim Kits share twenty a day per connection");
console.log("move-in, move-out seal: all checks passed");
