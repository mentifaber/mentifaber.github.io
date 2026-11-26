// Bill Watch (/bills) in Chromium. Nothing goes to a server: every request off the page is refused, and the page still
// does all of it.
//  - watching a bill; the first month is read line by line, with the total
//  - the next month (from a file) is lined up against it: what went up, what's new, a promo that ended, a heads-up,
//    what the lines don't explain, the questions to ask, copied in one tap
//  - each month is listed with its change; an earlier month can be opened; a month can be replaced or removed
//  - something that isn't a bill says so; it's all still there after a reload
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs"; import os from "node:os";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
const off = []; await ctx.route(/^(?!http:\/\/localhost:8099\/(bills\.html|assets\/))/, (rt) => { off.push(rt.request().url()); rt.abort(); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bills-"));
const OCT = `Northwind Mobile
Bill period Oct 1 - Oct 31, 2026
Previous balance $92.10
Payment received - thank you -92.10
Unlimited Plus plan (Oct 1 - Oct 31) $70.00
Line 2 access 20.00
Device payment 3 of 24 $25.00
Autopay discount -$10.00
New customer promo credit (6 of 12) ($15.00)
Regulatory cost recovery fee 2.49
Sales tax 4.11
Total current charges $96.60`;
const NOV = OCT.replace(/Oct 1 - Oct 31/g, "Nov 1 - Nov 30").replace("$92.10", "$96.60").replace("-92.10", "-96.60").replace("$70.00", "$75.00").replace("3 of 24", "4 of 24")
  .replace("-$10.00", "-$5.00").replace("New customer promo credit (6 of 12) ($15.00)\n", "").replace("2.49", "3.49").replace("4.11", "4.61\nLate payment fee 7.00").replace("$96.60`", "").replace("Total current charges $96.60", "Total current charges $135.10") + "\nYour promotional rate for Line 2 ends in December.";

await p.goto("http://localhost:8099/bills.html"); await p.waitForSelector("#accts .status"); assert.match(await p.textContent("#accts"), /Nothing watched yet/);
await p.fill("#a-name", "Northwind Mobile"); await p.selectOption("#a-kind", "phone"); await p.click("#f-new button[type=submit]"); await p.waitForSelector("#acct:not([hidden])");
assert.equal(await p.textContent("#a-title"), "Northwind Mobile · Phone");
await p.fill("#m-month", "2026-10"); await p.fill("#m-text", OCT); await p.click("#go"); await p.waitForSelector("#headline");
assert.match(await p.textContent("#headline"), /October 2026's bill: \$96\.60\s*The first Northwind Mobile bill here\. .* 9 lines read/);
assert.match(await p.textContent("#result .lines"), /Unlimited Plus plan \(Oct 1 - Oct 31\)\s*\$70\.00/); assert.equal(await p.inputValue("#m-month"), "2026-11", "the month moves on");
ok("watching a bill: the first month is read line by line, with its total; the month moves on to the next");

// November, from a file
fs.writeFileSync(path.join(tmp, "nov.txt"), NOV); await p.setInputFiles("#m-file", path.join(tmp, "nov.txt")); await p.waitForFunction(() => /Read nov\.txt/.test(document.querySelector("#st").textContent));
await p.click("#go"); await p.waitForFunction(() => /since October/.test(document.querySelector("#headline").textContent));
assert.match(await p.textContent("#headline"), /Up \$38\.50 since October 2026: \$96\.60 → \$135\.10 \(\+40%\)\.\s*The charges listed account for \+\$33\.50 of it; \$5\.00 isn't on any line I could read/);
const sec = await p.$$eval("#result h3", (x) => x.map((h) => h.textContent)); assert.deepEqual(sec, ["Went up", "New charges", "Discounts that ended or got smaller", "Worth knowing", "What to ask them"]);
assert.match(await p.textContent("#result .lines li.up"), /Unlimited Plus plan \(Nov 1 - Nov 30\)\s*\$70\.00 → \$75\.00\+\$5\.00 \(\+7%\)\s*on the bill: “Unlimited Plus plan \(Nov 1 - Nov 30\) \$75\.00”/);
assert.match(await p.textContent("#result"), /Late payment fee\s*— → \$7\.00\+\$7\.00/); assert.match(await p.textContent("#result"), /New customer promo credit \(6 of 12\)\s*−\$15\.00 → —\+\$15\.00\s*last bill: “New customer promo credit \(6 of 12\) \(\$15\.00\)”/);
assert.match(await p.textContent("#result"), /Worth knowing\s*on the bill: “Your promotional rate for Line 2 ends in December\.”/);
assert.match(await p.textContent("#result details summary"), /2 charges stayed the same/);
const qs = await p.$$eval("#qs li", (x) => x.map((l) => l.textContent)); assert.equal(qs.length, 7, qs.join("\n"));
assert.ok(qs.includes("The bill went up by $38.50, but the charges listed account for +$33.50. What's the other $5.00?"));
await p.click("#copy"); await p.waitForFunction(() => /Copied/.test(document.querySelector("#c-st").textContent));
const clip = await p.evaluate(() => navigator.clipboard.readText()); assert.match(clip, /^Northwind Mobile, November 2026 bill:\n1\. “Unlimited Plus plan/);
ok("the next month, from a file, lined up against it: up, new, a promo ended, a heads-up, $5.00 the lines don't explain, seven questions, copied");

// the months; an earlier one; replacing and removing
assert.deepEqual(await p.$$eval("#months .row b", (x) => x.map((t) => t.textContent)), ["November 2026", "October 2026"]);
assert.match(await p.textContent("#months .row:first-child"), /\$135\.10[\s\S]*\+\$38\.50/);
await p.click("#months .row:nth-child(2) button.open"); await p.waitForFunction(() => /October 2026's bill/.test(document.querySelector("#headline").textContent));
await p.fill("#m-month", "2026-11"); await p.fill("#m-text", NOV.replace("Total current charges $135.10", "Total current charges $130.10")); await p.click("#go");
await p.waitForFunction(() => /Up \$33\.50 since October/.test(document.querySelector("#headline").textContent)); assert.ok(!/isn't on any line/.test(await p.textContent("#headline")), "now the lines explain it all");
assert.equal(await p.$$eval("#months .row", (x) => x.length), 2, "replaced, not added");
await p.fill("#m-month", "2026-12"); await p.fill("#m-text", "Dear customer, thank you for being with us.\nCall us any time."); await p.click("#go");
assert.match(await p.textContent("#st"), /couldn't find any charges/); assert.equal(await p.$$eval("#months .row", (x) => x.length), 2);
ok("each month listed with its change; an earlier one opens; a month is replaced, not doubled; something that isn't a bill says so");

await p.reload(); await p.waitForSelector("#accts .row"); assert.match(await p.textContent("#accts"), /Northwind Mobile[\s\S]*November 2026: \$130\.10[\s\S]*\+\$33\.50/);
await p.click("#accts button.open"); await p.waitForSelector("#headline"); await p.click("#months .row:first-child [data-rm]"); await p.waitForFunction(() => document.querySelectorAll("#months .row").length === 1);
assert.match(await p.textContent("#headline"), /October 2026's bill/);
ok("after a reload it's all there, with the change on the list; removing a month goes back to the one before");

assert.deepEqual(off, [], "nothing left the page"); assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
