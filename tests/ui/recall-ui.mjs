// Recall Watch (/recall) in Chromium, against the real route (src/recalls.js) with a stand-in for the CPSC.
//  - the house's things: The Home Record's and the House Manual's appliances (never a private entry; one in both listed
//    once), each with its make and model number worked out ("Bosch SHX878WD5N" is make Bosch, model SHX878WD5N)
//  - "Check everything": the dishwasher's recall, "your model number is listed", with the hazard and what to do; the rest
//    clear; a thing with no model and no make isn't sent
//  - what reached the CPSC: only make, model and kind words, never a room, a note or a serial number
//  - a new recall published since is marked new; a make filled in is kept; one thing checked by hand; axe
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8");
const { recalls } = await import(REPO + "/src/recalls.js");
const st = { hit: async () => true }, env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const rec = (n, date, title, model, maker, hazard) => ({ RecallNumber: String(n), RecallDate: date + "T00:00:00", Title: title, URL: "https://www.cpsc.gov/Recalls/" + n, ConsumerContact: maker + " at 800-555-0100",
  Products: [{ Name: title, Model: model, NumberOfUnits: "About 1,200" }], Manufacturers: [{ Name: maker }], Hazards: [{ Name: hazard }], Remedies: [{ Name: "Stop using it and contact " + maker + " for a free repair." }], RemedyOptions: [{ Option: "Repair" }] });
let DB = [rec(24101, "2024-03-07", "Bosch Recalls Dishwashers Due to Fire Hazard", "SHX878WD5N, SHPM88Z75N", "BSH Home Appliances", "The control board can overheat, posing a fire hazard.")];
const sent = [];
const fakeCpsc = async (url) => { const p = Object.fromEntries(new URL(url).searchParams); sent.push(p);
  const out = p.ProductModel ? DB.filter((r) => r.Products[0].Model.toUpperCase().includes(p.ProductModel.toUpperCase())) : DB.filter((r) => /bosch/i.test(p.Manufacturer || "") && r.Title.toLowerCase().includes(String(p.ProductName || "").toLowerCase().slice(0, 8)));
  return new Response(JSON.stringify(out)); };
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", locale: "en-US" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/recalls/, async (rt) => { const r = await recalls(new Request(rt.request().url().replace("localhost:8099", "mentifaber.org"), { headers: { "cf-connecting-ip": "203.0.113.9" } }), env, json, { fetchFn: fakeCpsc }); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const card = (name) => p.locator(".thing", { has: p.locator(".nm", { hasText: name }) });

try {
  await p.goto("http://localhost:8099/recall.html");
  await p.evaluate(() => new Promise((done) => { localStorage.setItem("house:v1", JSON.stringify([
      { id: "h1", kind: "appliance", title: "Dishwasher", model: "Bosch SHX878WD5N", where: "Kitchen", priv: false },
      { id: "h2", kind: "appliance", title: "Kettle", model: "", where: "Kitchen", priv: false },
      { id: "h3", kind: "appliance", title: "Safe", model: "Sentry SFW123", where: "Under the stairs, code 4417", priv: true },
      { id: "h4", kind: "wifi", title: "Wi-Fi", model: "", where: "", det: "password hunter2", priv: false }]));
    const r = indexedDB.open("homerecord", 1); r.onupgradeneeded = () => r.result.createObjectStore("things", { keyPath: "id" });
    r.onsuccess = () => { const t = r.result.transaction("things", "readwrite"), s = t.objectStore("things");
      s.put({ id: "t1", name: "Dishwasher", model: "Bosch SHX878WD5N", serial: "FD9907", room: "Kitchen", notes: "Leaks a little at the door", passports: [] });
      s.put({ id: "t2", name: "Samsung Washer", model: "WF45T6000AW", serial: "0B7Z", room: "Utility", passports: [] }); t.oncomplete = () => { r.result.close(); done(); }; }; }));
  await p.reload(); await p.waitForSelector(".thing");
  assert.deepEqual(await p.$$eval(".thing .nm", (x) => x.map((e) => e.textContent)), ["Dishwasher", "Samsung Washer", "Kettle"], "the record's two, then the manual's kettle; the dishwasher once; never the private safe or the Wi-Fi");
  assert.equal(await card("Dishwasher").locator("[data-f=maker]").inputValue(), "Bosch"); assert.equal(await card("Dishwasher").locator("[data-f=model]").inputValue(), "SHX878WD5N");
  assert.equal(await card("Samsung Washer").locator("[data-f=maker]").inputValue(), "Samsung"); assert.equal(await card("Samsung Washer").locator("[data-f=kind]").inputValue(), "Washer");
  assert.match(await card("Kettle").textContent(), /add a model number, or a make/);
  ok("the house's things from The Home Record and the House Manual (never a private entry, the dishwasher once), each with its make and model worked out");

  await p.click("#all"); await p.waitForFunction(() => /recall found|no recalls/.test(document.querySelector("#st").textContent));
  assert.match(await p.textContent("#st"), /1 thing with a recall found/);
  const dw = card("Dishwasher"); assert.match(await dw.textContent(), /1 recall found[\s\S]*Bosch Recalls Dishwashers Due to Fire Hazard[\s\S]*Your model number is listed in this recall\. Recall 24101[\s\S]*Hazard: The control board can overheat[\s\S]*What to do: Stop using it/);
  assert.equal(await dw.locator(".recall a").getAttribute("href"), "https://www.cpsc.gov/Recalls/24101"); assert.equal(await dw.locator(".tag.new").count(), 0, "nothing is new on the first check");
  assert.match(await card("Samsung Washer").textContent(), /no recalls found/); assert.match(await card("Kettle").textContent(), /add a model number/);
  const out = JSON.stringify(sent); assert.ok(!/Kitchen|Utility|FD9907|0B7Z|Leaks|hunter2|4417|Sentry/.test(out), "only make, model and kind words reached the CPSC: " + out);
  assert.ok(sent.some((x) => x.ProductModel === "SHX878WD5N") && sent.some((x) => x.ProductModel === "WF45T6000AW"));
  ok("'Check everything': the dishwasher's recall, with its model number listed, the hazard and what to do; the washer clear; the kettle not sent; only make, model and kind words reached the CPSC");

  DB = [rec(25033, "2025-09-30", "Bosch Recalls Dishwashers Due to Shock Hazard", "SHX878WD5N", "BSH Home Appliances", "A wire can chafe, posing a shock hazard."), ...DB];
  await p.reload(); await p.waitForSelector(".thing.hit"); await p.click("#all"); await p.waitForFunction(() => /new since last time/.test(document.querySelector("#st").textContent));
  assert.equal(await dw.locator(".tag.new").count(), 1); assert.match(await dw.locator(".recall", { has: p.locator(".tag.new") }).textContent(), /Shock Hazard/);
  ok("a recall published since the last check is marked new");

  const kt = card("Kettle"); await kt.locator("[data-f=maker]").fill("Breville"); await kt.locator("[data-f=maker]").press("Tab"); await p.waitForSelector('.thing:has-text("Kettle") [data-check]:not([disabled])');
  await p.reload(); await p.waitForSelector(".thing"); assert.equal(await card("Kettle").locator("[data-f=maker]").inputValue(), "Breville", "a make filled in is kept");
  await p.fill("#o-make", "Bosch"); await p.fill("#o-kind", "dishwasher"); await p.click("#f-one button[type=submit]"); await p.waitForFunction(() => /found/.test(document.querySelector("#o-st").textContent));
  assert.match(await p.textContent("#o-out"), /Same make and kind of thing: check its model numbers against yours/);
  ok("a make filled in is kept; something else checked by make and kind says to compare model numbers");

  await p.addScriptTag({ content: AXE }); const v = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; ")));
  assert.deepEqual(v, []); ok("axe finds nothing with recalls showing");

  assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
