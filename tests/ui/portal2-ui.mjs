// The services arm, end to end in Chromium against the real portal code (src/portal.js):
//  - a visitor asks for a quote on /services: a job opens on the workshop's board as a request, and the visitor gets its
//    private link at once (no email app); that link shows "Your request"
//  - the workshop quotes it and adds an invoice with a payment link; the client sees Pay now (the workshop's own payment
//    page) and says "I've paid"; the workshop sees that, ticks Paid, and the client sees Paid
//  - a site the workshop hosts gets a public status page, with nothing about the client on it
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { portal } = await import(REPO + "/src/portal.js");
const OWNER = "e".repeat(64), mem = new Map(), hits = new Map(), alerts = [];
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k),
  kvList: async (p) => [...mem].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
globalThis.fetch = async () => { throw new Error("offline"); }; // the hosted site's check: nothing answers in the test
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const mk = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/portal\//, async (rt) => { const q = rt.request(), owner = (q.headers()["cookie"] || "").includes("mf_vigil=" + OWNER);
    const r = await portal(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "5.5.5.5" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, owner, { alert: async (x) => alerts.push(x) });
    rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  await ctx.route(/\/api\/(?!portal\/)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p }; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const W = await mk(), C = await mk();
await W.ctx.addCookies([{ name: "mf_vigil", value: OWNER, url: "http://localhost:8099" }]);

// 1. a visitor asks for a quote
await C.p.goto("http://localhost:8099/services.html");
await C.p.click("#chips .chip:has-text('Web hosting')"); await C.p.fill("#name", "Robin"); await C.p.fill("#from", "robin@example.com");
await C.p.fill("#what", "robin-bakes.example"); await C.p.fill("#msg", "I'd like my bakery site hosted, with a contact form.");
await C.p.click("#f button[type=submit]"); await C.p.waitForSelector("#sent");
const link = await C.p.getAttribute("#sent-link", "href"); assert.match(link, /^\/portal#[0-9a-f]{10}\.[0-9a-f]{32}$/);
assert.equal(alerts.length, 1); assert.match(alerts[0].title, /New request: Web hosting from Robin/);
await C.p.goto("http://localhost:8099" + link.replace("/portal", "/portal.html")); await C.p.waitForSelector("h2:text('Your request')");
assert.match(await C.p.textContent("main"), /robin-bakes\.example[\s\S]*Your request/);
ok("a visitor's request opens a job on the board and gives them its private link at once; the workshop is told");

// 2. the workshop quotes, invoices with a payment link
await W.p.goto("http://localhost:8099/portal.html"); await W.p.waitForSelector("h2:text('request')");
await W.p.click("ul.jobs button:has-text('robin-bakes.example')"); await W.p.waitForSelector("#q");
assert.match(await W.p.textContent("main"), /robin@example\.com[\s\S]*Asked for a quote \(Web hosting, robin-bakes\.example; whenever suits\): I'd like my bakery site hosted/);
await W.p.fill("#q", "Hosting, first year, 120"); await W.p.click("#q-go"); await W.p.waitForSelector("#i-amt");
await W.p.fill("#i-amt", "120"); await W.p.fill("#i-num", "2001"); await W.p.fill("#i-link", "https://buy.stripe.com/test_abc"); await W.p.fill("#site", "https://robin-bakes.example");
await W.p.click("#x-go"); await W.p.waitForSelector("text=Public status page");
const statusHref = await W.p.getAttribute("a[href^='/status#']", "href"); assert.match(statusHref, /^\/status#[0-9a-f]{16}$/);
await W.p.waitForTimeout(300); await W.p.evaluate(() => { document.querySelector("#i-link").value = "javascript:alert(1)"; document.querySelector("#x-go").click(); }); // set and save at once: the editor redraws after each save await W.p.waitForSelector("#e-st.bad", { timeout: 5000 }).catch(async () => { throw new Error("no error: " + (await W.p.textContent("#e-st")) + " | link=" + (await W.p.inputValue("#i-link"))); }); assert.match(await W.p.textContent("#e-st"), /https:\/\/ address/);
ok("the workshop quotes it and invoices with a payment link (only https:// links); a hosted site gets a status page");

// 3. the client pays and says so
await C.p.goto("http://localhost:8099" + link.replace("/portal#", "/portal.html?r=1#")); await C.p.waitForSelector("#pay");
assert.equal(await C.p.getAttribute("#pay", "href"), "https://buy.stripe.com/test_abc"); assert.match(await C.p.textContent("main"), /Invoice #2001/);
await C.p.click("#paid"); await C.p.waitForSelector("#claimed"); assert.match(await C.p.textContent("#claimed"), /The workshop will confirm/);
assert.ok(alerts.some((a) => /Paid\? Robin/.test(a.title)));
await W.p.reload(); await W.p.waitForSelector("#i-paid"); assert.match(await W.p.textContent("main"), /The client says they paid/);
await W.p.evaluate(() => { document.querySelector("#i-paid").checked = true; document.querySelector("#i-link").value = "https://buy.stripe.com/test_abc"; document.querySelector("#x-go").click(); }); await W.p.waitForFunction(() => document.querySelector("#i-paid") && document.querySelector("#i-paid").checked);
await C.p.reload(); await C.p.waitForSelector(".pill.up:text('Paid')"); assert.equal(await C.p.$$eval("#pay, #paid", (x) => x.length), 0);
ok("the client sees Pay now and says they've paid; the workshop sees it and ticks Paid; the client sees Paid");

// 4. the public status page
const P = await mk(); await P.p.goto("http://localhost:8099/status.html" + statusHref.replace("/status", "")); await P.p.waitForSelector("#now", { timeout: 5000 }).catch(async () => { throw new Error("status page: " + (await P.p.textContent("main")) + " | " + P.p.url()); });
assert.match(await P.p.textContent("h1"), /robin-bakes\.example/); assert.match(await P.p.textContent("#now"), /Not answering/);
const txt = await P.p.textContent("body"); assert.ok(!/Robin|robin@|2001|120/.test(txt.replace(/robin-bakes\.example/g, "")), "nothing about the client: " + txt.slice(0, 300));
await P.p.goto("http://localhost:8099/status.html#" + "0".repeat(16)); await P.p.reload(); await P.p.waitForFunction(() => /doesn't open a site/.test(document.body.textContent));
ok("the status page says whether the site answers, with nothing about the client; a wrong link says so");
for (const x of [W, C, P]) assert.deepEqual(x.p.errs, []);
assert.equal(await C.p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
