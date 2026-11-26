// Street Skills (/skills) in Chromium: two neighbours' phones against the real skills code (src/skills.js).
//  - Ann's phone opens the street Street Board knows (from Street Board's own link); she offers to fix bikes
//  - Bob's phone: he can't ask without his name; he asks, and thanks her; a second thanks the same day is refused
//  - Ann sees the ask and marks it done; filters by kind and by words; only Ann's phone can take it down; axe
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8");
const { skills } = await import(REPO + "/src/skills.js"), { board } = await import(REPO + "/src/board.js");
const mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; },
  kvCas: async (k, e, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== e) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const phone = async (ip) => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/(skills|board)\//, async (rt) => { const q = rt.request(), req = new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: q.method() === "POST" ? q.postData() : undefined });
    const r = /\/api\/skills\//.test(q.url()) ? await skills(req, env, json) : await board(req, env, json); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  await ctx.route(/^http:\/\/localhost:8099\/(skills|library)(#.*)?$/, (rt) => rt.continue({ url: rt.request().url().replace(/\/(skills|library)$/, "/$1.html") }));
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

try {
  const A = await phone("203.0.113.60"); await A.goto("http://localhost:8099/street.html"); await A.evaluate(() => localStorage.setItem("street:board", JSON.stringify("elm-street"))); await A.reload();
  await A.waitForSelector("#main:not([hidden])"); assert.equal(await A.getAttribute("#to-skills", "href"), "skills#b=elm-street"); await A.click("#to-skills");
  await A.waitForSelector("#main:not([hidden])"); assert.equal(await A.textContent("#n-board"), "Street elm-street"); assert.match(await A.textContent("#offers"), /Nothing offered on this street yet/);
  await A.fill("#a-what", "Fix bikes: punctures, brakes, gears"); await A.click("#f-add button[type=submit]"); await A.waitForFunction(() => /Say your name first/.test(document.querySelector("#a-st").textContent));
  await A.fill("#me", "Ann at no. 12"); await A.press("#me", "Tab"); await A.selectOption("#a-kind", "fix"); await A.fill("#a-note", "Weekend mornings"); await A.click("#f-add button[type=submit]");
  await A.waitForSelector(".offer.mine"); assert.match(await A.textContent(".offer.mine"), /Fix bikes: punctures, brakes, gears\s*Fixing\s*yours · no thanks yet\s*Weekend mornings/);
  ok("Ann's phone follows Street Board's link to the street's skills; she has to say who she is, then offers to fix bikes");

  const B = await phone("203.0.113.61"); await B.goto("http://localhost:8099/skills.html#b=elm-street"); await B.waitForSelector(".offer");
  assert.equal(await B.$$eval(".offer [data-act=rm]", (x) => x.length), 0, "not Ann's controls");
  await B.fill(".offer [name=text]", "My back brake squeaks: Saturday?"); await B.click(".offer form button[type=submit]"); await B.waitForFunction(() => /Say your name first/.test(document.querySelector(".offer .say").textContent));
  await B.fill("#me", "Bob at no. 4"); await B.press("#me", "Tab"); await B.click(".offer form button[type=submit]"); await B.waitForFunction(() => /Asked\./.test(document.querySelector(".offer .say").textContent));
  await B.click(".offer [data-act=thank]"); await B.waitForFunction(() => /Thanked/.test(document.querySelector(".offer .say").textContent)); assert.match(await B.textContent(".offer"), /1 thank(?!s)/);
  await B.click(".offer [data-act=thank]"); await B.waitForFunction(() => /already/.test(document.querySelector(".offer .say").textContent));
  ok("Bob's phone: no asking without his name; he asks for Saturday and thanks her; a second thanks the same day is refused");

  await A.reload(); await A.waitForSelector(".offer.mine .asks"); assert.match(await A.textContent(".offer.mine .asks"), /Bob at no\. 4 asked today: My back brake squeaks: Saturday\?/); assert.match(await A.textContent(".offer.mine"), /1 thank(?!s)/);
  await A.click(".offer.mine [data-answered]"); await A.waitForFunction(() => /No asks yet/.test(document.querySelector(".offer.mine").textContent));
  ok("Ann sees his ask and the thanks, and marks the ask done");

  await B.fill("#a-what", "Translate letters from French"); await B.selectOption("#a-kind", "teach"); await B.click("#f-add button[type=submit]"); await B.waitForSelector(".offer.mine");
  await B.click('#kinds [data-k="fix"]'); assert.deepEqual(await B.$$eval(".offer b", (x) => x.map((e) => e.textContent)), ["Fix bikes: punctures, brakes, gears"]);
  await B.click('#kinds [data-k=""]'); await B.fill("#q", "french"); assert.deepEqual(await B.$$eval(".offer b", (x) => x.map((e) => e.textContent)), ["Translate letters from French"]); await B.fill("#q", "");
  await B.addScriptTag({ content: AXE }); const v = await B.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; ")));
  assert.deepEqual(v, []);
  ok("filters by kind and by words; axe finds nothing with offers showing");

  await A.click(".offer.mine [data-act=rm]"); await A.waitForFunction(() => !document.querySelector(".offer.mine")); assert.equal(mem.get("sk:elm-street").offers.length, 1);
  ok("only Ann's phone takes her offer down");

  assert.deepEqual(errs, []); for (const x of [A, B]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
