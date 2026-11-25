// Foundry for other makers in Chromium, end to end against the real backend (src/makers.js): a maker checks and sends
// a manifest on /makers and gets a status link; the workshop (only it) sees the queue and approves; Foundry lists the
// app under "From other makers"; FaberOS opens it in a sandboxed window on the app's own https address, where the
// Faber kit (loaded from the site) works across addresses: the app's notification arrives, and AutoFaber runs its verb.
// A message from any other address is ignored.
//   node makers2-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2], DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { makers } = await import(REPO + "/src/makers.js");
const kv = new Map(), hits = new Map();
const env = { STORE: { idFromName: () => "main", get: () => ({ kvGet: async (k) => (kv.has(k) ? structuredClone(kv.get(k)) : null), kvPut: async (k, v) => kv.set(k, structuredClone(v)),
  kvList: async (p) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } }) } };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
let owner = false, next = [];
await ctx.route(/.*/, async (rt) => {
  const u = new URL(rt.request().url());
  if (u.hostname === "mf.test") {
    if (u.pathname.startsWith("/api/makers/")) { const rq = rt.request(), r = await makers(new Request(u.href, { method: rq.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.7.7" }, body: rq.postData() || undefined }), env, json, owner, {}); return rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); }
    if (u.pathname === "/api/hive/os/plan") return rt.fulfill({ contentType: "application/json", body: JSON.stringify({ actions: next }) });
    if (u.pathname.startsWith("/api/")) return rt.fulfill({ contentType: "application/json", body: "{}" });
    if (u.pathname === "/store/catalog.json") return rt.fulfill({ contentType: "application/json", body: JSON.stringify({ apps: [{ id: "org.mentifaber.hive", name: "AutoFaber", tagline: "The AI", category: "AI", web: "/hive", available: false }] }) });
    let f = path.join(REPO, decodeURIComponent(u.pathname)); if (u.pathname === "/os") f = path.join(REPO, "os.html");
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return rt.fulfill({ status: 404, body: "nope" });
    return rt.fulfill({ contentType: TYPES[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  }
  if (u.hostname === "tides.example") return rt.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><title>Tide Clock</title><h1>Tide Clock</h1><p id="io"></p>
    <script src="https://mf.test/assets/os/faber.js"></script><script>
      document.getElementById("io").textContent = "inOS=" + Faber.inOS;
      Faber.verbs({ "next-tide": (a) => "High tide at " + (a.harbour || "Dover") + " 14:05" });
      Faber.notify("Tide Clock", "ready in FaberOS");
    </script>` });
  return rt.abort();
});
await ctx.addInitScript(() => { try { if (location.hostname === "mf.test") { localStorage.setItem("fos:seen", "true"); localStorage.setItem("fos:ver", '"0.4"'); } } catch (e) {} });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const man = { format: "faberos/1", id: "tide-clock", name: "Tide Clock", desc: "High and low tides for any harbour, with a clock face that shows where the water is now.", entry: "https://tides.example/app", cat: "world", hue: 200,
  permissions: ["fullscreen"], kit: true, glyph: '<circle cx="12" cy="12" r="8"/><path d="M4 14c3-2 5 2 8 0s5 2 8 0"/>', verbs: [{ name: "next-tide", label: "Tell me the next tide", changes: false, args: { "harbour?": "string" }, words: "tide high low harbour" }] };

// 1. the maker sends it
await p.goto("https://mf.test/makers.html");
await p.fill("#man", JSON.stringify(man, null, 2)); await p.click("#chk"); await p.waitForSelector("#out .ok");
await p.fill("#mail", "maker@tides.example"); await p.fill("#by", "Tide Co"); await p.click("#send");
await p.waitForSelector("#st-word", { timeout: 5000 }).catch(async () => { throw new Error("no status: " + await p.textContent("#out") + " | " + p.url() + " | " + errs.join(";")); }); assert.match(await p.textContent("#st-word"), /Waiting for review/); assert.match(p.url(), /#status=tide-clock\.[0-9a-f]{32}$/);
assert.equal(await p.isVisible("#review"), false, "a maker doesn't see the review queue");
const link = p.url(); ok("a maker checks and sends a manifest and gets a private status link; no review queue for them");

// 2. the workshop approves
owner = true; await p.goto("https://mf.test/makers.html?as=workshop#review"); await p.waitForSelector("#queue [data-id='tide-clock']", { timeout: 6000 }).catch(async () => { throw new Error("no queue: " + (await p.innerHTML("body")).slice(-1500)); });
assert.match(await p.textContent("#queue"), /maker@tides\.example[\s\S]*next-tide/);
await p.fill("#queue [data-id='tide-clock'] input", "Lovely clock"); await p.click("#queue [data-id='tide-clock'] button[data-d='approve']");
await p.waitForFunction(() => /Approved/.test(document.querySelector("#queue").textContent)); owner = false;
await p.goto(link); await p.waitForSelector("#st-word"); assert.match(await p.textContent("#st-word"), /Approved/); assert.match(await p.textContent("#status"), /Lovely clock/);
ok("only the workshop sees the queue; it approves with a note, and the maker's link says so");

// 3. Foundry lists it
await p.goto("https://mf.test/store.html"); await p.waitForSelector(".list.makers .maker");
assert.match(await p.textContent(".list.makers"), /Tide Clock[\s\S]*by Tide Co[\s\S]*AutoFaber can operate it/);
assert.equal(await p.getAttribute(".maker a.btn.pri", "href"), "/os?open=x-tide-clock");
assert.equal(await p.innerHTML(".maker .mk-tile svg"), '<circle cx="12" cy="12" r="8"></circle><path d="M4 14c3-2 5 2 8 0s5 2 8 0"></path>');
ok("Foundry lists it under \"From other makers\", by its maker, with Open in FaberOS");

// 4. FaberOS runs it in a sandbox, across addresses
await p.goto("https://mf.test/os?open=x-tide-clock");
const fr = await p.waitForSelector(".win[data-id='x-tide-clock'] iframe", { state: "attached" });
assert.match(await fr.getAttribute("sandbox"), /allow-scripts/); assert.ok(!/allow-top-navigation/.test(await fr.getAttribute("sandbox")), "it can't navigate FaberOS's tab");
assert.equal(await fr.getAttribute("src"), "https://tides.example/app");
const f = await fr.contentFrame(); await f.waitForSelector("#io"); await f.waitForFunction(() => document.getElementById("io").textContent === "inOS=true");
await p.waitForFunction(() => (JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body === "ready in FaberOS");
ok("FaberOS opens it in a sandboxed window on its own address; the Faber kit works there and its notification arrives");

next = [{ do: "verb", app: "x-tide-clock", verb: "next-tide", args: { harbour: "Brighton" } }];
await p.click("#ask-in"); await p.fill("#ask-in", "when is the next high tide"); await p.waitForSelector("#sug:not([hidden]) li");
const s = await p.$$eval("#sug li", (xs) => xs.map((x) => x.textContent)); const i = s.findIndex((x) => /Let AutoFaber/.test(x)); assert.ok(i >= 0, JSON.stringify(s));
await p.click("#sug li:nth-child(" + (i + 1) + ")");
await p.waitForFunction(() => (JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {}).body === "High tide at Brighton 14:05", null, { timeout: 15000 });
ok("AutoFaber runs another maker's verb and the answer comes back");

// a message from an address that isn't the app's is ignored
await p.evaluate(() => window.postMessage({ faberos: 1, type: "notify", title: "spoof", body: "not from the app" }, "*")); await p.waitForTimeout(300);
assert.notEqual((await p.evaluate(() => JSON.parse(localStorage.getItem("fos:notes") || "[]")[0] || {})).body, "not from the app");
ok("a message that isn't from the app's own window and address is ignored");
assert.deepEqual(errs, []); await b.close(); console.log("all passed " + DEV);
