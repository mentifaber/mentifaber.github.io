// MentiPlayer's media gateway, against fixtures shaped like each source's real answers: one record for everything, https only,
// escaped text, one source failing never takes the others down, the right file picked to play, and no open proxy.
import assert from "node:assert/strict";
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
import { down, seen } from "./media-fixtures.mjs";
const M = await import("./harness.mjs").then(() => import("./src/media.js"));
const get = async (path, { owner = false, ip = "9.9.9.9" } = {}) => { const r = await M.media(new Request("https://mentifaber.org/api/media" + path, { headers: { "cf-connecting-ip": ip } }), {}, { waitUntil() {} }, (b, st = 200, h = {}) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json", ...h } }), async () => owner); return { r, j: await r.json() }; };

// 1 · safety rails
assert.equal(M.safe("http://a.example.org/x"), "https://a.example.org/x"); for (const bad of ["javascript:alert(1)", "http://127.0.0.1/a", "https://10.0.0.5/a", "http://localhost/a", "https://user:pw@a.org/", "ftp://a.org/", "", "not a url", "https://[::1]/a", "https://printer.local/a"]) assert.equal(M.safe(bad), "", bad);
assert.equal(M.plain("<p>A <b>bold</b> &amp; <i>big</i> &#39;idea&#39;</p><script>alert(1)</script>"), "A bold & big 'idea'"); ok("only https URLs to real hosts get through (no addresses, local names, credentials or scripts), and text is stripped to plain words");

// 2 · one search across everything: one record shape, every source represented
let { r, j } = await get("/search?q=love"); assert.equal(r.status, 200); const bySrc = {}; for (const it of j.items) (bySrc[it.source] = bySrc[it.source] || []).push(it);
for (const s of ["archive", "tvmaze", "openverse", "commons", "nasa", "radio", "podcasts", "audius"]) assert.ok(bySrc[s] && bySrc[s].length, s + " missing: " + Object.keys(bySrc)); assert.ok(!bySrc.peertube, "PeerTube is opt-in");
for (const it of j.items) { assert.match(it.id, /^[a-z]+\|[a-z]+\|.+/); assert.ok(["movie", "tv", "music", "radio", "audiobook", "podcast", "video"].includes(it.type), it.type); assert.ok(it.title && !/[<>]/.test(it.title + it.description + it.creator), it.title); for (const k of ["thumb", "page", "play"]) { const v = k === "play" ? it.play && it.play.url : it[k]; if (v) assert.match(v, /^https:\/\//, it.id + " " + k); } }
assert.deepEqual(Object.keys(j.sources).sort(), ["archive", "audius", "commons", "nasa", "openverse", "podcasts", "radio", "tvmaze"]); assert.ok(Object.values(j.sources).every((s) => s.ok && s.n > 0));
assert.equal(new Set(j.items.slice(0, 8).map((i) => i.source)).size >= 6, true); ok("a search fans out to eight sources and hands back one shape; the first screen mixes them (" + j.items.length + " results)");
assert.ok(!j.items.some((i) => /onerror|alert/.test(JSON.stringify(i)))); const ev = j.items.find((i) => i.id === "archive|movie|x2"); assert.ok(ev); assert.equal(ev.title, "Evil"); const nos = j.items.find((i) => i.id === "archive|movie|Nosferatu"); assert.equal(nos.description, "A symphony of horror & shadows"); assert.equal(nos.license, "Public domain"); ok("markup in a source's text is stripped before it reaches the page");
assert.ok(!j.items.some((i) => i.id === "openverse|music|ov2" || i.id === "openverse|music|ov3") && !j.items.some((i) => i.id === "radio|radio|u2") && !j.items.some((i) => i.id === "podcasts|podcast|222") && !j.items.some((i) => i.id === "audius|music|A2"));
assert.equal(j.items.filter((i) => i.id === "radio|radio|u1").length, 1); ok("unsafe URLs, plain-http radio streams, explicit podcasts and locked tracks are left out, and duplicates are merged");
const cm = bySrc.commons[0]; assert.equal(cm.title, "Apollo 11 landing"); assert.equal(cm.creator, "NASA"); assert.equal(cm.license, "Public domain"); assert.deepEqual(cm.play, { kind: "video", url: "https://upload.wikimedia.org/a.webm" }); assert.equal(bySrc.tvmaze[0].thumb, "https://static.tvmaze.com/m.jpg"); ok("Commons and TVmaze records are read right (licence and credit from the metadata; http artwork upgraded)");

// 3 · by type, by source, opt-in
({ j } = await get("/search?q=ghost&type=music")); assert.ok(j.items.every((i) => i.type === "music") && Object.keys(j.sources).every((s) => ["archive", "openverse", "commons", "audius"].includes(s)), JSON.stringify(Object.keys(j.sources)));
({ j } = await get("/search?q=docs&type=video&src=peertube")); assert.equal(j.items.length, 1); assert.deepEqual(j.items[0].play, { kind: "embed", url: "https://pt.example.org/videos/embed/pt1" }); assert.equal(j.items[0].license, "Attribution"); assert.match(seen.filter((u) => u.includes("sepiasearch")).at(-1), /nsfw=false/); assert.equal((seen.filter((u) => u.includes("sepiasearch")).at(-1).match(/licenceOneOf=/g) || []).length, 7);
({ j } = await get("/search?q=x&type=bogus&src=nope")); assert.deepEqual(j.items, []); ok("types narrow the sources used; PeerTube only on request, Creative Commons and non-NSFW only; junk parameters give nothing, not an error");

// 4 · a source that's down never takes the others with it
down.add("openverse"); down.add("api.radio-browser");
({ r, j } = await get("/search?q=down+test")); assert.equal(r.status, 200); assert.equal(j.sources.openverse.ok, false); assert.match(j.sources.openverse.error, /refused/); assert.equal(j.sources.radio.ok, false); assert.ok(j.sources.archive.ok && j.sources.tvmaze.ok && j.items.length > 5); down.clear();
const radioCalls = seen.filter((u) => u.includes("radio-browser")).length; assert.ok(radioCalls >= 3, "tried its mirrors: " + radioCalls); ok("two sources down: the search still answers, says which two, and the radio source tried its other mirrors");

// 4b · a slow source can't hold the screen: it is given a short budget, then reported as not answering
const slowFetch = globalThis.fetch; globalThis.fetch = (u, o) => (String(u).includes("api.openverse.org") ? new Promise(() => {}) : slowFetch(u, o)); M.BUDGET.search = 300;
{ const t0 = Date.now(); const x = await get("/search?q=slow+test"); assert.ok(Date.now() - t0 < 2500, "took " + (Date.now() - t0)); assert.equal(x.j.sources.openverse.ok, false); assert.match(x.j.sources.openverse.error, /too long/); assert.ok(x.j.sources.archive.ok && x.j.items.length > 5); }
globalThis.fetch = slowFetch; M.BUDGET.search = 5500; ok("one source that never answers is cut off after its budget; the rest of the screen arrives without it");

// 5 · what plays
({ j } = await get("/item?id=" + encodeURIComponent("archive|movie|Nosferatu"))); assert.equal(j.play.kind, "video"); assert.equal(j.play.url, "https://archive.org/download/Nosferatu/Nosferatu%20(1922)/film.mp4"); assert.equal(j.play.mime, "video/mp4"); assert.equal(j.play.subtitles[0].url, "https://archive.org/download/Nosferatu/Nosferatu.vtt"); assert.ok(!j.play.tracks || j.play.tracks.every((t) => !/trailer/.test(t.url)));
assert.equal(j.item.title, "Nosferatu"); assert.equal(j.item.year, "1922"); ok("a film plays its best encoding (H.264 over the small and the Ogg ones), not the trailer, with the path encoded and subtitles found");
({ j } = await get("/item?id=" + encodeURIComponent("archive|audiobook|moby_dick_librivox"))); assert.equal(j.play.kind, "audio"); assert.deepEqual(j.play.tracks.map((t) => t.title.slice(0, 8)), ["Loomings", "mobydick"]); assert.equal(j.play.tracks[0].duration, 1200); assert.equal(j.play.url, "https://archive.org/download/moby_dick_librivox/mobydick_01.mp3"); ok("an audiobook is a playlist of the best MP3s in track order, 64k copies left out");
({ j } = await get("/item?id=" + encodeURIComponent("nasa|video|GSFC_1"))); assert.equal(j.play.url, "https://images-assets.nasa.gov/video/GSFC_1/GSFC_1~medium.mp4"); assert.equal(j.item.title, "Hubble's view"); ok("NASA footage plays the medium encoding, over https");
({ j } = await get("/item?id=" + encodeURIComponent("podcasts|podcast|111"))); assert.equal(j.play.kind, "audio"); assert.equal(j.play.tracks.length, 2); assert.equal(j.play.tracks[0].title, "Episode 2: Black holes & time"); assert.equal(j.play.tracks[0].url, "https://cdn.example.org/ep2.mp3?x=1&y=2"); assert.equal(j.play.tracks[0].duration, 3723); assert.equal(j.play.tracks[0].notes, "All about holes."); assert.equal(j.play.tracks[1].duration, 2400); ok("a podcast's public feed is read: CDATA, entities, http enclosures upgraded, durations, notes; entries without audio skipped");
({ j } = await get("/item?id=" + encodeURIComponent("tvmaze|tv|82"))); assert.equal(j.play.kind, "none"); assert.equal(j.episodes[0].title, "The Kingsroad"); assert.equal(j.cast[0].as, "Daenerys"); assert.deepEqual(j.links.map((l) => l.label), ["Official site", "TVmaze"]); ok("a TV show gives episodes (newest first), cast and its official links, and honestly no stream");
({ j } = await get("/item?id=" + encodeURIComponent("nasa|video|KSC-20190902-VP (2)~x"))); assert.equal(j.play.url, "https://images-assets.nasa.gov/video/KSC-20190902-VP%20(2)~x/KSC~mobile.mp4"); ok("a NASA id with spaces, brackets and a tilde (as real ones have) opens");
for (const [id, code] of [["archive|movie|../../etc/passwd", 400], ["tvmaze|tv|abc", 400], ["nasa|video|a/b", 400], ["podcasts|podcast|1;2", 400], ["bogus|movie|x", 404], ["radio|radio|u1", 400], ["", 404]]) { const x = await get("/item?id=" + encodeURIComponent(id)); assert.equal(x.r.status, code, id + " → " + x.r.status); }
assert.ok(!seen.some((u) => /etc\/passwd|a%2Fb/.test(u))); ok("made-up or hostile ids are refused before any upstream is called: it isn't an open proxy");

// 6 · shelves
({ j } = await get("/featured")); assert.deepEqual(j.rails.map((x) => x.id), ["films", "tonight", "live", "space", "trending", "concerts", "books", "podcasts", "cartoons", "silent"]);
for (const rail of j.rails) { const x = await get("/featured?rail=" + rail.id); assert.equal(x.r.status, 200, rail.id); assert.ok(x.j.items.length > 0, rail.id + " is empty"); assert.ok(x.j.items.every((i) => i.type === rail.type), rail.id); }
const tn = (await get("/featured?rail=tonight")).j.items; assert.deepEqual(tn.map((i) => i.title), ["Show Six", "Show Five"]); assert.match(tn[0].meta, /21:00 · S1E1 · Pilot/); assert.equal((await get("/featured?rail=nope")).r.status, 404); ok("ten shelves, each loads on its own; tonight's TV is ranked by popularity, skips shows with no picture, and says when and which episode");

// 7 · the rest of the route
({ j } = await get("/sources")); assert.equal(j.sources.length, 9); assert.equal(j.sources.find((s) => s.id === "peertube").on, false); assert.ok(j.sources.find((s) => s.id === "archive").last, "last result shown");
assert.equal((await get("/health")).r.status, 401); ({ j } = await get("/health", { owner: true })); assert.ok(Object.values(j.sources).every((s) => s.ok), JSON.stringify(j.sources)); ok("/sources lists all nine with their last result; the live health probe is the owner's");
assert.equal((await M.media(new Request("https://mentifaber.org/api/media/search", { method: "POST" }), {}, {}, (b, st = 200) => new Response(JSON.stringify(b), { status: st }), async () => false)).status, 405);
let last; for (let i = 0; i < 95; i++) last = (await get("/search?q=flood" + i, { ip: "7.7.7.7" })).r.status; assert.equal(last, 429); assert.equal((await get("/sources", { ip: "8.8.8.8" })).r.status, 200); ok("GET only, and one address can't hammer it (the others are unaffected)");
console.log("all " + n + " checks passed"); process.exit(0);
