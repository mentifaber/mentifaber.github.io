// The Nest Registry with R2 switched off (Cloudflare's free plan, no MODELS binding): photos the parents upload, product
// photos the finder turns up and the ones they keep all go into the registry's own SQLite, and are served from there; the
// daily copy is kept there too (14 days); the full backup download still carries the photos. With R2 bound again, photos
// already in the registry's database still show.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"').replace('from "./nest-find.js"', 'from "' + REPO + '/src/nest-find.js"'));
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
assert.match(p[0].i, /^b[a-f0-9]{20}$/); assert.equal(p[0].r, "https://img.example/a.png", "the shop's address is kept as a fallback"); assert.match(p[1].i, /^b[a-f0-9]{20}$/);
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
// mending photos lost when R2 was switched off (a fresh registry object; the R2 copies are gone)
const db2 = new DatabaseSync(":memory:"), sql2 = { exec(q, ...a) { const st = db2.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((x) => ({ ...x }))); st.run(...a); return new Cursor([]); } };
shop["https://shop.example/p/tub"] = ['<html><head><meta property="og:title" content="Angelcare tub"><meta property="og:image" content="/img/tub.png"></head></html>', "text/html"]; shop["https://shop.example/img/tub.png"] = [png, "image/png"];
let al2 = null; const n2 = new Nest({ storage: { sql: sql2, getAlarm: async () => al2, setAlarm: async (t) => { al2 = t; } } }, { AI: { async run(m, inp) { asked.push(m); if (/llama-3\.2/.test(m) && inp.prompt === "agree") { agreed = true; return {}; } if (/llama-3\.2/.test(m) && !agreed) throw new Error("5016: Prior to using this model, you must submit the prompt 'agree'"); return { response: 'Sure! {"name": "Hatch Rest", "brand": "Hatch", "price": "$69.99", "currency": "USD", "store": "Target", "category": "sleep"}' }; } } });
let agreed = false; const asked = [];
const c2 = async (path, body, raw) => { const r = await n2.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body ? "POST" : "GET", headers: { "content-type": raw ? raw.type : "application/json", ...O }, body: raw ? raw.body : body ? JSON.stringify(body) : undefined })); return { status: r.status, r, j: /json/.test(r.headers.get("content-type") || "") ? await r.clone().json() : null }; };
await c2("/join", { name: "Anders" });
const lost = (d) => "b" + String(d).repeat(20);
await c2("/doc", { path: "items/t1", data: { name: "Tub", kind: "item", imageId: lost(1), options: [{ t: "A", u: "https://a.example", i: lost(2), r: "https://img.example/a.png" }, { t: "Angelcare", u: "https://shop.example/p/tub", i: lost(3) }, { t: "Gone", u: "https://nowhere.example/x", i: lost(4) }] } });
await c2("/state"); assert.ok(al2, "a parent opening the registry starts the mending");
for (let k = 0; k < 6 && al2; k++) { al2 = null; await n2.alarm(); }
const t1 = (await c2("/state")).j.docs["items/t1"];
assert.equal(t1.imageId, null); assert.equal(t1.imageOld, lost(1), "the lost photo's id is kept, should R2 come back");
assert.match(t1.options[0].i, /^b[a-f0-9]{20}$/); assert.notEqual(t1.options[0].i, lost(2)); assert.equal((await c2("/blob/" + t1.options[0].i)).status, 200, "fetched again from the shop's photo address");
assert.match(t1.options[1].i, /^b[a-f0-9]{20}$/); assert.equal(t1.options[1].r, "https://shop.example/img/tub.png", "or from the product page");
assert.equal(t1.options[2].i, null); assert.equal(t1.options[2].x, 1, "tried once; the card shows a tile");
al2 = null; await n2.alarm(); assert.equal(al2, null, "done once: no more mending ticks");
ok("photos lost with R2 are mended in the background: cleared from the items, and each pick's photo fetched again from its shop");

// a screenshot read for its name, price, shop and category; a shop's link read for its name, price and photo
const shotId = (await c2("/blob", {}, { type: "image/png", body: png })).j.id;
let rd = await c2("/read", { id: shotId }); assert.equal(rd.status, 200, JSON.stringify(rd.j));
assert.deepEqual(rd.j, { name: "Hatch Rest", brand: "Hatch", price: 69.99, currency: "USD", store: "Target", cat: "sleep" }); assert.ok(agreed, "Llama's licence prompt is answered once, by itself");
assert.equal((await call("/read", { id: shotId }, G)).status, 403, "only the parents");
rd = await c2("/fromlink", { url: "https://shop.example/p/tub" }); assert.equal(rd.j.name, "Angelcare tub"); assert.equal(rd.j.store, "shop.example"); assert.equal((await c2("/blob/" + rd.j.imageId)).status, 200);
rd = await c2("/fromlink", { url: "https://nowhere.example/x" }); assert.equal(rd.status, 200); assert.match(rd.j.error, /didn't let us read/); assert.equal(rd.j.url, "https://nowhere.example/x");
assert.equal((await c2("/fromlink", { url: "http://10.0.0.1/x" })).status, 400);
ok("a screenshot is read for its name, brand, price, shop and category; a shop's link for its name, price and photo; only the parents can");
console.log("nest without R2: all checks passed");
