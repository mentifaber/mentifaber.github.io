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
// the lantern follows the pointer by moving only itself: its --lx/--ly sit on .lantern, not on the whole floor (which made every
// bench restyle on each mouse move and cost the page its responsiveness)
if (DEV === "desktop") {
  const box = await p.$eval(".floor", (f) => { const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(r.top, 0) + 120 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.move(box.x + 40, box.y + 20, { steps: 4 }); await p.waitForTimeout(150);
  const lt = await p.evaluate(() => { const f = document.querySelector(".floor"), l = f.querySelector(".lantern"); return { on: f.classList.contains("lantern-on"), lx: l && l.style.getPropertyValue("--lx"), floorLx: f.style.getPropertyValue("--lx") }; });
  assert.ok(lt.on && /px$/.test(lt.lx) && !lt.floorLx, JSON.stringify(lt));
  ok("the lantern moves by itself: its position is on the lantern, not on the floor");
}

// the walls are drawn on the rooms, not 40px below them through the room names, including while they're drafted in on a first visit
const ink = await p.evaluate(() => { const s = document.querySelector(".ink"), F = document.querySelector(".floor").getBoundingClientRect(), m = s.getScreenCTM(); return { drafting: /drafting/.test(s.getAttribute("class")), scale: m.a, dx: m.e - F.left, dy: m.f - F.top }; });
assert.ok(Math.abs(ink.scale - 1) < 0.01 && Math.abs(ink.dx) < 1 && Math.abs(ink.dy) < 1, JSON.stringify(ink)); ok("the walls sit on the rooms" + (ink.drafting ? ", even while they're drafted in" : ""));

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
if (DEV === "desktop") { await p.keyboard.press("ArrowRight"); assert.ok(!(await p.evaluate(() => !!document.activeElement.closest(".benches"))), "with nothing focused the arrows are the page's (they don't grab a bench)");
  await p.focus(".benches li:not([inert]) .bench"); for (let i = 0; i < 4; i++) { await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowDown"); }
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

// AutoFaber's datasheet: something to try, who gets what, and what it may do on its own, without widening a phone
await p.goto("http://localhost:8099/hive.html"); await p.waitForSelector(".sec");
const heads = await p.$$eval(".sec h2", (xs) => xs.map((x) => x.textContent.replace(/^\d+/, "")));
for (const h of ["Try it", "Ratings", "Interlocks"]) assert.ok(heads.includes(h), heads.join(", "));
assert.equal(await p.$$eval(".tries .key.pri", (xs) => xs.filter((x) => /^hive-app\.html#(studio|swarm)$/.test(x.getAttribute("href"))).length), 4);
assert.ok(await p.$$eval(".rate tbody tr", (xs) => xs.length) >= 8);
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no sideways scroll on the datasheet");
ok("AutoFaber's datasheet: " + heads.filter((h) => ["Try it", "Ratings", "Interlocks"].includes(h)).join(", ") + ", and it fits the screen");

// AutoFaber with its server failing (Cloudflare's 1101): the page says so, and Ask explains instead of doing nothing
const p2 = await ctx.newPage(); await p2.route(/\/api\//, (rt) => rt.fulfill({ status: 500, contentType: "text/plain", body: "error code: 1101" }));
await p2.goto("http://localhost:8099/hive-app.html"); await p2.waitForFunction(() => document.getElementById("t-link").textContent === "server down");
assert.match(await p2.textContent("#esub"), /isn't answering/); assert.equal(await p2.textContent("#t-models"), "unreachable");
await p2.fill("#inp", "hello"); await p2.click("#sendb"); await p2.waitForFunction(() => /answering/.test(document.getElementById("toast").textContent));
assert.match(await p2.textContent("#toast"), /isn't answering/); assert.equal(await p2.inputValue("#inp"), "hello");
ok("AutoFaber with its server down: the lights say so, Ask explains and keeps the message");

// the 3D atlases and the old home-page preview were retired: nothing links to them, and their old addresses send people to the home page
{ const fs = await import("node:fs"), REPO = process.argv[2] || new URL("../..", import.meta.url).pathname;
  for (const f of ["atlas.html", "atlas-classic.html", "workshop.html"]) assert.ok(!fs.existsSync(REPO + "/" + f), f + " is gone");
  const linked = fs.readdirSync(REPO).filter((f) => f.endsWith(".html")).filter((f) => /href="\/?atlas(-classic)?(\.html)?["#]/.test(fs.readFileSync(REPO + "/" + f, "utf8")));
  assert.deepEqual(linked, [], "pages still linking the old atlas");
  const rd = fs.readFileSync(REPO + "/_redirects", "utf8"); for (const u of ["/atlas", "/atlas.html", "/atlas-classic", "/atlas-classic.html", "/workshop", "/workshop.html"]) assert.match(rd, new RegExp("^" + u.replace(".", "\\.") + " / 301$", "m"), u); }
ok("the old atlases and the old preview are gone: no page links them, and their addresses redirect to the home page");
assert.deepEqual(errs, []); await b.close();
