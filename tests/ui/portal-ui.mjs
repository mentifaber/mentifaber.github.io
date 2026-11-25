// The Workshop Portal in Chromium, two people in two browsers, against the real portal code (src/portal.js):
//  - without the workshop's session the page explains itself and points to sign in; it never shows the board
//  - the workshop opens a job, quotes it and gets the client's link
//  - the client (another browser) sees the quote, approves it and writes; the private note never reaches them
//  - back on the board the job is flagged with a new message
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { portal } = await import(REPO + "/src/portal.js");
const OWNER = "e".repeat(64), mem = new Map(), hits = new Map();
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), kvList: async (p) => [...mem].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const mk = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/portal\//, async (rt) => { const q = rt.request(), owner = (q.headers()["cookie"] || "").includes("mf_vigil=" + OWNER);
    const r = await portal(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, owner);
    rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p }; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

const W = await mk(), C = await mk();
await W.p.goto("http://localhost:8099/portal.html"); await W.p.waitForFunction(() => /sign in through Vigil/.test(document.body.textContent));
assert.equal(await W.p.$$eval("ul.jobs", (x) => x.length), 0);
ok("without the workshop's session: a note for clients and a sign-in link, no board");

await W.ctx.addCookies([{ name: "mf_vigil", value: OWNER, url: "http://localhost:8099" }]);
await W.p.reload(); await W.p.waitForSelector("#new");
await W.p.fill("#n-title", "Screen and battery, iPhone 13"); await W.p.fill("#n-client", "Sam"); await W.p.selectOption("#n-svc", "repair"); await W.p.fill("#n-email", "sam@example.com"); await W.p.click("#new button[type=submit]");
await W.p.waitForSelector("#q");
await W.p.fill("#q", "OLED screen, 189.50\nBattery, $79"); await W.p.fill("#q-note", "Parts arrive Thursday"); await W.p.click("#q-go");
await W.p.waitForFunction(() => /Total\s*\$268\.50/.test(document.body.textContent));
await W.p.fill("#note", "Customer prefers texts"); await W.p.check("#priv"); await W.p.click("#n-go"); await W.p.waitForFunction(() => /Private: Customer prefers texts/.test(document.body.textContent));
const link = await W.p.textContent("#link"); assert.match(link, /\/portal#[0-9a-f]{10}\.[0-9a-f]{32}$/);
ok("signed in: open a job, quote two lines ($268.50 total), add a private note, and get the client's link");

await C.p.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/portal#", "/portal.html#")); await C.p.waitForSelector("#approve");
const cv = await C.p.textContent("main"); assert.match(cv, /Screen and battery, iPhone 13[\s\S]*Tech repair · for Sam[\s\S]*OLED screen\s*\$189\.50[\s\S]*Battery\s*\$79\.00[\s\S]*Total\s*\$268\.50[\s\S]*Parts arrive Thursday/);
assert.doesNotMatch(cv, /prefers texts|sam@example/); assert.doesNotMatch(await C.p.content(), /prefers texts|sam@example\.com/);
await C.p.click("#approve"); await C.p.waitForFunction(() => /You approved this/.test(document.body.textContent));
await C.p.waitForFunction(() => document.querySelectorAll(".rail span.on").length === 3 && /approved/.test(document.querySelector(".rail span.now").textContent));
await C.p.fill("#text", "Can you check the camera too?"); await C.p.click("#msg button[type=submit]"); await C.p.waitForFunction(() => /You: Can you check the camera too\?/.test(document.body.textContent));
ok("the client's link: the quote, approve it (the rail moves to approved), and write; the private note and their email never reach their page");

await W.p.goto("http://localhost:8099/portal.html"); await W.p.waitForSelector("ul.jobs");
assert.match(await W.p.textContent("ul.jobs"), /New message[\s\S]*\$268\.50/);
await W.p.click("[data-job]"); await W.p.waitForFunction(() => /Client: Can you check the camera too\?/.test(document.body.textContent));
ok("back on the board the job is under approved, flagged with a new message, and the message is there");

// a hosted site: the client and the workshop both see its status and its uptime from the round-the-clock checks
const [jk, jj] = [...mem].find(([k]) => k.startsWith("job:")); const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
mem.set(jk, { ...jj, site: "https://shop.example/", siteCheck: { up: true, status: 200, ms: 120, at: Date.now() }, uptime: { days: { [day(1)]: [96, 96], [day(0)]: [96, 95] }, fails: 0, down: null } });
await C.p.reload(); await C.p.waitForSelector(".uptime"); assert.match(await C.p.textContent(".uptime"), /^Up 99\.48% of 192 checks over the last 2 days\. Checked every 15 minutes, around the clock\.$/);
assert.match(await C.p.textContent("main"), /Your site\s*shop\.example\/\s*Up · 120 ms/);
await W.p.reload(); await W.p.waitForFunction(() => /Their site/.test(document.body.textContent)); assert.match(await W.p.textContent(".uptime"), /Up 99\.48% of 192 checks/);
ok("a hosted site: the client's page and the workshop's both show it's up and its uptime from the round-the-clock checks");

for (const x of [W, C]) { assert.equal(await x.p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0); assert.deepEqual(x.p.errs, []); }
ok("no page errors, no sideways scroll");
await b.close();
