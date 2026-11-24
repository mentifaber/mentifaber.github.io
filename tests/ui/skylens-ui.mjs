// Sky Lens in Chromium with a fake camera, a fixed location and real ISS elements: point the phone (compass and tilt
// events, as an Android phone sends them) where the ISS is and it's drawn at the centre, named; point away and it's
// off screen; the footer says when the ISS next rises. Without a compass, dragging looks around.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const TLE = "ISS (ZARYA)\n1 25544U 98067A   26327.91294507  .00005691  00000+0  10921-3 0  9993\n2 25544  51.6309 207.9946 0007385 194.4467 165.6345 15.49611389541277\n";
const b = await chromium.launch({ args: ["--no-proxy-server", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["geolocation", "camera"], geolocation: { latitude: 41.59, longitude: -93.62 } });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/orbit/, (rt) => rt.fulfill({ contentType: "text/plain", body: /stations/.test(rt.request().url()) ? TLE : "" }));
await ctx.route(/\/api\/where/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
await p.goto("http://localhost:8099/skylens.html"); await p.click("#go");
await p.waitForFunction(() => SkyLens.S.sats.length === 1 && SkyLens.S.obs);
assert.equal(await p.isHidden("#start"), true); assert.equal(await p.$eval("#cam", (v) => !v.hidden && !!v.srcObject), true, "the camera is running");
assert.match(await p.textContent("#where"), /41\.59, -93\.62 · GPS/);
ok("Point it at the sky: the camera starts, GPS places you, the satellites load");

// find a moment the ISS is above the horizon from here, and freeze the clock there
const up = await p.evaluate(() => { const s = SkyLens.S.sats[0]; for (let t = Date.now(); t < Date.now() + 864e5; t += 30e3) { const l = SkyLens.look(s, t); if (l && l.el > 25) return { t, ...l }; } return null; });
assert.ok(up, "the ISS passes over within a day");
await p.evaluate((t) => { const real = Date.now; Date.now = () => t; }, up.t);
const point = (head, pitch) => p.evaluate(([h, e]) => dispatchEvent(Object.assign(new Event("deviceorientationabsolute"), { absolute: true, alpha: (360 - h) % 360, beta: e + 90, gamma: 0 })), [head, pitch]);
await point(up.az, up.el); await p.waitForTimeout(250);
let shown = await p.evaluate(() => SkyLens.shown); const vw = await p.evaluate(() => [innerWidth, innerHeight]);
assert.equal(shown.length, 1, JSON.stringify(shown)); assert.ok(Math.abs(shown[0].x - vw[0] / 2) < 4 && Math.abs(shown[0].y - vw[1] / 2) < 4, JSON.stringify([shown[0], vw])); assert.match(shown[0].name, /ISS/);
ok("pointed where the ISS is (bearing " + Math.round(up.az) + "°, " + Math.round(up.el) + "° up), it's drawn at the centre, named");
await point((up.az + 180) % 360, 10); await p.waitForTimeout(250); shown = await p.evaluate(() => SkyLens.shown); assert.equal(shown.length, 0, "turned away: off screen (an arrow at the edge instead)");
ok("turned the other way, it's off screen");
await p.evaluate(() => { SkyLens.S.sensors = false; }); await p.evaluate((t) => { Date.now = () => t - 3600e3 * 3; }, up.t);
await p.evaluate(() => document.dispatchEvent(new Event("x"))); await p.waitForTimeout(100);
const next = await p.evaluate(() => { const n = SkyLens.nextIss(); return n && (n.now || n.at > Date.now()); }); assert.ok(next, "the next ISS rise is found");
ok("the next ISS pass is worked out for the footer");
assert.deepEqual(errs, []); ok("no page errors");
await b.close();
