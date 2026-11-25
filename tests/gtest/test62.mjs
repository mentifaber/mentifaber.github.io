// The Nest Registry's picks are real products from real shops (src/nest-find.js, src/nest.js): a product no search result
// names (a model's invention, "Hooda NoseFrida") is left out; a search engine's logo, a blog's or a review's photo is never
// a pick's photo, and a blog or review site is never where to buy it; a brand is said once ("Hatch Hatch Night Light");
// prices are in dollars; items for the parents ask for adult products; a sign-up (freezer meals) isn't shopped for. The
// picks already on the registry are mended the same way in the background.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src62/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const F = await import(REPO + "/src/nest-find.js");

// 1. the small rules
assert.equal(F.once("Hatch Hatch Night Light"), "Hatch Night Light");
assert.equal(F.once("The Honest Company The Honest Company Clean Conscious Wipes"), "The Honest Company Clean Conscious Wipes");
assert.equal(F.once("Summer Summer Infant Car Mirror"), "Summer Infant Car Mirror");
assert.equal(F.once("Halo SleepSack Wearable Blanket"), "Halo SleepSack Wearable Blanket", "nothing said twice: unchanged");
assert.deepEqual(F.parseProposals('{"products":[{"brand":"Hatch","model":"Hatch Rest Sound Machine"},{"brand":"MAM","model":"Clip It"}]}').map((p) => p.model), ["Rest Sound Machine", "Clip It"]);
assert.equal(F.brandWord("The Honest Company"), "honest"); assert.equal(F.brandWord("Dr. Brown's"), "browns");
assert.equal(F.names({ title: "Fridababy NoseFrida the Snotsucker", url: "https://www.target.com/p/x" }, "Hooda"), false, "a made-up brand");
assert.equal(F.names({ title: "Dr. Brown's Natural Flow", url: "https://x" }, "Dr. Brown's"), true);
for (const u of ["https://tavily.com/x", "https://www.babygearlab.com/r", "https://blog.lovevery.com/a", "https://www.businessinsider.com/b", "https://i.ytimg.com/vi/x.jpg", "https://reviews.example.com/c"]) assert.equal(F.shopHost(u), false, u);
for (const u of ["https://www.target.com/p/x", "https://www.ikea.com/us/p", "https://lovevery.com/products/play-kit", "https://m.media-amazon.com/i.jpg"]) assert.equal(F.shopHost(u), true, u);
assert.equal(F.usd("USD"), true); assert.equal(F.usd(""), true); assert.equal(F.usd("EUR"), false);
ok("a brand said once; a brand's own word; a search engine, a review site, a blog or a video site is not a shop; dollars");

// 2. the finder: a made-up product is left out; logos, blog photos and blog links refused; euro prices dropped
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0, 8 + d.length); return b; };
const png = (w, h) => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
const sq = png(500, 500);
const ld = (name, img, price, cur) => `<script type="application/ld+json">{"@type":"Product","name":"${name}","image":"${img}","offers":{"price":"${price}","priceCurrency":"${cur}"}}</script>`;
const files = {
  "https://tavily.com/search": ['<meta property="og:image" content="https://tavily.com/og.png"><title>Moby Wrap Classic - Tavily</title>', "text/html"], "https://tavily.com/og.png": [sq, "image/png"],
  "https://www.mobywrap.com/classic": [ld("Moby Wrap Classic", "https://www.mobywrap.com/img/classic.png", "49.99", "USD"), "text/html"], "https://www.mobywrap.com/img/classic.png": [sq, "image/png"],
  "https://www.mam-shop.eu/clip": [ld("MAM Clip It", "https://www.mam-shop.eu/img/clip.png", "8.29", "EUR"), "text/html"], "https://www.mam-shop.eu/img/clip.png": [sq, "image/png"],
  "https://www.babygearlab.com/review": ['<meta property="og:image" content="https://www.babygearlab.com/hero.png"><title>Best Halo Sleep Sacks</title>', "text/html"], "https://www.babygearlab.com/hero.png": [sq, "image/png"],
  "https://cdn.random.example/a1.png": [sq, "image/png"], "https://i.ytimg.com/vi/a/halo-review.jpg": [sq, "image/png"],
};
globalThis.fetch = async (u) => { const f = files[String(u)]; return f ? new Response(f[0], { headers: { "content-type": f[1] } }) : new Response("nope", { status: 404 }); };
const web = async (q) => {
  const r = /Moby/.test(q) ? [{ title: "Moby Wrap Classic - Tavily", url: "https://tavily.com/search" }, { title: "Moby Wrap Classic", url: "https://www.mobywrap.com/classic" }]
    : /MAM/.test(q) ? [{ title: "MAM Clip It", url: "https://www.mam-shop.eu/clip" }]
    : /Hooda/.test(q) ? [{ title: "Fridababy NoseFrida the SnotSucker", url: "https://fridababy.com/nosefrida" }]
    : /Halo/.test(q) ? [{ title: "Best Halo Sleep Sacks", url: "https://www.babygearlab.com/review" }] : [];
  r.images = /Moby/.test(q) ? ["https://tavily.com/og.png"] : /Halo/.test(q) ? ["https://cdn.random.example/a1.png", "https://i.ytimg.com/vi/a/halo-review.jpg"] : /Hooda/.test(q) ? ["https://cdn.random.example/a1.png"] : []; return r; };
let asked = "";
const cheap = async (m, sys, msgs) => { asked = msgs[0].text;
  return JSON.stringify({ products: [{ brand: "Moby Wrap", model: "Moby Wrap Classic", tier: "mid", price: 50 }, { brand: "MAM", model: "MAM Clip It", tier: "budget", price: 8 }, { brand: "Hooda", model: "NoseFrida", tier: "budget", price: 15 }, { brand: "Halo", model: "SleepSack", tier: "mid", price: 30 }] }); };
const r = await F.findProducts({ env: {}, web, store: null, cheap }, { name: "Stretchy wrap carrier", cat: "gear" });
assert.deepEqual(r.products.map((p) => [p.brand, p.model, p.url, p.image, p.price, p.currency]), [
  ["Moby Wrap", "Classic", "https://www.mobywrap.com/classic", "https://www.mobywrap.com/img/classic.png", 49.99, "USD"],
  ["MAM", "Clip It", "https://www.mam-shop.eu/clip", "https://www.mam-shop.eu/img/clip.png", null, ""]], JSON.stringify(r.products));
ok("the finder: Hooda (made up) left out; Halo with only a review site's photo and a YouTube thumbnail left out; Moby's link is its shop, not the search engine, and its photo the shop's; MAM's euro price left off");
await F.findProducts({ env: {}, web, store: null, cheap }, { name: "Big water bottle with straw", cat: "mom" });
assert.match(asked, /WHO IT'S FOR: the parents themselves, not the baby/);
ok("an item for the parents asks for adult products");

// 3. the registry: sign-ups aren't shopped for; picks already there are mended (made-up removed, links and photos from shops, names once, dollars)
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"').replace('from "./nest-find.js"', 'from "' + REPO + '/src/nest-find.js"').replace('from "./rowmeter.js"', 'from "' + REPO + '/src/rowmeter.js"'));
writeFileSync(new URL("./cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest, signUp } = await import(OUT + "nest.js?" + Date.now());
assert.equal(signUp({ name: "Freezer meals", notes: "Sign up to cook one. Note what you're making." }), true); assert.equal(signUp({ name: "Crib", notes: "JPMA certified" }), false);
class Cursor { constructor(rows) { this.r = rows; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((x) => ({ ...x }))); st.run(...a); return new Cursor([]); } };
Object.assign(files, { "https://img.example/mam.png": [sq, "image/png"], "https://www.target.com/img/moby.png": [sq, "image/png"] });
const searched = [];
const HIVE = { idFromName: () => "h", get: () => ({ fetch: async (rq) => { const u = new URL(rq.url), b = await rq.json(); if (!u.pathname.endsWith("/nest/photo")) return Response.json({ error: "no" }, { status: 404 });
  searched.push([b.q, b.brand]);
  if (/Hooda/.test(b.q)) return Response.json({ made: true });
  if (/Moby/.test(b.q)) return Response.json({ image: "https://www.target.com/img/moby.png", url: "https://www.target.com/p/moby-wrap", store: "target.com", price: 49.99, currency: "USD" });
  return Response.json({ error: "no product photo found" }, { status: 404 }); } }) };
let al = null; const nest = new Nest({ storage: { sql, transactionSync: (f) => f(), getAlarm: async () => al, setAlarm: async (t) => { al = t; } } }, { HIVE });
const O = { "x-nest-owner": "1" };
const c = async (path, body, raw) => { const res = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body ? "POST" : "GET", headers: { "content-type": raw ? raw.type : "application/json", ...O }, body: raw ? raw.body : body ? JSON.stringify(body) : undefined })); return { status: res.status, j: /json/.test(res.headers.get("content-type") || "") ? await res.json() : null }; };
await c("/join", { name: "Anders" });
const good = (await c("/blob", {}, { type: "image/png", body: sq })).j.id, logo = (await c("/blob", {}, { type: "image/png", body: sq })).j.id;
await c("/doc", { path: "items/w1", data: { name: "Stretchy wrap carrier", kind: "item", cat: "gear", options: [
  { t: "Moby Wrap Moby Wrap Classic", b: "Moby Wrap", u: "https://tavily.com/search", s: "tavily.com", i: logo, r: "https://tavily.com/og.png" },
  { t: "Hooda NoseFrida", b: "Hooda", u: "https://www.babygearlab.com/review", s: "babygearlab.com", i: null },
  { t: "MAM MAM Clip It", b: "MAM", u: "https://www.mam-shop.eu/clip", s: "mam-shop.eu", i: good, r: "https://img.example/mam.png", p: 8.29, c: "EUR" }] } });
await c("/doc", { path: "items/f1", data: { name: "Freezer meals", kind: "item", cat: "mom", notes: "Sign up to cook one. Note what you're making." } });
await c("/doc", { path: "items/t1", data: { name: "Baby bath tub", kind: "item", cat: "bath" } });
db.prepare("DELETE FROM findq").run();
assert.equal((await c("/find", { item: "f1" })).status, 404, "a sign-up isn't shopped for");
assert.equal((await c("/findall", {})).j.queued, 1, "only the tub is queued, not the freezer meals"); db.prepare("DELETE FROM findq").run();
await c("/state"); assert.ok(al, "a parent opening the registry starts the mending");
for (let k = 0; k < 12 && al; k++) { al = null; await nest.alarm(); }
const w1 = (await c("/state")).j.docs["items/w1"];
assert.deepEqual(w1.options.map((o) => o.t), ["Moby Wrap Classic", "MAM Clip It"], "Hooda (made up) removed; brands said once");
const [moby, mam] = w1.options;
assert.equal(moby.u, "https://www.target.com/p/moby-wrap"); assert.equal(moby.s, "target.com"); assert.equal(moby.r, "https://www.target.com/img/moby.png"); assert.notEqual(moby.i, logo, "the search engine's logo replaced");
assert.equal((await c("/blob/" + moby.i)).status, 200); assert.equal(moby.p, 49.99); assert.equal(moby.c, "USD");
assert.equal(mam.i, good, "a shop's photo that's the product stays"); assert.equal(mam.p, null); assert.equal(mam.c, "", "the euro price is left off");
assert.ok(searched.some(([q, b]) => /Hooda/.test(q) && b === "Hooda"), "the brand goes with the search");
ok("picks already on the registry: the made-up one removed, a search engine's link and logo replaced by a shop's, names said once, euros left off; a sign-up isn't shopped for");
console.log("nest picks are real: all checks passed");
