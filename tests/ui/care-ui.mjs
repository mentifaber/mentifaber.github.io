// Care Circle (/care) in Chromium: two family phones, against the real circle and check-in code (src/care.js,
// src/checkin.js) and real cryptography; the phones' clocks are 14:00 on a fixed day.
//  - Ann starts Gran's circle with Gran's Quiet Check-in family link: the check-in is at the top
//  - the circle's link opens it on Bob's phone; he says who he is
//  - medicines and their doses today: Bob marks the 08:00 one given, and Ann's phone sees it was him; a dose two hours
//    late is marked; appointments, visits and the rota show today's
//  - two changes at once (Ann a note, Bob a visit, both from the same version): both are kept
//  - the server never has anything readable: no names, no medicines, not the key
//  - a link with the wrong key doesn't open it; deleting it is for everyone
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { care } = await import(REPO + "/src/care.js"), { checkin } = await import(REPO + "/src/checkin.js");
const mem = new Map(); const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => { mem.delete(k); }, kvList: async () => [], hit: async () => true };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const ci = await (await checkin(new Request("https://mentifaber.org/api/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Gran", by: "10:00", tz: "UTC" }) }), env, json, {})).json();
const famLink = "https://mentifaber.org/checkin#fam." + ci.id + "." + ci.fam;
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const DAY = "2026-11-26", NOW = new Date(DAY + "T14:00:00");
const phone = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/(care|checkin)\//, async (rt) => { const q = rt.request(), h = { "content-type": "application/json", "cf-connecting-ip": "203.0.113.20" }; const x = q.headers()["x-care-token"]; if (x) h["x-care-token"] = x;
    const req = new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: h, body: q.method() === "POST" ? q.postData() : undefined });
    const r = /\/api\/care\//.test(q.url()) ? await care(req, env, json) : await checkin(req, env, json, {}); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); await p.clock.install({ time: NOW }); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const circle = () => [...mem.entries()].find(([k]) => k.startsWith("care:"));

// Ann starts it
const A = await phone(); await A.goto("http://localhost:8099/care.html"); await A.waitForSelector("#f-new");
await A.fill("#n-person", "Gran"); await A.fill("#n-me", "Ann"); await A.fill("#n-ci", "not a link"); await A.click("#f-new button[type=submit]");
assert.match(await A.textContent("#n-st"), /isn't a Quiet Check-in family link/);
await A.fill("#n-ci", famLink); await A.click("#f-new button[type=submit]"); await A.waitForSelector("#circle:not([hidden])");
assert.match(await A.textContent("#c-title"), /Gran's circle/); await A.waitForSelector("#ci-card"); assert.match(await A.textContent("#ci-card"), /Gran checked in today/);
const link = (await A.textContent("#c-link")).trim(); assert.match(link, /\/care#c=[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/);
ok("Ann starts Gran's circle with her Quiet Check-in family link (a wrong link is refused); the check-in is at the top");

// what's in it
await A.click("summary:has-text('Add a medicine')"); await A.fill("#m-name", "Metformin"); await A.fill("#m-dose", "500 mg"); await A.fill("#m-times", "8:00, 12.00 20:00"); await A.fill("#m-with", "with food"); await A.click("#med-f button[type=submit]");
await A.waitForSelector("#doses li:has-text('20:00')"); assert.deepEqual(await A.$$eval("#doses li b", (x) => x.map((t) => t.textContent)), ["08:00 · Metformin", "12:00 · Metformin", "20:00 · Metformin"]);
assert.equal(await A.$$eval("#doses li.over", (x) => x.length), 2, "08:00 and 12:00 not given, at 14:00");
await A.click("summary:has-text('Add an appointment')"); await A.fill("#a-at", DAY + "T16:30"); await A.fill("#a-what", "Eye clinic"); await A.fill("#a-where", "St Mary's"); await A.fill("#a-who", "Ann"); await A.click("#ap-f button[type=submit]");
await A.click("summary:has-text('Add to the rota')"); await A.selectOption("#r-dow", String(NOW.getDay())); await A.fill("#r-who", "Bob"); await A.fill("#r-what", "Evening call"); await A.click("#r-f button[type=submit]");
await A.waitForSelector("#today-more li:has-text('Evening call')"); assert.match(await A.textContent("#today-more"), /Appointments\s*16:30 · Eye clinic\s*St Mary's · Ann is taking them[\s\S]*On the rota\s*Bob\s*Evening call/);
ok("medicines (times written loosely), an appointment and the rota: today's doses, with the two missed ones marked, and today's appointment and rota");

// Bob opens the link
const B = await phone(); await B.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/care#", "/care.html#")); await B.waitForSelector("#who:not([hidden])");
assert.deepEqual(await B.$$eval("#who-list button", (x) => x.map((t) => t.textContent)), ["Ann"]); await B.fill("#who-in", "Bob"); await B.click("#who-f button[type=submit]");
await B.waitForSelector("#circle:not([hidden])"); await B.waitForSelector("#doses li"); await B.click("#doses li:has-text('08:00') [data-give]"); await B.waitForSelector("#doses li.done");
assert.match(await B.textContent("#doses li.done"), /08:00 · Metformin\s*500 mg, with food · given by Bob at/);
await A.reload(); await A.waitForSelector("#doses li.done"); assert.match(await A.textContent("#doses li.done"), /given by Bob/); assert.equal(await A.$$eval("#doses li.over", (x) => x.length), 1);
ok("the link opens it on Bob's phone; he says who he is and marks the 08:00 dose given; Ann's phone sees it was Bob");

// two changes from the same version
await A.fill("#note-in", "She was tired today; ate well at lunch."); await B.click("summary:has-text('Add a visit')"); await B.fill("#v-date", DAY); await B.fill("#v-who", "Cara"); await B.fill("#v-note", "Bringing the shopping");
const v0 = circle()[1].v; await Promise.all([A.click("#note-f button[type=submit]"), B.click("#v-f button[type=submit]")]);
await A.waitForFunction(() => /Saved/.test(document.querySelector("#sync").textContent)); await B.waitForFunction(() => /Saved/.test(document.querySelector("#sync").textContent));
assert.equal(circle()[1].v, v0 + 2, "two versions: one change on top of the other");
for (const p of [A, B]) { await p.reload(); await p.waitForSelector("#notes li"); assert.match(await p.textContent("#notes"), /She was tired today/); assert.match(await p.textContent("#today-more"), /Visiting\s*Cara\s*Bringing the shopping/); }
ok("Ann's note and Bob's visit, made at once from the same version: both kept, on both phones");

const stored = JSON.stringify(circle()[1]), key = link.split(".").pop();
for (const word of ["Gran", "Ann", "Bob", "Cara", "Metformin", "Eye clinic", "tired", key]) assert.ok(!stored.includes(word), "the server has no " + word);
ok("the server holds only ciphertext: no names, no medicines, no notes, not the key");

// a wrong key, and deleting it
const W = await phone(); await W.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/care#", "/care.html#").replace(/\.[A-Za-z0-9_-]{43}$/, "." + "A".repeat(43)));
await W.waitForFunction(() => /doesn't open that circle/.test(document.querySelector("#n-st").textContent)); assert.ok(await W.isHidden("#circle"));
await A.click("#del"); await A.waitForSelector("#start:not([hidden])"); assert.equal(circle(), undefined);
await B.reload(); await B.waitForFunction(() => /doesn't exist any more/.test(document.querySelector("#n-st").textContent));
ok("a link with the wrong key doesn't open it; Ann deletes it, and it's gone from Bob's phone too");

assert.deepEqual(errs, []); for (const x of [A, B]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
