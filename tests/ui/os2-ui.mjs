// FaberOS 0.2 in Chromium: the command bar opens apps by what they do and runs commands (tile, close all) or hands the rest
// to AutoFaber; a window let go at the left edge snaps to half the screen; an app's notification (through the Faber kit)
// reaches the bell; the Shelf keeps a file in this browser and opens it in an app that declares it can take it (DocCrawler),
// and DocCrawler's export, inside FaberOS, lands back on the Shelf.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.addInitScript(() => { try { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.2"'); localStorage.setItem("fos:grants", '{"hive":"basic"}'); } catch (e) {} });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const cmd = async (text) => { await p.click("#ask-in"); await p.fill("#ask-in", text); await p.waitForSelector("#sug:not([hidden]) li"); return p.$$eval("#sug li", (xs) => xs.map((x) => x.textContent)); };
const frameOf = async (id) => (await (await p.$(".win[data-id='" + id + "'] iframe")).contentFrame());
await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");
assert.equal(await p.$$eval(".win", (x) => x.length), 0, "no About once it's been seen");

// the command bar
let s = await cmd("open budget"); assert.match(s[0], /Open Ballast/, JSON.stringify(s)); await p.press("#ask-in", "Enter"); await p.waitForSelector(".win[data-id='ballast']");
s = await cmd("cartograph"); assert.match(s[0], /Open Cartograph/); await p.press("#ask-in", "Enter"); await p.waitForSelector(".win[data-id='cartograph']");
s = await cmd("why is the sky blue"); assert.match(s[0], /Ask AutoFaber: why is the sky blue/);
await p.press("#ask-in", "Escape"); assert.equal(await p.isHidden("#sug"), true);
ok("the command bar: \"open budget\" and \"cartograph\" open their apps; a question goes to AutoFaber; Escape closes the list");

if (!M) {
  s = await cmd("tile windows"); assert.match(s[0], /Tile the open windows/); await p.press("#ask-in", "Enter");
  const r = await p.$$eval(".win", (ws) => ws.map((w) => [w.offsetLeft, w.offsetTop, w.offsetWidth]));
  assert.equal(r.length, 2); assert.notEqual(r[0][0], r[1][0], "side by side"); assert.ok(r.every((x) => x[2] > 300));
  const bar = await (await p.$(".win[data-id='ballast'] .win-bar b")).boundingBox(), desk = await (await p.$("#windows")).boundingBox();
  await p.mouse.move(bar.x + 30, bar.y + 8); await p.mouse.down(); await p.mouse.move(desk.x + 3, bar.y + 40, { steps: 8 }); await p.mouse.up();
  const w = await p.$eval(".win[data-id='ballast']", (x) => [x.offsetLeft, x.offsetTop, x.offsetWidth]);
  assert.deepEqual([w[0], w[1]], [0, 0]); assert.ok(Math.abs(w[2] - desk.width / 2) < 3, JSON.stringify([w, desk.width]));
  ok("\"tile windows\" lays them side by side; a window let go at the left edge takes the left half");
}

// an app that takes focus by itself (as it loads) stays where it is; clicking into a window's app brings it forward
if (!M) {
  await p.click("#dock-apps [data-app='cartograph']").catch(() => {}); if (!(await p.$eval(".win[data-id='cartograph']", (w) => w.classList.contains("focus")))) await p.click("#dock-apps [data-app='cartograph']");
  const bf = await frameOf("ballast"); await bf.evaluate(() => { const x = document.querySelector("input, button, [tabindex]"); window.focus(); if (x) x.focus(); });
  await p.waitForTimeout(150); assert.ok(await p.$eval(".win[data-id='cartograph']", (w) => w.classList.contains("focus")), "a background app that grabs focus doesn't jump in front");
  const vis = await p.evaluate(() => { const b = document.querySelector(".win[data-id='ballast'] iframe").getBoundingClientRect(), c = document.querySelector(".win[data-id='cartograph']").getBoundingClientRect();
    for (let y = b.top + 20; y < b.bottom - 10; y += 20) for (let x = b.left + 20; x < b.right - 10; x += 20) if (!(x >= c.left && x <= c.right && y >= c.top && y <= c.bottom)) return [x, y]; return null; });
  assert.ok(vis, "some of Ballast shows"); await p.mouse.move(vis[0] - 40, vis[1]); await p.mouse.move(vis[0], vis[1], { steps: 4 }); await p.mouse.click(vis[0], vis[1]);
  await p.waitForFunction(() => document.querySelector(".win[data-id='ballast']").classList.contains("focus"), null, { timeout: 3000 });
  ok("a background app that takes focus by itself stays behind; a click into it brings it forward");
}

// a notification from an app, through the Faber kit
await p.click("#all-btn"); await p.fill("#l-q", "doccrawler"); await p.keyboard.press("Enter"); await p.waitForSelector(".win[data-id='doccrawler'] iframe");
const dc = await frameOf("doccrawler"); await dc.waitForFunction(() => window.Faber && window.Faber.inOS === true);
await p.click("#dock-apps [data-app='ballast']").catch(() => {}); if (!(await p.$eval(".win[data-id='ballast']", (w) => w.classList.contains("focus")))) await p.click("#dock-apps [data-app='ballast']");
await p.click("#bell"); await p.click("#notes-clear"); await p.click("#bell"); // start from none (a newer FaberOS adds its own "what's new")
await dc.evaluate(() => Faber.notify("Indexed", "3 files are ready to search"));
await p.waitForSelector("#badge:not([hidden])"); assert.equal(await p.textContent("#badge"), "1");
await p.click("#bell"); assert.match(await p.textContent("#notes"), /Indexed[\s\S]*3 files are ready[\s\S]*DocCrawler/); assert.equal(await p.isHidden("#badge"), true, "read once seen");
await p.click("#notes [data-n]"); assert.ok(await p.$eval(".win[data-id='doccrawler']", (w) => w.classList.contains("focus")), "a notification opens its app");
ok("an app's notification reaches the bell with a count; opening it marks it read and brings the app forward");

// the Shelf: keep a file, open it in DocCrawler
await p.click("#menu-btn"); await p.click("#menu [data-open='shelf']"); await p.waitForSelector(".win[data-id='shelf'] #shelf-in", { state: "attached" });
await p.setInputFiles(".win[data-id='shelf'] #shelf-in", { name: "field-notes.txt", mimeType: "text/plain", buffer: Buffer.from("The quokka lives on Rottnest Island and smiles for photographs.") });
await p.waitForSelector(".win[data-id='shelf'] [data-with='doccrawler']");
assert.match(await p.textContent(".win[data-id='shelf']"), /field-notes\.txt/);
await p.click(".win[data-id='shelf'] [data-with='doccrawler']");
await dc.waitForFunction(() => document.body.textContent.includes("field-notes.txt"), null, { timeout: 15000 });
ok("a file put on the Shelf opens in DocCrawler, which reads it into its library");

// DocCrawler's export lands on the Shelf
await dc.click("#export"); await p.waitForFunction(() => document.querySelector(".win[data-id='shelf']") && document.querySelector(".win[data-id='shelf']").textContent.includes("doccrawler-library.json"), null, { timeout: 10000 });
assert.match(await p.textContent(".win[data-id='shelf']"), /from DocCrawler/);
ok("inside FaberOS, DocCrawler's export is saved to the Shelf, marked as from DocCrawler");

// close all
s = await cmd("close all"); assert.match(s[0], /Close every window/); await p.press("#ask-in", "Enter"); assert.equal(await p.$$eval(".win", (x) => x.length), 0);
await p.reload(); await p.waitForSelector("#icons .ic"); assert.equal(await p.$$eval(".win", (x) => x.length), 0, "and they stay closed");
await p.click("#icons [data-app='shelf']"); await p.waitForSelector(".win[data-id='shelf'] .shelf-row"); assert.equal(await p.$$eval(".win[data-id='shelf'] .shelf-row", (x) => x.length), 2, "the Shelf keeps its files across a reload");
ok("\"close all\" closes every window; the Shelf still has both files after a reload");
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
assert.deepEqual(errs.filter((e) => !/Service worker|offline|Failed to fetch|NetworkError/.test(e)), []);
ok("no page errors, no sideways scroll");
await b.close();
