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
// OpenStreetMap's close-in tiles answer (as they do live) with a stand-in 1x1 PNG, so the detail layer stays on the map
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
await ctx.route(/tile\.openstreetmap\.org/, (rt) => rt.fulfill({ contentType: "image/png", body: PNG }));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const errs = [];
const open = async (pg) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(pg + ": " + e.message)); await p.goto("http://localhost:8099/" + pg); return p; };
const drawn = (p) => p.waitForFunction(() => document.querySelectorAll(".leaflet-fmLand-pane canvas").length > 0 && document.querySelectorAll(".fm-label").length > 0, null, { timeout: 8000 });

const ca = await open("conflict-atlas-app.html"); await drawn(ca);
assert.equal(await ca.isHidden("#nomap"), true, "no 'map couldn't start' notice");
assert.match(await ca.textContent("header .logo"), /^Unlit$/);
assert.ok(await ca.evaluate(() => [...document.querySelectorAll(".fm-label")].some((x) => /SUDAN|UKRAINE|RUSSIA|IRAN/i.test(x.textContent))), "country names on the map");
assert.ok(await ca.evaluate(() => document.querySelectorAll(".leaflet-interactive").length >= 20), "the conflicts are marked");
const zr = await ca.evaluate(() => { const el = document.querySelector("#map"); const ctl = el.querySelector(".leaflet-control-zoom-out"); return ctl ? !ctl.classList.contains("leaflet-disabled") : null; });
assert.equal(zr, true, "zoom out works: the close-in detail layer must not set the map's minimum zoom");
ok("Unlit draws its own map (land, borders, names) with every outside host blocked, and marks the conflicts");

const res = await ca.evaluate(async () => { const r = await fetch("assets/maps/world-50m.json"); const w = await r.json(); return [r.ok, w.land.length, w.labels.length]; });
assert.ok(res[0] && res[1] > 1000 && res[2] > 200, JSON.stringify(res));
ok("the detailed map (1:50m) is there for close in");

// Coverage gap: sample coverage in, the conflicts ranked by how far their share of the news falls short of their cost
await ctx.route(/\/api\/hive\/world\/coverage/, (rt) => rt.fulfill({ contentType: "application/json", body: JSON.stringify({ at: Date.now(), days: 7, cov: [["Ukraine", 9000, 400], ["Iran", 6000, 200], ["Israel", 5000, 300], ["Lebanon", 900, 50], ["Mexico", 800, 90], ["Sudan", 40, 30], ["Democratic Republic of the Congo", 20, 12], ["Republic of the Congo", 5, 1], ["Myanmar", 30, 20]] }) }));
await ca.click("#gapbtn"); await ca.waitForSelector("#gap li");
assert.equal(await ca.isHidden("#list"), true); assert.equal(await ca.getAttribute("#gapbtn", "aria-pressed"), "true");
const rows = await ca.$$eval("#gap li", (xs) => xs.map((x) => [x.querySelector("b").textContent, x.querySelector(".ratio").textContent, x.querySelector("small").textContent]));
const at = (t) => rows.findIndex((r) => r[0].startsWith(t));
assert.ok(at("Sudan") < at("Russia – Ukraine") && at("DR Congo") < at("Russia – Ukraine"), JSON.stringify(rows.map((r) => r[0] + ": " + r[1])));
assert.match(rows[at("Sudan")][1], /× under-covered/); assert.match(rows[at("Russia – Ukraine")][1], /over-covered|in proportion/);
assert.match(rows[at("DR Congo")][2], /counted as Democratic Republic of the Congo$/, "the other Congo isn't counted"); assert.match(rows.at(-1)[1], /not in the record/); assert.match(rows.find((r) => r[0].startsWith("Haiti"))[1], /not in the record/); assert.ok(at("Haiti") > at("Russia – Ukraine"), "nothing in the record goes last");
await ca.click("#gap li[data-i='2']"); await ca.waitForFunction(() => /Sudan/.test(document.getElementById("detail").textContent));
await ca.click("#gapbtn"); assert.equal(await ca.isHidden("#gap"), true); assert.equal(await ca.isHidden("#list"), false);
ok("Coverage gap: Sudan and DR Congo rank as under-covered, Ukraine doesn't; each row says which countries it's counted by; a row opens its conflict; the button puts the list back");

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
const svt = await sv.textContent("main"); assert.match(svt, /Everything is remote or mail-in for now/); assert.doesNotMatch(svt, /Bring-in/);
assert.match(svt, /Every plan: uptime checked around the clock/); assert.match(svt, /your quote says how long backups are kept/); assert.match(svt, /read and approve the quote, follow each step of the job/);
assert.ok(await sv.$("main a[href='terms']"), "the services page links its terms");
const tp = await open("terms.html"); const tt = await tp.textContent("main");
for (const h of ["Payments", "Refunds", "Repair warranty: 30 days", "Your data and backups", "Mail-in", "Hosting"]) assert.ok(await tp.$("h2:text-is('" + h + "')"), h);
assert.match(tt, /Data rescue is an attempt, not a promise/); assert.match(tt, /Cancel any time .* no refund for part of a month/); assert.match(tt, /No uptime percentage is promised/);
const ct = await open("contact.html"); const cw = await ct.textContent("main"); assert.doesNotMatch(cw, /no third party/); assert.match(cw, /through your email provider and mine\. Nothing you type here is sent to or stored on this site/);
assert.ok(await ct.$("a[href='https://github.com/mentifaber']"), "Contact links GitHub, as the footer does");
const pv = await (await open("privacy.html")).textContent("main"); assert.match(pv, /Nothing you type is sent to or stored on this site; the message travels like any other email/); assert.match(pv, /The Nest Registry.*isn't listed on the site/s);
ok("Services says where the work happens (remote and mail-in), what every hosting plan gets and what the portal is for, and links the terms; Terms covers payments, refunds, the 30-day warranty, data, mail-in and hosting; Contact and Privacy say the same about email");

assert.deepEqual(errs, []);
ok("no page errors");
await b.close();
