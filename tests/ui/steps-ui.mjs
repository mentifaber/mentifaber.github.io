// Live steps in Chromium: while AutoFaber plans and looks things up, the pending message shows what it's doing.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = async (u) => { u = typeof u === "string" ? u : String(u.url || u);
  if (u.includes("en.wikipedia.org/w/api.php")) { await new Promise((r) => setTimeout(r, 1500)); return J({ query: { pages: { 1: { index: 1, title: "Tidal power", fullurl: "https://en.wikipedia.org/wiki/Tidal_power", extract: "Tidal power converts energy from tides." } } } }); }
  throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
H.setResponder((sys) => /You decide which tools AutoFaber/.test(sys) ? JSON.stringify({ calls: [{ tool: "web", arg: "tidal power output 2026" }] }) : null);
H.setDelayFn((sys) => /You decide which tools AutoFaber/.test(sys) ? 1500 : 1500);
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);
await p.fill("#inp", "How much electricity does tidal power make worldwide these days?"); await p.click("#sendb");
const seen = new Set(); const end = Date.now() + 15000;
while (Date.now() < end) { const t = await p.evaluate(() => [...document.querySelectorAll(".ex.pending .m.ai .tools span")].map((s) => s.className + ":" + s.textContent)); t.forEach((x) => seen.add(x)); if (await p.$(".ex:not(.pending) .m.ai .b")) break; await p.waitForTimeout(150); }
console.log("   seen:", [...seen].join(" | "));
assert.ok([...seen].some((x) => /^now:deciding what to look up…/.test(x))); assert.ok([...seen].some((x) => /^now:searching the web…/.test(x))); assert.ok([...seen].some((x) => /^did:searched the web: tidal power output 2026/.test(x)));
console.log("ok", DEV, "the pending message shows each step live: planning, searching, then ✓ done");
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
