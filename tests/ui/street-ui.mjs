// Street Board (/street) in Chromium, against the real board code (src/board.js); each browser context is a phone.
//  - "Use where I am" opens the board for the place (a 5-character geohash); a name opens a named board
//  - in an outage, a notice is pinned up on the phone; its link carries the board to a second phone, which has no
//    network either; when the second phone's network comes back, it uploads what it carried, and a third phone sees it
//  - the writer takes it down, and it goes from everyone's board, even the phone that carried it
//  - two phones on a (pretend) mesh radio: a notice posted on one arrives on the other over the air
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { board } = await import(REPO + "/src/board.js");
const mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
let ipN = 1;
const phone = async (down = false) => {
  const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1100, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["geolocation", "clipboard-read", "clipboard-write"], geolocation: { latitude: 51.5074, longitude: -0.1278 } });
  ctx.down = down; const ip = "203.0.113." + ipN++;
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/board\//, async (rt) => { if (ctx.down) return rt.abort("internetdisconnected"); const q = rt.request();
    const r = await board(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: q.method() === "POST" ? q.postData() : undefined }), env, json);
    rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p };
};
const sync = (p) => p.evaluate(() => dispatchEvent(new Event("online")));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

// the board for where you are
const G = await phone(); await G.p.goto("http://localhost:8099/street.html"); await G.p.waitForSelector("#pick:not([hidden])"); await G.p.click("#here");
await G.p.waitForSelector("#main:not([hidden])"); assert.match(await G.p.textContent("#n-board"), /Board gcpvj$/); await G.ctx.close();
ok("\"Use where I am\" opens the board for the place: a 5-character geohash (central London is gcpvj)");

// an outage: phone A pins a notice up, and passes the board to phone B by a link
const A = await phone(true); await A.p.goto("http://localhost:8099/street.html"); await A.p.fill("#bname", "Elm Street"); await A.p.click("#join");
await A.p.waitForSelector("#net.off"); assert.match(await A.p.textContent("#n-board"), /elm-street/);
await A.p.check("input[value=need]"); await A.p.fill("#text", "Need drinking water for two, 12 Oak St"); await A.p.fill("#by", "Ann"); await A.p.click("#f button[type=submit]");
await A.p.waitForSelector(".post.need"); assert.match(await A.p.textContent("#f-st"), /on this phone; it goes on the board when there's a network/);
assert.match(await A.p.textContent(".post.need"), /Need[\s\S]*Ann[\s\S]*posted here · not on the board yet[\s\S]*Need drinking water/); assert.match(await A.p.textContent("#n-pend"), /1 waiting/);
assert.equal(mem.size, 0, "nothing reached the server");
await A.p.click("#share"); await A.p.waitForSelector("#s-link:not([hidden])"); const link = await A.p.textContent("#s-link"); assert.match(link, /\/street\.html#b=elm-street&p=[jz][A-Za-z0-9_-]+$/);
ok("in an outage, a notice is pinned up on the phone and waits; the board travels in a link");

const B = await phone(true); await B.p.goto(link); await B.p.waitForSelector(".post.need");
assert.match(await B.p.textContent(".post.need"), /came by a link · not on the board yet/); assert.match(await B.p.textContent("#f-st"), /1 notice from the link, on this phone until there's a network/);
B.ctx.down = false; await sync(B.p); await B.p.waitForFunction(() => !/not on the board yet/.test(document.querySelector(".post.need").textContent));
const kept = mem.get("sb:elm-street").posts; assert.equal(kept.length, 1); assert.equal(kept[0].text, "Need drinking water for two, 12 Oak St"); assert.match(kept[0].dk, /^[0-9a-f]{64}$/, "the writer's removal hash travels with it");
const C = await phone(); await C.p.goto("http://localhost:8099/street.html"); await C.p.fill("#bname", "elm-street"); await C.p.click("#join"); await C.p.waitForSelector(".post.need");
assert.match(await C.p.textContent(".post.need"), /from the board[\s\S]*Need drinking water/); assert.equal(await C.p.$$eval(".post [data-act=rm]", (x) => x.length), 0, "only its writer can take it down");
ok("a second phone opens the link offline; when its network returns it uploads what it carried, and a third phone sees it");

A.ctx.down = false; await sync(A.p); await A.p.waitForFunction(() => !document.querySelector("#n-pend").textContent);
await A.p.click(".post.need [data-act=rm]"); await A.p.waitForFunction(() => !document.querySelector(".post.need"));
assert.ok(mem.get("sb:elm-street").posts[0].gone); await sync(B.p); await B.p.waitForFunction(() => !document.querySelector(".post.need"));
await sync(C.p); await C.p.waitForFunction(() => !document.querySelector(".post.need")); assert.match(await C.p.textContent("#posts"), /Nothing on the board yet/);
ok("its writer takes it down, and it goes from every phone's board, the one that carried it too");

// the mesh: two phones with (pretend) radios, no network
const D = await phone(true), D2 = await D.ctx.newPage(); D2.on("pageerror", (e) => errs.push(e.message));
for (const p of [D.p, D2]) { await p.goto("http://localhost:8099/street.html"); if (await p.isVisible("#pick")) { await p.fill("#bname", "elm-street"); await p.click("#join"); } await p.selectOption("#r-kind", "sim:sim"); await p.click("#r-go"); await p.waitForFunction(() => /Connected/.test(document.querySelector("#r-st").textContent)); }
await D.p.check("input[value=alert]"); await D.p.fill("#text", "Road closed at Elm and 3rd: a tree is down across both lanes"); await D.p.click("#f button[type=submit]");
await D2.waitForSelector(".post.alert", { timeout: 10000 }); assert.match(await D2.textContent(".post.alert"), /Alert[\s\S]*came over the radio[\s\S]*Road closed at Elm and 3rd/);
assert.match(await D2.textContent("#r-st"), /A notice came in over the radio/);
ok("two phones on a mesh radio, no network: a notice posted on one arrives on the other over the air");
assert.deepEqual(errs, []); for (const x of [A.p, B.p, C.p, D2]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
