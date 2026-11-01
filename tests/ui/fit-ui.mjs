// The composer at every common width: every control (attach, the modes, voice, dictate, Ask, New) stays inside it, and
// the page never scrolls sideways; nor does any field or button in Settings (Skills) or Mind → Tasks run past the edge. On Nov 1 the Research button pushed Ask off the right edge on phones up to 430 px.
//   node fit-ui.mjs <repo> desktop|mobile   (both run every width; the device argument only picks touch emulation)
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", widths = DEV === "mobile" ? [320, 360, 375, 390, 412, 430] : [600, 768, 1024, 1280, 1440];
const b = await chromium.launch({ args: ["--no-proxy-server"] });
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
  await ctx.route(/\/api\//, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ models: [{ id: "auto|best", name: "Auto", group: "AutoFaber" }] }) }));
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  const p = await ctx.newPage(); await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForSelector("#sendb");
  const r = await p.evaluate(() => { const c = document.getElementById("composer").getBoundingClientRect(), edge = Math.min(c.right, innerWidth), out = [];
    for (const e of document.querySelectorAll("#composer button, #composer .tog")) { if (!e.offsetWidth || e.closest(".menu")) continue; const x = e.getBoundingClientRect(); if (x.right > edge + 0.5 || x.left < c.left - 0.5) out.push((e.id || e.textContent.trim()) + " ends at " + Math.round(x.right) + " of " + Math.round(edge)); }
    return { out, sideways: document.documentElement.scrollWidth - innerWidth }; });
  assert.deepEqual(r.out, [], w + " px: controls outside the composer"); assert.ok(r.sideways <= 1, w + " px scrolls sideways by " + r.sideways);
  // the Settings dialog (Skills lives there) and Mind → Tasks: no field or button past the right edge
  const past = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel + " input, " + sel + " select, " + sel + " textarea, " + sel + " button")].filter((e) => e.offsetWidth && !e.closest(".mtabs")).map((e) => (e.id || e.textContent.trim().slice(0, 24)) + " ends at " + Math.round(e.getBoundingClientRect().right)).filter((x) => +x.split(" ends at ")[1] > innerWidth + 0.5), sel);
  await p.evaluate(() => document.getElementById("settings").click()); await p.waitForSelector("#sdlg[open]"); assert.deepEqual(await past("#sdlg"), [], w + " px: Settings controls past the edge"); await p.evaluate(() => document.getElementById("ssave").click());
  await p.evaluate(() => { location.hash = "mind"; }); await p.waitForTimeout(300);
  await p.evaluate(() => { for (const id of ["m-locked"]) document.getElementById(id).classList.add("hidden"); document.getElementById("m-open").classList.remove("hidden"); for (const t of document.querySelectorAll(".mtp")) t.classList.toggle("hidden", t.id !== "mt-tasks"); });
  assert.deepEqual(await past("#mt-tasks"), [], w + " px: Tasks controls past the edge");
  await ctx.close();
}
console.log("ok", DEV, "every composer, Settings and Tasks control stays inside at " + widths.join(", ") + " px, with no sideways scroll");
await b.close(); console.log("all passed", DEV); process.exit(0);
