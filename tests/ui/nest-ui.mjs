// The Nest Registry in Chromium, against its real backend (src/nest.js on node:sqlite): the owner names themself, sets the
// baby's details, quick-adds from the checklist and adds an item with a photo; the invite link lets a guest in by name (no
// link: private); the guest reserves a gift; the owner sees it in the Parents' room within a poll; the guest stays in.
//   node nest-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite"; import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2], DEV = process.argv[3] || "desktop", OUT = new URL("../gtest/src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"').replace('from "./nest-find.js"', 'from "' + REPO + '/src/nest-find.js"'));
writeFileSync(new URL("../gtest/cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest.js");
class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((r) => ({ ...r }))); st.run(...a); return new Cursor([]); } };
// the product finder: Hive answers with three products; their photos are fetched server-side when kept
const png1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// the product finder (Hive) answers with three products and their photos' addresses; the site has no R2 (as on the free
// plan with R2 off), so the registry fetches each photo into its own storage. The background queue runs on the object's
// alarm, as on Cloudflare (here a timer)
let seq = 0; const realFetch = globalThis.fetch;
const { deflateSync, crc32 } = await import("node:zlib");
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0, 8 + d.length); return b; };
const photoPng = (() => { const w = 400, hh = 400, ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(hh, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * hh); for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); })(); // a real product-sized photo
const shopPage = '<html><head><meta property="og:type" content="product"><meta property="og:title" content="Owlet Dream Duo baby monitor"><meta property="og:image" content="https://img.example/monitor.png"><meta property="product:price:amount" content="129.00"><meta property="product:price:currency" content="USD"></head></html>';
globalThis.fetch = (u, o) => /^https:\/\/img\.example\//.test(String(u)) ? Promise.resolve(new Response(/monitor/.test(String(u)) ? photoPng : png1, { headers: { "content-type": "image/png" } }))
  : /^https:\/\/shop\.example\//.test(String(u)) ? Promise.resolve(new Response(shopPage, { headers: { "content-type": "text/html" } })) : realFetch(u, o);
// the vision model that reads a screenshot (Workers AI on the site)
const AI = { async run(m, inp) { assert.ok(inp.image || JSON.stringify(inp.messages).includes("data:image/"), "the photo goes to the model"); return { response: 'Here you go: {"name": "Hatch Rest sound machine", "brand": "Hatch", "price": 69.99, "currency": "USD", "store": "Target", "category": "sleep"}' }; } };
const HIVE = { idFromName: () => "h", get: () => ({ fetch: async (rq) => { const b = await rq.json(); await new Promise((r) => setTimeout(r, 150));
  const put = () => "https://img.example/p" + ++seq + ".png";
  return Response.json({ products: [
    { brand: "Babyletto", model: "Hudson 3-in-1", tier: "mid", why: "Converts to a toddler bed", url: "https://www.babyletto.com/hudson", store: "babyletto.com", image: put(), price: 399, currency: "USD" },
    { brand: "IKEA", model: "SNIGLAR", tier: "budget", why: "Simple and sturdy", url: "https://www.ikea.com/sniglar", store: "ikea.com", image: put(), price: 119, currency: "USD" },
    { brand: "Nursery Works", model: "Novella", tier: "premium", why: "Statement piece", url: "https://nurseryworks.net/novella", store: "nurseryworks.net", image: put(), price: null, approx: 1200 }] }); } }) };
let alarmAt = null, alarmT = 0;
const storage = { sql, getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; clearTimeout(alarmT); alarmT = setTimeout(async () => { alarmAt = null; await nest.alarm(); }, Math.max(0, Math.min(t - Date.now(), 400))); } };
const nest = new Nest({ storage }, { HIVE, AI });

const b = await chromium.launch({ args: ["--no-proxy-server"] });
const opts = { viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1360, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" };
async function context(owner) {
  const ctx = await b.newContext(opts);
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/nest\//, async (route) => { const q = route.request(), u = new URL(q.url()), hd = await q.allHeaders();
    const h = { "content-type": hd["content-type"] || "application/json" }; if (hd.cookie) h.cookie = hd.cookie; if (owner) h["x-nest-owner"] = "1";
    const res = await nest.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: q.method(), headers: h, body: q.method() === "POST" ? q.postDataBuffer() : undefined }));
    const out = {}; res.headers.forEach((v, k) => (out[k] = v)); return route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) }); });
  await ctx.addInitScript(() => { window.NEST_POLL_MS = 1500; }); // the page checks every 30 s on the site; quicker here
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p };
}
const shot = async (p, name) => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/nest-" + DEV + "-" + name + ".png", fullPage: name === "registry" }); }; // SHOTS=<dir> to look at it
const ok = (m) => console.log("ok", DEV, m), URL0 = "http://localhost:8099/nest.html";
const wide = async (p) => { const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(w <= 1, "sideways scroll " + w); };

// ── the owner sets it up ──
const O = await context(true), op = O.p;
await op.goto(URL0); await op.waitForSelector("#nest-gate input");
assert.match(await op.textContent("#nest-gate"), /Your name on the registry/);
await op.fill("#nest-gate input", "Anders"); await op.click("#nest-gate button"); await op.waitForSelector("#nest-gate", { state: "detached" });
await op.waitForSelector(".empty h2:has-text('Start your registry')"); assert.equal(await op.isVisible("#tab-room"), true);
assert.match(await op.textContent("#who"), /Parent · owner[\s\S]*Anders/);
ok("the owner names themself once, then sees an empty registry with the Parents' room");

await op.click("#tab-room"); await op.waitForSelector("#s-baby");
await op.selectOption("#s-sex", "boy"); await op.fill("#s-baby", "Baby Faber"); await op.fill("#s-parents", "Anders & Adrianna"); await op.fill("#s-address", "A. Faber\n1 Rua Nova\nLisboa");
await op.evaluate(() => { const d = new Date(Date.now() + 70 * 864e5); document.getElementById("s-due").value = d.toISOString().slice(0, 10); });
await op.click("#room-settings button[type=submit]"); await op.waitForFunction(() => /Baby Faber/.test(document.querySelector(".babyname").textContent));
const link = await op.textContent("#room-share .addr"); assert.match(link, /^http:\/\/localhost:8099\/nest\?k=[a-f0-9]{24}$/); const key = link.split("k=")[1];
ok("the details save and show at the top; the Sharing panel gives the private invite link");

await op.click("#tab-registry"); await op.click(".empty .btn.primary"); await op.waitForSelector("#dlg[open] .starter");
for (const name of ["Crib", "Swaddles (velcro/zip)", "Diaper fund"]) await op.click(`#dlg .starter:has-text("${name}") input`);
await op.click("#dlg .dlg-foot .btn.primary"); await op.waitForFunction(() => document.querySelectorAll(".card").length === 3, null, { timeout: 10000 });
await op.click("#btn-add"); await op.fill("#e-name", "Convertible car seat"); await op.fill("#e-price", "289");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await op.setInputFiles("#e-file", { name: "seat.png", mimeType: "image/png", buffer: png }); await op.waitForSelector("#dlg .qs-preview img");
await op.waitForFunction(() => /Check the name/.test(document.querySelector("#dlg .qs-status").textContent));
assert.equal(await op.inputValue("#e-name"), "Convertible car seat", "what she typed isn't overwritten by the photo reading"); assert.equal(await op.inputValue("#e-price"), "289");
await op.click("#dlg .dlg-foot .btn.primary"); await op.waitForFunction(() => document.querySelectorAll(".card").length === 4, null, { timeout: 10000 });
const img = await op.waitForSelector(".card img[src^='/api/nest/blob/b']"); await op.waitForFunction((el) => el.complete && el.naturalWidth > 0, img);
await wide(op); ok("quick-add from the checklist and an item with a photo: the photo is stored and shows on its card");
// a photo that's gone (R2 switched off): the shop's copy if it loads, else a tidy tile; never a broken image
await nest.fetch(new Request("https://mentifaber.org/api/nest/doc", { method: "POST", headers: { "content-type": "application/json", "x-nest-owner": "1" }, body: JSON.stringify({ path: "items/gone1", data: { name: "Old photo", kind: "item", cat: "bath", imageId: "b" + "7".repeat(20), options: [{ t: "Tub", i: "b" + "8".repeat(20), r: "https://elsewhere.example/tub.png" }] } }) }));
await op.waitForSelector(".card:has(h3:text-is('Old photo')) .thumb .glyph", { timeout: 9000 }); assert.equal(await op.locator(".card:has(h3:text-is('Old photo')) .thumb img").count(), 0);
await op.waitForSelector(".card:has(h3:text-is('Old photo')) .opt .ph"); assert.equal(await op.locator(".card:has(h3:text-is('Old photo')) .opt img").count(), 0);
await nest.fetch(new Request("https://mentifaber.org/api/nest/doc", { method: "POST", headers: { "content-type": "application/json", "x-nest-owner": "1" }, body: JSON.stringify({ path: "items/gone1", data: null }) }));
await op.waitForSelector(".card h3:text-is('Old photo')", { state: "detached", timeout: 9000 });
ok("a missing photo falls back to the shop's copy, then to a tidy tile; never a broken image");

// products: the notice walks the parents through items without picks; they keep the closest; photos are copied in
await op.waitForSelector("#registry-notices .notice:has-text('Products found for 3 items')", { timeout: 15000 }); // found in the background as the items were added; funds aren't searched
assert.equal(await op.locator(".card .btn.primary:has-text('Pick from 3')").count(), 3);
await op.click("#registry-notices .notice .btn.primary:has-text('Review & pick')"); await op.waitForSelector("#dlg[open] .find");
await shot(op, "finder"); const first = await op.textContent("#dlg .dlg-head h2"); assert.equal(await op.locator("#dlg .find").count(), 3); assert.equal(await op.locator("#dlg .spin").count(), 0, "already found: nothing to wait for");
assert.match(await op.textContent("#dlg .finds"), /Babyletto Hudson 3-in-1[\s\S]*\$399[\s\S]*babyletto\.com[\s\S]*IKEA SNIGLAR[\s\S]*about \$1,200/);
await op.waitForFunction(() => [...document.querySelectorAll("#dlg .find img")].length === 3 && [...document.querySelectorAll("#dlg .find img")].every((i) => i.complete && i.naturalWidth > 0 && /^\/api\/nest\/blob\//.test(i.getAttribute("src"))), null, { timeout: 8000 });
await op.click("#dlg .find:has-text('Babyletto') input"); await op.click("#dlg .find:has-text('IKEA') input"); assert.match(await op.textContent("#dlg .dlg-foot"), /2 picks kept/);
await op.click("#dlg .dlg-foot .btn.primary:has-text('Save & next')"); await op.waitForFunction((t) => document.querySelector("#dlg[open] .dlg-head h2") && document.querySelector("#dlg .dlg-head h2").textContent !== t && document.querySelectorAll("#dlg .find").length === 3, first, { timeout: 10000 });
await op.click("#dlg .dlg-foot .btn:has-text('Close')");
const pickedName = first.replace("Products for ", ""), pc = op.locator(`.card:has(h3:text-is("${pickedName}"))`);
await pc.locator(".opts .opt").first().waitFor(); assert.equal(await pc.locator(".opts .opt").count(), 2);
const oimg = await pc.locator(".opts img").first().getAttribute("src"); assert.match(oimg, /^\/api\/nest\/blob\/b[a-f0-9]{20}$/, "the kept photo was copied into the registry");
await op.waitForFunction((n) => [...document.querySelectorAll(".card")].some((c) => c.querySelector("h3").textContent === n && c.querySelector(".opts img").naturalWidth > 0), pickedName);
assert.ok(await pc.locator(".thumb img").count(), "an item without its own photo shows its first pick's");
await op.evaluate(() => scrollTo(0, 0)); await shot(op, "registry"); await wide(op); ok("products are found for every item in the background as it's added; the parents review and pick (Save & next) with the photos already there, and see their picks on the card");

// ── a guest ──
const G = await context(false), gp = G.p;
await gp.goto(URL0); await gp.waitForSelector("#nest-gate"); assert.match(await gp.textContent("#nest-gate"), /This registry is private/); assert.equal(await gp.locator("#nest-gate input").count(), 0);
await gp.goto(URL0 + "?k=" + "0".repeat(24) + "#registry"); await gp.fill("#nest-gate input", "Mallory"); await gp.click("#nest-gate button");
await gp.waitForFunction(() => /isn't valid/.test(document.querySelector("#nest-gate").textContent)); ok("without the invite link the registry is private; a wrong link doesn't let anyone in");

await gp.goto(URL0 + "?k=" + key); await gp.fill("#nest-gate input", "Aunt Maria"); await gp.click("#nest-gate button"); await gp.waitForSelector("#nest-gate", { state: "detached" });
await gp.waitForFunction(() => document.querySelectorAll(".card").length === 4); assert.doesNotMatch(gp.url(), /k=/, "the key leaves the address bar");
assert.match(await gp.textContent(".babyname"), /Baby Faber/); assert.match(await gp.textContent(".its-a"), /It's a boy/, "guests see it's a boy"); assert.equal(await gp.isVisible("#tab-room"), false); assert.equal(await gp.isVisible("#btn-add"), false);
await gp.click(`.card:has(h3:text-is("${pickedName}")) .btn.primary`); await gp.waitForSelector("#dlg[open] #c-from");
assert.match(await gp.textContent("#dlg"), /Which one\?[\s\S]*Babyletto Hudson 3-in-1[\s\S]*IKEA SNIGLAR[\s\S]*Something similar/); await gp.click("#dlg .choice label:has-text('IKEA SNIGLAR') input"); await shot(gp, "choose");
assert.match(await gp.textContent("#dlg .addr"), /1 Rua Nova/); await gp.fill("#c-note", "Bringing it to the shower!");
await gp.click("#dlg .dlg-foot .btn.primary"); await gp.waitForSelector(`.card:has(h3:text-is("${pickedName}")) .pill.you`);
await wide(gp); ok("the invite link lets a guest in by name; they see the list (not the parents' tools), reserve a gift and see where to send it");

// the owner sees it within a poll; the guest stays in
await op.click("#tab-room"); await op.waitForFunction((n) => new RegExp("Aunt Maria[\\s\\S]*" + n + "[\\s\\S]*IKEA SNIGLAR[\\s\\S]*Bringing it to the shower").test(document.querySelector("#room-thanks").textContent), pickedName.replace(/[()]/g, "."), { timeout: 9000 });
assert.match(await op.textContent("#room-backup"), /saved automatically every night/);
const dl = await Promise.all([op.waitForEvent("download"), op.click("#room-backup a:has-text('Download a backup')")]).then(([d]) => d);
assert.match(dl.suggestedFilename(), /^nest-registry-backup-\d{4}-\d{2}-\d{2}\.json$/);
const bk = JSON.parse(readFileSync(await dl.path(), "utf8")); assert.equal(bk.kind, "the-nest-registry-backup");
assert.equal(Object.keys(bk.docs).filter((k) => k.startsWith("items/")).length, 4); assert.equal(bk.docs["meta/settings"].baby, "Baby Faber");
assert.ok(Object.values(bk.docs).some((d) => d.items && Object.values(d.items).some((c) => c.pick === "IKEA SNIGLAR")), "the guest's gift and choice are in it");
assert.ok(Object.values(bk.people).some((x) => x.name === "Aunt Maria")); assert.ok(Object.keys(bk.photos).length >= 3 && Object.values(bk.photos).every((u) => /^data:image\/png;base64,/.test(u)), "the photos are inside it");
ok("the owner downloads a backup: one file with the list, picks, gifts and choices, names, details and photos");
await gp.reload(); await gp.waitForFunction(() => document.querySelectorAll(".card").length === 4); assert.equal(await gp.locator("#nest-gate").count(), 0, "still in after a reload");
ok("the owner sees the guest's gift and note in the Parents' room within seconds; the guest stays signed in");

// Adrianna: her own co-parent link makes her a co-parent on her device; she adds and removes items herself
await op.click("#tab-room"); await op.waitForSelector("#room-share .addr >> nth=1");
const plink = await op.locator("#room-share .addr").nth(1).textContent(); assert.match(plink, /\/nest\?k=[a-f0-9]{24}$/); assert.notEqual(plink, link, "her link isn't the guests' link");
const AD = await context(false), ap = AD.p;
await ap.goto(URL0 + "?k=" + plink.split("k=")[1]); await ap.fill("#nest-gate input", "Adrianna"); await ap.click("#nest-gate button"); await ap.waitForSelector("#nest-gate", { state: "detached" });
await ap.waitForFunction(() => document.querySelectorAll(".card").length === 4); assert.equal(await ap.isVisible("#tab-room"), true, "she has the Parents' room"); assert.equal(await ap.isVisible("#btn-add"), true);
assert.match(await ap.textContent("#who"), /Parent[\s\S]*Adrianna/);
await ap.click("#btn-add"); await ap.fill("#e-name", "Baby monitor"); await ap.click("#dlg .dlg-foot .btn.primary"); await ap.waitForSelector(".card h3:text-is('Baby monitor')");
// the easy way: one tap, pick a screenshot, and it fills itself in
const [chooser] = await Promise.all([ap.waitForEvent("filechooser"), ap.click("#btn-shot")]);
await chooser.setFiles({ name: "Screenshot_20261113.png", mimeType: "image/png", buffer: png });
await ap.waitForFunction(() => document.querySelector("#e-name").value === "Hatch Rest sound machine", null, { timeout: 9000 });
assert.equal(await ap.inputValue("#e-price"), "69.99"); assert.equal(await ap.inputValue("#e-cat"), "sleep"); assert.equal(await ap.inputValue("#e-brand"), "Hatch"); assert.equal(await ap.isVisible("#e-brand"), false, "the extra details stay folded away");
assert.match(await ap.textContent("#dlg .qs-status"), /Filled in from the photo/); await shot(ap, "screenshot-add");
await ap.click("#dlg .dlg-foot .btn.primary"); const hatch = await ap.waitForSelector(".card:has(h3:text-is('Hatch Rest sound machine')) img[src^='/api/nest/blob/b']"); await ap.waitForFunction((el) => el.complete && el.naturalWidth > 0, hatch);
// or paste a shop's link: name, price and photo come from the page
await ap.click("#btn-add"); await ap.fill("#e-link", "https://shop.example/p/owlet"); await ap.click("#dlg .qs-link .btn");
await ap.waitForFunction(() => document.querySelector("#e-name").value === "Owlet Dream Duo baby monitor", null, { timeout: 9000 });
assert.equal(await ap.inputValue("#e-price"), "129"); await ap.waitForSelector("#dlg .qs-preview img");
await ap.click("#dlg .dlg-foot .btn.primary"); await ap.waitForSelector(".card:has(h3:text-is('Owlet Dream Duo baby monitor')) .links a[href='https://shop.example/p/owlet']");
ok("Adrianna adds from a screenshot in one tap (it reads the name, price and category) or by pasting a shop's link");
await op.click("#tab-registry"); await op.waitForSelector(".card h3:text-is('Baby monitor')", { timeout: 9000 }); // the owner sees her new item
await ap.click(".card:has(h3:text-is('Baby monitor')) .btn:has-text('Edit')"); await ap.click("#dlg .btn.danger:has-text('Delete')"); await ap.click("#dlg .confirm-bar .btn.danger");
await ap.waitForSelector(".card h3:text-is('Baby monitor')", { state: "detached" }); await op.waitForSelector(".card h3:text-is('Baby monitor')", { state: "detached", timeout: 9000 });
await ap.click("#tab-room"); await ap.waitForSelector("#room-share .addr"); assert.equal(await ap.locator("#room-share .addr").count(), 1, "the co-parent link is the owner's to give");
await wide(ap); ok("Adrianna opens her co-parent link, gets the Parents' room, and adds and removes items herself; the owner sees it");
await op.click("#tab-room"); await op.click("#room-backup .btn:has-text('Refresh all photos')"); await op.waitForSelector(".toast:has-text('Checking every photo again')");
await op.click("#tab-registry"); await op.waitForFunction(() => !/Finding product photos/.test(document.querySelector("#registry-notices").textContent), null, { timeout: 15000 });
ok("the parents can refresh every photo; progress shows while it works, and goes when it's done");
assert.deepEqual(op.errs, []); assert.deepEqual(gp.errs, []); assert.deepEqual(ap.errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
