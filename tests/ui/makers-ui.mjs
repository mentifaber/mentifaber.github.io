// The makers' page (/makers) in Chromium, and its manifest checker (assets/os/validate.js):
//  - every one of the workshop's own apps, as FaberOS publishes them, passes the checker a maker uses
//  - the sample on the page passes, with a note that FaberOS will ask before granting location
//  - a bad manifest lists what to fix (a bad id, a permission FaberOS doesn't grant, a verb without a usable name or
//    with an unknown argument type) and the send button stays hidden; broken JSON says so
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const check = require(REPO + "/assets/os/validate.js"); let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const man = JSON.parse(fs.readFileSync(REPO + "/assets/os/apps.json"));
const fails = man.apps.filter((a) => a.entry).map((a) => [a.id, check({ ...a, format: "faberos/1", entry: "https://mentifaber.org/" + a.entry, cat: a.cat === "system" ? undefined : a.cat })]).filter(([, r]) => !r.ok);
assert.deepEqual(fails.map(([id, r]) => id + ": " + r.errors.join("; ")), []);
ok("all " + man.apps.filter((a) => a.entry).length + " of the workshop's own apps pass the checker a maker uses");

const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:8099/makers.html"); await p.click("#chk");
assert.match(await p.textContent("#out"), /✓ This manifest is ready for FaberOS\.[\s\S]*FaberOS will ask people before granting geolocation/); assert.equal(await p.isHidden("#send"), false);
ok("the sample manifest passes, with a note that location will be asked for; the send button appears");

await p.fill("#man", JSON.stringify({ id: "Bad Id", name: "X", desc: "A thing that does a thing for you.", entry: "https://x.example", permissions: ["bluetooth"], kit: true, verbs: [{ name: "Do It", label: "Do it", changes: false, args: { amount: "money" } }] }));
await p.click("#chk"); const out = await p.textContent("#out");
for (const want of [/id: 2 to 40 characters/, /"bluetooth" isn't one FaberOS grants/, /verbs\[0\]\.name: lowercase/, /verbs\[0\]\.args\.amount: number, string, date, boolean/]) assert.match(out, want);
assert.equal(await p.isHidden("#send"), true);
await p.fill("#man", "{ not json"); await p.click("#chk"); assert.match(await p.textContent("#out"), /isn't valid JSON/);
ok("a bad manifest lists what to fix (id, permission, verb name, argument type) and can't be sent; broken JSON says so");
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0); assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close();
