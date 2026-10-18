// Links and the build check in Chromium, with a real Hive behind them: "Check all builds" runs every finished result unseen
// and gets the broken one fixed; Publish gives a link; build.html runs it sandboxed for anyone; Genesis's private preview is
// the owner's alone until he makes it public.   node pub-ui.mjs <repo> mobile|desktop
import { createRequire } from "node:module"; import { mkdirSync } from "node:fs"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", OUT = new URL("./shots/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const H = await import("../gtest/harness.mjs"); H.hive.sql();
const page = (body) => "<!doctype html><html><head><style>body{font:16px system-ui;padding:20px}</style></head><body>" + body + "</body></html>";
const mk = (id, title, final, by) => { H.db.prepare("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok,own) VALUES(?,?,?,?,?,0,'t',?,200,'c',1)").run(id, title, title, "done", final, Date.now() - (id.charCodeAt(1) * 1000)); if (by) H.db.prepare("INSERT INTO idea(ts,title,detail,status,pid,by_) VALUES(?,?,?,?,?,?)").run(Date.now(), title, "x", "building", id, by); };
mk("a1", "Clean clock", "```html run\n" + page("<h1 id=t>Clock</h1><script>document.getElementById('t').textContent='Clock 12:00'</script>") + "\n```");
mk("a2", "Broken counter", "```html run\n" + page("<h1>Counter</h1><script>undefinedThing()</script>") + "\n```");
mk("a3", "Bird atlas", "```html run\n" + page("<h1 id=h>Birds</h1>") + "\n```", "genesis");
H.setResponder((sys) => /fixing a runnable result/.test(sys) ? "```html run\n" + page("<h1>Counter</h1><b id=n>0</b>") + "\n```" : null);
let asOwner = true;
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", ...(asOwner ? { "x-hive-owner": "1" } : {}) }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled because the context is sandboxed|undefinedThing/.test(e.message)) errs.push(e.message); });
p.on("dialog", (d) => d.accept());
const ok = (m) => console.log("ok", DEV, m), until = async (fn, ms = 10000, what = "") => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn)) return; await p.waitForTimeout(150); } throw new Error("timed out: " + what); };

// 1 · Genesis's build finishes: a private preview link
await H.call("/genesis"); const priv = H.db.prepare("SELECT slug, live FROM pub WHERE pid='a3'").get(); assert.ok(priv && priv.live === 0); ok("Genesis's finished build got a private preview: /p/" + priv.slug);

// 2 · check every build
await p.goto("http://localhost:8099/hive-app.html#swarm"); await until(() => /Broken counter/.test(document.getElementById("plist").textContent), 8000, "list");
assert.equal(await p.isVisible("#audit"), true); await p.click("#audit");
await until(() => /run clean/.test(document.querySelector("#auditp .ah")?.textContent || "") && !document.getElementById("audit").disabled, 60000, "audit finished");
const rows = await p.$$eval("#auditp .ar", (r) => r.map((x) => x.textContent)); console.log("   ", rows.join(" | "));
assert.equal(rows.length, 3); assert.ok(rows.some((r) => /Broken counter.*fixed \(v2\) · runs clean/.test(r))); assert.ok(rows.some((r) => /Clean clock.*runs clean/.test(r)));
assert.match(await p.textContent("#auditp .ah"), /3 of 3 run clean/); await p.screenshot({ path: OUT + "audit-" + DEV + ".png" });
const rec = H.db.prepare("SELECT id, ran FROM proj WHERE ran IS NOT NULL").all().map((r) => [r.id, JSON.parse(r.ran)]); assert.equal(rec.length, 3); assert.ok(rec.every(([, r]) => r.ok), JSON.stringify(rec)); ok("“Check all builds”: 3 run unseen, the broken one is sent to be fixed and v2 runs clean (3 of 3)");

// 3 · publish from the mission
await p.click("#plist [data-id='a1']"); await until(() => !document.getElementById("pubbtn").classList.contains("hidden"), 8000, "publish button");
assert.equal((await p.textContent("#pubbtn")).trim(), "Publish"); await p.click("#pubbtn");
await until(() => /Public link/.test(document.getElementById("publink").textContent), 8000, "public link");
const href = await p.getAttribute("#publink", "href"); const slug = href.split("/p/")[1]; assert.match(slug, /^clean-clock-[0-9a-f]{4}$/); assert.equal((await p.textContent("#pubbtn")).trim(), "Unpublish");
ok("Publish on a finished mission: “Public link ↗” to /p/" + slug + ", and the button turns to Unpublish");

// 4 · the public page, as a visitor
asOwner = false; await p.goto("http://localhost:8099/build.html?s=" + slug);
await until(() => document.getElementById("title").textContent === "Clean clock" && !!document.querySelector("iframe"), 8000, "build page");
const fr = p.frameLocator("iframe"); await fr.locator("#t").waitFor(); assert.equal(await fr.locator("#t").textContent(), "Clock 12:00");
assert.equal(await p.getAttribute("iframe", "sandbox"), "allow-scripts allow-modals allow-forms allow-pointer-lock allow-popups allow-downloads"); assert.equal(await p.isVisible("#edit"), false); assert.equal(await p.isVisible("#priv"), false);
await p.screenshot({ path: OUT + "build-" + DEV + ".png" }); ok("a visitor opens the link: it runs sandboxed (no same-origin), with no owner controls");
await p.click(DEV === "mobile" ? "#title" : "#hide"); if (DEV !== "mobile") { assert.equal(await p.isVisible("#bar"), false); await p.click("#show"); assert.equal(await p.isVisible("#bar"), true); ok("full screen hides the bar; ◈ brings it back"); }
await p.goto("http://localhost:8099/build.html?s=" + priv.slug); await until(() => /Nothing here/.test(document.body.textContent), 6000, "private hidden"); assert.equal(await p.$("iframe"), null); ok("a visitor at the private preview's link sees nothing");

// 5 · the private preview, as the owner
asOwner = true; await p.goto("http://localhost:8099/build.html?s=" + priv.slug);
await until(() => !!document.querySelector("iframe") && getComputedStyle(document.getElementById("priv")).display === "flex", 8000, "owner preview");
assert.match(await p.textContent("#sub"), /Built by Genesis, on its own/); assert.equal(await p.getAttribute("#edit", "href"), "/hive-app?p=a3");
await p.click("#pub"); await until(() => /Public now/.test(document.getElementById("priv").textContent), 6000, "made public"); assert.equal(H.db.prepare("SELECT live FROM pub WHERE pid='a3'").get().live, 1);
ok("the owner sees the private preview with “Make public” and a way into the mission; one tap and it's public");
assert.deepEqual(errs, []); ok("no page errors");
const sw = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); assert.ok(sw); ok("no sideways scroll");
await b.close(); console.log("all passed", DEV); process.exit(0);
