// FaberOS 0.4 in Chromium: Faber Verbs. Apps declare what they can do (Ballast: add a transaction, tell the balance;
// Overhead: track a satellite; Unlit: show a conflict; DocCrawler: search) and AutoFaber can ask them to do it.
//  - the command bar offers "Let AutoFaber do it with Ballast" for a sentence that sounds like one of Ballast's verbs
//  - a verb that changes data asks first: Cancel changes nothing, "Do it" adds the transaction, money out stays negative
//  - read-only verbs just run (Overhead tracks the ISS, Unlit opens a conflict) and answer in a notification
//  - a verb an app didn't declare, or one missing its arguments, never reaches the app
//  - "Don't ask again" for an app, and Settings can take that back
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
const frameOf = async (id) => (await (await p.$(".win[data-id='" + id + "'] iframe")).contentFrame());
const lastNote = () => p.evaluate(() => JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || null);
const runAI = async (text, actions) => { next = actions; const s = await cmd(text); const i = s.findIndex((x) => /Let AutoFaber/.test(x)); assert.ok(i >= 0, JSON.stringify(s)); await p.click("#sug li:nth-child(" + (i + 1) + ")"); return s[i]; };
await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");

const m = JSON.parse(fs.readFileSync(new URL("../../assets/os/apps.json", import.meta.url)));
assert.equal(m.version, "0.4"); const bal = m.apps.find((a) => a.id === "ballast");
assert.ok(bal.verbs.some((v) => v.name === "add-transaction" && v.changes) && bal.kit);
ok("the manifest (0.4) carries each app's verbs; Ballast's add-transaction is marked as changing data");

// a sentence that sounds like a Ballast verb, handed to AutoFaber; the change waits for a yes
const label = await runAI("log 40 dollars for gas", [{ do: "verb", app: "ballast", verb: "add-transaction", args: { amount: 40, label: "Gas", direction: "out", category: "transportation" } }]);
assert.match(label, /Let AutoFaber do it with Ballast/);
assert.ok(planned.at(-1).apps.find((a) => a.id === "ballast").verbs.some((v) => v.name === "add-transaction" && v.args.amount === "number"), "the verbs go to AutoFaber with their arguments");
await p.waitForSelector("#vconfirm:not([hidden])"); assert.match(await p.textContent("#v-h"), /Ballast to: add a transaction/);
assert.match(await p.textContent("#v-list"), /amount\s*-?40[\s\S]*label\s*Gas[\s\S]*direction\s*out[\s\S]*category\s*Transportation/);
await p.click("#v-no"); assert.equal(await p.isHidden("#vconfirm"), true);
assert.equal(await p.$$eval(".win[data-id='ballast']", (x) => x.length), 0, "Cancel: Ballast isn't even opened");
ok("\"log 40 dollars for gas\" offers \"Let AutoFaber do it with Ballast\"; the change asks first, and Cancel does nothing");

await runAI("log 40 dollars for gas", [{ do: "verb", app: "ballast", verb: "add-transaction", args: { amount: 40, label: "Gas", direction: "out" } }]);
await p.waitForSelector("#vconfirm:not([hidden])"); await p.click("#v-yes");
await p.waitForFunction(() => { const n = JSON.parse(localStorage.getItem("fos:notes") || "[]")[0]; return n && /Added/.test(n.body); }, null, { timeout: 15000 });
let note = await lastNote(); assert.equal(note.app, "ballast"); assert.match(note.body, /Added -\$40\.00 · Gas\. Your balance is now/);
const bf = await frameOf("ballast"); const tx = await bf.evaluate(() => state.transactions.filter((t) => t.desc === "Gas"));
assert.equal(tx.length, 1); assert.equal(tx[0].amt, -40, "money out is negative"); assert.equal(tx[0].cat, "Other");
ok("\"Do it\": Ballast adds -$40.00 for Gas and answers in a notification with the new balance");

// read-only verbs run without asking
await runAI("what's my balance looking like", [{ do: "verb", app: "ballast", verb: "balance", args: {} }]);
await p.waitForFunction(() => /Balance now/.test((JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body || ""));
assert.equal(await p.isHidden("#vconfirm"), true);
await runAI("track the space station for me", [{ do: "verb", app: "orbit", verb: "track", args: { name: "ISS" } }]);
await p.waitForFunction(() => /Tracking ISS/.test((JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body || ""), null, { timeout: 15000 });
note = await lastNote(); assert.match(note.body, /Tracking ISS \(ZARYA\): over \d+\.\d°[NS], \d+\.\d°[EW] at \d+ km\./);
await runAI("show me the fighting in sudan", [{ do: "verb", app: "conflict-atlas", verb: "show", args: { query: "Sudan" } }]);
await p.waitForFunction(() => /Sudan/.test((JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body || ""), null, { timeout: 15000 });
const caf = await frameOf("conflict-atlas"); assert.match(await caf.textContent("#detail"), /Sudan/);
ok("read-only verbs just run: Ballast tells the balance, Overhead tracks the ISS, Unlit opens Sudan's entry");

// what never reaches an app
const before = await bf.evaluate(() => state.transactions.length);
await runAI("log something weird for me", [{ do: "verb", app: "ballast", verb: "delete-everything", args: {} }, { do: "verb", app: "ballast", verb: "add-transaction", args: { label: "no amount" } }]);
await p.waitForTimeout(600); assert.equal(await p.isHidden("#vconfirm"), true, "nothing to confirm");
assert.equal(await bf.evaluate(() => state.transactions.length), before);
assert.match(await p.textContent("#toast"), /Ballast needs amount to add a transaction/);
ok("a verb Ballast didn't declare, or one missing its amount, never reaches Ballast");

// don't ask again, and Settings takes it back
await runAI("log 12 for coffee", [{ do: "verb", app: "ballast", verb: "add-transaction", args: { amount: 12, label: "Coffee", direction: "out" } }]);
await p.waitForSelector("#vconfirm:not([hidden])"); await p.check("#v-trust"); await p.click("#v-yes");
await p.waitForFunction(() => /Coffee/.test((JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body || ""));
await runAI("log 3 for tea", [{ do: "verb", app: "ballast", verb: "add-transaction", args: { amount: 3, label: "Tea", direction: "out" } }]);
await p.waitForFunction(() => /Tea/.test((JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body || "")); assert.equal(await p.isHidden("#vconfirm"), true, "no sheet once trusted");
await p.click("#menu-btn"); await p.click("#menu [data-open='settings']"); await p.waitForSelector(".win[data-id='settings'] [data-vtrust='ballast']", { state: "attached" });
assert.match(await p.textContent(".win[data-id='settings'] [data-vtrust='ballast']"), /Acts without asking/);
await p.$eval(".win[data-id='settings'] [data-vtrust='ballast']", (x) => x.click());
assert.match(await p.textContent(".win[data-id='settings'] [data-vtrust='ballast']"), /Asks first/);
ok("\"Don't ask again\" lets Ballast's next change through without the sheet; Settings shows it and puts the question back");

assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
assert.deepEqual(errs.filter((e) => !/Service worker|offline|Failed to fetch|NetworkError/.test(e)), []);
ok("no page errors, no sideways scroll");
await b.close();
