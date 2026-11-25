// House Manual (/house) in Chromium:
//  - an empty manual offers the entries that matter in a hurry; one tap and "where it is" saves a card in its section
//  - search finds "where's the water shutoff" by meaning, best match first; a warranty about to end is flagged
//  - Share a copy: a link with the manual inside it (nothing sent anywhere), private entries left out unless asked;
//    another browser opens it read-only and can keep it
//  - in FaberOS, AutoFaber finds an entry and adds one (asking first) through House Manual's verbs
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const mk = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort()); await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p }; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const A = await mk(), p = A.p;

await p.goto("http://localhost:8099/house.html"); await p.waitForSelector("#start:not([hidden])");
await p.click("#chips .chip:has-text('Water shutoff')"); await p.fill("#e-where", "Under the kitchen sink, blue handle"); await p.fill("#e-det", "Turn clockwise.\nThe outside one is by the front step."); await p.click("#edit button[type=submit]");
await p.waitForSelector(".sec:has-text('Shutoffs & utilities') .card:has-text('Water shutoff')"); assert.equal(await p.isHidden("#start"), true, "the starter list goes once there's an entry");
await p.click("#add"); await p.fill("#e-title", "Wi-Fi"); await p.selectOption("#e-kind", "wifi"); await p.fill("#e-where", "Network: Maple · password on the router"); await p.click("#edit button[type=submit]");
await p.click("#add"); await p.fill("#e-title", "Alarm code"); await p.selectOption("#e-kind", "note"); await p.fill("#e-where", "4821"); await p.check("#e-priv"); await p.click("#edit button[type=submit]");
const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
await p.click("#add"); await p.fill("#e-title", "Dishwasher"); await p.selectOption("#e-kind", "appliance"); await p.fill("#e-model", "Bosch SHX78"); await p.fill("#e-warr", soon); await p.click("#edit button[type=submit]");
await p.waitForSelector(".card:has-text('Dishwasher') .tag.warn"); assert.match(await p.textContent(".card:has-text('Alarm code')"), /private/);
ok("an empty manual offers the urgent ones; entries save into their sections; a warranty about to end is flagged; private entries are marked");

await p.fill("#q", "where's the water shutoff?"); await p.waitForSelector(".sec h2:has-text('Best match first')");
assert.match(await p.textContent("#list .card"), /Water shutoff[\s\S]*Under the kitchen sink/);
await p.fill("#q", "wifi password"); assert.match(await p.textContent("#list .card"), /Wi-Fi[\s\S]*Maple/);
await p.fill("#q", "trampoline"); assert.match(await p.textContent("#list"), /Nothing here mentions/); await p.fill("#q", "");
ok("search answers \"where's the water shutoff?\" with the right card first");

await p.click("#share"); await p.click("#s-make"); await p.waitForSelector("#s-link");
const link = await p.getAttribute("#s-link", "href"); assert.match(link, /\/house\.html#v=[jz][A-Za-z0-9_-]+$/); assert.match(await p.textContent("#s-out"), /3 entries, private ones left out/);
const B = await mk(); await B.p.goto(link); await B.p.waitForSelector("#shared:not([hidden]) #keep");
const seen = await B.p.textContent("#list"); assert.match(seen, /Water shutoff[\s\S]*Dishwasher/); assert.ok(!/4821|Alarm code/.test(seen), "the private entry stays home");
assert.equal(await B.p.$$eval(".card .acts", (x) => x.length), 0, "a shared copy is read-only"); assert.equal(await B.p.isHidden("#add"), true);
await B.p.click("#keep"); await B.p.waitForFunction(() => /3 entries kept on this device/.test(document.querySelector("#shared").textContent));
assert.equal(await B.p.evaluate(() => JSON.parse(localStorage.getItem("house:v1")).length), 3); assert.equal(await B.p.isHidden("#add"), false);
ok("Share a copy: the manual travels in the link, private entries left out; the other browser sees it read-only and keeps it");

// FaberOS: AutoFaber looks something up, and adds an entry (asking first)
let next = []; await A.ctx.route(/\/api\/hive\/os\/plan/, (rt) => rt.fulfill({ contentType: "application/json", body: JSON.stringify({ actions: next }) }));
await p.evaluate(() => { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.4"'); });
await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");
const ai = async (text, actions) => { next = actions; await p.click("#ask-in"); await p.fill("#ask-in", text); await p.waitForSelector("#sug:not([hidden]) li"); const s = await p.$$eval("#sug li", (xs) => xs.map((x) => x.textContent)); const i = s.findIndex((x) => /Let AutoFaber/.test(x)); assert.ok(i >= 0, JSON.stringify(s)); await p.click("#sug li:nth-child(" + (i + 1) + ")"); };
const note = (re) => p.waitForFunction((src) => { const x = JSON.parse(localStorage.getItem("fos:notes") || "[]")[0]; return x && new RegExp(src).test(x.body); }, re.source, { timeout: 15000 });
await ai("where is the water shutoff", [{ do: "verb", app: "house", verb: "find", args: { what: "water shutoff" } }]);
await note(/^Water shutoff: Under the kitchen sink, blue handle\. Turn clockwise\./);
await ai("note that the stopcock key is in the garage", [{ do: "verb", app: "house", verb: "add", args: { title: "Stopcock key", where: "Garage, hook by the door", section: "shutoff" } }]);
await p.waitForSelector("#vconfirm:not([hidden])"); await p.click("#v-yes"); await note(/Added to the house manual: Stopcock key, Garage, hook by the door\./);
ok("in FaberOS, AutoFaber finds where the water shutoff is, and adds an entry after asking");
for (const x of [A, B]) assert.deepEqual(x.p.errs, []);
await b.close(); console.log("all passed " + DEV);
