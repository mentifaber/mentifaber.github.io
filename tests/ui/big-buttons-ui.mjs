// Big Buttons, in Chromium: every word fills its button, taps and spoken commands go to the right place, saved people
// can be called by name, and the settings panel's choices stick.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
// Record where the app would go instead of leaving the page
const watch = () => p.evaluate(() => { window.went = []; window.go = (url, said, id) => window.went.push([url, said, id]); });
await p.goto("http://localhost:8099/big-buttons.html"); await p.waitForTimeout(500); await watch();

const fit = await p.$$eval(".big", (bs) => bs.map((x) => { const w = x.querySelector(".word"); return [x.id, w.getBoundingClientRect().width / x.clientWidth, w.getBoundingClientRect().height <= x.clientHeight]; }));
for (const [id, share, fitsH] of fit) assert.ok(fitsH && share <= 0.95 && (share >= 0.8 || DEV === "desktop" && share >= 0.3), id + " " + share);
assert.equal(await p.$eval("#phone .word", (w) => getComputedStyle(w).fontFamily.split(",")[0].replace(/"/g, "")), "Atkinson Hyperlegible Next");
console.log("ok", DEV, "the four words fill their buttons:", fit.map(([id, s]) => id + " " + Math.round(s * 100) + "%").join(", "));

for (const id of ["phone", "search", "talk", "youtube"]) await p.click("#" + id);
assert.deepEqual((await p.evaluate(() => window.went)).map((w) => w[0]), ["tel:", "https://www.google.com", "https://mentifaber.org/talk", "https://www.youtube.com"]);
console.log("ok", DEV, "taps open the phone, Google, Talk and YouTube");

await watch();
await p.evaluate(() => ["phone", "Call 5 5 5 one two three four.", "search for pizza near me", "YouTube cat videos", "play some music", "let's talk", "what's the weather"].forEach(handle));
const went = await p.evaluate(() => window.went.map((w) => w[0]));
assert.deepEqual(went, ["tel:", "tel:5551234", "https://www.google.com/search?q=pizza%20near%20me", "https://www.youtube.com/results?search_query=cat%20videos", "https://www.youtube.com/results?search_query=some%20music", "https://mentifaber.org/talk"]);
assert.match(await p.textContent("#micText"), /what.s the weather/i);
await p.evaluate(() => { handle("search"); handle("dog parks"); });
assert.equal(await p.evaluate(() => window.went.at(-1)[0]), "https://www.google.com/search?q=dog%20parks");
console.log("ok", DEV, "spoken commands: numbers, Google and YouTube searches, Talk; “search” asks what for; nonsense is not acted on");

await p.click("#more"); assert.ok(await p.evaluate(() => document.getElementById("panel").open));
await p.fill("#cName", "Mom"); await p.fill("#cNum", "(555) 867-5309"); await p.click("#addForm .btn");
await p.check("#optHc"); assert.ok(await p.evaluate(() => document.documentElement.classList.contains("hc")));
await p.click("#done");
await p.reload(); await p.waitForTimeout(400); await watch();
assert.ok(await p.evaluate(() => document.documentElement.classList.contains("hc")), "high contrast survives a reload");
await p.evaluate(() => { handle("call mom"); handle("Mom"); handle("call Bob"); });
assert.deepEqual((await p.evaluate(() => window.went)).map((w) => w[0]), ["tel:5558675309", "tel:5558675309", "tel:"]);
console.log("ok", DEV, "a saved person is called by name, settings survive a reload, an unknown name opens the phone");

await p.keyboard.press("3"); assert.equal(await p.evaluate(() => window.went.at(-1)[0]), "https://mentifaber.org/talk");
console.log("ok", DEV, "keyboard shortcuts work");

assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
