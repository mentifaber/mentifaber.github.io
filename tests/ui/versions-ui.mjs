// Versions, branches, renaming, documents and quoting in Chromium: “Again” keeps the earlier answer and ‹ › steps through
// them (the one showing is what the chat carries on from); Branch carries on from an answer in a new chat and leaves the
// original as it was; a session can be renamed; PDFs, Word files and spreadsheets attach to a chat (a spreadsheet as one CSV
// per sheet, a scanned PDF says so); selecting part of an answer quotes it into the message box.
//   node versions-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
let n = 0; H.setResponder((sys) => /follow-up questions the user might ask next/.test(sys) ? '{"q": []}' : /You decide which tools/.test(sys) ? '{"calls":[]}' : "Answer " + (++n) + ": tides follow the moon, twice a day.");
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
const bodies = []; ctx.on("request", (r) => { if (/\/api\/hive\/chat$/.test(r.url())) bodies.push(JSON.parse(r.postData() || "{}")); });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
// the readers the app loads from cdnjs, stood in for here (offline): what they hand back is what matters
const js = (body) => (rt) => rt.fulfill({ contentType: "text/javascript", body });
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\//, js(`window.XLSX = { read: () => ({ SheetNames: ["Q1", "Blank", "Q2"], Sheets: { Q1: "q1", Blank: "", Q2: "q2" } }), utils: { sheet_to_csv: (s) => ({ q1: "Region,Sales\\nNorth,120\\nSouth,95\\n", q2: "Region,Sales\\nNorth,140\\n" })[s] || "" } };`));
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/mammoth\//, js(`window.mammoth = { extractRawText: async () => ({ value: "Minutes of the meeting.   \\n\\n\\n\\nWe agreed on Friday." }) };`));
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\//, js(`window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }) }) };`));
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
const ok = (m) => console.log("ok", DEV, m), settled = () => p.waitForFunction(() => !document.querySelector(".ex.pending") && document.querySelector(".m.ai .acts"), null, { timeout: 15000 });
const chats = () => p.evaluate(() => JSON.parse(localStorage.getItem("hive:chats") || "[]"));
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);

// ── versions ──
await p.fill("#inp", "Why are there tides?"); await p.click("#sendb"); await settled();
assert.match(await p.textContent(".m.ai .b"), /Answer 1/); assert.equal(await p.locator(".vers").count(), 0, "one answer: no switch");
await p.click(".m.ai [data-act='redo']"); await p.waitForFunction(() => /Answer 2/.test(document.querySelector(".m.ai .b") && (document.querySelector(".m.ai .b") || {}).textContent), null, { timeout: 15000 }); await settled();
assert.equal(await p.textContent(".m.ai .vers small"), "2/2");
await p.click(".m.ai [data-ver='-1']"); assert.match(await p.textContent(".m.ai .b"), /Answer 1/); assert.equal(await p.textContent(".m.ai .vers small"), "1/2"); assert.equal(await p.isDisabled(".m.ai [data-ver='-1']"), true);
await p.click(".m.ai [data-act='redo']"); await p.waitForFunction(() => /Answer 3/.test((document.querySelector(".m.ai .b") || {}).textContent), null, { timeout: 15000 }); await settled();
assert.equal(await p.textContent(".m.ai .vers small"), "3/3", "Again on an earlier version still keeps them all");
await p.click(".m.ai [data-ver='-1']"); await p.click(".m.ai [data-ver='-1']"); assert.match(await p.textContent(".m.ai .b"), /Answer 1/);
await p.fill("#inp", "And how high do they get?"); await p.click("#sendb"); await p.waitForFunction(() => document.querySelectorAll(".m.ai").length === 2, null, { timeout: 15000 }); await settled();
assert.match(bodies.at(-1).messages[1].text, /^Answer 1/, "the chat carries on from the version showing");
let C = await chats(); assert.equal(C[0].msgs[1].vers.length, 3); assert.equal(C[0].msgs[1].vi, 0); assert.ok(!C[0].msgs[1].vers.some((v) => v.vers), "versions aren't nested");
await p.reload(); await p.waitForTimeout(700); await p.evaluate(() => document.querySelector("#hist .sess").click()); await p.waitForSelector(".m.ai .vers");
assert.equal(await p.textContent(".ex:last-child .m.ai .vers small"), "1/3"); ok("Again keeps every answer (‹ 1/3 ›), the one showing is what the chat carries on from, and they survive a reload");

// ── branch ──
const orig = C[0].id; await p.click(".ex:last-child .m.ai [data-act='branch']"); await p.waitForTimeout(400);
C = await chats(); assert.equal(C.length, 2); const br = C.find((c) => c.id !== orig), og = C.find((c) => c.id === orig);
assert.equal(br.msgs.length, 2); assert.equal(og.msgs.length, 4, "the original is untouched"); assert.match(br.title, /^↳ Why are there tides/); assert.equal(br.from, orig);
assert.equal(await p.locator(".m.user").count(), 1); assert.equal(await p.textContent(".m.ai .vers small"), "1/3", "the branch keeps the versions too");
await p.fill("#inp", "What about the sun?"); await p.click("#sendb"); await p.waitForFunction(() => document.querySelectorAll(".m.ai").length === 2, null, { timeout: 15000 }); await settled();
assert.equal(bodies.at(-1).messages.length, 3); assert.equal((await chats()).find((c) => c.id === orig).msgs.length, 4);
ok("Branch carries on from an answer in a new chat; the original stays as it was");

// ── rename ──
p.once("dialog", (d) => d.accept("Tides, the sun one")); await p.evaluate(() => document.querySelector("#hist .sess [data-ren]").click()); await p.waitForTimeout(300);
assert.match(await p.textContent("#hist .sess"), /Tides, the sun one/); assert.equal((await chats())[0].title, "Tides, the sun one");
ok("a session can be renamed");

// ── documents ──
await p.click("#inp"); await p.click("#newchat");
await p.setInputFiles("#f-file", [{ name: "budget.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK fake") }]); await p.waitForFunction(() => document.querySelectorAll("#att .chip").length === 2, null, { timeout: 8000 });
await p.setInputFiles("#f-file", [{ name: "minutes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("PK fake") }]); await p.waitForFunction(() => document.querySelectorAll("#att .chip").length === 3, null, { timeout: 8000 });
assert.match(await p.textContent("#att"), /budget - Q1\.csv[\s\S]*budget - Q2\.csv[\s\S]*minutes\.docx/); assert.doesNotMatch(await p.textContent("#att"), /Blank/, "an empty sheet is left out");
await p.setInputFiles("#f-file", [{ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") }]); await p.waitForFunction(() => /scanned PDF/.test(document.querySelector("#toast").textContent), null, { timeout: 8000 });
assert.equal(await p.locator("#att .chip").count(), 3, "a PDF with no text isn't attached as nothing");
await p.fill("#inp", "Summarise these"); await p.click("#sendb"); await settled();
const sent = bodies.at(-1).messages.at(-1).text;
assert.match(sent, /budget - Q1\.csv:\n```\nRegion,Sales\nNorth,120\nSouth,95\n```/); assert.match(sent, /budget - Q2\.csv:\n```\nRegion,Sales\nNorth,140\n```/); assert.match(sent, /minutes\.docx:\n```\nMinutes of the meeting\.\n\nWe agreed on Friday\.\n```/);
assert.match(await p.textContent(".m.user .tools"), /budget - Q1\.csv[\s\S]*minutes\.docx/);
ok("a spreadsheet attaches as one CSV per sheet (empty ones left out), a Word file as its text; a scanned PDF says it has no text");

// ── quote a selection ──
await p.evaluate(() => { const t = document.querySelector(".m.ai .b p").firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(t.length, 22)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await p.waitForSelector("#quote:not(.hidden)", { timeout: 3000 }); const qb = await p.locator("#quote").boundingBox(), vw = await p.evaluate(() => innerWidth);
assert.ok(qb.x >= 0 && qb.x + qb.width <= vw, "the chip stays on screen");
await p.fill("#inp", "is that right?"); await p.evaluate(() => { const t = document.querySelector(".m.ai .b p").firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(t.length, 22)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await p.waitForSelector("#quote:not(.hidden)"); await p.click("#quote");
assert.match(await p.inputValue("#inp"), /^> Answer \d+: tides follow\n\nis that right\?$/); assert.equal(await p.isVisible("#quote"), false);
await p.evaluate(() => { const s = getSelection(); s.removeAllRanges(); const t = document.querySelector(".m.user .b").firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 5); s.addRange(r); }); await p.waitForTimeout(400);
assert.equal(await p.isVisible("#quote"), false, "only answers offer it");
ok("selecting part of an answer offers “Ask about this”, which quotes it into the message box");

const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide);
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
