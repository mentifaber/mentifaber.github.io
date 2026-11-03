// The Nest Registry's product finder (src/nest-find.js through Hive, src/nest.js /find and /grab): a model proposes products
// from different brands and price levels; each is searched and its page read for the product's own photo, name and price;
// only the parents search; a photo they keep is copied into the registry's storage (public https images only).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
const H = await import("./harness.mjs"); let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const F = await import("./src/nest-find.js");

assert.deepEqual(F.parseProposals('Sure: {"products": [{"brand": "UPPAbaby", "model": "Vista V2", "tier": "premium", "price": 999, "why": "Grows with the family"}, {"brand": "uppababy", "model": "vista v2"}, {"brand": "", "model": "x"}, {"brand": "Graco", "model": "Modes Pramette", "tier": "cheap"}]}'),
  [{ brand: "UPPAbaby", model: "Vista V2", why: "Grows with the family", tier: "premium", price: 999 }, { brand: "Graco", model: "Modes Pramette", why: "", tier: "mid", price: null }]);
const ld = `<html><head><title>x</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Product"],"name":"Nuna MIXX next Stroller","image":["/img/mixx.jpg"],"offers":{"@type":"AggregateOffer","lowPrice":"749.95","priceCurrency":"USD"}}]}</script></head></html>`;
assert.deepEqual(F.pageProduct(ld, "https://nunababy.com/usa/mixx-next"), { image: "https://nunababy.com/img/mixx.jpg", title: "Nuna MIXX next Stroller", price: 749.95, currency: "USD" });
const og = `<meta property="og:title" content="Bugaboo Fox 5 &amp; more"><meta property="og:image" content="https://cdn.bugaboo.com/fox5.png"><meta property="product:price:amount" content="1199"><meta property="product:price:currency" content="EUR">`;
assert.deepEqual(F.pageProduct(og, "https://www.bugaboo.com/fox-5"), { image: "https://cdn.bugaboo.com/fox5.png", title: "Bugaboo Fox 5 & more", price: 1199, currency: "EUR" });
assert.equal(F.pageProduct('<meta property="og:image" content="http://10.0.0.1/x.png">', "https://a.com").image, null, "no private or plain-http photos");
ok("proposals are read from the model's JSON (duplicates and blanks dropped); a page's own photo, name and price come from schema.org Product or Open Graph");

// the whole finder, through Hive (owner only)
const pages = { "https://www.nunababy.com/mixx": ld, "https://www.bugaboo.com/fox-5": og, "https://www.graco.com/modes": "<html><title>Graco Modes</title></html>", "https://www.target.com/graco-modes": og.replace(/fox5/g, "modes").replace("Bugaboo Fox 5 &amp; more", "Graco Modes Pramette") };
globalThis.fetch = async (u) => { u = String(u); if (pages[u]) return new Response(pages[u], { headers: { "content-type": "text/html" } }); return new Response("nope", { status: 404 }); };
H.hive.web = async (q) => /Nuna/.test(q) ? [{ title: "Reddit thread", url: "https://www.reddit.com/r/x" }, { title: "Nuna", url: "https://www.nunababy.com/mixx" }]
  : /Bugaboo/.test(q) ? [{ title: "Bugaboo", url: "https://www.bugaboo.com/fox-5" }] : /Graco/.test(q) ? [{ title: "Amazon", url: "https://www.amazon.com/dp/1" }, { title: "Graco", url: "https://www.graco.com/modes" }, { title: "Target", url: "https://www.target.com/graco-modes" }] : [];
let asked = null;
H.setResponder((sys, user) => /You help new parents choose baby products/.test(sys) ? (asked = user, '{"products": [{"brand": "Nuna", "model": "MIXX next", "tier": "premium", "price": 750, "why": "Smooth ride"}, {"brand": "Bugaboo", "model": "Fox 5", "tier": "premium", "price": 1199, "why": "All-terrain"}, {"brand": "Graco", "model": "Modes Pramette", "tier": "budget", "price": 300, "why": "Value"}, {"brand": "Nowhere", "model": "Ghost", "tier": "mid"}]}') : "ok");
assert.equal((await H.call("/nest/find", { name: "Stroller" }, false)).error, "owner only");
const r = await H.call("/nest/find", { name: "Stroller", cat: "Gear & travel", notes: "We walk a lot on cobbles", color: "Sage", price: 600, look: "good suspension" });
assert.match(asked, /ITEM: Stroller \(Gear & travel\)\nPARENTS' PREFERENCES: what they're looking for: good suspension; their notes: We walk a lot on cobbles; colour\/style: Sage; around \$600 each/);
assert.equal(r.products.length, 3, "a product with nothing found is left out");
assert.deepEqual(r.products.map((p) => [p.title, p.store, p.image, p.price]), [["Nuna MIXX next Stroller", "nunababy.com", "https://www.nunababy.com/img/mixx.jpg", 749.95], ["Bugaboo Fox 5 & more", "bugaboo.com", "https://cdn.bugaboo.com/fox5.png", 1199], ["Graco Modes Pramette", "target.com", "https://cdn.bugaboo.com/modes.png", 1199]]);
assert.equal(r.products[0].tier, "premium"); assert.equal(r.products[2].why, "Value");
ok("for an item and the parents' preferences: proposals from different brands, each found on the web (Reddit and Amazon skipped as pages to read), with its photo, name, price and store");

// the registry's side: only the parents search; a kept photo is copied into storage
const OUT = new URL("./src/", import.meta.url).pathname, REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"'));
writeFileSync(new URL("./cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest.js?" + Date.now());
class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((x) => ({ ...x }))); st.run(...a); return new Cursor([]); } };
const r2 = new Map(); let hiveAsk = null;
const HIVE = { idFromName: () => "hive", get: () => ({ fetch: async (rq) => { hiveAsk = { url: rq.url, owner: rq.headers.get("x-hive-owner"), body: await rq.json() }; return Response.json({ products: [{ brand: "Nuna", model: "MIXX next", url: "https://www.nunababy.com/mixx", image: "https://www.nunababy.com/img/mixx.jpg" }] }); } }) };
const nest = new Nest({ storage: { sql } }, { HIVE, MODELS: { async put(k, v, o) { r2.set(k, { buf: Buffer.from(v), meta: o.httpMetadata }); }, async get(k) { return r2.get(k); } } });
const call = async (path, body, h = {}) => { const res = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) })); return { status: res.status, j: await res.json() }; };
const O = { "x-nest-owner": "1" }; const key = (await (await nest.fetch(new Request("https://mentifaber.org/api/nest/state", { headers: O }))).json()).invite;
const g = await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name: "Maria" }) })), G = { cookie: g.headers.get("set-cookie").split(";")[0] };
assert.equal((await call("/find", { name: "Stroller" }, G)).status, 403, "guests don't search");
let res = await call("/find", { name: "Stroller", cat: "Gear & travel", look: "light", secret: "x" }, O);
assert.equal(res.j.products[0].model, "MIXX next"); assert.equal(hiveAsk.url, "https://mentifaber.org/api/hive/nest/find"); assert.equal(hiveAsk.owner, "1"); assert.equal(hiveAsk.body.look, "light"); assert.equal(hiveAsk.body.secret, undefined, "only the item's own fields go on");
const png = Buffer.from("89504e470d0a1a0a", "hex");
globalThis.fetch = async (u) => String(u) === "https://www.nunababy.com/img/mixx.jpg" ? new Response(png, { headers: { "content-type": "image/png" } }) : String(u) === "https://evil.example/page" ? new Response("<html>", { headers: { "content-type": "text/html" } }) : new Response("", { status: 404 });
assert.equal((await call("/grab", { url: "https://www.nunababy.com/img/mixx.jpg" }, G)).status, 403);
for (const bad of ["http://www.nunababy.com/img/mixx.jpg", "https://127.0.0.1/x.png", "https://localhost/x.png", "https://intranet/x.png"]) assert.equal((await call("/grab", { url: bad }, O)).status, 400, bad);
assert.equal((await call("/grab", { url: "https://evil.example/page" }, O)).status, 502, "not an image: refused");
res = await call("/grab", { url: "https://www.nunababy.com/img/mixx.jpg" }, O); assert.match(res.j.id, /^b[a-f0-9]{20}$/); assert.deepEqual(r2.get("nest/" + res.j.id).buf, png); assert.equal(r2.get("nest/" + res.j.id).meta.contentType, "image/png");
ok("in the registry only the parents search (through Hive, owner's key) and keep photos; a kept photo is copied into storage; private, plain-http and non-image addresses are refused");
console.log("nest products: all checks passed");
