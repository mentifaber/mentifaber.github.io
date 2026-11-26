// The Street Node in Chromium: the real box (node/street-node.mjs, its own process) and two phones that can reach nothing
// but the box, as on its Wi-Fi in an outage.
//  - a phone's "am I online?" check lands it on the street's page, and from there on Street Board, already on the street
//  - a notice posted on one phone is on the other's board, through the box
//  - Street Library from the box: a ladder lent with a photo of its condition; with no internet to seal it, the photo's
//    fingerprint is kept and both phones say plainly it isn't sealed
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import http from "node:http";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "node-ui-"));
const PORT = await new Promise((r) => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }), O = "http://localhost:" + PORT;
const box = spawn(process.execPath, [REPO + "/node/street-node.mjs", "--board", "elm-street", "--port", String(PORT), "--data", path.join(tmp, "box.json")], { stdio: ["ignore", "pipe", "pipe"] });
let out = ""; box.stdout.on("data", (d) => (out += d)); box.stderr.on("data", (d) => (out += d));
for (let i = 0; i < 100 && !/Street Node for/.test(out); i++) await new Promise((r) => setTimeout(r, 50));
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const phone = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1100, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  await ctx.route((u) => !u.href.startsWith(O), (rt) => rt.abort("internetdisconnected")); const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

try {
  const A = await phone(); await A.goto(O + "/generate_204"); assert.equal(new URL(A.url()).pathname, "/"); assert.match(await A.textContent("h1"), /This street's box/);
  await A.click("#to-street"); await A.waitForSelector("#main:not([hidden])"); assert.match(await A.textContent("#n-board"), /elm-street/);
  await A.check("input[value=need]"); await A.fill("#text", "Need drinking water for two, 12 Oak St"); await A.fill("#by", "Ann"); await A.click("#f button[type=submit]");
  await A.waitForFunction(() => document.querySelector(".post.need") && !/not on the board yet/.test(document.querySelector(".post.need").textContent));
  ok("a phone's online check lands it on the street's page; Street Board opens on the street, and a notice goes up to the box");

  const B = await phone(); await B.goto(O + "/connecttest.txt"); await B.click("#to-street"); await B.waitForSelector(".post.need");
  assert.match(await B.textContent(".post.need"), /Need[\s\S]*Ann[\s\S]*Need drinking water for two, 12 Oak St/);
  ok("the other phone, on the box's Wi-Fi, sees it on its board");

  await A.goto(O + "/"); await A.click("#to-library"); await A.waitForSelector("#main:not([hidden])"); assert.match(await A.textContent("#n-board"), /elm-street/);
  await A.fill("#me", "Ann at no. 12"); await A.press("#me", "Tab"); await A.fill("#a-what", "Ladder (3 m)"); await A.click("#f-add button[type=submit]"); await A.waitForSelector(".thing.mine");
  await A.fill(".thing.mine [name=to]", "Bob at no. 4"); await A.setInputFiles(".thing.mine [name=photo]", { name: "ladder.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(800, 7)]) });
  await A.click(".thing.mine [data-f=lend] button"); await A.waitForFunction(() => /Lent to Bob/.test(document.querySelector(".thing.mine").textContent));
  assert.match(await A.textContent(".thing.mine"), /couldn't be sealed without the internet/);
  await B.goto(O + "/library"); await B.waitForSelector(".thing"); assert.match(await B.textContent(".thing"), /with Bob at no\. 4, due[\s\S]*not sealed: there was no internet/);
  ok("Street Library from the box: a ladder lent with a condition photo; with no internet the fingerprint is kept unsealed, and both phones say so");

  assert.deepEqual(errs, []); for (const x of [A, B]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); box.kill("SIGTERM"); fs.rmSync(tmp, { recursive: true, force: true }); }
