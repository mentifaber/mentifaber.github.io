// Fine Print in DocCrawler (Chromium), against the real checking code (src/hive-fine.js) with a model that also makes
// things up: a lease goes in, the flags that are really in it come back (the invented one never shows), each says what
// it means with the exact words, and clicking one finds those words in the document.
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { finePrint } = await import(REPO + "/src/hive-fine.js");
const LEASE = "RESIDENTIAL LEASE\n\nThe tenant shall pay rent of $1,450 on the first day of each month. A late fee of $95 applies to any rent received after the 3rd day of the month.\n\nThis lease renews automatically for successive twelve-month terms unless either party gives written notice at least 60 days before the end of the term.\n\nAny dispute shall be resolved by binding arbitration, and the tenant waives the right to a jury trial.";
const model = { cheap: async () => JSON.stringify({ kind: "residential lease", flags: [
  { quote: "This lease renews automatically for successive twelve-month terms unless either party gives written notice at least 60 days before the end of the term.", kind: "auto-renewal", severity: "high", why: "Miss the 60-day window and you're signed up for another year." },
  { quote: "The tenant must pay for all repairs, including the roof.", kind: "unusual", severity: "high", why: "INVENTED" },
  { quote: "Any dispute shall be resolved by binding arbitration, and the tenant waives the right to a jury trial.", kind: "arbitration", severity: "medium", why: "Disputes go to an arbitrator, not a court." } ] }) };
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
const sent = [];
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/hive\/fineprint/, async (rt) => { const body = JSON.parse(rt.request().postData()); sent.push(body); const r = await finePrint(model, body); rt.fulfill({ contentType: "application/json", body: JSON.stringify(r) }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
await p.goto("http://localhost:8099/doccrawler-app.html"); await p.waitForFunction(() => window.DocCrawler);
await p.setInputFiles("#files", { name: "lease.txt", mimeType: "text/plain", buffer: Buffer.from(LEASE) });
await p.waitForSelector("#docs li[data-id]"); await p.click("#docs li[data-id]"); await p.waitForSelector("#view:not([hidden]) #fine");
await p.click("#fine"); await p.waitForSelector("#fine-out li");
const items = await p.$$eval("#fine-out li", (xs) => xs.map((x) => [x.className, x.querySelector("small").textContent, x.querySelector("b").textContent]));
assert.deepEqual(items.map((x) => x[1]), ["auto-renewal · high", "arbitration · medium"]); assert.ok(!items.some((x) => /INVENTED/.test(x[2])), "the made-up clause never shows");
assert.match(await p.textContent("#fine-st"), /A residential lease\. 2 things to know, each quoted from the document\. Not legal advice\./);
assert.equal(sent[0].name, "lease.txt"); assert.equal(sent[0].text, LEASE);
ok("Fine Print: the lease's two real flags, most important first; the clause the model made up never shows");
await p.click("#fine-out li[data-f='1']"); await p.waitForSelector("#vb mark.fp");
assert.match(await p.textContent("#vb mark.fp"), /^Any dispute shall be resolved by binding arbitration/);
ok("clicking a flag finds its exact words in the document");
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0); assert.deepEqual(errs, []);
ok("no page errors, no sideways scroll");
await b.close();
