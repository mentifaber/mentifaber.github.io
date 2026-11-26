// Street Skills, the server side (src/skills.js, /api/skills/<board>): what neighbours can do for each other.
//  - an offer goes up with a hash of its key; the hash is never handed out; only that key takes it down or marks an ask done
//  - anyone asks (a name and what they need); thanks once a day per connection per offer
//  - malformed offers and boards refused; two neighbours' asks at the same moment are both kept; 20 offers and 30 asks a day
import assert from "node:assert/strict";
const { skills } = await import(new URL("../../src/skills.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map(), tick = () => new Promise((r) => setImmediate(r));
const st = { kvGet: async (k) => { await tick(); return structuredClone(mem.get(k)) ?? null; }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; },
  kvCas: async (k, e, v) => { await tick(); const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== e) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (board, body, ip = "203.0.113.30") => { const r = await skills(new Request("https://mentifaber.org/api/skills/" + board, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined }), env, json); return { s: r.status, j: await r.json() }; };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const KEY = hex(16), ID = hex(6);

let r = await call("elm-street", { op: "add", offer: { id: ID, what: "Fix bikes: punctures, brakes, gears", kind: "fix", note: "Weekend mornings, no. 12", by: "Ann" }, ok: await sha(KEY) }); assert.equal(r.s, 200);
assert.deepEqual(Object.keys(r.j.offer).sort(), ["asks", "at", "by", "id", "kind", "note", "thanks", "what"]); r = await call("elm-street"); assert.ok(!JSON.stringify(r.j).includes(await sha(KEY)), "the key's hash is never handed out");
for (const [bad, why] of [[{ id: "x", what: "Fix bikes", by: "A" }, /what you can do/], [{ id: hex(6), what: "ab", by: "A" }, /what you can do/], [{ id: hex(6), what: "Fix bikes", by: "" }, /who you are/]]) { const q = await call("elm-street", { op: "add", offer: bad, ok: await sha(KEY) }); assert.equal(q.s, 400); assert.match(q.j.error, why); }
assert.equal((await call("elm-street", { op: "add", offer: { id: hex(6), what: "Fix bikes", by: "A" } })).s, 400, "no key hash");
assert.equal((await call("elm-street", { op: "add", offer: { id: ID, what: "Fix bikes", by: "A" }, ok: await sha(KEY) })).s, 409, "twice");
assert.equal((await call("Elm Street!")).s, 404);
r = await call("elm-street", { op: "add", offer: { id: hex(6), what: "Sit with the dog", kind: "pets", by: "Cat" }, ok: await sha(hex(16)) }); assert.equal(r.j.offer.kind, "help", "an unknown kind is 'help'");
ok("an offer goes up with a hash of its key, never handed out; malformed offers and boards refused");

const [a, b] = await Promise.all([call("elm-street", { op: "ask", id: ID, by: "Bob", text: "Back brake squeaks" }, "203.0.113.31"), call("elm-street", { op: "ask", id: ID, by: "Dee", text: "Flat tyre on a kid's bike" }, "203.0.113.32")]);
assert.equal(a.s, 200); assert.equal(b.s, 200); r = await call("elm-street"); const off = r.j.offers.find((x) => x.id === ID); assert.deepEqual(off.asks.map((x) => x.by).sort(), ["Bob", "Dee"], "both asks kept");
assert.equal((await call("elm-street", { op: "ask", id: ID, by: "", text: "hello" })).s, 400); assert.equal((await call("elm-street", { op: "ask", id: ID, by: "Eve", text: "" })).s, 400);
ok("anyone asks with a name and what they need; two asks at the same moment are both kept");

assert.equal((await call("elm-street", { op: "thank", id: ID }, "203.0.113.40")).j.offer.thanks, 1); assert.equal((await call("elm-street", { op: "thank", id: ID }, "203.0.113.40")).s, 429, "once a day per connection");
assert.equal((await call("elm-street", { op: "thank", id: ID }, "203.0.113.41")).j.offer.thanks, 2);
ok("thanks are counted, once a day per connection per offer");

const aid = off.asks.find((x) => x.by === "Bob").aid; assert.notEqual(aid, off.asks.find((x) => x.by === "Dee").aid, "each ask has its own id");
assert.equal((await call("elm-street", { op: "answered", id: ID, key: hex(16), aid })).s, 403); assert.equal((await call("elm-street", { op: "remove", id: ID, key: hex(16) })).s, 403);
r = await call("elm-street", { op: "answered", id: ID, key: KEY, aid }); assert.deepEqual(r.j.offer.asks.map((x) => x.by), ["Dee"]);
assert.equal((await call("elm-street", { op: "remove", id: ID, key: KEY })).s, 200); assert.equal((await call("elm-street")).j.offers.some((x) => x.id === ID), false);
ok("only the offer's key marks an ask done (that ask only, even two that came in the same moment) or takes it down");

let got = 0; for (let i = 0; i < 22; i++) { const q = await call("oak-road", { op: "add", offer: { id: hex(6), what: "Thing " + i, by: "Z" }, ok: await sha(KEY) }, "203.0.113.50"); if (q.s === 200) got++; } assert.equal(got, 20);
ok("20 offers a day per connection");
console.log("street skills: all checks passed");
