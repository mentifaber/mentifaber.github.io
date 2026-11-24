// The maps need no key and no tile service: Unlit, Overhead and Per Capita draw land, borders and country names from the
// site's own Natural Earth data (assets/maps) with the site's own Leaflet, even with every other host unreachable. No map
// asks CARTO for tiles (its free tiles show "API key required" since 25 September 2026). Close in, the detailed map
// loads. Each app's header carries its current name. And the Services page builds a quote request.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1366, height: 860 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
const asked = []; await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => { asked.push(rt.request().url()); rt.abort(); });
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const errs = [];
const open = async (pg) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(pg + ": " + e.message)); await p.goto("http://localhost:8099/" + pg); return p; };
const drawn = (p) => p.waitForFunction(() => document.querySelectorAll(".leaflet-fmLand-pane canvas").length > 0 && document.querySelectorAll(".fm-label").length > 0, null, { timeout: 8000 });

const ca = await open("conflict-atlas-app.html"); await drawn(ca);
assert.equal(await ca.isHidden("#nomap"), true, "no 'map couldn't start' notice");
assert.match(await ca.textContent("header .logo"), /^Unlit$/);
assert.ok(await ca.evaluate(() => [...document.querySelectorAll(".fm-label")].some((x) => /SUDAN|UKRAINE|RUSSIA|IRAN/i.test(x.textContent))), "country names on the map");
assert.ok(await ca.evaluate(() => document.querySelectorAll(".leaflet-interactive").length >= 20), "the conflicts are marked");
ok("Unlit draws its own map (land, borders, names) with every outside host blocked, and marks the conflicts");

const res = await ca.evaluate(async () => { const r = await fetch("assets/maps/world-50m.json"); const w = await r.json(); return [r.ok, w.land.length, w.labels.length]; });
assert.ok(res[0] && res[1] > 1000 && res[2] > 200, JSON.stringify(res));
ok("the detailed map (1:50m) is there for close in");

const ow = await open("orbit-app.html"); await drawn(ow);
assert.equal(await ow.isHidden("#nomap"), true); assert.match(await ow.textContent("header .logo"), /^Overhead$/);
ok("Overhead draws its own map too, under its current name");

const pc = await open("crime-dashboard-app.html"); await drawn(pc);
ok("Per Capita has the site's map under its imagery, so it still has land when the imagery can't load");

assert.deepEqual(asked.filter((u) => /cartocdn|carto\.com/.test(u)), [], "nothing asks CARTO");
assert.deepEqual(asked.filter((u) => /leaflet/.test(u)), [], "Leaflet comes from the site itself");
ok("no map asks CARTO for tiles, and Leaflet is the site's own copy");
const perms = await pc.evaluate(async () => Object.fromEntries((await (await fetch("assets/os/apps.json")).json()).apps.map((a) => [a.id, a.permissions])));
assert.ok(!perms["conflict-atlas"].includes("geolocation") && !perms["crime-dashboard"].includes("geolocation"), JSON.stringify(perms["conflict-atlas"]));
assert.ok(perms.orbit.includes("geolocation"), "Overhead still may ask, for passes over you");
ok("serving Leaflet from the site doesn't hand its maps location access they don't use (Overhead, which does, keeps it)");

const sv = await open("services.html#hosting");
assert.equal(await sv.$$eval(".svc", (x) => x.length), 5);
assert.equal(await sv.getAttribute("#chips .chip[aria-pressed='true']", "aria-pressed") && await sv.textContent("#chips .chip[aria-pressed='true']"), "Web hosting", "a link to #hosting picks hosting");
await sv.click("#websites [data-svc]"); assert.equal(await sv.textContent("#chips .chip[aria-pressed='true']"), "Websites");
await sv.click("button[type=submit]"); assert.match(await sv.textContent("#status"), /Say a little/);
await sv.fill("#what", "example.com"); await sv.fill("#msg", "A new site for my bakery"); await sv.fill("#from", "a@b.co");
await sv.click("button[type=submit]"); await sv.waitForFunction(() => /Opening your email app/.test(document.getElementById("status").textContent));
assert.equal(await sv.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
ok("Services: five lines of work, a link or a card's button picks the service in the quote form, and a filled request opens email");

assert.deepEqual(errs, []);
ok("no page errors");
await b.close();
