// The quick start in Chromium: a first visit shows it; a name, a line about you and an answer length are kept on the device,
// greet you, ride along with each message into AutoFaber's prompt, and can be changed or the quick start brought back in Settings.
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
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);
assert.equal(await p.isVisible("#welcome"), true); assert.match(await p.textContent("#welcome"), /Ask anything[\s\S]*Search[\s\S]*Council[\s\S]*Talk out loud[\s\S]*Swarm/); ok("a first visit shows the quick start");
await p.fill("#w-name", "Sam"); await p.fill("#w-about", "I fix bikes and I'm learning Python"); await p.click("#welcome [data-len='short']"); await p.click("#w-go");
assert.equal(await p.isVisible("#welcome"), false); assert.match(await p.textContent("#greet"), /, Sam\.$/); ok("Start: the card goes and the greeting uses the name");
await p.fill("#inp", "What should I learn first?"); await p.click("#sendb"); await p.waitForSelector(".ex:not(.pending) .m.ai", { timeout: 10000 });
const sys = H.calls.at(-1).sys; assert.match(sys, /call them Sam/); assert.match(sys, /"I fix bikes and I'm learning Python"/); assert.match(sys, /Keep answers short/); ok("the name, the line about them and “short” reach AutoFaber's prompt");
await p.reload(); await p.waitForTimeout(700); assert.equal(await p.isVisible("#welcome"), false); assert.match(await p.textContent("#greet"), /Sam/); ok("after a reload: no quick start, still greeted by name");
await p.click("#settings"); await p.waitForSelector("#sdlg[open]"); assert.equal(await p.inputValue("#s-name"), "Sam"); assert.equal(await p.inputValue("#s-len"), "short");
await p.fill("#s-name", "Samira"); await p.dispatchEvent("#s-name", "change"); await p.selectOption("#s-len", "long");
const m = await p.evaluate(() => JSON.parse(localStorage.getItem("hive:me"))); assert.equal(m.name, "Samira"); assert.equal(m.len, "long"); assert.match(await p.textContent("#greet"), /Samira/); ok("Settings → You edits the name and answer length");
await p.click("#s-intro"); await p.waitForTimeout(300); assert.equal(await p.isVisible("#welcome"), true); assert.equal(await p.inputValue("#w-name"), "Sam"); ok("“Show the quick start again” brings it back");
await p.click("#w-skip"); assert.equal(await p.isVisible("#welcome"), false);
const sw = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); assert.ok(sw); ok("no sideways scroll");
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
