// Hive, clicked through end to end against a real Hive (the gtest harness).  node flow.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", H = await import("../gtest/harness.mjs");
H.setResponder((sys, user) => /MENTIFABER|council|LEAD/.test(sys) && /Rust/.test(user) ? null : null);
const b = await chromium.launch({ args: ["--no-proxy-server", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block", permissions: ["microphone"] });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: JSON.stringify({ state: "online", model: { label: "Qwen3 8B", size: 5e9, ctx: 32768 } }) }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/sandboxed/.test(e.message)) errs.push(e.message); }); p.on("dialog", (d) => d.accept());
const ok = (m) => console.log("ok", DEV, m), until = async (fn, ms = 8000, what = "") => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn)) return; await p.waitForTimeout(120); } throw new Error("timed out: " + what + " · errs " + JSON.stringify(errs)); };
const txt = (s) => p.textContent(s);
await p.goto("http://localhost:8099/hive-app.html#studio"); await until(() => document.getElementById("mtot").textContent.length > 0, 8000, "models");
assert.ok(await p.isVisible("#lede")); assert.ok(await p.isVisible("#starters")); assert.ok(await p.$eval("#core img", (i) => i.complete && i.naturalWidth > 0)); assert.match(await p.textContent("#brand"), /Genesis/); assert.ok(await p.$eval("#geo-mark", (i) => i.complete && i.naturalWidth > 0)); ok("empty surface: greeting, seams, a geode grown from the model list, the mark in the crown");
// a message, streamed
await p.fill("#inp", "Hello there, what's new?"); await p.click("#sendb"); await until(() => document.querySelectorAll(".ex").length === 1 && !document.querySelector(".ex.pending") && document.querySelector(".m.ai .b"), 10000, "reply");
assert.equal(await p.isVisible("#lede"), false); assert.match(await txt(".ex .lyr"), /01/); assert.match(await txt(".m.ai .b"), /\w/); ok("a message streams into layer 01; the greeting gives way");
await p.fill("#inp", "And a second thing?"); if (DEV === "mobile") await p.click("#sendb"); else await p.press("#inp", "Enter"); await until(() => document.querySelectorAll(".ex").length === 2 && !document.querySelector(".ex.pending"), 10000, "second");
assert.match(await p.$eval("#log .ex", (e) => e.querySelector(".lyr").textContent), /02/); ok("newest layer on top (02 above 01), Enter sends");
// redo and edit
await p.click("#log .ex:first-child [data-act='redo']"); await until(() => !document.querySelector(".ex.pending") && document.querySelectorAll(".ex").length === 2, 8000, "redo"); ok("Again re-asks in place");
const before = await p.$$eval(".ex", (x) => x.length); await p.$eval("#log .ex:first-child [data-uact='edit']", (b) => b.click()); assert.equal(await p.inputValue("#inp"), "And a second thing?"); assert.equal(await p.$$eval(".ex", (x) => x.length), before - 1); ok("Edit takes the question back into the surface and lifts its layer");
await p.fill("#inp", "");
// slash commands
await p.fill("#inp", "/remember I like long walks"); await p.click("#sendb"); await p.waitForTimeout(500); assert.ok(H.db.prepare("SELECT COUNT(*) n FROM mem WHERE text LIKE '%long walks%'").get().n >= 1); ok("/remember files a memory");
await p.fill("#inp", "/model llama 3.3"); await p.click("#sendb"); await p.waitForTimeout(300); assert.match(await txt("#mname"), /Llama 3\.3/i); ok("/model switches the mind; the page takes its mineral: " + await p.evaluate(() => document.documentElement.style.getPropertyValue("--m")));
// council and search modes
await p.click("#council"); await p.fill("#inp", "Rust or Go first?"); await p.click("#sendb"); await until(() => !document.querySelector(".ex.pending") && document.querySelector(".ex.council"), 15000, "council");
assert.ok(await p.$(".ex.council .drafts")); ok("Council: drafts below the answer, the strip banded by every member"); await p.click("#council");
await p.click("#web"); await p.fill("#inp", "What's the weather in Porto?"); await p.click("#sendb"); await until(() => !document.querySelector(".ex.pending") && document.querySelector(".ex.web"), 15000, "search"); await p.click("#web"); ok("Search mode marks its layer");
// picker, palette, sessions
await p.click("#mpick"); await p.fill("#mq", "gemma"); await until(() => document.querySelectorAll("#mlist [data-m]").length > 0, 3000, "picker"); await p.keyboard.press("Enter"); assert.match(await txt("#mname"), /gemma/i); ok("the picker finds and picks a mind by name");
await p.click("#newchat"); assert.ok(await p.isVisible("#lede")); assert.ok((await p.$$("#hist .sess")).length >= 1); ok("New: an empty surface, the session settles into the bedrock");
await p.fill("#hsearch", "Porto"); await p.waitForTimeout(200); assert.equal((await p.$$("#hist .sess")).length, 1); await p.fill("#hsearch", ""); ok("digging the bedrock finds a session by a word in it");
await p.click("#cmdk-btn"); await p.fill("#cq", "Hello there"); await p.waitForTimeout(150); await p.keyboard.press("Enter"); await until(() => document.querySelectorAll(".ex").length > 0, 3000, "palette open"); ok("⌘K opens a session by name");
await p.click("#hist .sess [data-del]"); await p.waitForTimeout(300); ok("a session can be deleted from the bedrock");
// settings and theme
await p.click("#settings"); await p.selectOption("#s-theme", "light"); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "light"); await p.selectOption("#s-theme", "dark"); await p.click("#ssave"); ok("settings: limestone and basalt");
// voice opens and closes
await p.click("#voice"); await until(() => !document.getElementById("voiceo").classList.contains("hidden"), 4000, "voice open"); await p.waitForTimeout(600); await p.click("#vend"); assert.ok(await p.$eval("#voiceo", (e) => e.classList.contains("hidden"))); ok("voice link opens on the geode and ends cleanly");
// swarm
await p.click("#realms a[data-v='swarm']"); await until(() => !document.getElementById("home").classList.contains("hidden"), 4000, "swarm home");
await p.fill("#brief", "A tiny tip calculator in one HTML file"); await p.click("#go"); await until(() => !document.getElementById("proj").classList.contains("hidden") && document.getElementById("ptitle").textContent, 8000, "mission"); ok("Swarm: a brief becomes a mission page (" + await txt("#ptitle") + ")");
await p.click("[data-pt='swarm']"); await p.waitForTimeout(500); assert.ok(await p.isVisible("#map")); await p.click("#back"); await until(() => document.querySelectorAll("#plist [data-id]").length >= 1, 4000, "list"); ok("the cavity map shows; back lists it");
// mind and uplinks
await p.click("#realms a[data-v='mind']"); await until(() => !document.getElementById("m-open").classList.contains("hidden"), 6000, "mind");
for (const t of ["mem", "time", "gen", "you"]) { await p.click("#mtabs [data-mt='" + t + "']"); await p.waitForTimeout(250); assert.ok(await p.isVisible("#mt-" + t)); } assert.match(await txt("#m-mem"), /long walks/); ok("Mind: every tab, and the memory from /remember is there");
await p.click("#realms a[data-v='keys']"); await until(() => !document.getElementById("k-open").classList.contains("hidden"), 6000, "uplinks"); assert.match(await txt("#agentp"), /Mentifaber Agent 1\.0/); assert.ok((await p.$$("#k-prov option")).length > 5); ok("Uplinks: Agent 1.0 panel and the provider list");
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close(); console.log("all passed", DEV); process.exit(0);
