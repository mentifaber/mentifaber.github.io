// The home page in Chromium: a first visit finds five benches to start with, each opening the running thing; the Show chips
// sort the plan (what's left out goes dim and out of reach of the keyboard), the counts on the chips match the plan, and
// Find and the arrow keys are on the page, not only in the footer.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
const ok = (m) => console.log("ok", DEV, m);
await p.goto("http://localhost:8099/index.html"); await p.waitForSelector(".bench");

// start here
const picks = await p.$$eval(".picks .pick", (xs) => xs.map((x) => ({ n: x.querySelector("h3").textContent, open: x.querySelector(".key.pri").getAttribute("href"), tag: x.querySelector(".tag").textContent })));
assert.equal(picks.length, 5); assert.ok(picks.every((x) => x.tag === "live" && /#app$/.test(x.open)), JSON.stringify(picks));
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no sideways scroll");
ok("Start here: " + picks.map((x) => x.n).join(", ") + ", each opens the running thing");

// the chips' counts are the plan's
const counts = await p.$$eval(".sift [data-show]", (xs) => Object.fromEntries(xs.map((x) => [x.dataset.show, +x.querySelector("b").textContent])));
const plan = await p.$$eval(".floor .bench", (xs) => ({ all: xs.length, live: xs.filter((x) => x.dataset.k === "live").length, private: xs.filter((x) => x.dataset.k === "private").length, install: xs.filter((x) => "inst" in x.dataset).length }));
for (const k of Object.keys(plan)) assert.equal(counts[k], plan[k], k);
const say = await p.textContent(".tb-say"); assert.ok(say.includes(plan.all + " things") && say.includes(plan.live + " of them running"), say);
ok("the chips count what the plan holds, and the title block agrees: " + JSON.stringify(counts));

// show: private only
await p.click('[data-show="private"]');
assert.equal(await p.$$eval(".benches li:not([inert])", (xs) => xs.length), plan.private);
assert.match(await p.textContent(".sift output"), new RegExp("^" + plan.private + " of " + plan.all));
assert.equal(await p.getAttribute('[data-show="private"]', "aria-pressed"), "true");
if (DEV === "desktop") { await p.keyboard.press("ArrowRight"); for (let i = 0; i < 4; i++) { await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowDown"); }
  assert.equal(await p.evaluate(() => document.activeElement.dataset.k), "private", "the arrows only walk the benches on show"); }
await p.reload(); await p.waitForSelector(".bench");
assert.equal(await p.getAttribute('[data-show="private"]', "aria-pressed"), "true", "the choice holds for the visit");
await p.click('[data-show="all"]'); assert.equal(await p.$$eval(".benches li[inert]", (xs) => xs.length), 0);
ok("Show sorts the plan and the keyboard follows it; Everything brings it all back");

// find is on the page
await p.click(".sift [data-find]"); assert.ok(await p.isVisible(".find input")); await p.fill(".find input", "tether");
assert.match(await p.textContent(".find ol"), /Tether/); await p.keyboard.press("Escape");
ok("Find a bench: on the page, finds by name");
assert.equal(await p.$$eval(".bench .sr", (xs) => xs.length), plan.all); ok("every bench says its status to a screen reader");

assert.deepEqual(errs, []); await b.close();
