// The Nest Registry with R2 switched off (Cloudflare's free plan, no MODELS binding): photos the parents upload, product
// photos the finder turns up and the ones they keep all go into the registry's own SQLite, and are served from there; the
// daily copy is kept there too (14 days); the full backup download still carries the photos. With R2 bound again, photos
// already in the registry's database still show.
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
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const shop = { "https://img.example/a.png": [png, "image/png"], "https://img.example/b.jpg": [Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), "image/jpeg"], "https://img.example/big.png": [Buffer.alloc(2e6, 1), "image/png"], "https://img.example/page": ["<html>", "text/html"] };
globalThis.fetch = async (u) => { const f = shop[String(u)]; return f ? new Response(f[0], { headers: { "content-type": f[1] } }) : new Response("nope", { status: 404 }); };
let alarmAt = null, hiveReply = null;
const HIVE = { idFromName: () => "h", get: () => ({ fetch: async () => hiveReply() }) };
const nest = new Nest({ storage: { sql, getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; } } }, { HIVE });
const call = async (path, body, h = {}, raw) => { const r = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body ? "POST" : "GET", headers: { "content-type": raw ? raw.type : "application/json", ...h }, body: raw ? raw.body : body ? JSON.stringify(body) : undefined })); return { status: r.status, r, j: /json/.test(r.headers.get("content-type") || "") ? await r.clone().json() : null }; };
const O = { "x-nest-owner": "1" };
await call("/join", { name: "Anders" }, O); const key = (await call("/state", null, O)).j.invite;
const G = { cookie: (await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name: "Maria" }) }))).headers.get("set-cookie").split(";")[0] };

// a photo the parents upload
let r = await call("/blob", {}, O, { type: "image/png", body: png }); assert.equal(r.status, 200, JSON.stringify(r.j)); const up = r.j.id; assert.match(up, /^b[a-f0-9]{20}$/);
assert.equal((await call("/blob", {}, G, { type: "image/png", body: png })).status, 403, "guests don't add photos");
assert.equal((await call("/blob", {}, O, { type: "image/png", body: Buffer.alloc(2e6, 1) })).status, 413, "too big for one database value: refused, with a reason");
r = await call("/blob/" + up, null, G); assert.equal(r.status, 200); assert.equal(r.r.headers.get("content-type"), "image/png"); assert.deepEqual(Buffer.from(await r.r.arrayBuffer()), png, "everyone in the registry sees it, byte for byte");
assert.equal((await call("/blob/b" + "9".repeat(20), null, G)).status, 404);
ok("without R2 an uploaded photo is kept in the registry's own database and served from there");

// the finder's photos: the Hive had nowhere to keep them, so the registry fetches them in
await call("/doc", { path: "items/i1", data: { name: "Crib", kind: "item", imageId: up } }, O);
hiveReply = () => Response.json({ products: [{ brand: "IKEA", model: "SNIGLAR", url: "https://ikea.example/s", image: "https://img.example/a.png" }, { brand: "B", model: "Two", url: "https://b.example", image: "https://img.example/b.jpg" },
  { brand: "C", model: "Big", url: "https://c.example", image: "https://img.example/big.png" }, { brand: "D", model: "Page", url: "https://d.example", image: "https://img.example/page" }] });
r = await call("/find", { item: "i1" }, O); assert.equal(r.status, 200, JSON.stringify(r.j)); const p = r.j.find.products;
assert.match(p[0].i, /^b[a-f0-9]{20}$/); assert.equal(p[0].r, null); assert.match(p[1].i, /^b[a-f0-9]{20}$/);
assert.deepEqual(Buffer.from(await (await call("/blob/" + p[0].i, null, O)).r.arrayBuffer()), png); assert.equal((await call("/blob/" + p[1].i, null, O)).r.headers.get("content-type"), "image/jpeg");
assert.equal(p[2].i, null); assert.equal(p[2].r, "https://img.example/big.png", "a photo too big for the database is shown from the shop instead");
assert.equal(p[3].i, null, "a web page is not kept as a photo");
// a new search drops the last one's photos nobody kept, but not the ones that were kept
await call("/doc", { path: "items/i1", data: { name: "Crib", kind: "item", imageId: up, options: [{ t: "IKEA SNIGLAR", i: p[0].i }] } }, O);
hiveReply = () => Response.json({ products: [{ brand: "E", model: "New", url: "https://e.example", image: "https://img.example/a.png" }] }); await call("/find", { item: "i1" }, O);
assert.equal((await call("/blob/" + p[0].i, null, O)).status, 200, "a kept pick's photo stays"); assert.equal((await call("/blob/" + p[1].i, null, O)).status, 404, "an unkept one is removed");
// keeping a product photo from a shop
r = await call("/grab", { url: "https://img.example/b.jpg" }, O); assert.equal(r.status, 200); assert.equal((await call("/blob/" + r.j.id, null, G)).status, 200);
assert.equal((await call("/grab", { url: "https://img.example/page" }, O)).status, 502); assert.equal((await call("/grab", { url: "http://127.0.0.1/x.png" }, O)).status, 400);
ok("the finder's photos and the ones the parents keep go into the registry's database; too-big ones show from the shop; old unkept ones are cleared");

// the daily copy, and the full backup download
r = await call("/backup", {}, O); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.ok(r.j.ok); const day = new Date().toISOString().slice(0, 10);
const kept = db.prepare("SELECT day, data FROM backup").all(); assert.equal(kept.length, 1); assert.equal(kept[0].day, day); assert.equal(JSON.parse(kept[0].data).docs["items/i1"].name, "Crib");
assert.equal((await call("/state", null, O)).j.backup, day, "the Parents' room shows the last copy");
db.prepare("INSERT INTO backup(day,data) VALUES('2001-01-01','{}')").run(); db.prepare("DELETE FROM kv WHERE k='backup'").run(); await call("/backup", {}, O);
assert.deepEqual(db.prepare("SELECT day FROM backup").all().map((x) => x.day), [day], "copies older than 14 days are removed");
r = await call("/export", null, O); assert.equal(r.status, 200); assert.equal(r.j.photos[up], "data:image/png;base64," + png.toString("base64")); assert.ok(r.j.photos[p[0].i], "the pick's photo is in the download");
ok("the daily copy is kept in the registry's database (14 days); the backup download still carries the photos");

// R2 back on later: photos already in the database still show, new ones go to R2
const r2 = new Map(); nest.env.MODELS = { async put(k, v, o) { r2.set(k, { buf: Buffer.from(v), meta: o.httpMetadata }); }, async get(k) { const o = r2.get(k); return o && { body: o.buf, httpMetadata: o.meta }; }, async delete(k) { r2.delete(k); }, async list() { return { objects: [] }; } };
assert.equal((await call("/blob/" + up, null, G)).status, 200);
r = await call("/blob", {}, O, { type: "image/png", body: png }); assert.ok(r2.has("nest/" + r.j.id)); assert.equal((await call("/blob/" + r.j.id, null, G)).status, 200);
ok("with R2 bound again, photos already in the database still show and new ones go to R2");
console.log("nest without R2: all checks passed");
