// The Filament look in Chromium: the lattice runs behind the app without catching clicks, grows a star for each finished
// exchange, sessions carry their sigil, it holds still when Motion is off, and the light theme keeps it.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
const ok = (m) => console.log("ok", DEV, m);
await p.addInitScript(() => { window.__af = []; for (const n of ["think", "token", "done", "reset"]) addEventListener("af:" + n, (e) => window.__af.push([n, e.detail && e.detail.n])); });
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(800); await p.click("#w-skip");
const cv = await p.evaluate(() => { const c = document.getElementById("lattice"), s = getComputedStyle(c); return { pos: s.position, pe: s.pointerEvents, w: c.width, z: +s.zIndex }; });
assert.equal(cv.pos, "fixed"); assert.equal(cv.pe, "none"); assert.ok(cv.w > 100); ok("the lattice is behind everything and never takes a click");
const lit = await p.evaluate(() => { const c = document.getElementById("lattice"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++; return n; }); assert.ok(lit > 50, "drawn: " + lit); ok("it draws (" + lit + " lit samples)");
await p.fill("#inp", "Tell me one thing about gold"); await p.click("#sendb"); await p.waitForSelector(".ex:not(.pending) .m.ai", { timeout: 10000 }); await p.waitForTimeout(300);
const ev = await p.evaluate(() => window.__af); assert.ok(ev.some((e) => e[0] === "think")); assert.ok(ev.some((e) => e[0] === "done" && e[1] === 1), JSON.stringify(ev)); ok("asking sends it a pulse, and the finished answer adds the session's first star");
await p.click("#newchat"); await p.waitForTimeout(300); const sig = await p.$$eval("#hist .sess .sigil circle", (c) => c.length); assert.ok(sig >= 3); ok("the session is in the history with its sigil (" + sig + " stars)");
if (DEV === "desktop") { const sp = await p.evaluate(() => { const r = document.getElementById("crown").getBoundingClientRect(); return [r.width, r.height]; }); assert.ok(sp[0] < 120 && sp[1] > 800, String(sp)); ok("a wide screen has the spine down the left"); }
await p.evaluate(() => document.body.classList.add("still")); await p.waitForTimeout(200);
const a1 = await p.evaluate(() => document.getElementById("lattice").toDataURL().length); await p.waitForTimeout(400); const a2 = await p.evaluate(() => document.getElementById("lattice").toDataURL().length); assert.equal(a1, a2); ok("Motion off: it holds still");
await p.click("#settings"); await p.selectOption("#s-theme", "light"); await p.waitForTimeout(200); assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fil").trim()), "#9a6b12"); ok("vellum: the light theme re-inks it in bronze");
const sw = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); assert.ok(sw); ok("no sideways scroll");
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
