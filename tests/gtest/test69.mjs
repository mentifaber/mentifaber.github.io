// Street Board, the server side (src/board.js, /api/board/<board>): the meeting point for posts phones carried while the
// network was down.
//  - a board is a 5-letter place code or a name; anything else is refused
//  - a batch from a phone: well-formed posts are kept once by id (a later copy can't change one); a malformed post, a
//    stretched life (over 7 days), an expired one, a future-dated one or an unknown kind is refused, the rest still kept
//  - only the writer's key takes a post down; the tombstone is handed out so phones drop it, and an old copy relayed
//    later doesn't bring it back
//  - three connections flag a post and it's hidden; sixty new posts a day per connection; at most 40 in a batch
import assert from "node:assert/strict";
const { board } = await import(new URL("../../src/board.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map(), DAY = 864e5, H = 36e5;
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const go = async (path, body, ip = "203.0.113.9") => { const r = await board(new Request("https://mentifaber.org/api/board/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined }), env, json); return { status: r.status, j: await r.json() }; };
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const now = Date.now(), K = "a".repeat(32), DK = await sha(K);
const post = (id, o = {}) => ({ id: id.padEnd(12, "0"), kind: "need", text: "Need drinking water for two", by: "Ann, 12 Oak", at: now - H, exp: now + DAY, ...o });

for (const bad of ["ab", "a b", "-ab", "x".repeat(25), "a_b"]) assert.equal((await go(encodeURIComponent(bad))).status, 404, bad);
assert.equal((await go("dr5ru")).status, 200); assert.equal((await go("elm-street")).status, 200); assert.equal((await go("Elm-Street")).j.board, "elm-street", "names are lowercased");
ok("a board is a 5-letter place code or a name of 3 to 24 letters, digits and hyphens");

let r = await go("dr5ru", { posts: [post("a1", { dk: DK }), post("a2", { kind: "offer", text: "Generator power: charge phones at 14 Oak, 9 to 5" }), post("b1", { exp: now + 8 * DAY }), post("b2", { exp: now - 1 }),
  post("b3", { at: now + DAY, exp: now + 2 * DAY }), post("b4", { kind: "party" }), post("b5", { text: "x" }), { id: "zz", kind: "info", text: "bad id", at: now, exp: now + H }, post("a3", { kind: "safe", text: "We're all fine at 3 Elm", extra: "dropped", by: "" })] });
assert.deepEqual([r.j.added, r.j.refused], [3, 6]); const ids = r.j.posts.map((p) => p.id.slice(0, 2)).sort(); assert.deepEqual(ids, ["a1", "a2", "a3"]);
assert.ok(!JSON.stringify(mem.get("sb:dr5ru")).includes("dropped") && !("by" in r.j.posts.find((p) => p.id.startsWith("a3"))));
r = await go("dr5ru", { posts: [post("a1", { text: "Changed by a relay", exp: now + 6 * DAY })] }, "203.0.113.10"); assert.equal(r.j.added, 0);
assert.equal((await go("dr5ru")).j.posts.find((p) => p.id.startsWith("a1")).text, "Need drinking water for two", "a later copy can't change a post");
ok("a batch keeps well-formed posts once by id; a stretched life, an expired, future-dated, unknown-kind, too-short or bad-id post is refused; a later copy can't change one");

assert.equal((await go("dr5ru/remove", { id: post("a1").id, k: "b".repeat(32) })).status, 403, "someone else's key");
assert.equal((await go("dr5ru/remove", { id: post("a2").id, k: K })).status, 403, "a post written without a key can't be taken down by anyone");
assert.equal((await go("dr5ru/remove", { id: post("a1").id, k: K })).status, 200);
let g = (await go("dr5ru")).j.posts; assert.deepEqual(g.find((p) => p.id.startsWith("a1")), { id: post("a1").id, gone: true, exp: now + DAY }, "the tombstone is handed out, with nothing of the post");
r = await go("dr5ru", { posts: [post("a1", { dk: DK })] }, "203.0.113.11"); assert.equal(r.j.added, 0, "an old copy relayed later doesn't bring it back");
ok("only the writer's key takes a post down; the tombstone goes out so phones drop it; an old copy relayed later doesn't bring it back");

for (const ip of ["198.51.100.1", "198.51.100.1", "198.51.100.2"]) await go("dr5ru/flag", { id: post("a2").id }, ip);
assert.ok((await go("dr5ru")).j.posts.some((p) => p.id.startsWith("a2")), "two connections aren't enough");
assert.equal((await go("dr5ru/flag", { id: post("a2").id }, "198.51.100.3")).j.hidden, true); assert.ok(!(await go("dr5ru")).j.posts.some((p) => p.id.startsWith("a2")));
ok("three different connections flag a post and it's hidden");

assert.match((await go("elm-street", { posts: Array.from({ length: 41 }, (_, i) => post("c" + i)) })).j.error, /at most 40/);
let x = await go("elm-street", { posts: Array.from({ length: 40 }, (_, k) => post("d" + k.toString(16).padStart(3, "0"))) }, "203.0.113.50"); assert.equal(x.j.added, 40);
x = await go("elm-street", { posts: Array.from({ length: 40 }, (_, k) => post("e" + k.toString(16).padStart(3, "0"))) }, "203.0.113.50");
assert.equal(x.status, 200); assert.equal(x.j.added, 20, "the first 20 of the batch fit the day's 60, and are kept"); assert.match(x.j.limited, /today's 60 new posts/);
assert.equal((await go("elm-street")).j.posts.length, 60);
ok("sixty new posts a day per connection, at most 40 in a batch");
console.log("street board: all checks passed");
