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
const r2 = new Map(), nest = new Nest({ storage: { sql } }, { MODELS: { async put(k, v, o) { r2.set(k, { buf: Buffer.from(v), meta: o.httpMetadata }); }, async get(k) { const o = r2.get(k); return o && { body: o.buf, httpMetadata: o.meta }; } } });

const b = await chromium.launch({ args: ["--no-proxy-server"] });
const opts = { viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1360, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" };
async function context(owner) {
  const ctx = await b.newContext(opts);
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/nest\//, async (route) => { const q = route.request(), u = new URL(q.url()), hd = await q.allHeaders();
    const h = { "content-type": hd["content-type"] || "application/json" }; if (hd.cookie) h.cookie = hd.cookie; if (owner) h["x-nest-owner"] = "1";
    const res = await nest.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: q.method(), headers: h, body: q.method() === "POST" ? q.postDataBuffer() : undefined }));
    const out = {}; res.headers.forEach((v, k) => (out[k] = v)); return route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) }); });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p };
}
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

// ── a guest ──
const G = await context(false), gp = G.p;
await gp.goto(URL0); await gp.waitForSelector("#nest-gate"); assert.match(await gp.textContent("#nest-gate"), /This registry is private/); assert.equal(await gp.locator("#nest-gate input").count(), 0);
await gp.goto(URL0 + "?k=" + "0".repeat(24) + "#registry"); await gp.fill("#nest-gate input", "Mallory"); await gp.click("#nest-gate button");
await gp.waitForFunction(() => /isn't valid/.test(document.querySelector("#nest-gate").textContent)); ok("without the invite link the registry is private; a wrong link doesn't let anyone in");

await gp.goto(URL0 + "?k=" + key); await gp.fill("#nest-gate input", "Aunt Maria"); await gp.click("#nest-gate button"); await gp.waitForSelector("#nest-gate", { state: "detached" });
await gp.waitForFunction(() => document.querySelectorAll(".card").length === 4); assert.doesNotMatch(gp.url(), /k=/, "the key leaves the address bar");
assert.match(await gp.textContent(".babyname"), /Baby Faber/); assert.equal(await gp.isVisible("#tab-room"), false); assert.equal(await gp.isVisible("#btn-add"), false);
await gp.click(".card:has-text('Crib') .btn.primary"); await gp.waitForSelector("#dlg[open] #c-from");
assert.match(await gp.textContent("#dlg .addr"), /1 Rua Nova/); await gp.fill("#c-note", "Bringing it to the shower!");
await gp.click("#dlg .dlg-foot .btn.primary"); await gp.waitForSelector(".card:has-text('Crib') .pill.you");
await wide(gp); ok("the invite link lets a guest in by name; they see the list (not the parents' tools), reserve a gift and see where to send it");

// the owner sees it within a poll; the guest stays in
await op.click("#tab-room"); await op.waitForFunction(() => /Aunt Maria[\s\S]*Crib[\s\S]*Bringing it to the shower/.test(document.querySelector("#room-thanks").textContent), null, { timeout: 9000 });
await gp.reload(); await gp.waitForFunction(() => document.querySelectorAll(".card").length === 4); assert.equal(await gp.locator("#nest-gate").count(), 0, "still in after a reload");
ok("the owner sees the guest's gift and note in the Parents' room within seconds; the guest stays signed in");

assert.deepEqual(op.errs, []); assert.deepEqual(gp.errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
