// The Mind page in Chromium with a real Hive behind it.   node mind-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", OUT = new URL("./shots/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const H = await import("../gtest/harness.mjs"), { call, db } = H, M = "workers-ai|@cf/openai/gpt-oss-120b";
for (const t of ["My sister is called Maya", "I prefer short answers without filler", "I run everything on Cloudflare Workers", "Ship the Vigil markets panel by Friday"]) await call("/mind/remember", { text: t });
for (const t of ["I live in Porto now and I'm fixing the flat", "What does XRP trade at?", "Build me a synth sequencer"]) await call("/chat", { model: M, cid: "c-" + t.length, messages: [{ role: "user", text: t }] });
db.prepare("INSERT INTO mem(ts,text,src,kind,ok,pin,upd) VALUES(?,?,?,?,0,0,?)").run(Date.now(), "You live in Porto", "noticed", "about", Date.now());
db.prepare("INSERT INTO thread(ts,text,status,ok,src,upd) VALUES(?,?,'open',0,'noticed',?)").run(Date.now(), "Finish the synth sequencer", Date.now());
db.prepare("INSERT INTO thread(ts,text,status,ok,src,upd) VALUES(?,?,'open',1,'you',?)").run(Date.now() - 864e5 * 3, "Record the new EP", Date.now());
H.setResponder((s) => /Genesis's analyst/.test(s) ? "## Snapshot\nYou build Hive and make music.\n" + (/## Since last time/.test(s) ? "## Since last time\n- You moved to Porto.\n" : "") + "## What you're building\nHive.\n## Open threads\n- Record the new EP\n## Durable facts\n- You build Hive on Cloudflare" : null);
await call("/mind/analyze", {}); await call("/mind/analyze", {});
for (const [t, st] of [["Greeting-Filter Middleware", "built"], ["Self-Status Suppressor", "built"], ["Output Completeness Verifier", "built"], ["A tide-clock widget", "open"]]) db.prepare("INSERT INTO idea(ts,title,detail,status,pid) VALUES(?,?,?,?,?)").run(Date.now(), t, "A long description that goes on for a while. ".repeat(6), st, st === "built" ? "p-" + t.length : null);
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block", acceptDownloads: true });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" })); await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled because the context is sandboxed/.test(e.message)) errs.push(e.message); }); p.on("dialog", (d) => d.accept());
const ok = (m) => console.log("ok", DEV, m), until = async (fn, ms = 8000, what = "") => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn)) return; await p.waitForTimeout(120); } throw new Error("timed out: " + what); };
const untilN = async (fn, ms = 5000, what = "") => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await p.waitForTimeout(100); } throw new Error("timed out: " + what); };
const txt = (sel) => p.textContent(sel), vis = (sel) => p.$eval(sel, (e) => !e.classList.contains("hidden") && !!(e.offsetWidth || e.offsetHeight));
await p.goto("http://localhost:8099/hive-app.html"); await p.evaluate(() => localStorage.removeItem("hive:mind-tab")); await p.goto("http://localhost:8099/hive-app.html#mind");
await until(() => !document.getElementById("m-open").classList.contains("hidden") && document.getElementById("m-facts").children.length > 5, 8000, "mind loads");
assert.equal(await vis("#mt-you"), true); assert.equal(await vis("#m-review"), true); assert.equal(await txt("#m-badge"), "2"); assert.match(await txt("#m-rlist"), /You live in Porto[\s\S]*Finish the synth sequencer/);
assert.match(await txt("#m-facts"), /open threads\s*1/i); assert.match(await txt("#m-profile"), /Since last time[\s\S]*moved to Porto/); ok("You: facts, the profile with what changed, and 2 things Hive noticed waiting for a yes (badge 2)");
await p.screenshot({ path: OUT + DEV + "-you.png", fullPage: true });
await p.click("#m-rlist [data-rv='mem:" + db.prepare("SELECT id FROM mem WHERE text='You live in Porto'").get().id + ":1']"); await until(() => document.getElementById("m-badge").textContent === "1", 6000, "badge 1");
await p.click("#m-rlist [data-rv$=':0']"); await until(() => document.getElementById("m-review").classList.contains("hidden"), 6000, "review empty");
assert.equal(db.prepare("SELECT ok FROM mem WHERE text='You live in Porto'").get().ok, 1); assert.equal(db.prepare("SELECT ok FROM thread WHERE text='Finish the synth sequencer'").get().ok, -1); ok("Keep / No: the fact is kept, the thread turned down, the card goes away");
await p.selectOption("#m-hist", { index: 1 }); await until(() => /An earlier profile/.test(document.getElementById("m-profile").textContent), 5000, "old profile"); assert.doesNotMatch(await txt("#m-profile"), /Since last time/); ok("an earlier profile can be read");
// Memory
await p.click("#mtabs [data-mt='mem']"); assert.equal(await vis("#mt-mem"), true); assert.match(p.url(), /#mind\/mem$/);
assert.match(await txt("#m-chips"), /All 6[\s\S]*People 1/); await p.click("#m-chips [data-mf='people']"); assert.equal(await p.$$eval("#m-mem .mi", (x) => x.length), 1); await p.click("#m-chips [data-mf='all']");
const maya = db.prepare("SELECT id FROM mem WHERE text LIKE '%Maya%'").get().id;
await p.click("[data-pin='" + maya + "']"); await p.waitForSelector("[data-pin='" + maya + "'].on", { timeout: 5000 }); assert.equal(db.prepare("SELECT pin FROM mem WHERE id=?").get(maya).pin, 1);
await p.click("[data-edit='" + maya + "']"); await p.fill("[data-edit='" + maya + "'] input", "Your sister Maya lives in Lisbon"); await p.keyboard.press("Enter");
await until(() => /Lisbon/.test(document.getElementById("m-mem").textContent), 5000, "edited"); assert.equal(db.prepare("SELECT text FROM mem WHERE id=?").get(maya).text, "Your sister Maya lives in Lisbon");
const cf = db.prepare("SELECT id FROM mem WHERE text LIKE '%Cloudflare Workers%'").get().id; await p.selectOption("[data-mk='" + cf + "']", "work"); await untilN(() => db.prepare("SELECT kind FROM mem WHERE id=?").get(cf).kind === "work", 5000, "kind");
ok("Memory: chips filter by kind; pin, edit in place and change kind all stick");
await p.fill("#m-new", "Leo is my nephew"); await p.selectOption("#m-kind", "people"); await p.click("#m-add"); await until(() => /Leo is my nephew/.test(document.getElementById("m-mem").textContent), 5000, "added");
await p.fill("#m-tnew", "Mix the synth demo"); await p.click("#m-tadd"); await until(() => /Mix the synth demo/.test(document.getElementById("m-threads").textContent), 5000, "thread");
await p.click("#m-threads [data-th$=':done']"); await until(() => !document.getElementById("m-tdone").classList.contains("hidden"), 5000, "done list"); ok("Memory: remember with a kind, add a thread, finish one (it moves under Finished)");
await p.screenshot({ path: OUT + DEV + "-mem.png", fullPage: true });
// Timeline
await p.click("#mtabs [data-mt='time']"); assert.equal(await p.$$eval("#m-cal i", (x) => x.length), 182); assert.equal(await p.$$eval("#m-grid i", (x) => x.length), 168);
assert.match(await txt("#m-streak"), /active day/); assert.match(await txt("#m-kbars"), /Chat/); const n0 = await p.$$eval("#m-act .mi", (x) => x.length); await p.selectOption("#m-akind", "chat"); assert.ok((await p.$$eval("#m-act .mi", (x) => x.length)) <= n0);
const today = await p.$eval("#m-cal", (c) => [...c.children].at(-1).className); assert.notEqual(today, "l0"); ok("Timeline: 26-week calendar (today lit), weekday × hour grid, what you do, activity filter");
await p.screenshot({ path: OUT + DEV + "-time.png", fullPage: true });
// Genesis
await p.click("#mtabs [data-mt='gen']"); await until(() => /built · results waiting for you 3/i.test(document.getElementById("g-ideas").textContent), 5000, "ideas grouped");
const h0 = await p.$eval("#g-ideas .more", (e) => e.offsetHeight); await p.click("#g-ideas .more"); assert.ok((await p.$eval("#g-ideas .more", (e) => e.offsetHeight)) > h0);
await p.click("[data-iclear]"); await until(() => !/built ·/i.test(document.getElementById("g-ideas").textContent), 6000, "cleared"); assert.match(await txt("#g-ideas"), /on its list 1[\s\S]*tide-clock/i); ok("Genesis: ideas grouped, two lines each (tap for all), Clear all built");
// search
await p.fill("#m-q", "Porto"); await until(() => /memories[\s\S]*You live in Porto/i.test(document.getElementById("m-results").textContent), 6000, "search");
assert.equal(await vis("#mt-gen"), false); assert.match(await txt("#m-results"), /conversations|activity/i); assert.ok(await p.$("#m-results mark")); await p.fill("#m-q", ""); await p.waitForTimeout(500); assert.equal(await vis("#mt-gen"), true); ok("search across memories, threads, conversations and activity, highlighted; clearing it brings the tab back");
// export
const [dl] = await Promise.all([p.waitForEvent("download"), p.evaluate(() => { location.hash = "mind/you"; }).then(() => p.waitForTimeout(300)).then(() => p.click("#m-exp-md"))]);
const md = readFileSync(await dl.path(), "utf8"); assert.match(dl.suggestedFilename(), /^hive-mind-\d{4}-\d\d-\d\d\.md$/); assert.match(md, /## Memories[\s\S]*### People[\s\S]*★ Your sister Maya lives in Lisbon/); assert.match(md, /## Threads[\s\S]*\[x\] Mix the synth demo/); ok("Export notes: a readable .md with memories by kind, threads and activity");
await p.goto("http://localhost:8099/hive-app.html#mind/genesis"); await until(() => !document.getElementById("mt-gen").classList.contains("hidden"), 6000, "deep link"); ok("#mind/genesis opens the Genesis tab (the alert link)");
const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide); assert.deepEqual(errs, []); ok("no page errors, no sideways scroll");
await b.close(); console.log("all passed", DEV); process.exit(0);
