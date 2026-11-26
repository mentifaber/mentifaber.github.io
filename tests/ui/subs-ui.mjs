// Subscription Sweep (/subs) in Chromium. Every request off the page is refused and recorded: the statement never leaves.
//  - two monthly CSV exports chosen together (overlapping by a few days): every charge that comes back, the year's cost,
//    the price rise quoted, three video services flagged, what's due next; groceries, coffee and fuel are not in it
//  - "Cancel it": the letter quotes the charge and signs with the name given, and the saving is counted; "Not a
//    subscription" sets one aside; both are still there after a reload, and the statement isn't kept, only what was found
//  - the example; "Forget this sweep"
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8"); // as a11y-ui, on the results, not only the empty page
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [], off = [];
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => { off.push(rt.request().url()); rt.abort(); });
await ctx.route(/localhost:8099\/api\//, (rt) => { off.push(rt.request().url()); rt.abort(); });
const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

// statements: the last five months, ending today, as two exports (the second starts a few days before the first ends)
const now = new Date(), at = (back, d) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, d), fmt = (t) => { const x = new Date(t); return x.getUTCFullYear() + "-" + String(x.getUTCMonth() + 1).padStart(2, "0") + "-" + String(x.getUTCDate()).padStart(2, "0"); };
const all = [];
for (let back = 5; back >= 0; back--) {
  const c = (d, desc, amt) => { const t = at(back, d); if (t <= Date.now() - 864e5) all.push([t, desc, amt]); };
  c(3, "NETFLIX.COM 866-579-7172 CA", back > 2 ? 15.49 : 17.99); c(8, "SPOTIFY USA 8775576", 11.99); c(12, "HULU 877-8244858 CA", 7.99); c(15, "PAYPAL *DISNEYPLUS 4029357733", 13.99);
  c(6, "WHOLEFDS MKT #10234", [84.12, 131.4, 56.02, 102.77, 73.3, 61.5][back]); c(19, "WHOLEFDS MKT #10234", [61.5, 39.95, 120.33, 44.1, 98.7, 33.2][back]);
  for (const d of [2, 9, 10, 16, 23, 24]) c(d, "SQ *BLUE BOTTLE COFFEE", 5.75); // some weeks twice: not a weekly subscription c([4, 17, 9, 27, 14, 5][back], "SHELL OIL 57444", [41.2, 55.9, 38.05, 61.4, 47.75, 52.1][back]);
}
const csv = (rows) => "Date,Description,Amount\n" + rows.map(([t, d, a]) => fmt(t) + ',"' + d + '",' + (-a).toFixed(2)).join("\n") + "\n";
const cut = at(2, 10), A = csv(all.filter((r) => r[0] < cut + 5 * 864e5)), B = csv(all.filter((r) => r[0] >= cut));

try {
  await p.goto("http://localhost:8099/subs.html"); assert.equal(await p.isHidden("#out"), true);
  await p.setInputFiles("#files", [{ name: "june-sept.csv", mimeType: "text/csv", buffer: Buffer.from(A) }, { name: "sept-nov.csv", mimeType: "text/csv", buffer: Buffer.from(B) }]);
  await p.waitForSelector("#out:not([hidden])"); await p.waitForSelector("#subs .card");
  const names = await p.$$eval("#subs .card .nm", (x) => x.map((e) => e.textContent)); assert.deepEqual([...names].sort(), ["Disney+", "Hulu", "Netflix", "Spotify"], "found: " + names);
  assert.equal(names[0], "Netflix", "the dearest first");
  const year = Math.round((17.99 + 11.99 + 7.99 + 13.99) * 12); assert.match(await p.textContent("#sum"), new RegExp("^4charges that come back\\$" + Math.round(year / 12) + "a month\\$" + year.toLocaleString("en-US") + "a year$"));
  const nf = p.locator(".card", { hasText: "Netflix" }); assert.match(await nf.textContent(), /\$17\.99 monthly[\s\S]*\$216 a year · 6 charges since/); assert.match(await nf.textContent(), /Went up from \$15\.49 to \$17\.99 on .* \(16% more\)/);
  assert.match(await p.textContent("#overlaps"), /3 video streaming subscriptions: Netflix, Disney\+, Hulu, \$480 a year together/);
  assert.equal(await p.$$eval("#due li", (x) => x.length) >= 3, true); assert.match(await nf.textContent(), /6 charges/, "a charge on both exports counts once");
  ok("two monthly exports together: every charge that comes back with its year's cost, Netflix's rise quoted, three video services flagged, what's due next; groceries, coffee and fuel left out");

  await p.fill("#me", "Ann Lee"); await p.press("#me", "Tab"); await p.fill("#acct", "ann@example.com"); await p.press("#acct", "Tab");
  await p.locator(".card", { hasText: "Hulu" }).locator("[data-m=cancel]").click(); await p.waitForSelector(".card.cancel textarea");
  const letter = await p.inputValue(".card.cancel textarea"); assert.match(letter, /cancel my subscription with Hulu, which charges \$7\.99 monthly/); assert.match(letter, /Account: ann@example\.com/); assert.match(letter, /Ann Lee\n$/);
  assert.match(await p.textContent("#sum .save"), /\$96a year saved by cancelling 1/);
  await p.locator(".card", { hasText: "Spotify" }).locator("[data-m=not]").click(); await p.waitForSelector("#not-box:not([hidden])"); assert.match(await p.textContent("#not"), /Spotify/);
  assert.equal(await p.$$eval("#subs .card", (x) => x.length), 3);
  await p.reload(); await p.waitForSelector("#subs .card.cancel"); assert.match(await p.textContent("#not"), /Spotify/); assert.equal(await p.inputValue("#me"), "Ann Lee");
  const kept = await p.evaluate(() => localStorage.getItem("subs:last")); assert.ok(!/WHOLEFDS|BLUE BOTTLE|SHELL/.test(kept), "the statement isn't kept, only what was found");
  ok("cancelling one: a letter quoting the charge, signed with her name, and the saving counted; one set aside as not a subscription; both kept after a reload, but not the statement");
  await p.addScriptTag({ content: AXE }); const v = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; ")));
  assert.deepEqual(v, []); ok("axe finds nothing on the results, with a letter open");

  await p.click("#forget"); assert.equal(await p.isHidden("#out"), true); assert.equal(await p.evaluate(() => localStorage.getItem("subs:last")), null);
  await p.click("#example"); await p.click("#f button[type=submit]"); await p.waitForSelector("#subs .card"); assert.deepEqual((await p.$$eval("#subs .card .nm", (x) => x.map((e) => e.textContent))).sort(), ["Apple (App Store, iCloud)", "Disney+", "Hulu", "Netflix", "Planet Fitness", "Spotify"], "not the groceries or fuel");
  assert.match(await p.textContent("#gone"), /Peloton/, "the example's lapsed one is under Stopped");
  ok("forgetting the sweep; the example finds its subscriptions, and its cancelled gym is under Stopped");

  assert.deepEqual(off, [], "nothing left the page: " + off.join(", ")); assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
