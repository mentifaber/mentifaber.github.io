// Street Library, the server side (src/library.js, /api/library/<board>): a street's shelf of things to lend, on the
// same boards as Street Board:
//  - a thing goes on the shelf with a hash of its lender's key; the hash is never handed out
//  - only the lender's key lends it (to whom, due when, and the condition photo's fingerprint with its Witness record),
//    marks it back (the loan moves to its past, with the photo back's fingerprint) or takes it down
//  - anyone can ask to borrow it; lending it to someone clears their ask
//  - malformed things, loans and boards are refused; a thing can't be lent twice (even at the same moment) or marked
//    back when it isn't out; two neighbours' changes at the same moment are both kept
//  - 30 new things and 30 asks a day per connection (a refused one doesn't count); 200 things on a shelf
import assert from "node:assert/strict";
const { library } = await import(new URL("../../src/library.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map();
// like the Store: a read yields (so two requests can interleave around it), and kvCas checks and writes in one step
const tick = () => new Promise((r) => setImmediate(r));
const st = { kvGet: async (k) => { await tick(); return structuredClone(mem.get(k)) ?? null; }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; },
  kvCas: async (k, expect, v) => { await tick(); const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== expect) return { ok: false, cur: structuredClone(cur) }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (board, body, ip = "203.0.113.30") => { const r = await library(new Request("https://mentifaber.org/api/library/" + board, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined }), env, json); return { s: r.status, j: await r.json() }; };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const KEY = hex(16), ID = hex(6), PHOTO = hex(32), BACK = hex(32);

let r = await call("elm-street", { op: "add", item: { id: ID, what: "Ladder (3 m)", note: "Aluminium, folding", by: "Ann" }, ok: await sha(KEY) }); assert.equal(r.s, 200);
r = await call("elm-street"); assert.equal(r.j.items.length, 1); assert.deepEqual([r.j.items[0].what, r.j.items[0].by, r.j.items[0].loan], ["Ladder (3 m)", "Ann", null]);
assert.ok(!JSON.stringify(r.j).includes(await sha(KEY)), "the key's hash is never handed out"); assert.equal((await call("Elm-Street")).j.items.length, 1, "board names are case-blind");
assert.equal((await call("elm-street", { op: "add", item: { id: ID, what: "Ladder" }, ok: await sha(KEY) })).s, 409, "the same id twice");
ok("a thing goes on the shelf with a hash of its lender's key, which nobody is handed");

r = await call("elm-street", { op: "ask", id: ID, by: "Bob", text: "For Saturday, to clear the gutters" }); assert.equal(r.s, 200); assert.equal(r.j.item.asks[0].by, "Bob");
for (const [b, s, why] of [[{ op: "lend", id: ID, key: hex(16), to: "Bob", due: day(3) }, 403, "another key can't lend it"], [{ op: "lend", id: ID, to: "Bob", due: day(3) }, 403, "nor no key"],
  [{ op: "lend", id: ID, key: KEY, to: "", due: day(3) }, 400, "say who"], [{ op: "lend", id: ID, key: KEY, to: "Bob", due: "soon" }, 400, "say when"], [{ op: "lend", id: ID, key: KEY, to: "Bob", due: day(-5) }, 400, "not in the past"],
  [{ op: "back", id: ID, key: KEY }, 409, "it isn't out"], [{ op: "remove", id: ID, key: hex(16) }, 403, "another key can't take it down"]]) assert.equal((await call("elm-street", b)).s, s, why);
r = await call("elm-street", { op: "lend", id: ID, key: KEY, to: "Bob", due: day(3), sha: PHOTO, witness: "eyJ2IjoxfQ.c2ln" }); assert.equal(r.s, 200);
assert.deepEqual([r.j.item.loan.to, r.j.item.loan.due, r.j.item.loan.sha, r.j.item.loan.witness], ["Bob", day(3), PHOTO, "eyJ2IjoxfQ.c2ln"]); assert.deepEqual(r.j.item.asks, [], "Bob's ask is cleared");
assert.equal((await call("elm-street", { op: "lend", id: ID, key: KEY, to: "Cara", due: day(3) })).s, 409, "not lent twice");
ok("anyone can ask; only the lender's key lends it, to someone, due back on a day, with the condition photo's fingerprint and Witness record; not twice");

r = await call("elm-street", { op: "back", id: ID, key: KEY, sha: BACK }); assert.equal(r.s, 200); assert.equal(r.j.item.loan, null);
assert.deepEqual([r.j.item.past[0].to, r.j.item.past[0].sha, r.j.item.past[0].backSha], ["Bob", PHOTO, BACK]); assert.ok(r.j.item.past[0].back >= r.j.item.past[0].out);
ok("marked back by the lender: the loan moves to its past, with both photos' fingerprints");

// at the same moment: two lends of the same thing (one wins, the other is told it's out), and two neighbours' asks (both kept)
const two = await Promise.all(["Cara", "Dev"].map((to) => call("elm-street", { op: "lend", id: ID, key: KEY, to, due: day(2) })));
assert.deepEqual(two.map((x) => x.s).sort(), [200, 409], "lent once"); assert.match(two.find((x) => x.s === 409).j.error, /already out, with (Cara|Dev)/);
await call("elm-street", { op: "back", id: ID, key: KEY });
await Promise.all(["Eve", "Fay"].map((by) => call("elm-street", { op: "ask", id: ID, by, text: "Sunday?" })));
assert.deepEqual((await call("elm-street")).j.items[0].asks.map((a) => a.by).sort(), ["Eve", "Fay"], "neither ask lost");
ok("at the same moment: two lends of one thing, one wins and the other is told it's out; two neighbours' asks, both kept");

for (const [b, why] of [[{ op: "add", item: { id: "x", what: "Drill" }, ok: await sha(KEY) }, "id"], [{ op: "add", item: { id: hex(6), what: "D" }, ok: await sha(KEY) }, "what"], [{ op: "add", item: { id: hex(6), what: "Drill" }, ok: "nope" }, "key hash"], [{ op: "dance" }, "op"]])
  assert.equal((await call("elm-street", b)).s, 400, why);
for (const board of ["x", "A_B", "a".repeat(30)]) assert.equal((await call(board)).s, 404, board);
assert.equal((await call("elm-street", { op: "ask", id: hex(6), by: "Bob" })).s, 404, "asking for something not on the shelf");
ok("malformed things and boards are refused");

hits.clear(); let added = 0; for (let i = 0; i < 32; i++) { r = await call("oak-road", { op: "add", item: { id: hex(6), what: "Thing " + i }, ok: await sha(KEY) }, "198.51.100.7"); if (r.s === 200) added++; else assert.equal(r.s, 429); }
assert.equal(added, 30, "30 new things a day per connection");
hits.clear(); await call("oak-road", { op: "add", item: { id: "bad", what: "Thing" }, ok: await sha(KEY) }, "198.51.100.8"); assert.equal(hits.get("lib-add:198.51.100.8"), undefined, "a refused thing doesn't count");
const full = { items: Array.from({ length: 200 }, (_, i) => ({ id: i.toString(16).padStart(12, "0"), what: "x" + i, note: "", by: "", at: 0, ok: hex(32), loan: null, asks: [], past: [] })) }; mem.set("sl:full-street", full);
assert.equal((await call("full-street", { op: "add", item: { id: hex(6), what: "One more" }, ok: await sha(KEY) })).s, 409, "200 things on a shelf");
ok("30 new things a day per connection (a refused one doesn't count); a shelf holds 200");

r = await call("elm-street", { op: "remove", id: ID, key: KEY }); assert.equal(r.s, 200); assert.equal((await call("elm-street")).j.items.length, 0);
ok("the lender's key takes it down");
console.log("street library: all checks passed");
