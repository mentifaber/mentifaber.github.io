// Uplinks → "How replies are going" in Chromium, with a real Hive behind it.   node health-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", OUT = new URL("./shots/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const H = await import("../gtest/harness.mjs"), { db, hive } = H; hive.sql();
const now = Date.now(), add = (ago, model, who, ttft, ms, cut, err) => db.prepare("INSERT INTO reply(ts,model,who,kind,ms,prep,ttft,chars,cut,err) VALUES(?,?,?,?,?,?,?,?,?,?)").run(now - ago, model, who, "chat", ms, 300, ttft, 800, cut, err);
for (let i = 0; i < 40; i++) add(i * 60e3, "@cf/openai/gpt-oss-120b", i % 3 ? "visitor" : "owner", 1200 + i * 20, 5000 + i * 100, null, null);
add(5e3, "@cf/openai/gpt-oss-120b", "visitor", 1500, 9000, "loop", null); add(9e3, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "owner", 900, 120000, "time", null);
add(12e3, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "visitor", null, 400, null, "upstream exploded"); add(40 * 864e5, "@cf/openai/gpt-oss-20b", "visitor", 800, 2000, null, null); // a 40-day-old row is outside every period
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" })); await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled because the context is sandboxed/.test(e.message)) errs.push(e.message); });
const ok = (m) => console.log("ok", DEV, m), until = async (fn, ms = 8000, what = "") => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn)) return; await p.waitForTimeout(120); } throw new Error("timed out: " + what); };
await p.goto("http://localhost:8099/hive-app.html#keys");
await until(() => /replies/.test(document.getElementById("k-health").textContent), 8000, "reply health loads");
const t = await p.textContent("#k-health");
assert.match(t, /^43 replies \(\d+ from visitors\)/); assert.match(t, /looped 1/); assert.match(t, /time cap 1/); assert.match(t, /failed 1/);
assert.match(t, /gpt-oss-120b\s*41/); assert.match(t, /Recent problems[\s\S]*stopped: looping[\s\S]*stopped: time cap[\s\S]*failed: upstream exploded/); assert.doesNotMatch(t, /gpt-oss-20b/);
ok("the owner sees replies, timings and rates per model, with the recent problems; old rows fall outside the period");
await p.screenshot({ path: OUT + DEV + "-reply-health.png", fullPage: false, clip: await p.$eval("#k-health", (e) => { e.scrollIntoView(); const r = e.closest(".bd").getBoundingClientRect(); return { x: 0, y: Math.max(0, r.y), width: innerWidth, height: Math.min(r.height, innerHeight) }; }) });
await p.click("[data-rh='30']"); await until(() => document.querySelector("[data-rh='30']").getAttribute("aria-pressed") === "true", 4000, "30 days");
ok("the period buttons switch it (24 h, 7 days, 30 days)");
const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide); assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close(); console.log("all passed", DEV); process.exit(0);
