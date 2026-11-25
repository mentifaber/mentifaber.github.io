// Claim Kit, the server side (src/seal.js, POST /api/seal/claim): the workshop signs a case and the fingerprint of every
// file in it, in order, never the files; a kit with no name, no items, too many items or an item without a SHA-256 is
// refused (and doesn't count against the day's limit); twenty kits a day per connection; the record checks out against
// the public key, and one changed character doesn't.
import assert from "node:assert/strict";
const { seal, CLAIM_ITEMS, CLAIM_DAY } = await import(new URL("../../src/seal.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
let keyRec = null; const hits = new Map();
const env = { STORE: { idFromName: (x) => x, get: () => ({
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()),
  hit: async (k, limit) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= limit; } }) } };
const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const go = async (body, ip = "203.0.113.9", method = "POST", path = "claim") => { const r = await seal(new Request("https://mentifaber.org/api/seal/" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: method === "POST" ? JSON.stringify(body) : undefined }), env, json, false); return { status: r.status, j: await r.json() }; };
const SHA = (c) => c.repeat(64);
const unb = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const kit = { title: "Flat 4B deposit", kind: "deposit", party: "Elm Street Lettings", amount: "950.5", items: [
  { what: "photo", name: "hall-scuff.jpg", sha256: SHA("a"), bytes: 2048, date: "2026-10-31", note: "Scuff was there at move-in" },
  { what: "receipt", name: "carpet-clean.pdf", sha256: SHA("B"), bytes: 900, date: "2026-11-01" },
  { what: "note", name: "note-3.txt", sha256: SHA("c"), date: "not a date", note: "Agent agreed by phone the scuff was old", extra: "dropped" },
  { what: "video", name: "x", sha256: SHA("d") }] };
let r = await go(kit); assert.equal(r.status, 200, JSON.stringify(r.j));
const [p64, s64] = r.j.record.split("."), body = JSON.parse(unb(p64).toString());
assert.equal(body.kind, "claim"); assert.ok(Math.abs(body.iat - Date.now()) < 5000, "the workshop's own clock");
assert.deepEqual(body.data, { title: "Flat 4B deposit", kind: "deposit", party: "Elm Street Lettings", amount: 950.5, items: [
  { n: 1, what: "photo", name: "hall-scuff.jpg", sha256: SHA("a"), bytes: 2048, date: "2026-10-31", note: "Scuff was there at move-in" },
  { n: 2, what: "receipt", name: "carpet-clean.pdf", sha256: SHA("b"), bytes: 900, date: "2026-11-01" },
  { n: 3, what: "note", name: "note-3.txt", sha256: SHA("c"), note: "Agent agreed by phone the scuff was old" },
  { n: 4, what: "document", name: "x", sha256: SHA("d") }] });
ok("a kit is signed with each item's fingerprint, in order, and nothing else: no files, no stray fields; a bad date or kind is dropped");

const k = await go(null, "1.1.1.1", "GET", "key"), pub = await crypto.subtle.importKey("jwk", k.j.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb(s64), new TextEncoder().encode(p64)), true);
const forged = Buffer.from(JSON.stringify({ ...body, data: { ...body.data, amount: 9500 } })).toString("base64url");
assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb(s64), new TextEncoder().encode(forged)), false);
ok("the record checks out against the workshop's public key; changing the amount breaks it");

const before = hits.get("claim:203.0.113.7") || 0;
for (const [bad, why] of [[{ ...kit, title: " " }, /name/], [{ ...kit, items: [] }, /add something/], [{ ...kit, items: Array(CLAIM_ITEMS + 1).fill(kit.items[0]) }, /at most 60/],
  [{ ...kit, items: [{ name: "a.jpg", sha256: "nothex" }] }, /item 1: send its SHA-256/], [{ ...kit, items: [{ name: "a.jpg", data: "AAAA" }] }, /SHA-256, not the file/]]) {
  const x = await go(bad, "203.0.113.7"); assert.equal(x.status, 400); assert.match(x.j.error, why); }
assert.equal(hits.get("claim:203.0.113.7") || 0, before, "a refused kit doesn't count against the limit");
ok("no name, no items, more than 60, or an item without its SHA-256 is refused, and doesn't use up the day's limit");

for (let i = 0; i < CLAIM_DAY; i++) assert.equal((await go(kit, "203.0.113.8")).status, 200);
const over = await go(kit, "203.0.113.8"); assert.equal(over.status, 429); assert.match(over.j.error, /today's 20 sealed kits/);
assert.equal((await go(kit, "203.0.113.10")).status, 200, "another connection is unaffected");
ok("twenty kits a day per connection");
console.log("claim kit seal: all checks passed");
