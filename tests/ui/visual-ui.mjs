// Visual answers in Chromium (assets/hive/visual.js): a reply's chart block drawn as a chart with its numbers; a widget run
// inline, sandboxed, with no network and no reach into the app; Preview opening a page in its own tab without the app's
// origin; Python's Run handing it the files attached earlier in the chat.   node visual-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
const widget = "<!doctype html><html><head><title>w</title></head><body><h1>Tip calculator</h1><input id=a value=40><output id=o></output><div id=net>?</div><div id=store>?</div><div id=up>?</div><div style='height:300px'></div>" +
  "<script>o.textContent=(+a.value*1.2).toFixed(2);fetch('https://example.com/steal').then(()=>net.textContent='network reached').catch(()=>net.textContent='network blocked');" +
  "try{localStorage.getItem('x');store.textContent='storage read'}catch(e){store.textContent='storage blocked'}try{parent.document.title;up.textContent='app reached'}catch(e){up.textContent='app blocked'}<\/script></body></html>";
const reply = "Here are the numbers.\n\n```chart\n" + JSON.stringify({ type: "bar", title: "Rainfall by season", labels: ["Winter", "Spring", "Summer", "Autumn"], series: [{ name: "2025", data: [120, 80, 30, 95] }, { name: "2026", data: [110, 90, 25, 100] }], unit: "mm" }) + "\n```\n\n" +
  "A broken one:\n\n```chart\n{not json\n```\n\nTry it:\n\n```widget\n" + widget + "\n```\n\nOr preview this:\n\n```html\n<h1>Hi</h1><script>var r=[];try{parent.document.title;r.push('app reached')}catch(e){r.push('app blocked')}try{localStorage.length;r.push('storage reached')}catch(e){r.push('storage blocked')}document.title=r.join(', ')<\/script>\n```\n\nAnd the data:\n\n```python\nimport pandas as pd\nprint(pd.read_csv('sales.csv').sum())\n```";
H.setResponder((sys) => /You decide which tools/.test(sys) ? '{"calls":[]}' : /Visual answers: when numbers compare/.test(sys) ? reply : null);
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099|about:|data:)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
const ok = (m) => console.log("ok", DEV, m);
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);
await p.setInputFiles("#f-file", { name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("region,amount\nnorth,10\nsouth,32\n") }); await p.waitForTimeout(300);
await p.fill("#inp", "Compare rainfall by season for 2025 and 2026, and give me a tip calculator"); await p.click("#sendb");
await p.waitForSelector(".m.ai .vchart svg", { timeout: 15000 });
assert.equal(await p.locator(".m.ai .vchart svg rect").count(), 8, "two series of four bars");
assert.match(await p.textContent(".m.ai .vchart svg"), /Rainfall by season[\s\S]*Winter[\s\S]*Autumn/); assert.match(await p.textContent(".m.ai .clegend"), /2025[\s\S]*2026/);
await p.click(".m.ai .cdata summary"); assert.match(await p.textContent(".m.ai .cdata table"), /Summer\s*30 mm\s*25 mm/);
assert.ok(await p.locator(".m.ai .pre code", { hasText: "{not json" }).count(), "a chart that doesn't parse shows as code");
ok("a chart block is drawn: bars, title, legend, and its numbers in a table; one that doesn't parse stays readable as code");

const f = p.locator(".m.ai .vwidget iframe"); assert.equal(await f.getAttribute("sandbox"), "allow-scripts");
const wf = p.frames().find((x) => x.url() === "about:srcdoc" && x.parentFrame() === p.mainFrame()) || (await f.elementHandle()).contentFrame(); const fr = await wf;
await fr.waitForFunction(() => document.getElementById("net").textContent !== "?", null, { timeout: 8000 });
assert.equal(await fr.textContent("#o"), "48.00"); assert.equal(await fr.textContent("#net"), "network blocked"); assert.equal(await fr.textContent("#store"), "storage blocked"); assert.equal(await fr.textContent("#up"), "app blocked");
await p.waitForFunction(() => parseInt(document.querySelector(".m.ai .vwidget iframe").style.height) > 300, null, { timeout: 5000 });
await p.locator(".m.ai .vchart").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: new URL("./shots/", import.meta.url).pathname + DEV + "-visual.png" });
ok("a widget runs inline: it works, but it can't reach the network, the app's storage or the app itself; it sizes itself to fit");

const [tab] = await Promise.all([ctx.waitForEvent("page"), p.click(".m.ai [data-run]")]); await tab.waitForLoadState();
const sb = await tab.getAttribute("iframe", "sandbox"); assert.ok(sb.includes("allow-scripts") && !sb.includes("allow-same-origin"), sb);
assert.equal(await tab.evaluate(() => document.scripts.length), 0, "the tab itself runs no script");
const inner = tab.frames().find((x) => x !== tab.mainFrame()); await inner.waitForFunction(() => document.title !== "", null, { timeout: 5000 }); assert.equal(await inner.title(), "app blocked, storage blocked");
await tab.close(); ok("Preview opens the page in its own tab, inside a frame without the app's origin: it can't reach the app");

await p.click(".m.ai [data-py]"); const pf = p.locator(".m.ai .pyrun iframe"); assert.equal(await pf.getAttribute("sandbox"), "allow-scripts");
const doc = await pf.getAttribute("srcdoc"); assert.match(doc, /sales\.csv/); assert.match(doc, /north,10/); assert.match(doc, /pd\.read_csv/);
ok("Run gives Python a sandboxed frame, with the CSV attached earlier in the chat beside it (Pyodide itself isn't loaded here: the test runs offline)");
const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide);
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
