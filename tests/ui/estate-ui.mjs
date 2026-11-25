// Digital Estate (/estate) in Chromium, against the real Sealed Letters and Quiet Check-in code (src/letters.js,
// src/checkin.js) and the real cryptography:
//  - a ledger of accounts and devices, from the common ones or your own; a password typed in is refused
//  - sealed for 2 of 3 named people, opening only once the writer's Quiet Check-in goes quiet: the family's link is
//    refused, the writer's own works; the site gets only ciphertext; each person gets their own named link
//  - with two people's links it stays shut while the writer keeps checking in, and opens as a ledger once they've gone
//    quiet for the days; the draft can be cleared from the device
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { letters } = await import(REPO + "/src/letters.js"), { checkin } = await import(REPO + "/src/checkin.js");
const mem = new Map(), hits = new Map(), posted = [], DAY = 864e5;
const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k),
  kvList: async (p) => [...mem].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1180, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/letters/, async (rt) => { const q = rt.request(); if (q.method() === "POST") posted.push(q.postData());
  const r = await letters(new Request(q.url(), { method: q.method(), headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.71" }, body: q.method() === "POST" ? q.postData() : undefined }), env, json);
  rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
// the writer's own Quiet Check-in
const c = await (await checkin(new Request("https://mentifaber.org/api/checkin", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.72" }, body: JSON.stringify({ name: "Anders", by: "10:00", tz: "UTC" }) }), env, json, {})).json();
const meLink = "https://mentifaber.org/checkin#me." + c.id + "." + c.me, famLink = "https://mentifaber.org/checkin#fam." + c.id + "." + c.fam;

await p.goto("http://localhost:8099/estate.html"); await p.waitForSelector("#starters .chip");
await p.click("#starters .chip:has-text('Email')"); await p.fill("#a-where", "Password manager, under Google; recovery codes in the desk drawer"); await p.click("#a-go");
await p.click("#starters .chip:has-text('Phone')"); await p.fill("#a-to", "Sam"); await p.fill("#a-where", "Passcode is in the sealed envelope with the will"); await p.click("#a-go");
await p.selectOption("#a-kind", "money"); await p.fill("#a-name", "Credit union savings"); await p.selectOption("#a-wish", "pass"); await p.fill("#a-to", "Robin"); await p.fill("#a-where", "password: hunter22"); await p.click("#a-go");
assert.match(await p.textContent("#a-st"), /looks like a password/); await p.fill("#a-where", "Branch on Elm Street; the account number is in the filing cabinet"); await p.click("#a-go");
await p.waitForFunction(() => document.querySelectorAll("#rows tr").length === 3);
assert.match(await p.textContent("#rows"), /Email[\s\S]*Save what's in it, then close it[\s\S]*Phone[\s\S]*Give it to Sam[\s\S]*Credit union savings[\s\S]*Give it to Robin/);
assert.equal(await p.$$eval("#starters .chip", (x) => x.filter((c) => /Email|Phone/.test(c.textContent)).length), 0, "a starter once added isn't offered again");
await p.fill("#msg", "Thank you for doing this. The will is with Hale & Co."); await p.fill("#from", "Anders");
ok("a ledger from the common ones and your own; a password typed in is refused");

await p.fill("#n", "3"); await p.fill("#k", "2"); await p.fill("#f0", "Sam"); await p.fill("#f1", "Robin"); await p.fill("#f2", "Jo"); await p.fill("#days", "30");
await p.fill("#ci", famLink); await p.click("#seal"); await p.waitForSelector("#s-st.bad"); assert.match(await p.textContent("#s-st"), /your own Quiet Check-in link/);
await p.fill("#ci", meLink); await p.click("#seal"); await p.waitForSelector("#shares li");
const shares = await p.$$eval("#shares li", (xs) => xs.map((x) => [x.querySelector("b").textContent, x.querySelector("code").textContent]));
assert.deepEqual(shares.map((s) => s[0]), ["Sam", "Robin", "Jo"]); assert.match(await p.textContent("#done"), /3 accounts and devices\. Any 2 of these 3 people can open it, once your Quiet Check-in has gone 30 days without a check-in/);
const sent = posted.at(-1); assert.ok(!/Credit union|Sam|hunter|desk drawer|Hale/.test(sent), "only ciphertext leaves the browser"); assert.equal(JSON.parse(sent).lock.type, "quiet");
const L = [...mem].find(([k]) => k.startsWith("letter:")); assert.ok(L && !JSON.stringify(L[1]).includes(c.me), "the check-in key isn't kept");
await p.click("#clear"); assert.equal(await p.evaluate(() => localStorage.getItem("estate:v1")), null);
ok("sealed for 2 of 3 named people, opening only once the Quiet Check-in goes quiet: the family's link is refused; only ciphertext is sent; the draft clears");

const local = (u) => u.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/letters#", "/letters.html#");
const O = await ctx.newPage(); O.on("pageerror", (e) => errs.push(e.message));
await O.goto(local(shares[0][1])); await O.waitForSelector("#more"); await O.fill("#more", shares[1][1]); await O.click("#add");
await O.waitForFunction(() => /isn't allowed to open yet/.test(document.querySelector("main").textContent));
ok("two people's links together: still shut while the writer keeps checking in");

// 31 days of quiet
const id = L[0].slice(7); { const x = mem.get(L[0]); x.lock.last = Date.now() - 31 * DAY; mem.set(L[0], x); const y = mem.get("ci:" + c.id); y.last = Date.now() - 31 * DAY; mem.set("ci:" + c.id, y); }
await O.goto("about:blank"); await O.goto(local(shares[0][1])); await O.waitForSelector("#more"); await O.fill("#more", shares[2][1]); await O.click("#add");
await O.waitForSelector("ol.estate li"); const opened = await O.textContent("main");
assert.match(opened, /A digital estate[\s\S]*From Anders[\s\S]*Thank you for doing this\. The will is with Hale & Co\.[\s\S]*Email[\s\S]*Save what's in it, then close it[\s\S]*Where to find it: Password manager, under Google[\s\S]*Phone[\s\S]*Give it to Sam[\s\S]*Credit union savings[\s\S]*Give it to Robin/);
assert.ok(id.length === 16);
ok("quiet for 30 days, it opens with two people's links, as a ledger of what should become of each");
assert.deepEqual(errs, []); for (const x of [p, O]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
