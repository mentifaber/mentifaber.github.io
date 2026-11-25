// FaberOS Routines in Chromium (game plan GP-4.2): several apps, one sentence.
//  - "Friday money check" from the starters: say its name in the top bar and Duely, then Ballast twice, answer in one
//    notification, one line per app; the windows it opened only to ask are closed again
//  - a routine you make: a step that's missing what it needs won't save; a step that changes data still asks first, and
//    "No" comes back as that step's answer
//  - on a day: a routine that was due while FaberOS was closed runs once when it opens, and not again
//   node routines-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.addInitScript(() => { try { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.4"'); localStorage.setItem("fos:grants", '{"hive":"basic","orbit":"basic"}');
  if (!localStorage.getItem("duely:invoices")) localStorage.setItem("duely:invoices", JSON.stringify([
    { id: "i1", me: "Green Acre", client: "Dana Whitfield", email: "", num: "1042", cur: "USD", amount: 150, due: "2026-11-01", created: "2026-11-02", what: "lawn care", steps: [{ day: 0, sent: false }, { day: 7, sent: false }, { day: 14, sent: false }] }])); } catch (e) {} });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const notes = () => p.evaluate(() => JSON.parse(localStorage.getItem("fos:notes") || "[]"));
const waitNote = (title) => p.waitForFunction((t) => { const x = JSON.parse(localStorage.getItem("fos:notes") || "[]")[0]; return x && x.title === t; }, title, { timeout: 40000 });
const openRoutines = async () => { await p.click("#menu-btn"); await p.click("#menu [data-open='routines']"); await p.waitForSelector(".win[data-id='routines'] .inner h2"); };
const R = ".win[data-id='routines'] .inner";

await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");
await openRoutines(); assert.match(await p.textContent(R), /No routines yet/);
await p.click(R + " .prow:has-text('Friday money check') [data-rt-start]"); await p.waitForSelector(R + " .rt:has-text('Friday money check')");
assert.match(await p.textContent(R + " .rt"), /Fridays at 17:00[\s\S]*Duely: tell me what's still owed[\s\S]*Ballast: tell me my balance[\s\S]*Ballast: tell me what I've spent \(days 7\)/);
assert.equal(await p.$$eval(R + " .prow:has-text('Friday money check')", (x) => x.length), 0, "a starter once added isn't offered again");
ok("Routines: Friday money check added from the starters, with its steps and its day");

await p.click("#ask-in"); await p.fill("#ask-in", "friday money"); await p.waitForSelector("#sug:not([hidden]) li");
assert.match(await p.textContent("#sug li:first-child"), /Run the routine Friday money check/); await p.click("#sug li:first-child");
await waitNote("Friday money check"); const nt = (await notes())[0];
assert.equal(nt.app, "routines"); const lines = nt.body.split("\n"); assert.equal(lines.length, 3, nt.body);
assert.match(lines[0], /^Duely: 1 open \(\$150\.00\): Dana Whitfield \$150\.00/); assert.match(lines[1], /^Ballast: /); assert.match(lines[2], /^Ballast: /);
assert.deepEqual(await p.$$eval(".win", (ws) => ws.map((w) => w.dataset.id)), ["routines"], "the windows it opened only to ask are closed again");
await p.waitForSelector(R + " .rt-last"); assert.match(await p.textContent(R + " .rt-last"), /Last run[\s\S]*Duely: 1 open/);
ok("saying its name runs it: Duely and Ballast answer in one notification, one line each, and their windows close again");

// a routine you make
await p.click(R + " [data-rt-new]"); await p.fill("#rt-name", "House check");
await p.selectOption("#rt-v0", "house/find"); await p.waitForSelector("#rt-a0-what"); await p.click(R + " [data-rt-save]");
assert.match(await p.textContent("#rt-err"), /Step 1: House Manual needs what/);
await p.fill("#rt-a0-what", "water shutoff"); await p.click(R + " [data-rt-add]"); await p.selectOption("#rt-v1", "ballast/add-transaction");
await p.fill("#rt-a1-amount", "5"); await p.fill("#rt-a1-label", "Tea"); await p.fill("#rt-name", "Friday Money Check"); await p.click(R + " [data-rt-save]");
assert.match(await p.textContent("#rt-err"), /already a routine called that/); await p.fill("#rt-name", "House check"); await p.click(R + " [data-rt-save]");
await p.waitForSelector(R + " .rt:has-text('House check')"); assert.match(await p.textContent(R + " .rt:has-text('House check')"), /When you say its name[\s\S]*look something up in the house manual \(what water shutoff\)[\s\S]*amount 5, label Tea/);
await p.click(R + " .rt:has-text('House check') [data-rt-run]"); await p.waitForSelector("#vconfirm:not([hidden])"); assert.match(await p.textContent("#v-h"), /Ballast/); await p.click("#v-no");
await waitNote("House check"); assert.match((await notes())[0].body, /^House Manual: The house manual is empty[^\n]*\nBallast: Cancelled: nothing was changed$/);
ok("a routine you make: a missing argument or a taken name won't save; a step that changes data still asks, and No is its answer");

// on a day: due while FaberOS was closed, it runs once when it opens
const today = await p.evaluate(() => new Date().getDay());
await p.evaluate((d) => { const rs = JSON.parse(localStorage.getItem("fos:routines")); const r = rs.find((x) => x.name === "Friday money check"); r.on = { day: d, at: "00:00" }; r.since = 0; delete r.last; localStorage.setItem("fos:routines", JSON.stringify(rs)); localStorage.setItem("fos:notes", "[]"); }, today);
await p.reload(); await p.waitForSelector("#icons .ic"); await waitNote("Friday money check (on schedule)");
await p.reload(); await p.waitForSelector("#icons .ic"); await p.waitForTimeout(3000);
assert.equal((await notes()).filter((x) => /on schedule/.test(x.title)).length, 1, "once, not every time FaberOS opens");
ok("a routine due while FaberOS was closed runs once when it opens, and not again");
assert.deepEqual(errs, []); await b.close(); console.log("all passed " + DEV);
