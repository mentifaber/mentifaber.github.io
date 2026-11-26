// Street Library (/library) in Chromium: two neighbours' phones, against the real library and seal code (src/library.js,
// src/seal.js).
//  - Ann's phone opens the street Street Board already knows; she puts a ladder on the shelf
//  - Bob's phone opens the street's link; he can't ask without saying who he is; then he asks for Saturday
//  - Ann sees the ask, lends it to Bob (his name already filled in) with a photo of its condition: the workshop seals the
//    photo's fingerprint; the photo stays on her phone, and Bob's phone shows the seal checks out
//  - a seal for another photo shows as not valid; an overdue loan is marked
//  - it comes back with a photo: how it went out beside how it came back; it's on the shelf again with its history
//  - only Ann's phone has her controls; she takes it off the shelf
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { library } = await import(REPO + "/src/library.js"), { seal } = await import(REPO + "/src/seal.js");
const mem = new Map(); let keyRec = null;
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, hit: async () => true,
  kvCas: async (k, expect, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== expect) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; },
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()) };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const phone = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/(library|seal)\//, async (rt) => { const q = rt.request(), req = new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.40" }, body: q.method() === "POST" ? q.postData() : undefined });
    const r = /\/api\/library\//.test(q.url()) ? await library(req, env, json) : await seal(req, env, json, false); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const img = (name, fill) => ({ name, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(1500, fill)]) });
const shelf = () => mem.get("sl:elm-street"), card = (p, what) => p.locator(".thing", { hasText: what });

// Ann: her phone already has Street Board's street
const A = await phone(); await A.goto("http://localhost:8099/library.html"); await A.evaluate(() => localStorage.setItem("street:board", JSON.stringify("elm-street"))); await A.reload();
await A.waitForSelector("#main:not([hidden])"); assert.equal(await A.textContent("#n-board"), "Street elm-street"); assert.match(await A.textContent("#things"), /Nothing on this street's shelf yet/);
await A.fill("#me", "Ann at no. 12"); await A.press("#me", "Tab"); await A.fill("#a-what", "Ladder (3 m)"); await A.fill("#a-note", "Aluminium, folding"); await A.click("#f-add button[type=submit]");
await A.waitForSelector(".thing.mine"); assert.match(await A.textContent(".thing.mine"), /Ladder \(3 m\)\s*yours\s*on the shelf\s*Aluminium, folding/);
ok("Ann's phone opens the street Street Board knows; she puts a ladder on the shelf");

// Bob asks
const B = await phone(); await B.goto("http://localhost:8099/library.html#b=elm-street"); await B.waitForSelector(".thing");
assert.match(await B.textContent(".thing"), /Ladder \(3 m\)\s*lent by Ann at no\. 12\s*on the shelf/); assert.equal(await B.$$eval(".thing [data-f=lend], .thing [data-act=rm]", (x) => x.length), 0, "not Ann's controls");
await B.fill(".thing [name=text]", "For Saturday, to clear the gutters"); await B.click(".thing [data-f=ask] button"); await B.waitForSelector(".thing .status.say.bad"); assert.match(await B.textContent(".thing .say"), /Say your name first/);
await B.fill("#me", "Bob at no. 4"); await B.press("#me", "Tab"); await B.click(".thing [data-f=ask] button"); await B.waitForFunction(() => /Asked\./.test(document.querySelector(".thing").textContent));
assert.equal(shelf().items[0].asks[0].by, "Bob at no. 4");
ok("Bob's phone opens the street's link and sees the ladder, without Ann's controls; he says who he is and asks for Saturday");

// Ann lends it, with a photo of its condition
await A.reload(); await A.waitForSelector(".thing.mine .asks"); assert.match(await A.textContent(".thing.mine .asks"), /Bob at no\. 4\s*asked .*: For Saturday, to clear the gutters/);
assert.equal(await A.inputValue(".thing.mine [name=to]"), "Bob at no. 4", "his name is filled in");
await A.setInputFiles(".thing.mine [name=photo]", img("ladder-out.png", 1)); await A.click(".thing.mine [data-f=lend] button"); await A.waitForFunction(() => /Lent to Bob/.test(document.querySelector(".thing.mine").textContent));
assert.match(await A.textContent(".thing.mine"), /with Bob at no\. 4, due/); assert.match(await A.textContent(".thing.mine"), /Its condition photo is sealed/);
await A.waitForSelector(".thing.mine [data-ph] img"); const loan = shelf().items[0].loan; assert.match(loan.sha, /^[0-9a-f]{64}$/); assert.ok(loan.witness);
assert.ok(!JSON.stringify(shelf()).includes(img("x", 1).buffer.toString("base64").slice(0, 40)), "the photo isn't on the server, only its fingerprint");
await B.reload(); await B.waitForFunction(() => /✓/.test(document.querySelector(".thing").textContent)); assert.match(await B.textContent(".thing"), /with Bob at no\. 4, due[\s\S]*✓ Its condition when it went out: a photo sealed by the workshop/);
ok("Ann sees the ask, lends it to Bob with a photo: its fingerprint is sealed, the photo stays on her phone, and Bob's phone shows the seal checks out");

// a seal for another photo, and an overdue loan
const real = shelf(); const fake = structuredClone(real); fake.items[0].loan.sha = "0".repeat(64); fake.items[0].loan.due = "2020-01-01"; mem.set("sl:elm-street", fake);
await B.reload(); await B.waitForFunction(() => /✗/.test(document.querySelector(".thing").textContent)); assert.match(await B.textContent(".thing"), /overdue: with Bob[\s\S]*✗ The photo of its condition when it went out has no valid seal/);
mem.set("sl:elm-street", real);
ok("a seal that's for another photo shows as not valid; an overdue loan is marked");

// back
await A.reload(); await A.waitForSelector(".thing.mine [data-f=back]"); await A.setInputFiles(".thing.mine [name=photo]", img("ladder-back.png", 2)); await A.click(".thing.mine [data-f=back] button");
await A.waitForFunction(() => document.querySelectorAll(".thing.mine [id^=cmp-] img").length === 2); // how it went out, beside how it came back
assert.match(await A.textContent(".thing.mine"), /on the shelf[\s\S]*Lent 1 time: Bob at no\. 4 \(back[\s\S]*Back on the shelf\. Here's how it went out, beside how it came back\./);
assert.deepEqual([shelf().items[0].loan, shelf().items[0].past[0].sha, /^[0-9a-f]{64}$/.test(shelf().items[0].past[0].backSha)], [null, loan.sha, true]);
ok("it comes back with a photo: how it went out beside how it came back; on the shelf again, with its history");

await A.click(".thing.mine [data-act=rm]"); await A.waitForFunction(() => !document.querySelector(".thing.mine")); assert.equal(shelf().items.length, 0);
ok("Ann takes it off the shelf");
assert.deepEqual(errs, []); for (const x of [A, B]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
