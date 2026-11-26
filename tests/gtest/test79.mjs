// House Kitty: the sums (assets/kitty/settle.js) and the sealed box on the server (src/care.js's sealedBox, /api/kitty).
//  - shares: evenly or by weights, in cents, always adding back to the cost exactly; nobody outside "among"
//  - balances: who paid, each share, payments made between people; they add up to 0
//  - settle: the fewest payments (6, 4 / −4, −3, −3 takes 3, where biggest-to-biggest takes 4), checked against brute
//    force on 300 random kitties, and every plan brings everyone to 0
//  - the box: only a hash of the token kept, the ciphertext as sent, a stale write refused with the current one, a wrong
//    token refused, its own limits and words ("kitty"); Care Circle's box is unchanged
import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const S = require(new URL("../../assets/kitty/settle.js", import.meta.url).pathname);
const { kitty, care } = await import(new URL("../../src/care.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

assert.deepEqual(S.shares({ amount: 1000, among: ["a", "b", "c"] }), { a: 334, b: 333, c: 333 });
assert.deepEqual(S.shares({ amount: 1000, among: ["a", "b", "c"], weights: { a: 2, b: 1, c: 1 } }), { a: 500, b: 250, c: 250 });
assert.deepEqual(S.shares({ amount: 1001, among: ["a", "b"], weights: { a: 1, b: 0 } }), { a: 1001, b: 0 }, "a weight of 0 pays nothing");
assert.deepEqual(S.shares({ amount: 0, among: ["a"] }), {}); assert.deepEqual(S.shares({ amount: 500, among: [] }), {});
for (let i = 0; i < 500; i++) { const k = 1 + (i % 7), among = Array.from({ length: k }, (_, j) => "p" + j), amount = 1 + Math.floor(Math.random() * 100000), weights = i % 2 ? Object.fromEntries(among.map((p) => [p, 1 + Math.floor(Math.random() * 4)])) : undefined;
  const s = S.shares({ amount, among, weights }); assert.equal(sum(s), amount); assert.deepEqual(Object.keys(s).sort(), [...among].sort()); }
ok("shares: evenly or by weights, in cents, always adding back to the cost exactly (500 random costs)");

const K = { people: [{ id: "ann" }, { id: "bob" }, { id: "cat" }], costs: [
  { amount: 12000, paidBy: "ann", among: ["ann", "bob", "cat"] },          // electricity, 40 each
  { amount: 9000, paidBy: "bob", among: ["ann", "bob", "cat"], weights: { ann: 2, bob: 1, cat: 0 } }, // Ann's double room
  { amount: 2500, paidBy: "cat", among: ["bob", "cat"] },                  // a takeaway
  { amount: 999, paidBy: "dan", among: ["ann"] }],                         // someone not in the kitty: ignored
  paid: [{ from: "cat", to: "ann", amount: 1000 }] };
const b = S.balances(K);
// Ann: paid 120.00, her shares 40.00 + 60.00, and Cat paid her back 10.00 → owed 10.00. Bob: paid 90.00, shares 40.00 +
// 30.00 + 12.50 → owed 7.50. Cat: paid 25.00, shares 40.00 + 12.50, paid Ann 10.00 → owes 17.50
assert.deepEqual(b, { ann: 1000, bob: 750, cat: -1750 });
assert.equal(sum(b), 0);
ok("balances: who paid, each share (even and weighted), a payment between two people; someone not in the kitty is left out; they add up to 0");

const hard = { A: 600, B: 400, C: -400, D: -300, E: -300 };
assert.equal(S.greedy(Object.entries(hard).map(([id, n]) => ({ id, n }))).length, 4, "biggest-to-biggest takes 4");
const plan = S.settle(hard); assert.equal(plan.length, 3); assert.deepEqual(plan.map((p) => p.from + ">" + p.to + ":" + p.amount).sort(), ["C>B:400", "D>A:300", "E>A:300"]);
// brute force: the fewest payments is (people with money to settle) − (the most groups that cancel out among themselves)
const brute = (vals) => { const m = vals.length; let best = 0; const go = (left, groups) => { if (!left.length) { best = Math.max(best, groups); return; }
  const first = left[0], rest = left.slice(1); for (let mask = 0; mask < 1 << rest.length; mask++) { const pick = [first, ...rest.filter((_, i) => mask & (1 << i))]; if (pick.reduce((a, x) => a + x.n, 0) !== 0) continue; go(rest.filter((_, i) => !(mask & (1 << i))), groups + 1); } };
  go(vals, 0); return m - best; };
for (let t = 0; t < 300; t++) {
  const k = 2 + (t % 7), bal = {}; let tot = 0; for (let i = 0; i < k - 1; i++) { const v = (Math.floor(Math.random() * 9) - 4) * 100; bal["p" + i] = v; tot += v; } bal["p" + (k - 1)] = -tot;
  const pl = S.settle(bal), after = { ...bal }; for (const p of pl) { assert.ok(p.amount > 0); after[p.from] += p.amount; after[p.to] -= p.amount; }
  assert.ok(Object.values(after).every((v) => v === 0), "everyone at 0: " + JSON.stringify(bal));
  assert.equal(pl.length, brute(Object.entries(bal).filter(([, n]) => n).map(([id, n]) => ({ id, n }))), JSON.stringify(bal)); }
const big = {}; for (let i = 0; i < 20; i++) big["p" + i] = i < 10 ? 100 * (i + 1) : -100 * (i - 9); const bp = S.settle(big), after = { ...big }; for (const p of bp) { after[p.from] += p.amount; after[p.to] -= p.amount; } assert.ok(Object.values(after).every((v) => v === 0)); assert.ok(bp.length <= 19);
ok("settle: the fewest payments (3 where biggest-to-biggest takes 4), equal to brute force on 300 random kitties, everyone at 0; 20 people settle too");

// the sealed box on the server
const mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvDel: async (k) => { mem.delete(k); }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; },
  kvCas: async (k, e, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== e) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (fn, route, path, body, tok) => { const r = await fn(new Request("https://mentifaber.org/api/" + route + "/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.77", ...(tok ? { ["x-" + route + "-token"]: tok } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, json); return { s: r.status, j: await r.json() }; };
const ID = "0123456789abcdef", T = "a".repeat(32), CT = "Q".repeat(40), IV = "B".repeat(16);
let r = await call(kitty, "kitty", ID, { t: T, v: 0, ct: CT, iv: IV }); assert.equal(r.s, 200); assert.equal(r.j.v, 1);
assert.ok(mem.has("kitty:" + ID) && !mem.has("care:" + ID)); assert.ok(!JSON.stringify(mem.get("kitty:" + ID)).includes(T), "only the token's hash");
r = await call(kitty, "kitty", ID, null, T); assert.equal(r.j.ct, CT);
r = await call(kitty, "kitty", ID, null, "b".repeat(32)); assert.equal(r.s, 403); assert.equal(r.j.error, "this link doesn't open that kitty");
r = await call(kitty, "kitty", ID, { t: T, v: 1, ct: CT + "x", iv: IV }); assert.equal(r.s, 200); assert.equal(r.j.v, 2);
r = await call(kitty, "kitty", ID, { t: T, v: 1, ct: CT + "y", iv: IV }); assert.equal(r.s, 409); assert.equal(r.j.error, "someone else changed the kitty first"); assert.equal(r.j.v, 2); assert.equal(r.j.ct, CT + "x");
r = await call(care, "care", ID, null, T); assert.equal(r.s, 404); assert.equal(r.j.error, "this circle doesn't exist any more", "Care Circle's box is apart, with its own words");
for (let i = 0; i < 10; i++) await call(kitty, "kitty", (i + 1).toString(16).padStart(16, "0"), { t: T, v: 0, ct: CT, iv: IV });
r = await call(kitty, "kitty", "ffffffffffffffff", { t: T, v: 0, ct: CT, iv: IV }); assert.equal(r.s, 429); assert.match(r.j.error, /10 new kitties/);
r = await call(kitty, "kitty", ID + "/delete", { t: T }); assert.equal(r.s, 200); assert.equal(mem.has("kitty:" + ID), false);
ok("the sealed box at /api/kitty: only the token's hash kept, a stale write refused with the current one, a wrong token refused, its own limit and words; Care Circle's box apart");
console.log("house kitty: all checks passed");
