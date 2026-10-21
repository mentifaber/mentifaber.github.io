// Voice links in Chromium, end to end: the owner makes a link in Settings; a phone opens it, gives a name, talks (a fake
// microphone turn), is answered out loud, comes back later without the link, and disconnects; the owner removes a device and
// turns the link off.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
H.setResponder((sys) => /SPOKEN REPLY/.test(sys) ? "The capital of France is Paris, Sam." : null);
let asOwner = true;
const b = await chromium.launch({ args: ["--no-proxy-server", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 860 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block", permissions: ["microphone"] });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()), h = { "content-type": "application/json" }; const a = req.headers()["authorization"]; if (a) h.authorization = a; if (asOwner) h["x-hive-owner"] = "1"; h["cf-connecting-ip"] = "5.5.5.5";
  const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: h, body: req.postData() || undefined })); const rh = {}; res.headers.forEach((v, k) => (rh[k] = v)); return route.fulfill({ status: res.status, headers: rh, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const ok = (m) => console.log("ok", DEV, m), errs = [], watch = (p) => p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });

// 1 · the owner makes a link in Settings
const o = await ctx.newPage(); watch(o); await o.goto("http://localhost:8099/hive-app.html#studio"); await o.waitForTimeout(900); const sk = await o.$("#w-skip"); if (sk && (await sk.isVisible())) await sk.click();
await o.click("#settings"); await o.waitForSelector("#sdlg[open]"); assert.equal(await o.isVisible("#s-vl"), true);
await o.fill("#vl-label", "Family phones"); await o.fill("#vl-dev", "2"); await o.fill("#vl-per", "6"); await o.click("#vl-new button[type=submit]");
await o.waitForSelector("#vl-list .vl"); const url = await o.inputValue("#vl-list .vl .vlu input"); assert.match(url, /\/talk#[a-z2-7]{26}$/); assert.match(await o.textContent("#vl-list .vlh"), /Family phones[\s\S]*0\/2 devices · 6 turns a day each/);
ok("Settings → Voice links: a link is made (" + url.replace(/#.*/, "#…") + "), and shown with its limits");
const code = url.split("#")[1]; asOwner = false;

// 2 · a phone opens it
const p = await ctx.newPage(); watch(p); await p.goto("http://localhost:8099/talk.html"); await p.waitForTimeout(500); assert.match(await p.textContent("#msg"), /Open your voice link/); ok("the page without a link says so");
await p.goto("http://localhost:8099/talk.html#" + code); await p.waitForSelector("#join:not(.hidden)"); await p.fill("#jn", "Sam"); await p.click("#jgo");
await p.waitForSelector("#stage:not(.hidden)"); assert.equal(await p.textContent("#who"), "Sam"); assert.equal((await p.textContent("#left")).trim(), "6 turns left today"); assert.equal(new URL(p.url()).hash, ""); assert.match(await p.evaluate(() => localStorage.getItem("af:talk:guest")), /vg_[0-9a-f]{64}/);
ok("the phone joins as Sam: 6 turns left, the code gone from the address bar, a token kept on the device");

// 3 · it talks: a fake ear hears one sentence, AutoFaber answers, the reply is spoken (the fake clip fails to play, and the conversation carries on)
await p.evaluate(() => { let n = 0; window.HiveEars = { open: async () => ({ level: 0, loud: 0, close() {}, cancel() {}, turn: (o) => { window.__ear = o; return ++n === 1 ? Promise.resolve({ text: "What is the capital of France?", engine: "flux" }) : new Promise(() => {}); } }) }; });
await p.click("#go"); await p.waitForFunction(() => document.getElementById("said").textContent.includes("Paris"), null, { timeout: 10000 });
assert.match(await p.textContent("#heard"), /capital of France/); assert.equal((await p.textContent("#left")).trim(), "5 turns left today"); assert.ok(await p.evaluate(() => /^vg_/.test(window.__ear.guest)));
const sys = H.calls.at(-1).sys; assert.match(sys, /call them Sam/); assert.doesNotMatch(sys, /OWNER MODE/); ok("a spoken question is answered: heard, answered, 5 turns left; the listening turn carries the guest's token; no owner memory in the prompt");
await p.waitForFunction(() => document.getElementById("state").textContent === "Listening…", null, { timeout: 8000 }); assert.equal((await p.textContent("#go")).trim(), "Pause"); await p.click("#go"); assert.equal((await p.textContent("#go")).trim(), "Resume"); assert.equal(await p.textContent("#state"), "Paused"); await p.click("#go"); assert.equal((await p.textContent("#go")).trim(), "Pause"); ok("back to listening after each answer; Pause and Resume work");
await p.click("#caps"); assert.equal(await p.isVisible("#cap"), false); await p.click("#caps"); ok("captions can be hidden");
const sw = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); assert.ok(sw); ok("no sideways scroll");

// 4 · it comes back without the link; a second phone; the limit of devices
await p.goto("http://localhost:8099/talk.html"); await p.waitForSelector("#stage:not(.hidden)"); assert.equal(await p.textContent("#who"), "Sam"); ok("opening the page again (no link) reconnects the same guest");
const c2 = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }); await c2.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "5.5.5.5", ...(req.headers()["authorization"] ? { authorization: req.headers()["authorization"] } : {}) }, body: req.postData() || undefined })); return route.fulfill({ status: res.status, headers: { "content-type": "application/json" }, body: Buffer.from(await res.arrayBuffer()) }); });
await c2.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort()); const p2 = await c2.newPage(); await p2.goto("http://localhost:8099/talk.html#" + code); await p2.waitForSelector("#join:not(.hidden)"); await p2.click("#jgo"); await p2.waitForSelector("#stage:not(.hidden)"); assert.equal(await p2.textContent("#who"), "Guest 2");
const c3 = await b.newContext({ serviceWorkers: "block" }); await c3.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json" }, body: req.postData() || undefined })); return route.fulfill({ status: res.status, headers: { "content-type": "application/json" }, body: Buffer.from(await res.arrayBuffer()) }); });
await c3.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort()); const p3 = await c3.newPage(); await p3.goto("http://localhost:8099/talk.html#" + code); await p3.waitForSelector("#join:not(.hidden)"); await p3.click("#jgo"); await p3.waitForSelector("#msg:not(.hidden)"); assert.match(await p3.textContent("#msg"), /already has its 2 devices/);
ok("a second phone on the same address is its own guest (Guest 2); a third is turned away at the link's limit of 2"); await c2.close(); await c3.close();

// 5 · the owner sees both and removes one
asOwner = true; await o.reload(); await o.waitForTimeout(900); await o.click("#settings"); await o.waitForSelector("#vl-list .vlg li");
assert.equal(await o.$$eval("#vl-list .vlg li", (l) => l.length), 2); assert.match(await o.textContent("#vl-list .vlg"), /Sam[\s\S]*1 today[\s\S]*1 in all/); o.on("dialog", (d) => d.accept());
await o.click("#vl-list .vlg li:nth-child(2) [data-a=kick]"); await o.waitForFunction(() => document.querySelectorAll("#vl-list .vlg li").length === 1); ok("the owner sees each device and how much it used, and removes one");
await o.click("#vl-list [data-a=toggle]"); await o.waitForFunction(() => /off ·/.test(document.querySelector("#vl-list .vls").textContent)); asOwner = false;
await p.goto("http://localhost:8099/talk.html"); await p.waitForSelector("#msg:not(.hidden)"); assert.match(await p.textContent("#msg"), /turned off/); ok("turning the link off: the phone is told, not left guessing");
asOwner = true; await o.click("#vl-list [data-a=toggle]"); await o.waitForFunction(() => /on ·/.test(document.querySelector("#vl-list .vls").textContent)); asOwner = false;
await p.goto("http://localhost:8099/talk.html"); await p.waitForSelector("#stage:not(.hidden)"); p.on("dialog", (d) => d.accept()); await p.click("#leave"); await p.waitForSelector("#msg:not(.hidden)"); assert.match(await p.textContent("#mt"), /Disconnected/); assert.equal(await p.evaluate(() => localStorage.getItem("af:talk:guest")), null);
assert.equal(H.db.prepare("SELECT COUNT(*) c FROM vguest").get().c, 0); ok("on again it reconnects; Disconnect forgets the device here and on the server");
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
