// Quiet Check-in in Chromium against the real server code (src/checkin.js): set up a circle, get two links; on her
// link one big "I'm OK" button, which turns to "Done for today"; on the family's link her status (waiting, checked
// in, or missed with a nudge to call) and the button that turns on alerts for this phone.
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { checkin } = await import(REPO + "/src/checkin.js");
const mem = new Map(); const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), kvList: async () => [], hit: async () => true };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1180, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"], timezoneId: "America/Chicago" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/checkin/, async (rt) => { const q = rt.request(); const r = await checkin(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json, { PUSH_HOSTS: /^https:\/\/fcm\.googleapis\.com\// }); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const local = (u) => u.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/checkin#", "/checkin.html#");

await p.goto("http://localhost:8099/checkin.html"); assert.equal(await p.inputValue("#tz"), "America/Chicago", "the time zone is filled in from the device");
await p.fill("#name", "Gran"); await p.fill("#by", "10:00"); await p.click("#f button[type=submit]"); await p.waitForSelector(".link");
const [meLink, famLink] = await p.$$eval(".link", (xs) => xs.map((x) => x.textContent)); assert.match(meLink, /#me\.[0-9a-f]{16}\.[0-9a-f]{32}$/); assert.match(famLink, /#fam\.[0-9a-f]{16}\.[0-9a-f]{32}$/);
ok("set up for Gran (her time zone filled in from the device): two links, hers and the family's");

await p.goto(local(famLink)); await p.waitForSelector(".state"); assert.match(await p.textContent(".state"), /✓ Gran checked in today/, "setting it up counts as today's check-in");
const id = /fam\.([0-9a-f]{16})/.exec(famLink)[1], C = mem.get("ci:" + id); C.last = Date.now() - 3 * 864e5; C.by = "00:00"; mem.set("ci:" + id, C);
await p.reload(); await p.waitForSelector(".state.late"); assert.match(await p.textContent(".state"), /Gran hasn't checked in today\. Their time was 00:00\. Give them a call\./);
assert.ok(await p.$("#watch"), "this phone can be told");
ok("the family's link: checked in when it was set up; days without a check-in past her time reads as missed, with a nudge to call; alerts can be turned on");

await p.goto(local(meLink)); await p.waitForSelector("#ok"); assert.match(await p.textContent("#ok"), /^I'm OK$/);
const box = await (await p.$("#ok")).boundingBox(), vh = M ? 844 : 900; assert.ok(box.height >= vh * 0.4 && box.width > (M ? 300 : 400), "one big button: " + JSON.stringify(box));
await p.click("#ok"); await p.waitForSelector("#ok.done"); assert.match(await p.textContent("#ok"), /✓ Done for today/);
await p.goto(local(famLink)); await p.waitForSelector(".state.ok"); assert.match(await p.textContent(".state"), /✓ Gran checked in today at/);
ok("her link: one button filling half the screen; a tap turns it to Done for today, and the family's page says she's checked in");
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0); assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close();
