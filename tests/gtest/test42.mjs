// The Nest Registry's product finder (src/nest-find.js through Hive; src/nest.js /find, /findall, the background queue and
// /grab): a model proposes products from different brands and price levels; each is searched with image results, and a
// photo is kept only if it is the product (downloaded and checked: a real photo, big enough, roughly square, not a logo or
// a share banner); products without one are left out; kept photos are stored at once. Every item is worked through in the
// background, new items as they're added; searching again replaces an item's results and drops the photos nobody kept.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
const H = await import("./harness.mjs"); let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const F = await import("./src/nest-find.js");

// pictures to test with: a real PNG of any size (noisy, so it isn't tiny), and JPEG/GIF/WebP headers
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0, 8 + d.length); return b; };
const png = (w, h) => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
assert.deepEqual(F.imageSize(png(640, 480)), { w: 640, h: 480 });
assert.deepEqual(F.imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x02, 0x58, 0x03, 0x20, 3])), { w: 800, h: 600 });
assert.deepEqual(F.imageSize(Buffer.from("GIF89a\x40\x01\xf0\x00", "latin1")), { w: 320, h: 240 });
const webp = Buffer.alloc(30); webp.write("RIFF", 0); webp.write("WEBPVP8X", 8); webp.writeUIntLE(999, 24, 3); webp.writeUIntLE(749, 27, 3); assert.deepEqual(F.imageSize(webp), { w: 1000, h: 750 });
assert.equal(F.productShaped({ w: 800, h: 800 }), true); assert.equal(F.productShaped({ w: 1200, h: 630 }), false, "a share banner"); assert.equal(F.productShaped({ w: 120, h: 120 }), false, "an icon");
ok("a picture's size is read from its first bytes (PNG, JPEG, GIF, WebP); a product photo is big enough and roughly square, not a 1200×630 banner or an icon");

assert.deepEqual(F.parseProposals('{"products": [{"brand": "UPPAbaby", "model": "Vista V2", "tier": "premium", "price": 999, "why": "Grows with the family"}, {"brand": "uppababy", "model": "vista v2"}, {"brand": "", "model": "x"}]}'),
  [{ brand: "UPPAbaby", model: "Vista V2", why: "Grows with the family", tier: "premium", price: 999 }]);
const ld = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Product"],"name":"Nuna MIXX next Stroller","image":["/img/mixx.png","/img/mixx2.png"],"offers":{"@type":"AggregateOffer","lowPrice":"749.95","priceCurrency":"USD"}}]}</script><meta property="og:image" content="https://nunababy.com/share-banner.png">`;
assert.deepEqual(F.pageProduct(ld, "https://nunababy.com/mixx"), { product: true, images: ["https://nunababy.com/img/mixx.png", "https://nunababy.com/img/mixx2.png"], title: "Nuna MIXX next Stroller", price: 749.95, currency: "USD", og: "https://nunababy.com/share-banner.png" });
assert.equal(F.pageProduct('<meta property="og:type" content="product"><meta property="og:image" content="/p.png">', "https://shop.example").product, true);
ok("a product page's own data: its photos, name and price from schema.org Product; its share image kept apart");

// the finder through Hive: each product's photo is checked; products without a real one are left out
const files = {
  "https://www.nunababy.com/mixx": [ld.replace(/nunababy\.com\/img/g, "www.nunababy.com/img"), "text/html"], "https://www.nunababy.com/img/mixx.png": [png(800, 800), "image/png"],
  "https://www.bugaboo.com/fox-5": ['<meta property="og:image" content="https://cdn.bugaboo.com/social-share.png"><title>Bugaboo Fox 5</title>', "text/html"], "https://cdn.bugaboo.com/social-share.png": [png(1200, 630), "image/png"],
  "https://images.example.com/fox5-black.png": [png(900, 1000), "image/png"], "https://images.example.com/brand-logo.png": [png(400, 400), "image/png"],
  "https://www.graco.com/modes": ['<meta property="og:image" content="https://www.graco.com/og-default.png"><title>Graco</title>', "text/html"], "https://www.graco.com/og-default.png": [png(1200, 630), "image/png"],
};
globalThis.fetch = async (u) => { const f = files[String(u)]; return f ? new Response(f[0], { headers: { "content-type": f[1] } }) : new Response("nope", { status: 404 }); };
const q2 = []; H.hive.searchKey = async () => ({ v: { provider: "tavily" }, key: "k" });
H.hive.web = async (q, own, o) => { q2.push([q, o]); const r = /Nuna/.test(q) ? [{ title: "Reddit", url: "https://www.reddit.com/r/x" }, { title: "Nuna", url: "https://www.nunababy.com/mixx" }] : /Bugaboo/.test(q) ? [{ title: "Bugaboo", url: "https://www.bugaboo.com/fox-5" }] : /Graco/.test(q) ? [{ title: "Graco", url: "https://www.graco.com/modes" }] : [];
  r.images = /Bugaboo/.test(q) ? ["https://images.example.com/brand-logo.png", "https://images.example.com/fox5-black.png"] : /Graco/.test(q) ? ["https://cdn.example.com/tiny.png"] : []; return r; };
const stored = new Map(); H.env.MODELS = { async put(k, v, o) { stored.set(k, { buf: Buffer.from(v), type: o.httpMetadata.contentType }); }, async get(k) { return stored.get(k); } };
let asked = null;
H.setResponder((sys, user) => /You help new parents choose baby products/.test(sys) ? (asked = user, '{"products": [{"brand": "Nuna", "model": "MIXX next", "tier": "premium", "price": 750, "why": "Smooth ride"}, {"brand": "Bugaboo", "model": "Fox 5", "tier": "premium", "price": 1199, "why": "All-terrain"}, {"brand": "Graco", "model": "Modes Pramette", "tier": "budget", "price": 300, "why": "Value"}]}') : "ok");
assert.equal((await H.call("/nest/find", { name: "Stroller" }, false)).error, "owner only");
const r = await H.call("/nest/find", { name: "Stroller", cat: "Gear & travel", notes: "Cobbled streets", color: "Sage", price: 600, look: "good suspension" });
assert.match(asked, /ITEM: Stroller \(Gear & travel\)\nPARENTS' PREFERENCES: what they're looking for: good suspension; their notes: Cobbled streets; colour\/style: Sage; around \$600 each/);
assert.deepEqual(q2.map((x) => [x[0], x[1].images]), [["Nuna MIXX next Stroller", true], ["Bugaboo Fox 5 Stroller", true], ["Graco Modes Pramette Stroller", true]]);
assert.deepEqual(r.products.map((p) => [p.model, p.image, p.store]), [["MIXX next", "https://www.nunababy.com/img/mixx.png", "nunababy.com"], ["Fox 5", "https://images.example.com/fox5-black.png", "bugaboo.com"]],
  "Nuna: its own product photo; Bugaboo: the share banner and the logo refused, the search's product image kept; Graco: only a banner and a missing image, so it's left out");
assert.equal(r.products[0].price, 749.95); assert.deepEqual(stored.get("nest/" + r.products[0].i).buf, files["https://www.nunababy.com/img/mixx.png"][0], "the photo is stored as found");
H.hive.searchKey = async () => null; assert.match((await H.call("/nest/find", { name: "Stroller" })).error, /add a search key in AutoFaber's Uplinks/);
ok("each product's photo is the product (its page's own, or a search image that passes the check); logos, banners and missing images are refused; a product without a real photo is left out; no search key says so");

// the registry: everything is worked through in the background; a search again replaces results and drops unkept photos
const OUT = new URL("./src/", import.meta.url).pathname, REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"').replace('from "./nest-find.js"', 'from "' + REPO + '/src/nest-find.js"'));
writeFileSync(new URL("./cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest.js?" + Date.now());
class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((x) => ({ ...x }))); st.run(...a); return new Cursor([]); } };
let alarmAt = null, asks = [], seq = 0; const r2 = new Map(), deleted = [];
const HIVE = { idFromName: () => "hive", get: () => ({ fetch: async (rq) => { const b = await rq.json(); asks.push(b); if (/Mystery/.test(b.name)) return Response.json({ error: "no products with a clear photo turned up" }, { status: 502 });
  const ids = [1, 2].map(() => "b" + String(++seq).padStart(20, "0")); ids.forEach((i) => r2.set("nest/" + i, 1));
  return Response.json({ products: ids.map((i, k) => ({ brand: "Brand" + k, model: b.name + " " + k, url: "https://shop.example/" + i, image: "https://img.example/" + i + ".png", i, store: "shop.example", tier: "mid" })) }); } }) };
const MODELS = { async put() {}, async get() {}, async delete(k) { deleted.push(k); r2.delete(k); } };
const nest = new Nest({ storage: { sql, getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; } } }, { HIVE, MODELS });
await nest.alarm(); alarmAt = null; // the first tick mends photos lost with R2 (nothing to mend here)
const call = async (path, body, h = {}) => { const res = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined })); return { status: res.status, j: await res.json() }; };
const runAlarms = async () => { let k = 0; while (alarmAt != null && k++ < 20) { alarmAt = null; await nest.alarm(); } };
const O = { "x-nest-owner": "1" };
for (const [id, name, kind] of [["i1", "Crib"], ["i2", "Swaddles"], ["i3", "Diaper fund", "fund"], ["i4", "Bassinet"]]) await call("/doc", { path: "items/" + id, data: { name, kind: kind || "item", cat: "nursery" } }, O);
assert.deepEqual(asks, [], "nothing is searched while a request waits"); assert.ok(alarmAt, "the new items are queued");
let st = (await call("/state", null, O)).j; assert.deepEqual(st.findq.sort(), ["i1", "i2", "i4"], "funds aren't searched");
await runAlarms(); assert.deepEqual(asks.map((a) => a.name).sort(), ["Bassinet", "Crib", "Swaddles"]);
st = (await call("/state", null, O)).j; assert.deepEqual(st.findq, []); assert.equal(st.finds.i1.products.length, 2); assert.match(st.finds.i1.products[0].i, /^b\d{20}$/); assert.match(st.finds.i1.products[0].r, /^https:/, "a stored photo, with the shop's address kept as a fallback");
const key = st.invite, g = await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name: "Maria" }) }));
const G = { cookie: g.headers.get("set-cookie").split(";")[0] }; const gs = (await call("/state", null, G)).j; assert.equal(gs.finds, undefined, "guests don't see the suggestions, only the parents' picks"); assert.equal((await call("/findall", {}, G)).status, 403);
ok("every item is searched in the background, a few at a time, without anyone waiting; funds are skipped; only the parents see the results");

await call("/doc", { path: "items/i5", data: { name: "Mystery thing", kind: "item" } }, O); await runAlarms();
st = (await call("/state", null, O)).j; assert.equal(st.finds.i5.error, "no products with a clear photo turned up");
await call("/doc", { path: "items/i1", data: { name: "Crib", kind: "item", options: [st.finds.i1.products[0]] } }, O); // the parents keep the first crib
const kept = st.finds.i1.products[0].i, dropped = st.finds.i1.products[1].i;
let res = await call("/find", { item: "i1", look: "white wood" }, O); assert.equal(res.status, 200); assert.equal(asks.at(-1).look, "white wood");
assert.ok(deleted.includes("nest/" + dropped), "the last search's unkept photo is deleted"); assert.ok(!deleted.includes("nest/" + kept), "a kept one stays");
assert.equal((await call("/find", { item: "nope" }, O)).status, 404); assert.equal((await call("/find", { item: "i3" }, O)).status, 404, "not for funds");
asks = []; res = await call("/findall", {}, O); assert.equal(res.j.queued, 1, "only items still without products: here, the one nothing was found for"); await runAlarms(); assert.deepEqual(asks.map((a) => a.name), ["Mystery thing"]);
ok("a new item joins the queue; one with nothing found says why; searching again replaces the results and deletes the photos nobody kept");
console.log("nest products: all checks passed");
