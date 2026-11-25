// FaberOS 0.3 in Chromium: AutoFaber acts. Common phrasings are read on the device ("put Overhead next to the Conflict
// Atlas" opens both side by side, "open ballast and doccrawler" opens both); anything else goes to AutoFaber
// (/api/hive/os/plan), and only actions naming apps in FaberOS's manifest run. Ballast and CryptoVault use the Shelf:
// Ballast's backup lands there and restores from it; CryptoVault puts only encrypted output there and opens .cv files
// from it to decrypt.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
const planned = [];
await ctx.route(/\/api\//, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" })); // routes match newest first: this one is the fallback
await ctx.route(/\/api\/hive\/os\/plan/, async (rt) => { planned.push(JSON.parse(rt.request().postData()));
  rt.fulfill({ contentType: "application/json", body: JSON.stringify({ actions: [{ do: "open", app: "evil-app" }, { do: "open", app: "ballast" }, { do: "open", app: "nullspace" }, { do: "snap", app: "ballast", side: "left" }, { do: "snap", app: "nullspace", side: "right" }, { do: "format", app: "ballast" }] }) }); });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.addInitScript(() => { try { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.3"'); localStorage.setItem("fos:grants", '{"hive":"basic","orbit":"basic","nullspace":"basic","cryptovault":"basic"}'); } catch (e) {} });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const cmd = async (text) => { await p.click("#ask-in"); await p.fill("#ask-in", text); await said(p.waitForSelector("#sug:not([hidden]) li"), "the top bar: " + text); return p.$$eval("#sug li", (xs) => xs.map((x) => x.textContent)); };
const frameOf = async (id) => { const f = await (await p.waitForSelector(".win[data-id='" + id + "'] iframe", { state: "attached" })).contentFrame(); if (!/^https?:/.test(f.url())) await f.waitForURL(/^https?:/); await f.waitForLoadState("domcontentloaded"); return f; }; // once the frame has left its blank first page
// on a failed wait, say what FaberOS looked like (windows, launcher, prompts, focus), then fail as before
const said = (pr, where) => pr.catch(async (e) => { const st = await p.evaluate(() => ({ wins: [...document.querySelectorAll(".win")].map((w) => w.dataset.id + " " + w.className), launcher: document.getElementById("launcher").hidden ? "closed" : "open: " + document.getElementById("l-q").value, consent: !document.getElementById("consent").hidden, confirm: !document.getElementById("vconfirm").hidden, toast: document.getElementById("toast").textContent, focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName) })).catch(() => "page gone"); console.log("state at " + where + ": " + JSON.stringify(st)); throw e; });
const geo = (id) => p.$eval(".win[data-id='" + id + "']", (w) => [w.offsetLeft, w.offsetWidth]);
await p.goto("http://localhost:8099/os.html"); await p.waitForSelector("#icons .ic");

// read on the device
let s = await cmd("put overhead next to the conflict atlas"); assert.match(s[0], /Overhead and Unlit, side by side/, JSON.stringify(s));
await p.press("#ask-in", "Enter"); await p.waitForSelector(".win[data-id='orbit']", { state: "attached" }); await p.waitForSelector(".win[data-id='conflict-atlas']", { state: "attached" });
if (!M) { const [a, c] = [await geo("orbit"), await geo("conflict-atlas")]; assert.equal(a[0], 0); assert.ok(c[0] >= a[1] - 2 && Math.abs(a[1] - c[1]) < 3, JSON.stringify([a, c])); }
assert.equal(planned.length, 0, "no model was asked");
s = await cmd("open ballast and doccrawler"); assert.match(s[0], /Open Ballast, DocCrawler/); await p.press("#ask-in", "Enter");
await p.waitForSelector(".win[data-id='ballast']", { state: "attached" }); await p.waitForSelector(".win[data-id='doccrawler']", { state: "attached" });
ok("\"put overhead next to the conflict atlas\" and \"open ballast and doccrawler\" are read on the device and done" + (M ? "" : ", side by side"));

// handed to AutoFaber
s = await cmd("set up my money tracker beside the mesh radio thing"); const i = s.findIndex((x) => /Let AutoFaber arrange it/.test(x)); assert.ok(i >= 0, JSON.stringify(s));
await p.click("#sug li:nth-child(" + (i + 1) + ")"); await p.waitForSelector(".win[data-id='nullspace']", { state: "attached" });
assert.equal(planned.length, 1); assert.equal(planned[0].text, "set up my money tracker beside the mesh radio thing");
assert.ok(planned[0].apps.some((a) => a.id === "ballast") && planned[0].apps.every((a) => a.id && a.name && !("permissions" in a)), "only ids, names and a short line go to AutoFaber");
assert.ok(planned[0].open.includes("orbit"));
assert.equal(await p.$$eval(".win[data-id='evil-app']", (x) => x.length), 0, "an app not in the manifest never opens");
if (!M) { const [l, r] = [await geo("ballast"), await geo("nullspace")]; assert.equal(l[0], 0); assert.ok(r[0] > 300); }
ok("anything else goes to AutoFaber; its plan runs, and an action naming an app FaberOS doesn't have is ignored");

// Ballast: the backup goes to the Shelf and comes back from it
s = await cmd("close all"); await p.press("#ask-in", "Enter");
await p.click("#all-btn"); await p.fill("#l-q", "ballast"); await p.keyboard.press("Enter"); await p.waitForSelector(".win[data-id='ballast'] iframe");
const bal = await frameOf("ballast"); await bal.waitForFunction(() => typeof exportBackup === "function" && window.Faber && Faber.inOS);
await bal.evaluate(() => exportBackup());
await p.waitForFunction(() => /Saved to the Shelf/.test(document.getElementById("toast").textContent)); // the app is in front, so it's read, not a badge
await p.click("#home-btn"); await p.click("#icons [data-app='shelf']");
await p.waitForSelector(".win[data-id='shelf'] [data-with='ballast']");
assert.match(await p.textContent(".win[data-id='shelf']"), /ballast-backup-\d{4}-\d\d-\d\d\.json[\s\S]*from Ballast/);
await p.click(".win[data-id='shelf'] [data-with='ballast']"); await bal.waitForFunction(() => /Backup imported/.test(document.body.textContent), null, { timeout: 8000 });
ok("inside FaberOS Ballast's backup lands on the Shelf, and \"Open in Ballast\" restores it");

// typing in the top bar while an app grabs focus (Ballast's first-run guide does, as it loads): the letters stay in the bar
await p.click("#ask-in"); await p.keyboard.type("open dw"); await bal.evaluate(() => document.querySelector("input, button").focus());
await p.waitForFunction(() => document.activeElement && document.activeElement.id === "ask-in", null, { timeout: 2000 }); await p.keyboard.type("ell");
assert.equal(await p.inputValue("#ask-in"), "open dwell"); await p.keyboard.press("Escape"); await p.fill("#ask-in", ""); await p.evaluate(() => document.getElementById("ask-in").blur());
ok("typing in the top bar keeps the keyboard when an app grabs focus as it loads");

// CryptoVault: only encrypted output, and .cv files open to decrypt; the launcher keeps the keyboard even when the app in
// front grabs focus while it's open
await p.click("#all-btn"); await p.fill("#l-q", "cryptovault");
await bal.evaluate(() => document.querySelector("input, button").focus()); // an app grabbing focus while the launcher is open (a first-run guide, say)
await p.waitForFunction(() => document.activeElement && document.activeElement.id === "l-q", null, { timeout: 2000 }); await p.keyboard.press("Enter"); await said(p.waitForSelector(".win[data-id='cryptovault'] iframe"), "opening CryptoVault");
const cv = await frameOf("cryptovault"); await cv.waitForFunction(() => typeof sealed === "function" && FOS.on === true);
await cv.evaluate(() => sealed(new Blob([new Uint8Array([0x43, 0x56, 1, 2, 3, 4])], { type: "application/octet-stream" }), "plans.pdf.cv"));
assert.match(await cv.textContent("#encSt"), /Shelf, still encrypted/);
await p.click("#dock-apps [data-app='shelf']").catch(() => {}); await p.waitForSelector(".win[data-id='shelf'] [data-with='cryptovault']");
await p.click(".win[data-id='shelf'] .shelf-row:has-text('plans.pdf.cv') [data-with='cryptovault']");
await cv.waitForFunction(() => !document.getElementById("t-dec").hidden && /plans\.pdf\.cv/.test(document.getElementById("decDrop").textContent), null, { timeout: 8000 });
assert.equal(await cv.evaluate(() => /FOS\.save|sealed\(/.test(document.getElementById("backup").onclick.toString())), false, "the key backup still only downloads");
ok("CryptoVault puts only encrypted output on the Shelf, and a .cv from the Shelf opens on its Decrypt tab");

assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
assert.deepEqual(errs.filter((e) => !/Service worker|offline|Failed to fetch|NetworkError/.test(e)), []);
ok("no page errors, no sideways scroll");
await b.close();
