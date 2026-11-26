// Repair Café (/repair) in Chromium, against the real repair, board and seal code (src/repair.js, src/board.js,
// src/seal.js). Four phones: the organiser at the workshop's own table (signed in), a neighbour, a walk-in, and a helper.
//  - the organiser makes the day and posts it on Street Board; the neighbour's Street Board shows the notice, and its link
//    opens the day
//  - the neighbour books a slot; Fix or Replace weighs up her laptop as she types; the public sees no names
//  - the door: her booking with Fix or Replace's verdict, "Here", a walk-in with a link for his phone, the queue on both
//    phones, a table
//  - at the workshop's table her fix is written up with a Device Passport; her phone shows what was done and the passport,
//    which checks out as signed by the workshop
//  - a helper (the helpers' link) can't issue a passport and is told so; the walk-in's toaster goes to the workshop, and
//    his phone gets the Workshop Portal link
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { repair } = await import(REPO + "/src/repair.js"), { board } = await import(REPO + "/src/board.js"), { seal } = await import(REPO + "/src/seal.js");
const mem = new Map(); let keyRec = null; const portalAsks = [];
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => { mem.delete(k); }, hit: async () => true,
  kvCas: async (k, expect, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== expect) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; },
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()) };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8"); // as a11y-ui: the door and a booking, not only the empty page
const axe = async (p) => { await p.addScriptTag({ content: AXE }); return p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; "))); };
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const phone = async (owner) => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/(repair|board|seal|portal)(\/|$)/, async (rt) => { const q = rt.request(), u = q.url();
    if (/\/api\/portal\/request/.test(u)) { portalAsks.push(JSON.parse(q.postData())); return rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ab12cd34ef", link: "/portal#ab12cd34ef.Zx9_8-7y6w5vQQ" }) }); }
    const req = new Request(u.replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.90" }, body: q.method() === "POST" ? q.postData() : undefined });
    const r = /\/api\/repair/.test(u) ? await repair(req, env, json) : /\/api\/board\//.test(u) ? await board(req, env, json) : await seal(req, env, json, owner);
    rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  await ctx.route(/^http:\/\/localhost:8099\/(street|repair|passport|second|fix)$/, (rt) => rt.continue({ url: rt.request().url() + ".html" })); // the site's short addresses
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const date = new Date(Date.now() + 3 * 864e5), DATE = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
const day = () => [...mem.entries()].find(([k]) => k.startsWith("rc:"))[1];

try {
  // the organiser, at the workshop's table
  const O = await phone(true); await O.goto("http://localhost:8099/repair.html"); await O.evaluate(() => localStorage.setItem("street:board", JSON.stringify("elm-street"))); await O.reload();
  assert.equal(await O.inputValue("#n-board"), "elm-street", "the street Street Board knows");
  await O.fill("#n-title", "Elm Street Repair Café"); await O.fill("#n-place", "The library hall, 2 Elm St"); await O.fill("#n-date", DATE); await O.fill("#n-from", "10:00"); await O.fill("#n-to", "12:00"); await O.fill("#n-slot", "30"); await O.fill("#n-tables", "2");
  await O.fill("#n-note", "Bring the charger"); await O.click("#f-new button[type=submit]"); await O.waitForSelector("#door:not([hidden])");
  const ID = day().id; assert.equal(new URL(O.url()).hash, "#" + ID); assert.equal(await O.textContent("#d-title"), "Elm Street Repair Café"); assert.match(await O.textContent("#d-when"), /10:00–12:00 · The library hall, 2 Elm St/);
  assert.equal(await O.$$eval("#b-slots input", (x) => x.length), 4); assert.equal(await O.inputValue("#p-board"), "elm-street");
  await O.click("#f-post button[type=submit]"); await O.waitForFunction(() => /on elm-street's Street Board/.test(document.querySelector("#door-st").textContent));
  const post = mem.get("sb:elm-street").posts[0]; assert.match(post.text, new RegExp("^Elm Street Repair Café, .* 10:00–12:00 at The library hall, 2 Elm St: bring something broken\\. Book a slot: mentifaber\\.org/repair#" + ID + "$")); assert.ok(post.text.length <= 160); assert.equal(post.kind, "offer");
  ok("the organiser makes the day (its street from Street Board) and posts it on the street's board, with the booking link");

  // the neighbour sees it on Street Board and books
  const A = await phone(false); await A.goto("http://localhost:8099/street.html"); await A.evaluate(() => localStorage.setItem("street:board", JSON.stringify("elm-street"))); await A.reload();
  await A.waitForSelector(".post.offer a"); await A.click(".post.offer a"); await A.waitForSelector("#f-book:not([hidden])"); assert.equal(new URL(A.url()).hash, "#" + ID);
  assert.equal(await A.isHidden("#door"), true, "not the door"); assert.match(await A.textContent("#d-note"), /Bring the charger/);
  await A.check("#b-slots input[value='10:00']"); await A.fill("#b-name", "Ann"); await A.fill("#b-dev", "ThinkPad laptop"); await A.fill("#b-prob", "The battery dies fast"); await A.fill("#b-age", "4");
  assert.match(await A.textContent("#b-chk"), /Fix or Replace: Fix it/);
  await A.click("#f-book button[type=submit]"); await A.waitForFunction(() => /Booked for 10:00/.test(document.querySelector("#b-st").textContent));
  await A.waitForSelector("#yours:not([hidden])"); assert.match(await A.textContent("#mine"), /ThinkPad laptop\s*Booked for 10:00/); assert.match(await A.textContent("#b-slots"), /10:00 1 left/);
  const pub = await A.evaluate(async (id) => (await fetch("/api/repair/" + id)).text(), ID); assert.ok(!/Ann|ThinkPad|battery/.test(pub), "the public sees no names");
  ok("Street Board's notice links to the day; the neighbour books 10:00, Fix or Replace weighs up her laptop as she types, and the public sees no names");

  // the door
  await O.click("#refresh"); await O.waitForSelector("#booked .card"); assert.match(await O.textContent("#booked .card"), /Ann · ThinkPad laptop\s*10:00 Fix or Replace: Fix it\s*The battery dies fast/);
  await O.click("#booked [data-here]"); await O.waitForSelector("#queue .card"); assert.match(await O.textContent("#queue .card"), /1\. here since/);
  await O.fill("#w-name", "Dee"); await O.fill("#w-dev", "Toaster"); await O.fill("#w-prob", "Only one side heats"); await O.click("#f-walk button[type=submit]"); await O.waitForSelector("#w-link:not([hidden])");
  const walkUrl = (await O.textContent("#w-url")).replace(/^https?:\/\/[^/]+/, "http://localhost:8099"); assert.match(walkUrl, new RegExp("/repair#" + ID + "/b=[0-9a-f]{12}\\.[0-9a-f]{32}$"));
  assert.equal(await O.$$eval("#queue .card", (x) => x.length), 2);
  const W = await phone(false); await W.goto(walkUrl); await W.waitForSelector("#yours:not([hidden])"); assert.equal(new URL(W.url()).hash, "#" + ID, "the secret isn't left in the address bar");
  assert.match(await W.textContent("#mine"), /Toaster\s*1 ahead of you/);
  await A.reload(); await A.waitForSelector("#yours:not([hidden])"); assert.match(await A.textContent("#mine"), /You're next/);
  await O.click("#queue .card:first-child [data-to='1']"); await O.waitForSelector("#tables .tbl.busy"); assert.match(await O.textContent("#tables .tbl.busy"), /Table 1\s*Ann · ThinkPad laptop/);
  await A.reload(); await A.waitForSelector("#yours:not([hidden])"); assert.match(await A.textContent("#mine"), /At table 1 now/); await W.reload(); await W.waitForSelector("#yours:not([hidden])"); assert.match(await W.textContent("#mine"), /You're next/);
  ok("the door: her booking with Fix or Replace's verdict, checked in, a walk-in with a link for his phone; the queue on both phones; a table");
  assert.deepEqual(await axe(O), [], "the door, with a write-up open"); assert.deepEqual(await axe(A), [], "a booking");
  ok("axe finds nothing at the door (a write-up open at a table) or on a neighbour's booking");

  // the fix, with a Device Passport from the workshop's table
  const T1 = "#tables .tbl.busy form.up"; await O.fill(T1 + " [name=work]", "Replaced the battery\nCalibrated it"); await O.fill(T1 + " [name=parts]", "01AV422 battery"); await O.fill(T1 + " [name=bat]", "100");
  await O.click(T1 + " button[type=submit]"); await O.waitForSelector("#done .card"); assert.match(await O.textContent("#done .card"), /Ann · ThinkPad laptop\s*Fixed, table 1\s*Replaced the battery; Calibrated it · Parts: 01AV422 battery/);
  assert.ok(day().ents.find((e) => e.name === "Ann").done.passport);
  await A.reload(); await A.waitForSelector("#mine [data-pp]"); assert.match(await A.textContent("#mine"), /Fixed[\s\S]*Replaced the battery[\s\S]*Calibrated it[\s\S]*Parts: 01AV422 battery/);
  await A.click("#mine [data-pp]"); await A.waitForSelector(".verdict"); assert.match(await A.textContent(".verdict"), /✓ Signed by the Mentifaber workshop/); assert.match(await A.textContent("#view"), /ThinkPad laptop[\s\S]*Replaced the battery/);
  ok("at the workshop's table the fix is written up with a Device Passport; her phone shows what was done, and the passport checks out");

  // a helper's table: no passport; the toaster goes to the workshop
  await O.click("#helpers"); const helpers = (await O.textContent("#copied")).replace(/^https?:\/\/[^/]+/, "http://localhost:8099"); assert.match(helpers, new RegExp("/repair#" + ID + "~[0-9a-f]{32}$"));
  const H = await phone(false); await H.goto(helpers); await H.waitForSelector("#door:not([hidden])"); assert.equal(new URL(H.url()).hash, "#" + ID, "the key isn't left in the address bar");
  await H.click("#queue .card [data-to='2']"); await H.waitForSelector("#tables .tbl.busy"); const T2 = "#tables .tbl.busy form.up";
  await H.fill(T2 + " [name=work]", "Cleaned the contacts"); await H.click(T2 + " button[type=submit]"); await H.waitForFunction((s) => /Only the workshop's own table/.test(document.querySelector(s + " [data-st]").textContent), T2);
  assert.equal(day().ents.find((e) => e.name === "Dee").done, null, "not written up");
  await H.selectOption(T2 + " [name=out]", "workshop"); assert.equal(await H.isVisible(T2 + " [name=email]"), true); assert.equal(await H.isVisible(T2 + " [name=pp]"), false);
  await H.fill(T2 + " [name=note]", "The element needs replacing"); await H.click(T2 + " button[type=submit]"); await H.waitForSelector("#done .card + .card");
  assert.equal(portalAsks.length, 1); assert.equal(portalAsks[0].name, "Dee"); assert.match(portalAsks[0].msg, /Elm Street Repair Café.*table 2/);
  await W.reload(); await W.waitForSelector("#mine [data-portal]"); assert.match(await W.textContent("#mine"), /It's gone to the workshop[\s\S]*The element needs replacing/); assert.equal(await W.getAttribute("#mine [data-portal]", "href"), "/portal#ab12cd34ef.Zx9_8-7y6w5vQQ");
  ok("a helper's table can't issue a Device Passport and is told so; the walk-in's toaster goes to the workshop, and his phone gets the Workshop Portal link");

  await O.click("#refresh"); await O.waitForFunction(() => document.querySelector("#counts").textContent === "1Booked1Walk-ins0Waiting0At tables1Fixed1Other");
  await O.goto("http://localhost:8099/repair.html"); await O.waitForSelector("#mydays:not([hidden])"); assert.match(await O.textContent("#days"), /Elm Street Repair Café\s*you run it/);
  ok("the day's counts; the organiser's phone lists the day it runs");

  assert.deepEqual(errs, []); for (const x of [O, A, W, H]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
