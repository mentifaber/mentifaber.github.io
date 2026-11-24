// Witness and Device Passport in Chromium, against the real seal code (src/seal.js) answering /api/seal/* in the test:
//  - Witness: only the photo's fingerprint, never the photo, goes to the workshop; the record comes back stamped; the
//    same photo checks out, an edited one doesn't, and a changed record doesn't
//  - Device Passport: a visitor can't issue one (and is pointed to sign in); the owner's link opens as a signed
//    certificate with the parts and warranty; one changed character and it says so
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { seal } = await import(REPO + "/src/seal.js");
const OWNER = "e".repeat(64); let keyRec = null; const hits = new Map(), sent = [];
const env = { STORE: { idFromName: (x) => x, get: () => ({
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()),
  hit: async (k, limit) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= limit; } }) } };
const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["geolocation", "clipboard-read", "clipboard-write"], geolocation: { latitude: 41.5868, longitude: -93.625, accuracy: 9 } });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/seal\//, async (rt) => { const q = rt.request(); if (q.method() === "POST") sent.push({ url: q.url(), body: q.postData() });
  const owner = (q.headers()["cookie"] || "").includes("mf_vigil=" + OWNER);
  const r = await seal(new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.5" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, owner);
  rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const photo = { name: "roof-damage.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(4000, 7)]) };

// Witness
await p.goto("http://localhost:8099/witness.html");
await p.setInputFiles("#photo", photo); await p.check("#where"); await p.fill("#note", "Hail, north side"); await p.click("#go");
await p.waitForSelector("#out:not([hidden]) .stamp");
const w = JSON.parse(sent.at(-1).body); assert.deepEqual(Object.keys(w).sort(), ["acc", "bytes", "lat", "lon", "name", "note", "sha256"]);
assert.ok(sent.at(-1).body.length < 400 && !/base64|PNG|iVBOR/.test(sent.at(-1).body), "the photo itself never goes: " + sent.at(-1).body.length + " bytes sent for a " + photo.buffer.length + "-byte photo");
assert.match(await p.textContent(".stamp"), /Witnessed[\s\S]*roof-damage\.png · 41\.5868, -93\.625 \(±9 m, as reported\)[\s\S]*SHA-256 [0-9a-f]{64}/);
ok("Witness: only the photo's fingerprint, name, size, note and reported position go to the workshop; the record comes back stamped");

await p.click("#copy"); const link = await p.evaluate(() => navigator.clipboard.readText()); assert.match(link, /\/witness#[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
await p.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/witness#", "/witness.html#")); await p.waitForSelector("#p-check:not([hidden])");
await p.setInputFiles("#cphoto", photo); await p.click("#cgo"); await p.waitForSelector("#cout .verdict");
assert.match(await p.textContent("#cout"), /✓ This exact photo existed by .* and hasn't changed since\. Position as the phone reported it: 41\.5868, -93\.625 \(±9 m\)\. Note: Hail, north side/);
const edited = { ...photo, buffer: Buffer.concat([PNG, Buffer.alloc(4000, 8)]) };
await p.setInputFiles("#cphoto", edited); await p.click("#cgo"); await p.waitForFunction(() => /✗ This isn't the photo/.test(document.getElementById("cout").textContent));
const rec = link.split("#")[1], forged = rec.replace(/^(.{30})(.)/, (m, a, c) => a + (c === "A" ? "B" : "A"));
await p.fill("#crec", forged); await p.setInputFiles("#cphoto", photo); await p.click("#cgo"); await p.waitForFunction(() => /✗/.test(document.getElementById("cout").textContent));
assert.doesNotMatch(await p.textContent("#cout"), /✓/);
ok("checking: the same photo passes; one changed byte in the photo, or one changed character in the record, fails");

// Device Passport
await p.goto("http://localhost:8099/passport.html");
await p.fill("#device", "iPhone 13"); await p.fill("#serial", "F2LXK0QJ0D"); await p.fill("#work", "Replaced the screen\nReplaced the battery"); await p.fill("#parts", "OLED screen, 661-21991\nBattery, 661-22296");
await p.fill("#battery", "100"); await p.fill("#warranty", "90"); await p.click("#iss button[type=submit]");
await p.waitForFunction(() => /Only the workshop can issue passports/.test(document.getElementById("iss-st").textContent));
assert.ok(await p.$("#iss-st a[href='vigil-app']"));
await ctx.addCookies([{ name: "mf_vigil", value: OWNER, url: "http://localhost:8099" }]);
await p.click("#iss button[type=submit]"); await p.waitForSelector("#iss-out:not([hidden]) #link");
const plink = await p.textContent("#link"); assert.match(plink, /\/passport#[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
ok("a visitor can't issue a passport and is pointed to sign in; signed in, the workshop gets a passport link");

await p.goto(plink.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/passport#", "/passport.html#")); await p.waitForSelector("#view .verdict");
const cert = await p.textContent("#view");
assert.match(cert, /✓ Signed by the Mentifaber workshop[\s\S]*iPhone 13[\s\S]*F2LXK0QJ0D[\s\S]*Replaced the screen[\s\S]*OLED screen · 661-21991[\s\S]*Battery · 661-22296[\s\S]*100% after service[\s\S]*90 days, until/);
await p.goto("http://localhost:8099/passport.html#" + plink.split("#")[1].replace(/^(.{40})(.)/, (m, a, c) => a + (c === "A" ? "B" : "A")));
await p.waitForFunction(() => /✗/.test((document.querySelector("#view .verdict") || {}).textContent || ""));
ok("the passport link opens as a signed certificate (parts with numbers, battery, warranty); one changed character and it says not to rely on it");

assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close();
