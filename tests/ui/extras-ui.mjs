// Extras in Chromium: Auto picks a model and says why; follow-up questions appear under the newest answer and ask on a
// tap; a private session is never saved and sends mind: false; an answer downloads as a document, slides, CSV or Markdown.
//   node extras-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql(); const { calls } = H;
const answer = "## The plan\n\nThree days in Lisbon.\n\n| Day | Where |\n|---|---|\n| 1 | Alfama |\n| 2 | Belém |\n\n## Costs\n\nAbout **€300** in all.";
H.setResponder((sys, user) => /You pick out the claims/.test(sys) ? '{"claims": [{"claim": "Day 1 covers Alfama", "search": "Alfama Lisbon"}, {"claim": "The trip costs about 300 euros", "search": "Lisbon 3 day budget"}]}' :
  /You check claims against the sources found/.test(sys) ? '{"v": [{"verdict": "S", "source": null, "note": "a common first-day route"}, {"verdict": "C", "source": null, "note": "guides put it nearer 450 euros"}]}' : /follow-up questions the user might ask next/.test(sys) ? '{"q": ["What should I eat in Alfama?", "Is the Lisbon Card worth it?"]}' : /You decide which tools/.test(sys) ? '{"calls":[]}' : answer);
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ acceptDownloads: true, viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
const bodies = []; ctx.on("request", (r) => { if (/\/api\/hive\/chat$/.test(r.url())) bodies.push(JSON.parse(r.postData() || "{}")); });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
const ok = (m) => console.log("ok", DEV, m);
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);
assert.equal(await p.inputValue("#model"), "auto|best", "Auto is the default");
await p.fill("#inp", "Plan three days in Lisbon with costs in a table"); await p.click("#sendb");
await p.waitForSelector(".ex:not(.pending) .m.ai .b", { timeout: 15000 });
assert.equal(bodies.at(-1).model, "auto|best"); assert.match(await p.textContent(".m.ai .tools"), /Auto chose gpt-oss-120b: a full answer from the strongest model/);
ok("Auto is the default model; it picks one for the message and the answer says which and why");
await p.waitForSelector(".m.ai .fups button", { timeout: 8000 }); assert.equal(await p.locator(".m.ai .fups button").count(), 2);
await p.click(".m.ai .fups button >> nth=1"); await p.waitForFunction(() => document.querySelectorAll(".m.user").length === 2, null, { timeout: 8000 });
assert.equal(bodies.at(-1).messages.at(-1).text, "Is the Lisbon Card worth it?");
await p.waitForSelector(".ex:not(.pending) .m.ai .fups", { timeout: 15000 }); assert.equal(await p.locator(".fups").count(), 1, "only under the newest answer");
ok("follow-up questions appear under the newest answer; a tap asks it");

const dl = async (kind) => { await p.locator(".m.ai [data-act='dlm']").first().click(); /* answers stack newest first */ const [d] = await Promise.all([p.waitForEvent("download"), p.locator(".dlm [data-exp='" + kind + "']").click()]); return { name: d.suggestedFilename(), text: require("node:fs").readFileSync(await d.path(), "utf8") }; };
let f = await dl("doc"); assert.match(f.name, /^is-the-lisbon-card-worth-it\.doc$/); assert.match(f.text, /urn:schemas-microsoft-com:office:word[\s\S]*<h1>Is the Lisbon Card worth it\?<\/h1>[\s\S]*<table>[\s\S]*Alfama/); assert.doesNotMatch(f.text, /<button/);
f = await dl("slides"); assert.match(f.name, /-slides\.html$/); assert.equal((f.text.match(/<section class='slide/g) || []).length, 3); assert.match(f.text, /<h2>The plan<\/h2>[\s\S]*<h2>Costs<\/h2>/);
f = await dl("csv"); assert.match(f.text, /Day,Where\r\n1,Alfama\r\n2,Belém/);
f = await dl("md"); assert.match(f.text, /^# Is the Lisbon Card worth it\?\n\n## The plan/);
ok("an answer downloads as a Word document, a slide deck (a slide per heading), its table as CSV, and Markdown");
await p.locator(".m.ai [data-act='check']").first().click(); await p.waitForSelector(".m.ai .fc", { timeout: 15000 });
const fc = await p.locator(".m.ai .fc").first().textContent(); assert.match(fc, /Fact check[\s\S]*2 claims searched[\s\S]*1 supported[\s\S]*1 contradicted[\s\S]*0 unclear[\s\S]*contradicted\s*The trip costs about 300 euros[\s\S]*nearer 450 euros/);
assert.equal(await p.locator(".m.ai [data-act='check']").first().textContent(), "Checked");
assert.match(await p.evaluate(() => localStorage.getItem("hive:chats")), /"verdict":"contradicted"/, "the check is kept with the chat");
ok("Check fact-checks an answer: each claim's verdict shows under it, and stays with the chat");

const saved = () => p.evaluate(() => (JSON.parse(localStorage.getItem("hive:chats") || "[]")).length);
const n0 = await saved(); await p.click("#inp"); /* scrolled deep, the composer shows its top row once you are in it */ await p.click("#privchat"); assert.equal(await p.getAttribute("#privchat", "aria-pressed"), "true");
await p.fill("#inp", "a secret plan for a surprise party"); await p.click("#sendb"); await p.waitForSelector(".ex:not(.pending) .m.ai .b", { timeout: 15000 });
assert.equal(bodies.at(-1).mind, false); assert.equal(await saved(), n0, "not saved on this device");
assert.doesNotMatch(await p.evaluate(() => localStorage.getItem("hive:chats") || ""), /surprise party/);
await p.click("#inp"); await p.click("#newchat"); assert.equal(await p.getAttribute("#privchat", "aria-pressed"), "false");
ok("a private session sends mind: false and is never saved on the device; New leaves private mode");
const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide);
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
