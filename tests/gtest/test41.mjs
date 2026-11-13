// The Nest Registry's backend (src/nest.js): nothing loads without the owner's session or an invite; a guest joins with the
// invite key and a name and holds a cookie (only its hash is kept); the parents edit the list, each guest only their own
// gifts; co-parents can't change who the parents are; locks stop two people taking the last one; photos are the parents'.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"').replace('from "./nest-find.js"', 'from "' + REPO + '/src/nest-find.js"'));
writeFileSync(new URL("./cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest.js");
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);

class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:");
const sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((r) => ({ ...r }))); st.run(...a); return new Cursor([]); } };
const r2 = new Map(), MODELS = { async put(k, v, o) { r2.set(k, { buf: Buffer.from(v), meta: o.httpMetadata }); }, async get(k) { const o = r2.get(k); return o && { body: o.buf, httpMetadata: o.meta }; } };
const nest = new Nest({ storage: { sql } }, { MODELS });
const req = async (path, { body, owner, cookie, raw, type } = {}) => {
  const h = { "content-type": type || "application/json" }; if (owner) h["x-nest-owner"] = "1"; if (cookie) h.cookie = cookie;
  const r = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body !== undefined || raw ? "POST" : "GET", headers: h, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) }));
  const text = await r.clone().text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j, r, setCookie: r.headers.get("set-cookie") };
};
const O = { owner: true };

let r = await req("/state"); assert.equal(r.status, 401); assert.equal(r.j.need, "invite");
r = await req("/state", O); assert.equal(r.status, 200); assert.equal(r.j.me.owner, true); assert.equal(r.j.me.name, ""); assert.match(r.j.invite, /^[a-f0-9]{24}$/);
const key = r.j.invite;
r = await req("/join", { ...O, body: { name: "  Anders <b>" } }); assert.ok(r.j.ok); assert.equal((await req("/state", O)).j.me.name, "Anders b");
ok("nothing loads without the owner's session or an invite; the owner gets an invite key and gives a name once");

r = await req("/join", { body: { key: "0".repeat(24), name: "Mallory" } }); assert.equal(r.status, 403);
r = await req("/join", { body: { key, name: " " } }); assert.equal(r.status, 400);
r = await req("/join", { body: { key, name: "Aunt Maria" } }); assert.equal(r.status, 200);
assert.match(r.setCookie, /^nest=g[a-f0-9]{16}\.[a-f0-9]{48}; Path=\/api\/nest; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
const maria = r.setCookie.split(";")[0], mariaId = r.j.id;
const kept = db.prepare("SELECT sec FROM person WHERE id=?").get(mariaId).sec; assert.ok(!maria.includes(kept), "only the secret's hash is kept");
r = await req("/state", { cookie: maria }); assert.equal(r.j.me.id, mariaId); assert.equal(r.j.me.parent, false); assert.equal(r.j.invite, undefined, "guests don't see the invite key");
assert.equal((await req("/state", { cookie: "nest=" + mariaId + "." + "f".repeat(48) })).status, 401, "a forged secret is refused");
ok("a guest joins with the invite key and a name, and holds a cookie (HttpOnly, Secure, only for /api/nest); a wrong key or forged cookie gets nothing");

const item = { name: "Crib", kind: "item", qty: 1, prio: "must", cat: "nursery" };
assert.equal((await req("/doc", { cookie: maria, body: { path: "items/i1", data: item } })).status, 403, "guests don't edit the list");
assert.equal((await req("/doc", { ...O, body: { path: "items/i1", data: item } })).status, 200);
assert.equal((await req("/doc", { cookie: maria, body: { path: "claims/" + mariaId, data: { items: { i1: { qty: 1, status: "reserved" } }, from: "Maria" } } })).status, 200);
assert.equal((await req("/doc", { cookie: maria, body: { path: "claims/owner", data: { items: {} } } })).status, 403, "not someone else's gifts");
assert.equal((await req("/doc", { cookie: maria, body: { path: "meta/thanks", data: { sent: {} } } })).status, 403);
assert.equal((await req("/doc", { ...O, body: { path: "../etc", data: {} } })).status, 400); assert.equal((await req("/doc", { ...O, body: { path: "items/x", data: [1] } })).status, 400);
assert.equal((await req("/doc", { ...O, body: { path: "items/big", data: { notes: "x".repeat(70000) } } })).status, 413);
r = await req("/state", { cookie: maria }); assert.deepEqual(r.j.docs["items/i1"], item); assert.equal(r.j.docs["claims/" + mariaId].from, "Maria"); assert.equal(r.j.profiles[mariaId].name, "Aunt Maria");
ok("the parents edit the list; a guest marks only their own gifts; bad paths, non-objects and oversized entries are refused");

const v = r.j.v; assert.deepEqual((await req("/state?v=" + v, { cookie: maria })).j, { v, same: true }, "nothing new: a tiny reply");
await req("/doc", { ...O, body: { path: "items/i1", data: { ...item, qty: 2 } } }); assert.notEqual((await req("/state?v=" + v, { cookie: maria })).j.v, v);
ok("polling is cheap: “nothing new” until something changes");

// co-parents
const adri = (await req("/join", { body: { key, name: "Adrianna" } })), adriC = adri.setCookie.split(";")[0], adriId = adri.j.id;
await req("/doc", { ...O, body: { path: "meta/settings", data: { baby: "Baby Faber", parents: [adriId] } } });
r = await req("/state", { cookie: adriC }); assert.equal(r.j.me.parent, true); assert.equal(r.j.invite, key, "a co-parent sees the invite link");
assert.equal((await req("/doc", { cookie: adriC, body: { path: "items/i2", data: { name: "Bassinet" } } })).status, 200);
await req("/doc", { cookie: adriC, body: { path: "meta/settings", data: { baby: "Baby F.", parents: [adriId, mariaId] } } });
assert.deepEqual((await req("/state", O)).j.docs["meta/settings"], { baby: "Baby F.", parents: [adriId] }, "a co-parent's edit keeps the parents list as the owner set it");
assert.equal((await req("/invite", { cookie: adriC, body: {} })).status, 403);
ok("a co-parent edits the list and details like the owner, but can't add parents or make a new invite link");

// locks
assert.equal((await req("/lock", { cookie: maria, body: { path: "locks/i1", ttlMs: 6000 } })).j.acquired, true);
assert.equal((await req("/lock", { cookie: adriC, body: { path: "locks/i1" } })).j.acquired, false, "someone else holds it");
assert.equal((await req("/lock", { cookie: maria, body: { path: "locks/i1" } })).j.acquired, true, "the holder can renew it");
db.prepare("UPDATE lock SET until=? WHERE path='locks/i1'").run(Date.now() - 1); assert.equal((await req("/lock", { cookie: adriC, body: { path: "locks/i1" } })).j.acquired, true, "an expired one is free");
assert.ok(!Object.keys((await req("/state", O)).j.docs).some((p) => p.startsWith("locks/")));
ok("a lock is one person's for a few seconds, renewable by them, free once it lapses");

// photos
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
assert.equal((await req("/blob", { cookie: maria, raw: jpg, type: "image/jpeg" })).status, 403);
assert.equal((await req("/blob", { ...O, raw: Buffer.from("<svg/>"), type: "image/svg+xml" })).status, 415, "no SVG (it can carry script)");
assert.equal((await req("/blob", { ...O, raw: Buffer.alloc(3e6 + 1), type: "image/png" })).status, 413);
r = await req("/blob", { cookie: adriC, raw: jpg, type: "image/jpeg" }); assert.match(r.j.id, /^b[a-f0-9]{20}$/); const bid = r.j.id;
r = await req("/blob/" + bid, { cookie: maria }); assert.equal(r.status, 200); assert.equal(r.r.headers.get("content-type"), "image/jpeg"); assert.match(r.r.headers.get("content-security-policy"), /sandbox/); assert.deepEqual(Buffer.from(await r.r.arrayBuffer()), jpg);
assert.equal((await req("/blob/" + bid)).status, 401, "photos are private too"); assert.equal((await req("/blob/nope", { cookie: maria })).status, 404);
ok("the parents add photos (JPEG, PNG, WebP or GIF, 3 MB); anyone in the registry sees them, nobody else");

// a new invite link
const k2 = (await req("/invite", { ...O, body: {} })).j.invite; assert.notEqual(k2, key);
assert.equal((await req("/join", { body: { key, name: "Late Larry" } })).status, 403, "the old link no longer lets new people in");
assert.equal((await req("/state", { cookie: maria })).status, 200, "everyone already in stays in");
assert.equal((await req("/join", { body: { key: k2, name: "Larry" } })).status, 200);
assert.equal((await req("/doc", { ...O, body: { path: "items/i2", data: null } })).status, 200); assert.ok(!("items/i2" in (await req("/state", O)).j.docs));
ok("a new invite link stops the old one letting new people in; those already in stay; the owner can delete");
console.log("nest registry: all checks passed");
