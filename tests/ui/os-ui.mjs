// FaberOS (os.html) in Chromium: the manifest loads; About opens on a first visit; the launcher finds an app and opens it in a
// window whose iframe may use only what its manifest declares; an app that uses something sensitive asks first, and
// "Open without them" keeps those out of the frame; windows focus, minimize, maximize, close and come back after a reload;
// the Ask bar opens AutoFaber; Settings changes a permission answer; on a phone one app fills the screen at a time.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
const toFront = async (id) => { if (!(await p.$eval(".win[data-id='" + id + "']", (w) => w.classList.contains("focus")))) await p.click("#dock-apps [data-app='" + id + "']"); };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const man = await (await fetch("http://localhost:8099/assets/os/apps.json")).json();
assert.equal(man.format, "faberos/1"); const orbit = man.apps.find((a) => a.id === "orbit"), ballast = man.apps.find((a) => a.id === "ballast");
assert.ok(orbit.permissions.includes("geolocation") && !ballast.permissions.includes("geolocation") && !ballast.permissions.includes("camera"));
assert.ok(man.apps.every((a) => a.id && a.name && a.status && a.platforms && Array.isArray(a.permissions)), "every entry is a whole manifest");
ok("the manifest: " + man.apps.length + " apps, each declaring where it runs and what it may use");

await p.goto("http://localhost:8099/os.html"); await p.waitForSelector(".win[data-id='about']");
assert.match(await p.textContent(".win[data-id='about']"), /Mentifaber[\s\S]*AutoFaber[\s\S]*FaberOS[\s\S]*Foundry/);
assert.ok((await p.$$("#dock-apps button")).length >= 5); assert.ok((await p.$$("#icons .ic")).length >= 5);
ok("a first visit opens About: the four layers; the dock and the desktop hold the pinned apps");

// the launcher finds an app and opens it, with only its own permissions
await p.keyboard.press("Control+k"); await p.waitForSelector("#launcher:not([hidden])");
assert.equal(await p.evaluate(() => document.activeElement.id), "l-q");
await p.fill("#l-q", "budget"); assert.ok(await p.isVisible(".la[data-app='ballast']")); await p.keyboard.press("Enter");
await p.waitForSelector(".win[data-id='ballast'] iframe"); assert.equal(await p.isHidden("#launcher"), true);
const allow = await p.getAttribute(".win[data-id='ballast'] iframe", "allow");
assert.ok(!/camera|microphone|geolocation/.test(allow), allow); assert.match(await p.getAttribute(".win[data-id='ballast'] iframe", "src"), /ballast-app\.html/);
ok("Ctrl K, \"budget\", Enter: Ballast opens in a window whose frame gets no camera, microphone or location");

// something sensitive asks first
await p.click("#all-btn"); await p.fill("#l-q", "overhead satellite"); await p.click(".la[data-app='orbit']");
await p.waitForSelector("#consent:not([hidden])"); assert.match(await p.textContent("#consent"), /your location/);
await p.click("#c-no"); await p.waitForSelector(".win[data-id='orbit'] iframe");
assert.ok(!/geolocation/.test(await p.getAttribute(".win[data-id='orbit'] iframe", "allow")), "said no: no location in the frame");
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("fos:grants")).orbit), "basic");
ok("Overhead asks before it may use your location; \"Open without them\" opens it without");

// window controls
assert.equal(await p.textContent("#bar-title"), (await p.getAttribute(".win.focus", "aria-label")));
await p.click(".win[data-id='orbit'] [data-w='min']"); assert.ok(await p.$eval(".win[data-id='orbit']", (w) => w.classList.contains("min")));
await p.click("#dock-apps [data-app='orbit']"); assert.ok(await p.$eval(".win[data-id='orbit']", (w) => w.classList.contains("focus") && !w.classList.contains("min")));
if (!M) { await p.click(".win[data-id='orbit'] [data-w='max']"); assert.ok(await p.$eval(".win[data-id='orbit']", (w) => w.classList.contains("max"))); await p.click(".win[data-id='orbit'] [data-w='max']");
  const box = await p.$eval(".win[data-id='ballast']", (w) => [w.offsetLeft, w.offsetTop]); await p.click(".win[data-id='ballast'] .win-bar b");
  const bar = await p.$(".win[data-id='ballast'] .win-bar b"), bb = await bar.boundingBox(); await p.mouse.move(bb.x + 20, bb.y + 8); await p.mouse.down(); await p.mouse.move(bb.x + 140, bb.y + 90, { steps: 5 }); await p.mouse.up();
  const after = await p.$eval(".win[data-id='ballast']", (w) => [w.offsetLeft, w.offsetTop]); assert.ok(after[0] > box[0] + 80 && after[1] > box[1] + 50, JSON.stringify([box, after])); }
ok("minimize, back from the dock" + (M ? "" : ", maximize, and a window dragged by its bar"));

// they come back after a reload
await p.reload(); await p.waitForSelector(".win[data-id='orbit']", { state: "attached" }); await p.waitForSelector(".win[data-id='ballast']", { state: "attached" });
assert.equal(await p.$$eval(".win[data-id='about']", (x) => x.length), 1, "About comes back too, but only once");
ok("the open windows come back after a reload");

// close
await toFront("ballast"); await p.click(".win[data-id='ballast'] [data-w='close']"); assert.equal(await p.$$eval(".win[data-id='ballast']", (x) => x.length), 0);
ok("close removes the window and the next one comes to the front");

// Settings: the answer can change
await p.click("#menu-btn"); await p.click("#menu [data-open='settings']"); await p.waitForSelector(".win[data-id='settings'] [data-perm='orbit']");
assert.equal((await p.textContent(".win[data-id='settings'] [data-perm='orbit']")).trim(), "Not allowed"); await p.click(".win[data-id='settings'] [data-perm='orbit']");
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("fos:grants")).orbit), "all");
await toFront("orbit"); await p.click(".win[data-id='orbit'] [data-w='close']"); await p.click("#dock-apps [data-app='orbit']"); await p.waitForSelector(".win[data-id='orbit'] iframe");
assert.match(await p.getAttribute(".win[data-id='orbit'] iframe", "allow"), /geolocation/);
ok("Settings: allowing Overhead's location applies the next time it opens");

// Ask AutoFaber
await p.fill("#ask-in", "what's up tonight?"); await p.press("#ask-in", "Enter");
await p.waitForSelector("#consent:not([hidden])"); assert.match(await p.textContent("#consent"), /microphone/); await p.click("#c-yes"); await p.waitForSelector(".win[data-id='hive'] iframe");
assert.match(await p.getAttribute(".win[data-id='hive'] iframe", "allow"), /microphone/); assert.match(await p.textContent(".win[data-id='hive'] .perm"), /microphone/);
assert.match(await p.getAttribute(".win[data-id='hive'] iframe", "src"), /hive-app\.html\?ask=what/);
ok("the Ask bar opens AutoFaber with the question, after asking once about its camera and microphone; the window shows what it may use");

if (M) { assert.equal(await p.$$eval(".win", (ws) => ws.filter((w) => getComputedStyle(w).display !== "none").length), 1, "one app at a time on a phone");
  const r = await p.$eval(".win.focus", (w) => { const b = w.getBoundingClientRect(); return [b.left, b.width]; }); assert.equal(r[0], 0); assert.equal(Math.round(r[1]), 390);
  await p.click("#home-btn"); assert.equal(await p.$$eval(".win", (ws) => ws.filter((w) => getComputedStyle(w).display !== "none").length), 0);
  ok("on a phone one app fills the screen at a time, and Home shows the desktop"); }
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no sideways scroll");
assert.deepEqual(errs.filter((e) => !/Service worker|offline/.test(e)), []);
ok("no page errors, no sideways scroll");
await b.close();
