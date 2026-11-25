// Move-in, Move-out (/movein) in Chromium, against the real seal code (src/seal.js) answering /api/seal/*:
//  - a property: rooms from the chips come with their usual items; conditions, notes and photos per room
//  - sealing a walk sends only fingerprints and downloads one zip: the photos by room, inventory.json, a summary and
//    how to check it; a change after sealing says it needs sealing again
//  - the move-out walk starts from the move-in rooms; "What changed" lays them side by side and marks what's worse
//  - a dispute becomes a Claim Kit case on the same device, with what got worse and both walks' photos of those rooms
//  - checking a walk: the zip checks out photo by photo; a swapped photo is named; a stray file says so
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs"; import os from "node:os"; import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { seal } = await import(REPO + "/src/seal.js");
let keyRec = null; const hits = new Map(), sent = [];
const env = { STORE: { idFromName: (x) => x, get: () => ({
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()),
  hit: async (k, limit) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= limit; } }) } };
const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", acceptDownloads: true });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/seal\//, async (rt) => { const q = rt.request(); if (q.method() === "POST") sent.push(q.postData());
  const r = await seal(new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, false);
  rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const img = (name, fill) => ({ name, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(2000, fill)]) });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "movein-"));
const room = (name) => '.room:has(input[data-f=rname][value="' + name + '"])';
const item = (r, what) => room(r) + ' tr:has(input[data-f=what][value="' + what + '"])';
const setCond = async (r, what, cond, note) => { await p.selectOption(item(r, what) + " select", cond); if (note != null) { await p.fill(item(r, what) + " input[data-f=note]", note); await p.press(item(r, what) + " input[data-f=note]", "Tab"); } await p.waitForTimeout(80); };
const names = (zip) => execFileSync("python3", ["-c", "import sys,zipfile\nprint('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", zip]).toString().trim().split("\n");

await p.goto("http://localhost:8099/movein.html"); await p.waitForSelector("#props .status");
await p.click("#new"); await p.fill("#p-name", "Flat 4B, 12 Elm Street"); await p.fill("#p-landlord", "Elm Street Lettings"); await p.press("#p-landlord", "Tab");
await p.fill("#w-date", "2026-01-10"); await p.dispatchEvent("#w-date", "change");
await p.click("#room-chips .chip:has-text('Kitchen')"); await p.waitForSelector(room("Kitchen"));
assert.deepEqual(await p.$$eval(room("Kitchen") + " input[data-f=what]", (x) => x.map((i) => i.value)), ["Walls", "Floor", "Ceiling", "Windows", "Doors", "Lights and switches", "Oven and hob", "Fridge", "Sink and taps", "Cupboards", "Worktop"]);
await p.click("#room-chips .chip:has-text('Bedroom')"); await p.fill("#r-name", "Box room"); await p.click("#r-add"); await p.waitForSelector(room("Box room"));
assert.equal(await p.$$eval(room("Box room") + " input[data-f=what]", (x) => x.length), 6, "a room by name gets the usual six");
for (const w of ["Walls", "Floor", "Oven and hob", "Worktop"]) await setCond("Kitchen", w, "good");
await setCond("Kitchen", "Floor", "fair", "Small scuff by the door");
await setCond("Bedroom", "Walls", "good"); await setCond("Bedroom", "Wardrobe", "good");
await p.setInputFiles(room("Kitchen") + " input[data-f=photos]", [img("oven.png", 1), img("floor.png", 2)]); await p.waitForFunction(() => document.querySelectorAll(".room figure").length === 2);
await p.setInputFiles(room("Bedroom") + " input[data-f=photos]", [img("wardrobe.png", 3)]); await p.waitForFunction(() => document.querySelectorAll(".room figure").length === 3);
await p.click(room("Box room") + " [data-act=rm-room]"); await p.waitForFunction(() => document.querySelectorAll(".room").length === 2);
ok("a property: chips add rooms with their usual items; conditions, notes and photos per room; a room can be removed");

// seal the move-in walk
const seal1 = sent.length; const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#seal")]);
const inZip = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(inZip); assert.equal(dl.suggestedFilename(), "movein-flat-4b-12-elm-street-move-in-2026-01-10.zip");
const req = JSON.parse(sent[seal1]); assert.equal(req.phase, "in"); assert.equal(req.rooms.length, 2); assert.ok(!sent[seal1].includes(PNG.toString("base64").slice(0, 30)), "no photo is sent");
assert.ok(req.rooms.flatMap((r) => r.photos).every((x) => /^[0-9a-f]{64}$/.test(x.sha256) && Object.keys(x).sort().join() === "bytes,name,sha256"));
assert.deepEqual(names(inZip).sort(), ["01-kitchen-01-oven.png", "01-kitchen-02-floor.png", "02-bedroom-01-wardrobe.png", "HOW-TO-CHECK.txt", "inventory.json", "summary.html"]);
await p.waitForSelector("#sealed:not([hidden]) .stamp"); assert.match(await p.textContent("#sealed"), /Move-in walk, .* 2 rooms, 3 photos/); assert.equal(await p.textContent("#seal"), "Seal it again and download it");
await setCond("Bedroom", "Floor", "good"); await p.waitForSelector("#sealed .status.bad"); assert.match(await p.textContent("#sealed"), /changed since it was sealed/);
await Promise.all([p.waitForEvent("download"), p.click("#seal")]); await p.waitForSelector("#sealed #again");
ok("sealing sends only fingerprints and downloads one zip (photos by room, inventory.json, a summary); a change after sealing says so");

// move-out: from the move-in rooms; the oven's damaged, the floor's the same, the wardrobe's missing a door
await p.click("#t-out"); await p.waitForSelector("#from-in"); await p.click("#from-in"); await p.waitForSelector(room("Kitchen"));
assert.equal(await p.$$eval(".room", (x) => x.length), 2); assert.equal(await p.$eval(item("Kitchen", "Oven and hob") + " select", (s) => s.value), "", "conditions start blank");
await p.fill("#w-date", "2026-11-20"); await p.dispatchEvent("#w-date", "change");
for (const w of ["Walls", "Worktop"]) await setCond("Kitchen", w, "good");
await setCond("Kitchen", "Floor", "fair"); await setCond("Kitchen", "Oven and hob", "damaged", "Glass door cracked"); await setCond("Bedroom", "Walls", "good"); await setCond("Bedroom", "Wardrobe", "worn", "One hinge loose");
await p.setInputFiles(room("Kitchen") + " input[data-f=photos]", [img("oven-crack.png", 4)]); await p.waitForFunction(() => document.querySelectorAll(".room figure").length === 1);
const [dl2] = await Promise.all([p.waitForEvent("download"), p.click("#seal")]); assert.equal(dl2.suggestedFilename(), "movein-flat-4b-12-elm-street-move-out-2026-11-20.zip");
const outZip = path.join(tmp, dl2.suggestedFilename()); await dl2.saveAs(outZip); assert.equal(JSON.parse(sent.at(-1)).phase, "out");
ok("the move-out walk starts from the move-in rooms and items, blank, and is sealed the same way");

// what changed
await p.click("#t-cmp"); await p.waitForSelector("#cmp-verdict");
assert.match(await p.textContent("#cmp-verdict"), /2 things are in a worse state at move-out than at move-in\. Move-in .*\(sealed\), move-out .*\(sealed\)/);
assert.deepEqual(await p.$$eval(".cmp tr.worse td:first-child", (x) => x.map((t) => t.textContent)), ["Kitchen · Oven and hob", "Bedroom · Wardrobe"]);
assert.match(await p.textContent(".cmp tr.worse"), /good[\s\S]*damaged[\s\S]*Glass door cracked[\s\S]*Worse/);
assert.match(await p.textContent(".cmp tbody"), /Kitchen · Floor\s*fair\s*Small scuff by the door\s*fair\s*Same/);
await p.click("#to-claim"); await p.waitForSelector("#c-st a"); assert.match(await p.textContent("#c-st"), /Claim Kit, on this device: 7 items/);
await p.goto("http://localhost:8099/claim.html"); await p.waitForSelector("#cases button[data-id]");
assert.match(await p.textContent("#cases"), /Flat 4B, 12 Elm Street deposit[\s\S]*A deposit dispute · 7 items/);
await p.click("#cases button[data-id]"); await p.waitForSelector("#items .item"); assert.equal(await p.inputValue("#c-party"), "Elm Street Lettings");
const claimText = await p.textContent("#items"); assert.match(claimText, /Oven and hob: good at move-in, damaged at move-out \(Glass door cracked\)/); assert.match(claimText, /oven-crack\.png/); assert.match(claimText, /wardrobe\.png/);
const [kit] = await Promise.all([p.waitForEvent("download"), p.click("#seal")]); assert.match(kit.suggestedFilename(), /^claim-kit-flat-4b-12-elm-street-deposit-/); assert.equal(JSON.parse(sent.at(-1)).items.length, 7, "the case seals as a Claim Kit");
ok("what changed: the two walks side by side, what's worse marked; it becomes a Claim Kit case with those things and both walks' photos of those rooms");

// check a sealed walk, in a fresh page
const C = await ctx.newPage(); C.on("pageerror", (e) => errs.push(e.message)); await C.goto("http://localhost:8099/movein.html"); await C.waitForSelector("#props");
await C.setInputFiles("#k-files", outZip); await C.waitForSelector("#k-out .verdict");
assert.match(await C.textContent("#k-out .verdict.ok"), /A genuine move-out walk of Flat 4B, 12 Elm Street, sealed by the workshop on .*All 1 photos and every room's notes are exactly as sealed/);
assert.match(await C.textContent("#k-out"), /Kitchen: .*Oven and hob damaged/);
await C.setInputFiles("#k-files", inZip); await C.waitForSelector("#k-out .verdict.ok"); assert.match(await C.textContent("#k-out .verdict"), /move-in walk[\s\S]*All 3 photos/);
fs.writeFileSync(path.join(tmp, "01-kitchen-01-oven.png"), img("x", 9).buffer);
await C.setInputFiles("#k-files", [inZip, path.join(tmp, "01-kitchen-01-oven.png")]); await C.waitForSelector("#k-out .verdict.bad");
assert.match(await C.textContent("#k-out .verdict"), /1 of 3 photos don't match/); assert.match(await C.textContent("#k-out .checks"), /✗ changed since sealing Kitchen · 01-kitchen-01-oven\.png/);
await C.setInputFiles("#k-files", path.join(tmp, "01-kitchen-01-oven.png")); await C.waitForSelector("#k-out .verdict.bad"); assert.match(await C.textContent("#k-out"), /no inventory\.json/);
ok("checking: a walk's zip checks out photo by photo; a swapped photo is named; a stray file says so");

assert.deepEqual(errs, []); for (const x of [p, C]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
