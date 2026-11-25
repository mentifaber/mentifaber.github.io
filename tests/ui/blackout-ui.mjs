// The Blackout Kit in Chromium, with service workers on and a server that answers clean addresses like the live site
// (/blackout, /meshnet-app). "Make it all work offline" gets every part ready; then, with the network cut, the kit
// opens, draws its own world map, shows where you are from GPS, and its apps (Hopline here) still open.
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const ROOT = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p === "/") p = "/index.html";
  let f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  if (!fs.existsSync(f) && fs.existsSync(f + ".html")) f += ".html"; // clean addresses, as Cloudflare serves them
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end("not found"); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
await new Promise((res) => srv.listen(8097, res)); const O = "http://localhost:8097";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, permissions: ["geolocation"], geolocation: { latitude: 41.5868, longitude: -93.625 } });
await ctx.route(/^(?!http:\/\/localhost:8097)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

await p.goto(O + "/blackout"); await p.waitForSelector("#apps li");
assert.match(await p.textContent("#prep-st"), /0 of 8 ready/);
assert.equal(await p.$$eval("#apps li", (x) => x.length), 7);
assert.match(await p.textContent("body"), /8 drops per gallon[\s\S]*30 minutes[\s\S]*20 feet/);
ok("the kit lists its seven apps (none ready yet) and the guides: water, food, carbon monoxide, phone, radio");

await p.click("#prep"); await p.waitForFunction(() => /Ready: all 8 parts work offline/.test(document.getElementById("prep-st").textContent), null, { timeout: 60000 });
assert.equal(await p.$$eval("#apps .st.ok", (x) => x.length), 7);
ok("\"Make it all work offline\" gets the kit and all seven apps ready");

await p.click("#locate"); await p.waitForFunction(() => /41\.58680, -93\.62500/.test(document.getElementById("coords").textContent));
ok("Find me shows the GPS fix and puts it on the map");

await ctx.setOffline(true);
await p.reload(); await p.waitForSelector("#apps li");
await p.waitForFunction(() => document.querySelectorAll(".leaflet-fmLand-pane canvas").length > 0 && document.querySelector(".leaflet-interactive, .leaflet-marker-pane *, .leaflet-overlay-pane svg, .leaflet-overlay-pane canvas"), null, { timeout: 10000 });
assert.match(await p.textContent("#coords"), /41\.58680, -93\.62500 \(last known\)/);
assert.match(await p.textContent("#prep-st"), /Ready: all 8/);
ok("with the network cut, the kit opens, draws the site's own world map and remembers where you were");

const hp = await ctx.newPage(); await hp.goto(O + "/meshnet-app"); assert.match(await hp.title(), /Hopline/);
ok("and Hopline, from the kit's list, opens with no network");

await ctx.setOffline(false);
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
assert.deepEqual(errs.filter((e) => !/Failed to fetch|NetworkError|net::/.test(e)), []);
ok("no page errors, no sideways scroll");
await b.close(); srv.close();
