// MentiPlayer when a source turns Cloudflare's servers away (src/media.js): Apple's directory answers 429 to Cloudflare's
// shared addresses and loc.gov answers 403. Song previews and "Top songs" then come from Deezer, podcasts from gpodder.net's
// open directory (each show's own feed, so playing it needs nothing from Apple), and the historic-recordings shelf from the
// Internet Archive's restored 78s. When the sources answer, nothing changes.
import assert from "node:assert/strict";
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const F = await import("./media-fixtures.mjs"), { J, RSS } = F;
const M = await import("./harness.mjs").then(() => import("./src/media.js"));
const fixtures = globalThis.fetch; let apple = 429, loc = 403; const asked = [];
const track = (id, title, ex) => ({ id, title, explicit_lyrics: !!ex, preview: "https://cdnt-preview.dzcdn.net/" + id + ".mp3", duration: 200, link: "https://www.deezer.com/track/" + id, artist: { name: "Miles Davis" }, album: { title: "Album", cover_xl: "https://e-cdns-images.dzcdn.net/" + id + ".jpg" } });
globalThis.fetch = async (u, o) => { const url = String(u), host = new URL(url).hostname; asked.push(host);
  if (host === "itunes.apple.com" || host === "rss.marketingtools.apple.com") { if (apple) return new Response("Too Many Requests", { status: apple }); }
  if (host === "www.loc.gov" && loc) return new Response("Forbidden", { status: loc });
  if (host === "api.deezer.com") return J({ data: [track(1, "Blue in Green"), track(2, "So What"), track(3, "Rude Song", true), { id: 4, title: "No preview" }] });
  if (host === "gpodder.net") return J([{ url: "https://feeds.example.org/science.xml", title: "Science & Wonder", author: "Dr. Q", description: "<b>Big</b> questions", subscribers: 1234, logo_url: "https://img.example.org/cover.jpg", website: "https://science.example.org" }, { url: "http://127.0.0.1/evil.xml", title: "Local" }, { url: "javascript:alert(1)", title: "Bad" }]);
  if (host === "feeds.example.org") return new Response(RSS, { headers: { "content-type": "application/rss+xml" } });
  return fixtures(u, o); };
const get = async (path) => { const r = await M.media(new Request("https://mentifaber.org/api/media" + path + (path.includes("?") ? "&" : "?") + "safe=0", { headers: { "cf-connecting-ip": "9.9.9.9" } }), {}, { waitUntil() {} }, (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...h } }), async () => false); return { r, j: await r.json() }; };

// songs
let { r, j } = await get("/search?q=miles+davis&src=itunes&type=music"); assert.equal(r.status, 200, JSON.stringify(j));
assert.deepEqual(j.items.map((i) => i.title).sort(), ["Blue in Green", "Rude Song", "So What"]); assert.ok(j.items.every((i) => i.source === "deezer" && i.play.kind === "audio" && /^https:\/\/cdnt-preview/.test(i.play.url) && /Deezer/.test(i.license)));
assert.ok(j.sources.itunes.ok, "the search still counts as answered");
({ j } = await (async () => { const r2 = await M.media(new Request("https://mentifaber.org/api/media/search?q=miles+davis&src=itunes&type=music&safe=1", { headers: { "cf-connecting-ip": "9.9.9.9" } }), {}, { waitUntil() {} }, (o, s = 200) => new Response(JSON.stringify(o), { status: s }), async () => false); return { j: await r2.json() }; })());
assert.ok(!j.items.some((i) => i.title === "Rude Song"), "explicit songs left out in Safe mode");
ok("Apple answers 429: song previews come from Deezer (explicit ones left out in Safe mode)");
({ r, j } = await get("/featured?rail=topsongs")); assert.equal(r.status, 200, JSON.stringify(j)); assert.ok(j.items.length >= 2 && j.items.every((i) => i.source === "deezer")); assert.ok(asked.includes("api.deezer.com"));
ok("the Top songs shelf fills from Deezer's chart");

// podcasts
({ r, j } = await get("/search?q=science&src=podcasts&type=podcast")); assert.equal(r.status, 200, JSON.stringify(j));
assert.equal(j.items.length, 1, "only the public https feed: no local addresses, no scripts"); const show = j.items[0];
assert.equal(show.title, "Science & Wonder"); assert.match(show.id, /^podcasts\|podcast\|g[\w-]+$/); assert.match(show.meta, /1,234 listeners/);
asked.length = 0; ({ r, j } = await get("/item?id=" + encodeURIComponent(show.id))); assert.equal(r.status, 200, JSON.stringify(j));
assert.equal(j.play.kind, "audio"); assert.equal(j.play.tracks.length, 2); assert.equal(j.play.url, "https://cdn.example.org/ep2.mp3?x=1&y=2"); assert.ok(!asked.includes("itunes.apple.com"), "played straight from its feed");
({ r } = await get("/item?id=" + encodeURIComponent("podcasts|podcast|g" + Buffer.from("http://10.0.0.1/x.xml").toString("base64url")))); assert.equal(r.status, 400, "a feed address must be public https");
ok("Apple answers 429: podcasts come from gpodder.net's open directory and play straight from each show's own feed");

// the historic-recordings shelf
({ r, j } = await get("/featured?rail=jukebox")); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.title, "Historic recordings"); assert.ok(j.items.length && j.items.every((i) => i.source === "archive"));
ok("loc.gov answers 403: the historic-recordings shelf fills from the Internet Archive's restored 78s");

// sources that answer: unchanged
apple = 0; loc = 0; asked.length = 0;
({ j } = await get("/search?q=taylor&src=itunes&type=music&page=2")); assert.ok(j.items.length && j.items.every((i) => i.source === "itunes")); assert.ok(!asked.includes("api.deezer.com"));
({ j } = await get("/search?q=wonder&src=podcasts&type=podcast&page=2")); assert.ok(j.items.every((i) => /^podcasts\|podcast\|\d+$/.test(i.id))); assert.ok(!asked.includes("gpodder.net"));
ok("when Apple and loc.gov answer, nothing changes");
console.log("MentiPlayer around refusing sources: all checks passed");
