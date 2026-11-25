// FaberOS in Chromium: Faber Verbs in more of the workshop's apps. Duely answers what's still owed and marks an invoice
// paid (asking first); MentiPlayer looks something up when AutoFaber is asked to put something on.
//   node os5-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
const TLE = "ISS (ZARYA)\n1 25544U 98067A   26327.91294507  .00005691  00000+0  10921-3 0  9993\n2 25544  51.6309 207.9946 0007385 194.4467 165.6345 15.49611389541277\n";
let next = []; const planned = [];
await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/\/api\/orbit/, (rt) => rt.fulfill({ contentType: "text/plain", body: TLE }));
await ctx.route(/\/api\/hive\/os\/plan/, (rt) => { planned.push(JSON.parse(rt.request().postData())); rt.fulfill({ contentType: "application/json", body: JSON.stringify({ actions: next }) }); });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.addInitScript(() => { try { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.4"'); localStorage.setItem("fos:grants", '{"hive":"basic","orbit":"basic"}'); } catch (e) {} });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const cmd = async (text) => { await p.click("#ask-in"); await p.fill("#ask-in", text); await p.waitForSelector("#sug:not([hidden]) li"); return p.$$eval("#sug li", (xs) => xs.map((x) => x.textContent)); };
const frameOf = async (id) => { const f = await (await p.waitForSelector(".win[data-id='" + id + "'] iframe", { state: "attached" })).contentFrame(); if (!/^https?:/.test(f.url())) await f.waitForURL(/^https?:/); await f.waitForLoadState("domcontentloaded"); return f; }; // once the frame has left its blank first page
const lastNote = () => p.evaluate(() => JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || null);

const runAI = async (text, actions) => { next = actions; const s = await cmd(text); const i = s.findIndex((x) => /Let AutoFaber/.test(x)); assert.ok(i >= 0, JSON.stringify(s)); await p.click("#sug li:nth-child(" + (i + 1) + ")"); return s[i]; };
const waitNote = (re) => p.waitForFunction((src) => { const n = JSON.parse(localStorage.getItem("fos:notes") || "[]")[0]; return n && new RegExp(src).test(n.body); }, re.source, { timeout: 15000 });
await ctx.route(/\/api\/media\//, (rt) => rt.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], sources: {} }) }));
// Duely's invoices, as a person would have them in this browser
await ctx.addInitScript(() => { try { if (!localStorage.getItem("duely:invoices")) localStorage.setItem("duely:invoices", JSON.stringify([
  { id: "i1", me: "Green Acre", client: "Dana Whitfield", email: "", num: "1042", cur: "USD", amount: 150, due: "2026-11-01", created: "2026-11-02", what: "lawn care", steps: [{ day: 0, sent: false }, { day: 7, sent: false }, { day: 14, sent: false }] },
  { id: "i2", me: "Green Acre", client: "Sam Ortiz", email: "", num: "1043", cur: "USD", amount: 80, due: "2099-01-01", created: "2026-11-20", what: "hedges", steps: [{ day: 0, sent: false }, { day: 7, sent: false }, { day: 14, sent: false }] }])); } catch (e) {} });
await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");

await runAI("who still owes me money", [{ do: "verb", app: "duely", verb: "owed", args: {} }]);
await waitNote(/2 open \(\$230\.00\): Dana Whitfield \$150\.00, \d+ days late; Sam Ortiz \$80\.00, not due yet\./);
ok("Duely: \"who still owes me money\" answers with each open invoice and how late it is");

await runAI("Dana paid me", [{ do: "verb", app: "duely", verb: "mark-paid", args: { who: "Dana" } }]);
await p.waitForSelector("#vconfirm:not([hidden])"); assert.match(await p.textContent("#v-h"), /Duely/); await p.click("#v-yes");
await waitNote(/Marked paid: Dana Whitfield, invoice #1042 \(\$150\.00\)/);
const df = await frameOf("duely"); assert.ok(await df.evaluate(() => !!Duely.INV().find((i) => i.num === "1042").paid));
await runAI("mark it paid", [{ do: "verb", app: "duely", verb: "mark-paid", args: { who: "nobody" } }]); await p.waitForSelector("#vconfirm:not([hidden])"); await p.click("#v-yes");
await waitNote(/No open invoice matches/);
ok("Duely: marking an invoice paid asks first, then marks it; a name that matches nothing says so");

await runAI("put on some jazz", [{ do: "verb", app: "mentiplayer", verb: "find", args: { what: "jazz", kind: "music" } }]);
await waitNote(/Looking in MentiPlayer for .jazz. \(music\)/);
const mf = await frameOf("mentiplayer"); assert.equal(await mf.inputValue("#q"), "jazz"); assert.equal(await mf.evaluate(() => document.querySelector("#tabs .on").dataset.t), "music");
ok("MentiPlayer: \"put on some jazz\" searches its music for jazz");
assert.deepEqual(errs, []); await b.close(); console.log("all passed " + DEV);
