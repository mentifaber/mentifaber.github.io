// House Kitty (/kitty) in Chromium: two housemates' phones against the real sealed box (src/care.js's kitty).
//  - Ann starts a kitty for 12 Elm St with Bob and Cat; Bob opens its link and says which one he is
//  - costs: electricity split evenly, rent by shares (Ann's double room counts 2), a takeaway between two; both phones show
//    the same balances, and the fewest payments that settle everyone up
//  - Bill Watch's bill on Ann's phone drops into the form with its total
//  - "Mark it paid" settles a payment; two costs added at the same moment on two phones are both kept
//  - the server holds no names, amounts or key; a link with the wrong key doesn't open it; deleting it is for everyone
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8");
const { kitty } = await import(REPO + "/src/care.js");
const mem = new Map(), tick = () => new Promise((r) => setTimeout(r, 30));
const st = { kvGet: async (k) => { await tick(); return structuredClone(mem.get(k)) ?? null; }, kvDel: async (k) => { mem.delete(k); }, hit: async () => true,
  kvCas: async (k, e, v) => { await tick(); const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== e) return { ok: false, cur: structuredClone(cur) }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const phone = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", locale: "en-US" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/kitty\//, async (rt) => { const q = rt.request(), req = new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { ...q.headers(), "cf-connecting-ip": "203.0.113.91" }, body: q.method() === "POST" ? q.postData() : undefined });
    const r = await kitty(req, env, json); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const box = () => [...mem.entries()].find(([k]) => k.startsWith("kitty:"));
const bal = (p) => p.$$eval("#bal > div", (x) => x.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const plan = (p) => p.$$eval("#plan .pay span", (x) => x.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
async function cost(p, what, amt, payer, opts = {}) {
  await p.fill("#c-what", what); await p.fill("#c-amt", amt); await p.selectOption("#c-by", { label: payer });
  if (opts.shares) { await p.check("#c-uneven"); for (const [who, w] of Object.entries(opts.shares)) await p.fill('#c-among [data-p]:has-text("' + who + '") [type=number]', String(w)); }
  else if ((await p.isChecked("#c-uneven"))) await p.uncheck("#c-uneven");
  for (const who of opts.out || []) await p.uncheck('#c-among [data-p]:has-text("' + who + '") [type=checkbox]');
  await p.click("#f-cost button[type=submit]"); await p.waitForFunction((w) => new RegExp(w + ", .* added").test(document.querySelector("#c-st").textContent), what);
  for (const who of opts.out || []) await p.check('#c-among [data-p]:has-text("' + who + '") [type=checkbox]');
}

try {
  const A = await phone(); await A.goto("http://localhost:8099/kitty.html");
  await A.evaluate(() => localStorage.setItem("bills:v1", JSON.stringify({ accounts: [{ id: "x", name: "Northwind Power", kind: "power", months: [{ month: "2026-10", text: "Energy used 88.10\nStanding charge 9.30\nTotal amount due 97.40" }, { month: "2026-11", text: "Energy used 101.20\nStanding charge 9.30\nTotal amount due 110.50" }] }] })));
  await A.fill("#n-name", "12 Elm St"); await A.fill("#n-me", "Ann"); await A.fill("#n-others", "Bob, Cat"); await A.selectOption("#n-cur", "£"); await A.click("#f-new button[type=submit]");
  await A.waitForSelector("#main:not([hidden])"); assert.equal(await A.textContent("#k-title"), "12 Elm St"); assert.deepEqual(await bal(A), ["Ann (you) £0.00 square", "Bob £0.00 square", "Cat £0.00 square"]);
  const link = await A.textContent("#k-link"); assert.match(link, /\/kitty#k=[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/);
  const B = await phone(); await B.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/kitty#", "/kitty.html#")); await B.waitForSelector("#who:not([hidden])"); await B.click('#who-list [data-n="Bob"]'); await B.waitForSelector("#main:not([hidden])");
  assert.match(await B.textContent("#me-line"), /You're Bob/);
  ok("Ann starts a kitty for 12 Elm St with Bob and Cat; Bob's phone opens its link and he says which one he is");

  assert.match(await A.textContent("#bills"), /Northwind Power, November: £110\.50/); await A.click("#bills [data-b]"); assert.equal(await A.inputValue("#c-amt"), "110.50"); assert.match(await A.inputValue("#c-what"), /Northwind Power, November 2026/);
  await A.click("#f-cost button[type=submit]"); await A.waitForFunction(() => /added/.test(document.querySelector("#c-st").textContent));
  await cost(A, "Rent, December", "1600", "Ann", { shares: { Ann: 2, Bob: 1, Cat: 1 } });
  await cost(B, "Takeaway", "36.40", "Bob", { out: ["Ann"] });
  await A.reload(); await A.waitForSelector("#main:not([hidden])");
  // Ann: paid 110.50 + 1600, her shares 36.84 + 800 → +873.66. Bob: paid 36.40, shares 36.83 + 400 + 18.20 → −418.63. Cat: 36.83 + 400 + 18.20 → −455.03
  const want = ["Ann (you) +£873.66 is owed", "Bob −£418.63 owes", "Cat −£455.03 owes"]; assert.deepEqual(await bal(A), want);
  await B.reload(); await B.waitForSelector("#main:not([hidden])"); assert.deepEqual(await bal(B), want.map((x) => x.replace(" (you)", "")).map((x, i) => (i === 1 ? x.replace("Bob", "Bob (you)") : x)));
  assert.deepEqual(await plan(A), ["Cat pays Ann £455.03", "Bob pays Ann £418.63"]); assert.match(await A.textContent("#plan"), /2 payments settle everyone up/);
  assert.match(await A.textContent("#costs"), /Rent, December £1,600\.00Ann paid .* Ann £800\.00, Bob £400\.00, Cat £400\.00/); assert.match(await A.textContent("#costs"), /Takeaway £36\.40Bob paid .* split between Bob, Cat/);
  ok("Bill Watch's bill drops in with its total; rent by shares, a takeaway between two; both phones show the same balances and the two payments that settle up");

  await B.click('#plan .pay:has-text("Bob pays Ann") [data-paid]'); await B.waitForFunction(() => /Saved/.test(document.querySelector("#sync").textContent));
  assert.deepEqual(await plan(B), ["Cat pays Ann £455.03"]); assert.match(await B.textContent("#paid"), /Bob paid Ann £418\.63/);
  // two costs at the same moment, one on each phone
  await A.fill("#c-what", "Milk"); await A.fill("#c-amt", "2.40"); await B.fill("#c-what", "Bin bags"); await B.fill("#c-amt", "4.80");
  await Promise.all([A.click("#f-cost button[type=submit]"), B.click("#f-cost button[type=submit]")]);
  await A.waitForFunction(() => /Milk, .* added/.test(document.querySelector("#c-st").textContent)); await B.waitForFunction(() => /Bin bags, .* added/.test(document.querySelector("#c-st").textContent));
  await A.reload(); await A.waitForSelector("#main:not([hidden])"); const cs = await A.textContent("#costs"); assert.match(cs, /Milk/); assert.match(cs, /Bin bags/);
  ok("Bob marks his payment made; two costs added at the same moment on two phones are both kept");

  const [k, rec] = box(); const raw = JSON.stringify(rec); assert.ok(!/Ann|Bob|Elm|Rent|Northwind|1600|873/.test(raw), "the server holds no names, costs or amounts"); assert.ok(!raw.includes(link.split(".").pop()), "nor the key");
  const C = await phone(); const bad = link.replace(/.$/, (c) => (c === "A" ? "B" : "A")).replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/kitty#", "/kitty.html#"); await C.goto(bad); await C.waitForFunction(() => /doesn't open/.test(document.querySelector("#n-st").textContent));
  assert.equal(await C.isHidden("#main"), true);
  ok("the server holds no names, amounts or key; a link with the wrong key doesn't open it");

  await A.addScriptTag({ content: AXE }); const v = await A.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; ")));
  assert.deepEqual(v, []); ok("axe finds nothing on a kitty in use");

  await A.click("#del"); await A.waitForSelector("#start:not([hidden])"); assert.equal(box(), undefined); await B.reload(); await B.waitForFunction(() => /doesn't exist any more/.test(document.querySelector("#n-st").textContent));
  ok("deleting the kitty is for everyone");

  assert.deepEqual(errs, []); for (const x of [A, B]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
