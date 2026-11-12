// The Nest Registry on Cloudflare's free plan (src/nest.js, src/nest-find.js): the state is built once per change and served
// from memory (each person still sees themself); a copy of everything is saved to R2 once a day (30 days kept); only the
// owner downloads the full backup, photos inside; when a daily allowance runs out the product finder pauses until after
// midnight UTC instead of failing item after item, and says so.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"'));
writeFileSync(new URL("./cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest.js?" + Date.now());
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((x) => ({ ...x }))); st.run(...a); return new Cursor([]); } };
const r2 = new Map(), MODELS = { async put(k, v, o) { r2.set(k, { buf: Buffer.from(typeof v === "string" ? v : new Uint8Array(v)), meta: o && o.httpMetadata }); }, async get(k) { const o = r2.get(k); return o && { body: o.buf, httpMetadata: o.meta }; },
  async list({ prefix }) { return { objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }, async delete(k) { r2.delete(k); } };
let alarmAt = null, hiveReply = null;
const HIVE = { idFromName: () => "h", get: () => ({ fetch: async () => hiveReply() }) };
const nest = new Nest({ storage: { sql, getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; } } }, { MODELS, HIVE });
const call = async (path, body, h = {}) => { const r = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined })); return { status: r.status, r, j: /json/.test(r.headers.get("content-type") || "") ? await r.clone().json() : null }; };
const O = { "x-nest-owner": "1" };
hiveReply = () => Response.json({ products: [] });
await call("/join", { name: "Anders" }, O); const key = (await call("/state", null, O)).j.invite;
const join = async (name) => { const r = await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name }) })); return { cookie: r.headers.get("set-cookie").split(";")[0] }; };
const A = await join("Maria"), B = await join("Tom");

// the state, built once per change
await call("/doc", { path: "items/i1", data: { name: "Crib", kind: "item", options: [{ t: "IKEA SNIGLAR", i: "b" + "1".repeat(20) }] } }, O);
const a1 = (await call("/state", null, A)).j, b1 = (await call("/state", null, B)).j;
assert.equal(a1.me.name, "Maria"); assert.equal(b1.me.name, "Tom", "a cached reply still says who's asking"); assert.equal(a1.v, b1.v); assert.equal(b1.finds, undefined, "a guest's cached reply has no parents' extras");
assert.ok(nest.cache && nest.cache.g, "kept in memory for the next guest");
const o1 = (await call("/state", null, O)).j; assert.equal(o1.me.owner, true); assert.ok(o1.finds && o1.invite, "the parents' reply is cached apart from the guests'");
await call("/doc", { path: "claims/" + a1.me.id, data: { items: { i1: { qty: 1, status: "reserved" } }, from: "Maria" } }, A);
const b2 = (await call("/state?v=" + b1.v, null, B)).j; assert.notEqual(b2.v, b1.v); assert.equal(b2.docs["claims/" + a1.me.id].from, "Maria", "a change is seen at once, not an old copy");
assert.deepEqual((await call("/state?v=" + b2.v, null, B)).j, { v: b2.v, same: true });
ok("the state is built once per change and served from memory; each person still sees themself; guests and parents get their own; changes show at once");

// backups: once a day to R2, 30 days kept; the full backup is the owner's
r2.set("nest/backups/2001-01-01.json", { buf: Buffer.from("{}") }); r2.set("nest/b" + "1".repeat(20), { buf: Buffer.from([1, 2, 3]), meta: { contentType: "image/png" } });
assert.equal((await call("/backup", {}, A)).status, 403);
let r = await call("/backup", {}, O); assert.ok(r.j.ok); const k = r.j.key; assert.match(k, /^nest\/backups\/\d{4}-\d{2}-\d{2}\.json$/);
const saved = JSON.parse(r2.get(k).buf.toString()); assert.equal(saved.kind, "the-nest-registry-backup"); assert.equal(saved.docs["items/i1"].name, "Crib"); assert.equal(saved.people[a1.me.id].name, "Maria"); assert.equal(saved.docs["claims/" + a1.me.id].from, "Maria");
assert.equal(saved.photos, undefined, "the nightly copy leaves the photos where they are, in R2"); assert.ok(!r2.has("nest/backups/2001-01-01.json"), "copies older than 30 days are removed");
assert.equal((await call("/backup", {}, O)).j.already, true, "once a day"); assert.equal((await call("/state", null, O)).j.backup, k.slice(13, 23));
assert.equal((await call("/export", null, A)).status, 403, "guests can't download everyone's details");
r = await call("/export", null, O); assert.match(r.r.headers.get("content-disposition"), /attachment; filename="nest-registry-backup-\d{4}-\d{2}-\d{2}\.json"/);
assert.deepEqual(r.j.photos, { ["b" + "1".repeat(20)]: "data:image/png;base64,AQID" }, "the picks' photos are inside the download");
ok("a copy of everything is saved to R2 once a day (old ones pruned); only the owner downloads the full backup, photos inside");

// a daily allowance runs out: the finder pauses until after midnight UTC
hiveReply = () => Response.json({ error: "the free daily AI allowance is used up; product finding carries on by itself tomorrow", later: true }, { status: 429 });
await call("/doc", { path: "items/i2", data: { name: "Swaddles", kind: "item" } }, O); await call("/doc", { path: "items/i3", data: { name: "Bottles", kind: "item" } }, O);
const before = Date.now(); alarmAt = null; await nest.alarm();
const st = (await call("/state", null, O)).j; assert.match(st.findpause.why, /free daily AI allowance/); assert.deepEqual(st.findq.sort(), ["i2", "i3"], "nothing is dropped from the queue");
const next = new Date(alarmAt); assert.equal(next.getUTCHours(), 0); assert.equal(next.getUTCMinutes(), 10); assert.ok(alarmAt > before && alarmAt - before <= 864e5 + 11 * 60e3);
hiveReply = () => Response.json({ products: [{ brand: "X", model: "Y", url: "https://x.example", i: "b" + "2".repeat(20) }] }); alarmAt = null; await nest.alarm();
const st2 = (await call("/state", null, O)).j; assert.equal(st2.findpause, undefined, "running again clears the pause"); assert.equal(st2.findq.length, 1); assert.ok(alarmAt - Date.now() >= 10e3, "and it goes on a breath apart");
ok("when a daily allowance runs out the finder pauses until 00:10 UTC, says why, keeps its queue, and carries on one item at a time after");

// Adrianna's co-parent link: whoever opens it can add, edit and remove items, on every device
const own = (await call("/state", null, O)).j; const pkey = own.pinvite; assert.match(pkey, /^[a-f0-9]{24}$/); assert.notEqual(pkey, key);
const P = await (async () => { const r = await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: pkey, name: "Adrianna" }) })); return { cookie: r.headers.get("set-cookie").split(";")[0], id: (await r.json()).id }; })();
const ps = (await call("/state", null, P)).j; assert.equal(ps.me.parent, true, "joining with the co-parent link makes her a co-parent"); assert.equal(ps.pinvite, undefined, "only the owner sees the co-parent link, even from a cached reply"); assert.equal(ps.invite, key, "she sees the guest link to share");
assert.equal((await call("/state", null, O)).j.pinvite, pkey); assert.equal((await call("/state", null, P)).j.pinvite, undefined);
assert.equal((await call("/doc", { path: "items/n1", data: { name: "Nursing pillow", kind: "item" } }, P)).status, 200); assert.equal((await call("/doc", { path: "items/n1", data: { name: "Nursing pillow", kind: "item", qty: 2 } }, P)).status, 200);
assert.equal((await call("/doc", { path: "items/i3", data: null }, P)).status, 200, "and remove them"); assert.ok(!("items/i3" in (await call("/state", null, O)).j.docs));
// already in as a guest on a device: opening the co-parent link upgrades her there; a guest link changes nothing
assert.equal((await call("/upgrade", { key }, B)).j.parent, false); assert.equal((await call("/state", null, B)).j.me.parent, false);
assert.equal((await call("/upgrade", { key: pkey }, B)).j.parent, true); assert.equal((await call("/state", null, B)).j.me.parent, true);
assert.deepEqual((await call("/state", null, O)).j.docs["meta/settings"].parents.sort(), [P.id, (await call("/state", null, B)).j.me.id].sort());
assert.equal((await call("/invite", { which: "parent" }, P)).status, 403, "only the owner makes a new co-parent link");
const pkey2 = (await call("/invite", { which: "parent" }, O)).j.pinvite; assert.notEqual(pkey2, pkey);
assert.equal((await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: pkey, name: "Someone" }) }))).status, 403, "the old co-parent link no longer works");
assert.equal((await call("/state", null, P)).j.me.parent, true, "and she stays a co-parent");
ok("the co-parent link (the owner's only) makes whoever opens it a co-parent on that device, even one already in as a guest; she adds, edits and removes items; a new link retires the old one");

const F = await import("../../src/nest-find.js".replace("../../src", REPO + "/src"));
assert.equal(F.quota("AiError: 4006: you have used up your daily free allocation of 10,000 neurons"), true); assert.equal(F.quota("timed out"), false);
ok("Workers AI's daily-allowance error is recognised");
console.log("nest on the free plan: all checks passed");
