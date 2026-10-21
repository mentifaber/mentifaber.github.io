// MentiPlayer in Chromium, front and back together: the page runs against the real gateway (src/media.js) answering from fixtures
// shaped like each source. Shelves load, search mixes sources, the player really plays audio and keeps going while you browse,
// radio goes out live, TV is honest about streams, saved items stay, sources can be chosen, hostile text stays text.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
const { seen } = await import("../gtest/media-fixtures.mjs"); await import("../gtest/harness.mjs"); const M = await import("../gtest/src/media.js");
// one second of 8 kHz silence as a WAV: every "audio file" in the fixtures is this
const wav = (() => { const n = 8000, b = Buffer.alloc(44 + n); b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b; })();
const json = (b, st = 200, h = {}) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json", ...h } });
const b = await chromium.launch({ args: ["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1360, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
let override = null; const gw = [];
await ctx.route(/\/api\/media\//, async (route) => { const u = new URL(route.request().url()); gw.push(u.pathname.replace("/api/media", "") + u.search); if (override && override(u)) return route.fulfill(override(u));
  const res = await M.media(new Request("https://mentifaber.org" + u.pathname + u.search, { headers: { "cf-connecting-ip": "4.4.4." + (gw.length % 200) } }), {}, { waitUntil() {} }, json, async () => false); return route.fulfill({ status: res.status, headers: { "content-type": "application/json" }, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/^https:\/\/(archive\.org\/download|stream\.example\.org|disc1\.audius\.example|cdn\.example\.org|upload\.wikimedia\.org\/.*\.(mp3|ogg))/, (rt) => rt.fulfill({ status: 200, contentType: "audio/wav", body: wav, headers: { "access-control-allow-origin": "*" } }));
await ctx.route(/^(?!http:\/\/localhost:8099|https:\/\/(archive\.org\/download|stream\.example|disc1\.audius|cdn\.example))/, (rt) => rt.abort());
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
const ok = (m) => console.log("ok", DEV, m), URLP = "http://localhost:8099/mentiplayer-app.html";

// 1 · the home screen: ten shelves, each loading on its own
await p.goto(URLP); await p.waitForFunction(() => document.querySelectorAll(".shelf .card").length >= 10, null, { timeout: 15000 });
const shelves = await p.$$eval(".shelf > h2", (h) => h.map((x) => x.firstChild.textContent)); assert.deepEqual(shelves, ["Classic films", "On TV tonight (US)", "Live radio", "From NASA", "Trending music", "Live concerts", "Audiobooks", "Top podcasts", "Cartoons", "Silent era"]);
assert.ok(await p.$(".shelf .card .art img")); assert.equal(await p.isVisible("#deck"), false); ok("the home screen loads ten shelves, one request each, and no player until something plays");
// shelves that fail don't break the others
override = (u) => (u.searchParams.get("rail") === "live" ? { status: 502, contentType: "application/json", body: JSON.stringify({ error: "radio-browser.info answered 502" }) } : null); await p.reload(); await p.waitForFunction(() => document.querySelectorAll(".shelf .card").length >= 8, null, { timeout: 15000 }); assert.match(await p.textContent(".shelf:nth-child(3)"), /didn't answer/); override = null; ok("a shelf whose source is down says so; the rest load");

// 2 · hostile text from a source stays text
override = (u) => (u.pathname.endsWith("/search") ? { status: 200, contentType: "application/json", body: JSON.stringify({ q: "x", type: "all", page: 1, items: [{ id: "archive|movie|evil", source: "archive", type: "movie", title: "<img src=x onerror=\"window.__pwned=1\">Evil <b>film</b>", creator: "<script>window.__pwned=2</script>", year: "1999", description: "<i>x</i>", thumb: "javascript:window.__pwned=3", page: "http://evil.example/", license: "", meta: "" }], sources: { archive: { ok: true, n: 1 } } }) } : null);
await p.fill("#q", "evil"); await p.press("#q", "Enter"); await p.waitForSelector("#grid .card"); assert.equal(await p.textContent("#grid .card h3"), "<img src=x onerror=\"window.__pwned=1\">Evil <b>film</b>"); assert.equal(await p.evaluate(() => window.__pwned), undefined); assert.equal(await p.$("#grid .card h3 img"), null); assert.match(await p.getAttribute("#grid .card .art img", "src"), /^data:image\/svg\+xml/); override = null;
ok("markup in a title, creator or description stays as words, and a javascript: picture falls back to a drawn one");

// 3 · search mixes sources; types narrow it
await p.fill("#q", "love"); await p.press("#q", "Enter"); await p.waitForFunction(() => document.querySelectorAll("#grid .card").length > 8); const badges = await p.$$eval("#grid .card .badge", (b) => [...new Set(b.map((x) => x.textContent))]); assert.ok(badges.length >= 5, badges.join()); assert.match(await p.textContent("#status"), /\d+ results/); assert.ok(gw.some((x) => /^\/search\?q=love&type=all/.test(x)));
await p.click("#tabs [data-t=music]"); await p.waitForFunction(() => [...document.querySelectorAll("#grid .card .badge")].every((b) => b.textContent === "Music") && document.querySelectorAll("#grid .card").length > 2); assert.ok(gw.some((x) => /type=music/.test(x))); assert.equal(new URL(p.url()).hash.includes("t=music"), true); ok("“love” gives a mixed screen (" + badges.join(", ") + "); the Music tab asks for music only, and the address remembers it");
await p.fill("#q", ""); await p.press("#q", "Enter"); await p.waitForSelector(".shelf"); await p.click("#tabs [data-t='']");

// 4 · sources can be chosen; PeerTube is opt-in
await p.click("#srcbtn"); await p.waitForSelector("#srclist input"); assert.equal(await p.$$eval("#srclist input", (i) => i.length), 9); assert.equal(await p.isChecked("#src-archive"), true); assert.equal(await p.isChecked("#src-peertube"), false); assert.ok(await p.$("#srclist .dot.ok"), "a source that answered shows a green dot");
await p.check("#src-peertube"); await p.click("#srcsave"); await p.fill("#q", "docs"); await p.press("#q", "Enter"); await p.waitForSelector("#grid .card"); assert.ok(gw.some((x) => /src=[^&]*peertube/.test(x))); assert.ok((await p.$$eval("#grid .card .badge", (b) => b.length)) > 0);
await p.click("#srcbtn"); await p.click("#srcreset"); await p.fill("#q", "docs"); await p.press("#q", "Enter"); await p.waitForTimeout(500); assert.ok(!/src=/.test(gw.at(-1)), gw.at(-1)); ok("Sources: nine listed with their last result, PeerTube off until you turn it on, and “back to the defaults” works");

// 5 · an audiobook: a playlist that really plays, and keeps playing while you browse
await p.fill("#q", ""); await p.press("#q", "Enter"); await p.click("#tabs [data-t=audiobook]"); await p.waitForSelector(".shelf .card"); await p.click(".shelf .card .open"); await p.waitForSelector("#dlg[open] .tracks.audio li");
assert.equal(await p.$$eval("#dlg .tracks.audio li", (l) => l.length), 2); assert.match(await p.textContent("#dlg .tracks.audio li"), /Loomings/); await p.click("#dlg .btn.pri");
await p.waitForSelector("#deck:not([hidden])"); assert.equal(await p.evaluate(() => document.getElementById("audio").src), "https://archive.org/download/moby_dick_librivox/mobydick_01.mp3"); await p.waitForFunction(() => document.getElementById("audio").currentTime > 0.15, null, { timeout: 8000 }); assert.equal(await p.textContent("#dktitle"), "Loomings");
ok("an audiobook opens as a playlist and plays for real (the clock moves), its first track in the player");
assert.equal(await p.evaluate(() => document.getElementById("dlg").contains(document.getElementById("deck"))), true); await p.click("#dkplay"); assert.equal(await p.evaluate(() => document.getElementById("audio").paused), true); await p.click("#dkplay"); assert.equal(await p.evaluate(() => document.getElementById("audio").paused), false); assert.equal(await p.evaluate(() => document.getElementById("deck").parentElement.id), "dlg");
ok("the player rides inside the open window, above its backdrop, so it can be paused without closing anything");
await p.keyboard.press("Escape"); await p.waitForFunction(() => !document.getElementById("dlg").open && document.getElementById("deck").parentElement.tagName === "BODY"); assert.equal(await p.isVisible("#deck"), true); await p.click("#dknext"); await p.waitForFunction(() => /mobydick_02/.test(document.getElementById("audio").src)); await p.click("#dkplay"); assert.equal(await p.evaluate(() => document.getElementById("audio").paused), true); await p.click("#dkplay"); assert.equal(await p.evaluate(() => document.getElementById("audio").paused), false);
ok("closing the window leaves the player going; next, pause and play work"); const sw0 = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); assert.ok(sw0); ok("no sideways scroll with the player up");
await p.click("#dkclose"); assert.equal(await p.isVisible("#deck"), false);

// 6 · radio goes out live
await p.click("#tabs [data-t=radio]"); await p.waitForSelector(".shelf .card"); await p.click(".shelf .card .open"); await p.waitForSelector("#deck:not([hidden])", { timeout: 8000 }); assert.equal(await p.evaluate(() => document.getElementById("audio").src), "https://stream.example.org/jazz"); assert.equal(await p.textContent("#dksub"), "Live radio"); assert.equal(await p.evaluate(() => document.getElementById("deck").classList.contains("live")), true); assert.equal(await p.isVisible("#dkseek"), false); ok("a station starts at once, labelled live, with no seek bar"); await p.keyboard.press("Escape"); await p.click("#dkclose");

// 7 · TV: details, episodes, cast, and honesty about streams
await p.click("#tabs [data-t='']"); await p.fill("#q", "game of thrones"); await p.press("#q", "Enter"); await p.waitForSelector("#grid .card.t-tv"); await p.click("#grid .card.t-tv .open"); await p.waitForSelector("#dlg .eps li");
assert.match(await p.textContent("#dlg"), /Streams belong to the networks/); assert.match(await p.textContent("#dlg .eps"), /S1E2 · The Kingsroad/); assert.match(await p.textContent("#dlg .cast"), /Emilia Clarke[\s\S]*as Daenerys/); assert.equal(await p.$("#dlg video"), null); assert.equal(await p.getAttribute("#dlg .links a", "href"), "https://www.hbo.com/got"); assert.equal(await p.getAttribute("#dlg .links a", "rel"), "noopener noreferrer");
assert.match(new URL(p.url()).hash, /i=tvmaze/); await p.keyboard.press("Escape"); await p.waitForFunction(() => !new URL(location.href).hash.includes("i=")); ok("a TV show shows episodes and cast, plays nothing, links to the official site; its address opens it again, and closing tidies the address");

// 8 · a film: the right file, subtitles, poster; and a deep link
await p.goto(URLP + "#i=" + encodeURIComponent("archive|movie|Nosferatu")); await p.waitForSelector("#dlg[open] video"); assert.equal(await p.evaluate(() => document.querySelector("#dlg video").src), "https://archive.org/download/Nosferatu/Nosferatu%20(1922)/film.mp4"); assert.equal(await p.getAttribute("#dlg video track", "src"), "https://archive.org/download/Nosferatu/Nosferatu.vtt"); assert.match(await p.textContent("#dlg"), /Public domain[\s\S]*Source: Internet Archive/);
ok("a shared link opens the film straight into its player: best encoding, subtitles, licence and source shown");
await p.keyboard.press("Escape");

// 9 · saved items stay
await p.fill("#q", "love"); await p.press("#q", "Enter"); await p.waitForSelector("#grid .card"); await p.click("#grid .card .heart"); const savedTitle = await p.textContent("#grid .card h3"); await p.reload(); await p.click("#tabs [data-t=saved]"); await p.waitForSelector("#grid .card"); assert.equal(await p.textContent("#grid .card h3"), savedTitle); assert.match(await p.textContent("#status"), /1 saved on this device/);
await p.click("#grid .card .heart"); await p.waitForFunction(() => !document.querySelector("#grid .card")); assert.match(await p.textContent("#grid"), /Nothing saved yet/); ok("a ♥ is kept across a reload, shown under Saved, and can be removed");
assert.ok(!seen.some((u) => /localhost|127\.0\.0\.1|etc\/passwd/.test(u))); assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
