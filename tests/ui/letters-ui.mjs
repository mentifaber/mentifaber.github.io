// Sealed Letters, end to end in Chromium against the real server code (src/letters.js) and the real cryptography:
//  - write a letter for 2 of 3 friends: the site gets only ciphertext (never the letter, the key or a share)
//  - one friend's link alone shows a sealed letter; with a second friend's link it opens and reads as written
//  - a letter locked "if I stop checking in" stays shut with enough friends until the writer misses the deadline;
//    the writer's check-in pushes the deadline back; the writer can delete it, after which nothing opens
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { letters } = await import(REPO + "/src/letters.js");
const mem = new Map(), hits = new Map(), posted = [];
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1180, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/letters/, async (rt) => { const q = rt.request(); if (q.method() === "POST") posted.push(q.postData());
  const r = await letters(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.70" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json);
  rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const local = (u) => u.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/letters#", "/letters.html#");
const TEXT = "If you're reading this, the spare key is under the blue pot.\nLove, always.";

await p.goto("http://localhost:8099/letters.html"); await p.fill("#body", TEXT); await p.fill("#n", "3"); await p.fill("#k", "2"); await p.fill("#from", "Anders"); await p.click("#w button[type=submit]");
await p.waitForSelector("ol.shares li"); const shares = await p.$$eval("ol.shares code", (xs) => xs.map((x) => x.textContent));
assert.equal(shares.length, 3); assert.ok(!posted.some((x) => /blue pot|Anders/.test(x)), "the letter never leaves the browser in the clear");
const sent = JSON.parse(posted[0]); assert.deepEqual(Object.keys(sent).sort(), ["ct", "iv", "k", "lock", "n"]); assert.ok(!shares.some((s) => posted[0].includes(s.split(".").pop())), "no share is sent to the site");
ok("write a letter for 2 of 3 friends: the site gets the ciphertext and k of n, never the letter, the key or a share");

await p.goto(local(shares[0])); await p.waitForSelector(".wax"); assert.match(await p.textContent("main"), /share 1\. It takes 2 of the 3[\s\S]*1 of 2 so far/);
await p.fill("#more", "https://mentifaber.org/letters#" + "f".repeat(16) + ".2." + "a".repeat(64) + "\n" + shares[2]); await p.click("#add");
await p.waitForSelector(".opened"); assert.equal(await p.textContent(".opened"), TEXT); assert.match(await p.textContent("main"), /— Anders/);
ok("friend 1's link alone shows it sealed; adding friend 3's (and a link to another letter, ignored) opens it, word for word");

// locked: "if I stop checking in"
await p.goto("http://localhost:8099/letters.html"); await p.waitForSelector("#body"); await p.fill("#body", "Only if I go quiet."); await p.fill("#n", "2"); await p.fill("#k", "2");
await p.selectOption("#lock", "checkin"); await p.fill("#days", "30"); await p.click("#w button[type=submit]"); await p.waitForSelector("ol.shares li");
const ls = await p.$$eval("ol.shares code", (xs) => xs.map((x) => x.textContent)), wk = await p.textContent("#wk");
assert.match(JSON.parse(posted.at(-1)).S, /^[0-9a-f]{64}$/, "a locked letter sends only its release secret");
await p.goto(local(ls[0])); await p.waitForSelector("#more"); await p.fill("#more", ls[1]); await p.click("#add");
await p.waitForFunction(() => /isn't allowed to open yet/.test(document.body.textContent)); assert.equal(await p.$$eval(".opened", (x) => x.length), 0);
ok("a letter locked \"if I stop checking in\": both friends together still can't open it while the writer keeps checking in");

const id = /writer\.([0-9a-f]{16})\./.exec(wk)[1], L = mem.get("letter:" + id); L.lock.last -= 20 * 864e5; mem.set("letter:" + id, L);
await p.goto(local(wk)); await p.waitForSelector("#ci"); await p.click("#ci"); await p.waitForFunction(() => /Checked in\. Next deadline/.test(document.body.textContent));
assert.ok(mem.get("letter:" + id).lock.last > Date.now() - 60e3, "the check-in moved the deadline");
const L2 = mem.get("letter:" + id); L2.lock.last -= 31 * 864e5; mem.set("letter:" + id, L2);
await p.goto(local(ls[1])); await p.waitForSelector("#more"); await p.fill("#more", ls[0]); await p.click("#add");
await p.waitForSelector(".opened"); assert.equal(await p.textContent(".opened"), "Only if I go quiet.");
ok("checking in pushes the deadline back; once the writer misses it, the two friends open the letter");

await p.goto(local(wk)); await p.waitForSelector("#del"); await p.click("#del"); await p.waitForFunction(() => /Deleted/.test(document.body.textContent));
await p.goto(local(ls[0])); await p.waitForFunction(() => /doesn't exist, or its writer deleted it/.test(document.body.textContent));
ok("the writer deletes it, and the friends' links open nothing");
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0); assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close();
