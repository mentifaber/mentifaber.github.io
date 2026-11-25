// Fix or Replace (/fix) in Chromium:
//  - a young phone with a cracked screen: "Fix it", with the sums (parts, labour at the shop rate) shown; changing the shop
//    rate changes the estimate
//  - an old phone whose repair costs more than a working one like it: "Replace it", and what it would fetch for parts
//  - an appliance from the house manual (same device) fills in its model and warranty: "Use the warranty"; the workshop
//    can't take a washer by mail, so there's no quote button
//  - "Ask the workshop" opens a request on the real Workshop Portal (src/portal.js) with the sums attached, and gives the
//    private link at once; recent checks are kept on the device
//  - in FaberOS, AutoFaber answers "should I fix my 4-year-old laptop's battery?" through the check verb
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { portal } = await import(REPO + "/src/portal.js");
const mem = new Map(), hits = new Map(), alerts = [];
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k),
  kvList: async (p) => [...mem].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/portal\//, async (rt) => { const q = rt.request();
  const r = await portal(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "6.6.6.6" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, false, { alert: async (x) => alerts.push(x) });
  rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
let next = []; await ctx.route(/\/api\/(?!portal\/)/, (rt) => rt.fulfill({ contentType: "application/json", body: /os\/plan/.test(rt.request().url()) ? JSON.stringify({ actions: next }) : "{}" }));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const go = async () => { await p.click("#f button[type=submit]"); await p.waitForSelector("#verdict"); };

await p.goto("http://localhost:8099/fix.html"); await p.waitForSelector("#kinds button");
await p.click("#f button[type=submit]"); assert.match(await p.textContent("#f-st"), /Pick what it is/);
await p.click("#kinds button:has-text('Phone')"); await p.click("#faults button:has-text('Cracked or dead screen')"); await p.fill("#age", "1"); await p.fill("#price", "800"); await go();
assert.equal(await p.textContent("#stamp"), "Fix it"); assert.equal(await p.textContent("#cost"), "$95–$340"); assert.equal(await p.textContent("#worth"), "$480");
assert.match(await p.textContent("#verdict"), /Labour, 0\.5–1 h at \$90\/h/);
await p.click("details summary"); await p.fill("#rate", "60"); await go(); assert.equal(await p.textContent("#cost"), "$80–$310", "the shop rate changes the estimate");
assert.equal(await p.isVisible("#ask"), true, "a phone can go to the workshop by mail");
ok("a one-year-old phone with a cracked screen: Fix it, with parts and labour shown; the shop rate changes the estimate");

await p.fill("#age", "6"); await go(); assert.equal(await p.textContent("#stamp"), "Replace it");
assert.match(await p.textContent("#why"), /more than a working one like it costs used \(about \$80\)/); assert.match(await p.textContent("#verdict"), /for parts it might fetch about \$20/);
await p.click("#kinds button:has-text('Laptop')"); await p.click("#faults button:has-text('Got a drink')"); await p.fill("#age", "2"); await p.fill("#price", ""); await go();
assert.match(await p.textContent("#verdict"), /needs a diagnosis first[\s\S]*Back up what's on it[\s\S]*don't try to switch it on again/);
ok("a six-year-old phone: Replace it, and what it fetches for parts; a spilled drink needs a diagnosis and a backup first");

// the house manual's appliances, on the same device
const soon = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
await p.evaluate((w) => localStorage.setItem("house:v1", JSON.stringify([{ id: "h1", kind: "appliance", title: "Washing machine", model: "LG WM4000", warr: w }, { id: "h2", kind: "wifi", title: "Wi-Fi", where: "Maple" }])), soon);
await p.reload(); await p.waitForSelector("#fromHouse:not([hidden])"); assert.equal(await p.$$eval("#houseChips .chip", (x) => x.length), 1, "only things it can weigh up");
await p.click("#houseChips .chip"); assert.equal(await p.inputValue("#model"), "LG WM4000"); assert.equal(await p.isChecked("#warr"), true);
await p.click("#faults button:has-text('Won\\'t drain')"); await p.fill("#age", "2"); await go(); assert.equal(await p.textContent("#stamp"), "Use the warranty");
await p.uncheck("#warr"); await go(); assert.equal(await p.textContent("#stamp"), "Fix it"); assert.match(await p.textContent("#verdict"), /Call-out fee/);
assert.equal(await p.isHidden("#ask"), true); assert.match(await p.textContent("#out"), /can't take a washer/);
ok("an appliance from the house manual brings its model and warranty: Use the warranty; a washer gets a call-out fee and no mail-in quote");

// ask the workshop
assert.equal(await p.$$eval("#hist li", (x) => x.length) >= 4, true, "recent checks are kept");
await p.click("#hist li button:has-text('Phone')"); await p.waitForSelector("#ask:not([hidden])");
await p.fill("#a-name", "Sam"); await p.fill("#a-note", "Dropped it on the patio."); await p.click("#a-go"); await p.waitForSelector("#a-ok");
assert.match(await p.getAttribute("#a-link", "href"), /^\/portal#[0-9a-f]{10}\.[0-9a-f]{32}$/);
const job = [...mem.values()].find((x) => x && x.status === "request"); assert.ok(job, "a request waits on the board");
assert.equal(job.service, "repair"); assert.match(job.title, /Phone: cracked or dead screen/); assert.match(job.timeline[0].text, /From Fix or Replace: cracked or dead screen\. Phone, 6 years old, \$800 new\. Estimate \$80–\$310; the page said: replace it\.\s+Dropped it on the patio\./);
assert.match(alerts[0].title, /New request: Tech repair from Sam/);
ok("Ask the workshop: a request on the Workshop Portal with the sums attached, and the private link at once");

// a link can carry a check; FaberOS asks through the verb
await p.goto("http://localhost:8099/fix.html#tablet/battery/2"); await p.waitForSelector("#verdict"); assert.equal(await p.textContent("#stamp"), "Fix it");
await p.evaluate(() => { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.4"'); });
await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");
next = [{ do: "verb", app: "fix", verb: "check", args: { device: "my laptop", problem: "the battery dies in an hour", age: 4 } }];
await p.click("#ask-in"); await p.fill("#ask-in", "should I fix my 4 year old laptop's battery?"); await p.waitForSelector("#sug:not([hidden]) li");
const s = await p.$$eval("#sug li", (xs) => xs.map((x) => x.textContent)); const i = s.findIndex((x) => /Let AutoFaber/.test(x)); assert.ok(i >= 0, JSON.stringify(s)); await p.click("#sug li:nth-child(" + (i + 1) + ")");
await p.waitForFunction(() => { const x = JSON.parse(localStorage.getItem("fos:notes") || "[]")[0]; return x && /^Fix it: About \$95–\$240 brings back a laptop worth about \$\d+ working/.test(x.body); }, null, { timeout: 15000 })
  .catch(async () => { throw new Error("note: " + (await p.evaluate(() => localStorage.getItem("fos:notes")))); });
ok("a link carries a check; in FaberOS, AutoFaber answers \"should I fix my 4-year-old laptop's battery?\"");
assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
