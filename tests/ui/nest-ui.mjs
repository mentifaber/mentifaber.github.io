// The Nest Registry in Chromium, against its real backend (src/nest.js on node:sqlite): the owner names themself, sets the
// baby's details, quick-adds from the checklist and adds an item with a photo; the invite link lets a guest in by name (no
// link: private); the guest reserves a gift; the owner sees it in the Parents' room within a poll; the guest stays in.
//   node nest-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite"; import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2], DEV = process.argv[3] || "desktop", OUT = new URL("../gtest/src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "nest.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"'));
writeFileSync(new URL("../gtest/cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest.js");
class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((r) => ({ ...r }))); st.run(...a); return new Cursor([]); } };
// the product finder: Hive answers with three products; their photos are fetched server-side when kept
const png1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// the product finder (Hive) answers with three products whose photos it has already stored; the background queue runs on
// the object's alarm, as on Cloudflare (here a timer)
let seq = 0;
const HIVE = { idFromName: () => "h", get: () => ({ fetch: async (rq) => { const b = await rq.json(); await new Promise((r) => setTimeout(r, 150));
  const put = () => { const id = "b" + String(++seq).padStart(20, "0"); r2.set("nest/" + id, { buf: png1, meta: { contentType: "image/png" } }); return id; };
  return Response.json({ products: [
    { brand: "Babyletto", model: "Hudson 3-in-1", tier: "mid", why: "Converts to a toddler bed", url: "https://www.babyletto.com/hudson", store: "babyletto.com", i: put(), price: 399, currency: "USD" },
    { brand: "IKEA", model: "SNIGLAR", tier: "budget", why: "Simple and sturdy", url: "https://www.ikea.com/sniglar", store: "ikea.com", i: put(), price: 119, currency: "USD" },
    { brand: "Nursery Works", model: "Novella", tier: "premium", why: "Statement piece", url: "https://nurseryworks.net/novella", store: "nurseryworks.net", i: put(), price: null, approx: 1200 }] }); } }) };
let alarmAt = null, alarmT = 0;
const storage = { sql, getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; clearTimeout(alarmT); alarmT = setTimeout(async () => { alarmAt = null; await nest.alarm(); }, Math.max(0, Math.min(t - Date.now(), 400))); } };
const r2 = new Map(), nest = new Nest({ storage }, { HIVE, MODELS: { async put(k, v, o) { r2.set(k, { buf: Buffer.from(v), meta: o.httpMetadata }); }, async get(k) { const o = r2.get(k); return o && { body: o.buf, httpMetadata: o.meta }; } } });

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
await op.fill("#s-baby", "Baby Faber"); await op.fill("#s-parents", "Anders & Adrianna"); await op.fill("#s-address", "A. Faber\n1 Rua Nova\nLisboa");
await op.evaluate(() => { const d = new Date(Date.now() + 70 * 864e5); document.getElementById("s-due").value = d.toISOString().slice(0, 10); });
await op.click("#room-settings button[type=submit]"); await op.waitForFunction(() => /Baby Faber/.test(document.querySelector(".babyname").textContent));
const link = await op.textContent("#room-share .addr"); assert.match(link, /^http:\/\/localhost:8099\/nest\?k=[a-f0-9]{24}$/); const key = link.split("k=")[1];
ok("the details save and show at the top; the Sharing panel gives the private invite link");

await op.click("#tab-registry"); await op.click(".empty .btn.primary"); await op.waitForSelector("#dlg[open] .starter");
for (const name of ["Crib", "Swaddles (velcro/zip)", "Diaper fund"]) await op.click(`#dlg .starter:has-text("${name}") input`);
await op.click("#dlg .dlg-foot .btn.primary"); await op.waitForFunction(() => document.querySelectorAll(".card").length === 3, null, { timeout: 10000 });
await op.click("#btn-add"); await op.fill("#e-name", "Convertible car seat"); await op.fill("#e-price", "289");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await op.setInputFiles("#e-file", { name: "seat.png", mimeType: "image/png", buffer: png }); await op.waitForSelector("#dlg .photo-drop img");
await op.click("#dlg .dlg-foot .btn.primary"); await op.waitForFunction(() => document.querySelectorAll(".card").length === 4, null, { timeout: 10000 });
const img = await op.waitForSelector(".card img[src^='/api/nest/blob/b']"); await op.waitForFunction((el) => el.complete && el.naturalWidth > 0, img);
await wide(op); ok("quick-add from the checklist and an item with a photo: the photo is stored and shows on its card");

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
assert.match(await gp.textContent(".babyname"), /Baby Faber/); assert.equal(await gp.isVisible("#tab-room"), false); assert.equal(await gp.isVisible("#btn-add"), false);
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
await op.click("#tab-registry"); await op.waitForSelector(".card h3:text-is('Baby monitor')", { timeout: 9000 }); // the owner sees her new item
await ap.click(".card:has(h3:text-is('Baby monitor')) .btn:has-text('Edit')"); await ap.click("#dlg .btn.danger:has-text('Delete')"); await ap.click("#dlg .confirm-bar .btn.danger");
await ap.waitForSelector(".card h3:text-is('Baby monitor')", { state: "detached" }); await op.waitForSelector(".card h3:text-is('Baby monitor')", { state: "detached", timeout: 9000 });
await ap.click("#tab-room"); await ap.waitForSelector("#room-share .addr"); assert.equal(await ap.locator("#room-share .addr").count(), 1, "the co-parent link is the owner's to give");
await wide(ap); ok("Adrianna opens her co-parent link, gets the Parents' room, and adds and removes items herself; the owner sees it");
assert.deepEqual(op.errs, []); assert.deepEqual(gp.errs, []); assert.deepEqual(ap.errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
