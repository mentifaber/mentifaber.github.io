// Claim Kit (/claim) in Chromium, against the real seal code (src/seal.js) answering /api/seal/*:
//  - a case: photos, a receipt and a dated note, in date order; a photo's Witness record is accepted only if it's for
//    that exact photo
//  - sealing sends only fingerprints (no file leaves the device) and downloads one zip: the files, claim.json and a
//    summary; a change after sealing says the kit needs sealing again
//  - checking: the zip checks out, item by item, with the photo's Witness time; a file swapped for another says which
//    one; something that isn't a kit says so
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs"; import os from "node:os";
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
  const r = await seal(new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.5" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, false);
  rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
const dialogs = []; let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const hall = { name: "hall-scuff.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(3000, 1)]) };
const oven = { name: "oven.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(3000, 2)]) };
const receipt = { name: "carpet-receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 carpet cleaning $180") };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claim-"));

await p.goto("http://localhost:8099/claim.html"); await p.waitForSelector("#cases .note");
await p.click("#new"); await p.fill("#c-title", "Flat 4B deposit"); await p.selectOption("#c-kind", "deposit"); await p.fill("#c-party", "Elm Street Lettings"); await p.fill("#c-amount", "950"); await p.press("#c-amount", "Tab");
await p.setInputFiles("#files", [hall, oven, receipt]); await p.waitForFunction(() => document.querySelectorAll("#items .item").length === 3);
assert.deepEqual(await p.$$eval("#items .item .tag:first-child", (x) => x.map((t) => t.textContent)), ["Photo", "Photo", "Receipt"], "photos by type, a receipt by its name");
const dates = await p.$$("#items .item [data-f=date]"); await dates[0].fill("2026-10-31"); await dates[0].dispatchEvent("change"); await p.waitForTimeout(200);
await (await p.$("#items .item:has-text('oven.png') [data-f=date]")).fill("2026-11-02"); await (await p.$("#items .item:has-text('oven.png') [data-f=date]")).dispatchEvent("change"); await p.waitForTimeout(200);
await (await p.$("#items .item:has-text('carpet-receipt.pdf') [data-f=date]")).fill("2026-11-03"); await (await p.$("#items .item:has-text('carpet-receipt.pdf') [data-f=date]")).dispatchEvent("change"); await p.waitForTimeout(200);
await p.fill("#n-text", "Called the agent: she agreed the scuff was there at move-in."); await p.fill("#n-date", "2026-11-01"); await p.click("#n-add");
await p.waitForFunction(() => document.querySelectorAll("#items .item").length === 4);
assert.deepEqual(await p.$$eval("#items .item .nm", (x) => x.map((t) => t.textContent)), ["1. hall-scuff.png", "2. Note", "3. oven.png", "4. carpet-receipt.pdf"], "in date order");
const cap = await p.$("#items .item:has-text('hall-scuff.png') [data-f=note]"); await cap.fill("Scuff by the door, there at move-in"); await cap.dispatchEvent("change");
ok("a case: two photos and a receipt (sorted by type), a dated note, all in date order");

// a Witness record for the hall photo; and one for the other photo, which is refused
const witness = async (buf) => { const sha = (await import("node:crypto")).createHash("sha256").update(buf).digest("hex");
  return (await p.evaluate(async (s) => (await (await fetch("/api/seal/witness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sha256: s, name: "x.png" }) })).json()).record, sha)); };
const wHall = await witness(hall.buffer), wOven = await witness(oven.buffer);
fs.writeFileSync(path.join(tmp, "oven.witness.json"), JSON.stringify({ witness: 1, record: wOven })); fs.writeFileSync(path.join(tmp, "hall.witness.json"), JSON.stringify({ witness: 1, record: wHall }));
await p.setInputFiles("#items .item:has-text('hall-scuff.png') [data-w]", path.join(tmp, "oven.witness.json")); await p.waitForTimeout(300);
assert.match(dialogs.at(-1), /for a different photo/); assert.equal(await p.$$eval("#items .tag.w", (x) => x.length), 0);
await p.setInputFiles("#items .item:has-text('hall-scuff.png') [data-w]", path.join(tmp, "hall.witness.json")); await p.waitForSelector("#items .item:has-text('hall-scuff.png') .tag.w");
ok("a photo's Witness record is attached only if it's for that exact photo");

// seal
const before = sent.length; const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#seal")]);
const zipPath = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(zipPath); assert.match(dl.suggestedFilename(), /^claim-kit-flat-4b-deposit-\d{4}-\d\d-\d\d\.zip$/);
const req = JSON.parse(sent[before]); assert.equal(req.items.length, 4); assert.ok(!JSON.stringify(req).includes(hall.buffer.toString("base64").slice(0, 40)), "no file content is sent");
assert.ok(req.items.every((i) => /^[0-9a-f]{64}$/.test(i.sha256) && !("blob" in i) && !("text" in i)));
await p.waitForSelector("#sealed:not([hidden]) .stamp"); assert.equal(await p.textContent("#seal"), "Seal it again");
const z = fs.readFileSync(zipPath); for (const f of ["claim.json", "summary.html", "HOW-TO-CHECK.txt", "01-2026-10-31-hall-scuff.png", "02-2026-11-01-note.txt", "04-2026-11-03-carpet-receipt.pdf"]) assert.ok(z.includes(Buffer.from(f)), f + " in the zip");
ok("sealing sends only fingerprints and downloads one zip: the files in date order, claim.json, a summary and how to check it");

await (await p.$("#items .item:has-text('oven.png') [data-f=note]")).fill("Oven door was already cracked"); await (await p.$("#items .item:has-text('oven.png') [data-f=note]")).dispatchEvent("change");
await p.waitForSelector("#sealed .status.bad"); assert.match(await p.textContent("#sealed"), /changed since it was sealed/);
await p.click("#back"); await p.waitForSelector("#cases .tag.warn"); assert.match(await p.textContent("#cases"), /Flat 4B deposit[\s\S]*4 items[\s\S]*changed since sealing/);
ok("a change after sealing says the kit needs sealing again, in the case and in the list");

// check, in a fresh browser
const C = await ctx.newPage(); C.on("pageerror", (e) => errs.push(e.message)); await C.goto("http://localhost:8099/claim.html#check"); await C.waitForSelector("#p-check:not([hidden])");
await C.setInputFiles("#k-files", zipPath); await C.waitForSelector("#k-out .verdict");
assert.match(await C.textContent("#k-out .verdict.ok"), /A genuine Claim Kit, sealed by the workshop on .*All 4 items are exactly as sealed/);
assert.match(await C.textContent("#k-out"), /Flat 4B deposit[\s\S]*A deposit dispute · against Elm Street Lettings · \$950\.00 in dispute[\s\S]*1\. Photo[\s\S]*✓ witnessed[\s\S]*2\. Note/);
// someone unzipped it and zipped it again (compressed, inside a folder): it still checks out
const re = path.join(tmp, "rezipped.zip"); (await import("node:child_process")).execFileSync("python3", ["-c", "import sys,zipfile\ni=zipfile.ZipFile(sys.argv[1]);o=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)\nfor n in i.namelist(): o.writestr('Flat 4B kit/'+n, i.read(n))\no.writestr('__MACOSX/Flat 4B kit/._claim.json', b'x');o.close()", zipPath, re]);
await C.setInputFiles("#k-files", re); await C.waitForFunction(() => /All 4 items are exactly as sealed/.test(document.querySelector("#k-out").textContent));
fs.writeFileSync(path.join(tmp, "03-2026-11-02-oven.png"), Buffer.concat([PNG, Buffer.alloc(3000, 9)]));
await C.setInputFiles("#k-files", [zipPath, path.join(tmp, "03-2026-11-02-oven.png")]); await C.waitForSelector("#k-out .verdict.bad");
assert.match(await C.textContent("#k-out .verdict"), /1 of 4 items don't match/); assert.match(await C.textContent("#k-out .checks li:nth-child(3)"), /✗ changed since sealing[\s\S]*oven\.png/);
await C.setInputFiles("#k-files", path.join(tmp, "hall.witness.json")); await C.waitForSelector("#k-out .verdict.bad"); assert.match(await C.textContent("#k-out"), /no claim\.json/);
ok("checking: the zip (or a re-zipped copy) checks out item by item with the photo's Witness time; a swapped file is named; a stray file says so");
assert.deepEqual(errs, []); for (const x of [p, C]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
fs.rmSync(tmp, { recursive: true, force: true }); await b.close(); console.log("all passed " + DEV);
