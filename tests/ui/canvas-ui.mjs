// The canvas in Chromium: Canvas opens an answer as a document; a selected passage is rewritten in place (the rest stays
// exactly as it was) and comes back selected; with nothing selected the whole document is rewritten; undo and redo step
// through the edits; Preview renders it; “Use in chat” makes it a new version of the answer that the chat carries on from;
// closing with unused changes asks first.
//   node canvas-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
const answer = "## Lisbon in a day\n\nStart in Alfama, where the old trams climb narrow streets past tiled houses and small cafés that open early.\n\nEnd at Belém for the tower and the custard tarts.";
H.setResponder((sys) => /follow-up questions the user might ask next/.test(sys) ? '{"q": []}' : /You decide which tools/.test(sys) ? '{"calls":[]}' :
  /passage is marked/.test(sys) ? "Start in Alfama: trams, tiles, early cafés." : /Rewrite the whole document/.test(sys) ? "## Lisbon in one day\n\nBegin in Alfama.\n\nFinish at Belém." : answer);
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
const bodies = [], rw = []; ctx.on("request", (r) => { if (/\/api\/hive\/chat$/.test(r.url())) bodies.push(JSON.parse(r.postData() || "{}")); if (/\/canvas\/rewrite$/.test(r.url())) rw.push(JSON.parse(r.postData() || "{}")); });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
const ok = (m) => console.log("ok", DEV, m), val = () => p.inputValue("#cv-text");
const select = (a, z) => p.evaluate(([a, z]) => { const t = document.getElementById("cv-text"); t.focus(); t.setSelectionRange(a, z); t.dispatchEvent(new Event("select")); }, [a, z]);
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);
await p.fill("#inp", "Plan a day in Lisbon"); await p.click("#sendb"); await p.waitForFunction(() => !document.querySelector(".ex.pending") && document.querySelector(".m.ai .acts"), null, { timeout: 15000 });

await p.click(".m.ai [data-act='canvas']"); await p.waitForSelector("#canvas:not(.hidden)");
assert.equal(await val(), answer); assert.equal(await p.isDisabled("#cv-use"), true, "nothing to use yet"); assert.match(await p.textContent("#cv-title"), /Plan a day in Lisbon/);
assert.deepEqual(await p.$$eval("#cv-presets button", (bs) => bs.map((x) => x.textContent)), ["Shorter", "Longer", "Simpler", "Polish", "More formal", "More casual"], "code edits only show for code");
const box = await p.locator("#canvas").boundingBox(), vw = await p.evaluate(() => innerWidth);
if (DEV === "mobile") assert.ok(box.x <= 0.5 && Math.abs(box.width - vw) <= 1, "full screen on a phone"); else assert.ok(box.width < vw * 0.7, "a side panel beside the chat on desktop");
for (const id of ["#cv-undo", "#cv-redo", "#cv-edit", "#cv-view", "#cv-copy", "#cv-use", "#cv-close", "#cv-go"]) { const r = await p.locator(id).boundingBox(); assert.ok(r && r.x >= 0 && r.x + r.width <= vw + 0.5, id + " is on screen"); }
ok("Canvas opens the answer as a document (full screen on a phone, a side panel on desktop); every control is on screen");

// a passage: rewritten in place, the rest untouched, the new passage selected
const s = answer.indexOf("Start in"), e = answer.indexOf("early.") + 6; await select(s, e);
assert.match(await p.textContent("#cv-scope"), /selected passage \(\d+ characters\)/);
await p.click("#cv-presets [data-pre='shorter']"); await p.waitForFunction(() => /trams, tiles/.test(document.getElementById("cv-text").value), null, { timeout: 10000 });
assert.deepEqual([rw.at(-1).start, rw.at(-1).end, rw.at(-1).preset], [s, e, "shorter"]);
const v1 = answer.slice(0, s) + "Start in Alfama: trams, tiles, early cafés." + answer.slice(e); assert.equal(await val(), v1, "only the passage changed");
assert.equal(await p.evaluate(() => { const t = document.getElementById("cv-text"); return t.value.slice(t.selectionStart, t.selectionEnd); }), "Start in Alfama: trams, tiles, early cafés.");
ok("a selected passage is rewritten in place, the rest stays exactly as it was, and the new passage comes back selected");

// nothing selected: the whole document, from a typed instruction
await select(0, 0); assert.match(await p.textContent("#cv-scope"), /whole document/);
await p.fill("#cv-how", "Make it terse"); await p.click("#cv-go"); await p.waitForFunction(() => /Begin in Alfama/.test(document.getElementById("cv-text").value), null, { timeout: 10000 });
assert.equal(rw.at(-1).how, "Make it terse"); assert.equal(rw.at(-1).start, undefined); assert.equal(await val(), "## Lisbon in one day\n\nBegin in Alfama.\n\nFinish at Belém.");
ok("with nothing selected, a typed instruction rewrites the whole document");

await p.click("#cv-undo"); assert.equal(await val(), v1); await p.click("#cv-undo"); assert.equal(await val(), answer); assert.equal(await p.isDisabled("#cv-undo"), true);
await p.click("#cv-redo"); await p.click("#cv-redo"); assert.equal(await val(), "## Lisbon in one day\n\nBegin in Alfama.\n\nFinish at Belém."); assert.equal(await p.isDisabled("#cv-redo"), true);
await p.click("#cv-text"); await p.keyboard.press("Control+End"); await p.keyboard.type(" Book ahead."); await p.waitForTimeout(600);
await p.click("#cv-undo"); assert.equal(await val(), "## Lisbon in one day\n\nBegin in Alfama.\n\nFinish at Belém.", "typing is undone too"); await p.click("#cv-redo");
await p.click("#cv-view"); assert.equal(await p.textContent("#cv-prev h2"), "Lisbon in one day"); assert.equal(await p.isVisible("#cv-text"), false); await p.click("#cv-edit");
ok("undo and redo step through the rewrites and the typing; Preview renders the document");

// use it in the chat: a new version of the answer, and the chat carries on from it
await p.click("#cv-use"); const edited = "## Lisbon in one day\n\nBegin in Alfama.\n\nFinish at Belém. Book ahead.";
assert.match(await p.textContent(".m.ai .b"), /Begin in Alfama\.[\s\S]*Book ahead\./); assert.equal(await p.textContent(".m.ai .vers small"), "2/2"); assert.match(await p.textContent(".m.ai .who-line"), /edited in canvas/);
assert.equal(await p.isDisabled("#cv-use"), true, "nothing new to use");
await p.keyboard.press("Escape"); assert.equal(await p.isVisible("#canvas"), false, "Escape closes it when nothing is unsaved");
await p.fill("#inp", "Thanks!"); await p.click("#sendb"); await p.waitForFunction(() => document.querySelectorAll(".m.ai").length === 2 && !document.querySelector(".ex.pending"), null, { timeout: 15000 });
assert.equal(bodies.at(-1).messages[1].text, edited);
await p.click(".ex:last-child .m.ai [data-ver='-1']"); assert.match(await p.textContent(".ex:last-child .m.ai .b"), /Start in Alfama, where the old trams/, "the original is a version away");
ok("Use in chat makes it a new version of the answer (‹ › back to the original), marked as edited; the chat carries on from it");

// closing with changes not used asks first
await p.click(".ex:last-child .m.ai [data-act='canvas']"); await p.click("#cv-text"); await p.keyboard.type("x");
let asked = 0; p.once("dialog", (d) => { asked++; d.dismiss(); }); await p.click("#cv-close"); assert.equal(asked, 1); assert.equal(await p.isVisible("#canvas"), true, "kept open");
p.once("dialog", (d) => d.accept()); await p.click("#cv-close"); assert.equal(await p.isVisible("#canvas"), false);
ok("closing with changes you haven't used asks first");

const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide);
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
