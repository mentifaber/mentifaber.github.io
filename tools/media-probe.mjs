// A live check of every source behind MentiPlayer's gateway (src/media.js): does each still answer in the shape the gateway reads,
// and do the files it hands back actually serve audio or video? Run it anywhere with Node 20+ and a network:
//   node tools/media-probe.mjs            (GitHub runs it from .github/workflows/media-probe.yml)
// It exits non-zero only if the script itself breaks; a source that has changed or is down is reported as a warning.
import { SOURCES, RAILS, LIVE_TV, item, setEnv } from "../src/media.js";
setEnv(process.env); // optional keys (YOUTUBE_API_KEY, JAMENDO_CLIENT_ID) make those sources part of the check
let bad = 0, n = 0; const log = [];
const row = (name, ok, detail) => { n++; const line = (ok ? "PASS " : "FAIL ") + name.padEnd(34) + detail; console.log(line); log.push(line); if (!ok) { bad++; console.log("::warning title=" + name + "::" + detail); } };
const shape = (it) => /^[a-z]+\|[a-z]+\|.+/.test(it.id) && it.title && ["thumb", "page"].every((k) => !it[k] || /^https:\/\//.test(it[k])) && (!it.play || /^https:\/\//.test(it.play.url));
// does this address serve media? (a few bytes only; a live station never ends, so the body is dropped after the headers)
async function serves(url, want) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
  try { const r = await fetch(url, { headers: { range: "bytes=0-2047", "user-agent": "MentiPlayer/1.0 probe" }, signal: c.signal, redirect: "follow" }); const ct = r.headers.get("content-type") || ""; try { await r.body.cancel(); } catch (e) {}
    return { ok: (r.status === 200 || r.status === 206) && (want === "any" ? /audio|video|octet|mpeg|ogg|webm|mp4/i.test(ct) : new RegExp(want, "i").test(ct) || /octet-stream/i.test(ct)), status: r.status, ct }; }
  catch (e) { return { ok: false, status: 0, ct: String(e.message || e).slice(0, 60) }; } finally { clearTimeout(t); }
}
const sample = {}; // type|source → first result, to try playing
const QUERY = { "archive|tv": "lucy", "archive|podcast": "shadow", "livetv|live": "news", "somafm|radio": "ambient", "mixcloud|podcast": "house", "loc|movie": "edison", "loc|music": "caruso", "dailymotion|video": "moon" };
for (const [id, s] of Object.entries(SOURCES)) for (const type of s.types) {
  if (s.needs && !process.env[s.needs]) { console.log("SKIP " + (id + " · " + type).padEnd(34) + "needs " + s.needs + " (not set here)"); continue; }
  const q = QUERY[id + "|" + type] || (type === "tv" ? "friends" : type === "radio" ? "jazz" : type === "audiobook" ? "dickens" : type === "podcast" ? "science" : type === "video" ? "apollo" : type === "movie" ? "night" : "love"), t0 = Date.now();
  try { const r = await s.search(type, q, 6, 1), good = r.filter(shape); row(id + " · " + type, r.length > 0 && good.length === r.length, r.length + " results" + (good.length !== r.length ? " (" + (r.length - good.length) + " malformed)" : "") + " in " + (Date.now() - t0) + " ms" + (r[0] ? " · “" + r[0].title.slice(0, 40) + "”" : "")); sample[id + "|" + type] = r; }
  catch (e) { row(id + " · " + type, false, "threw: " + String(e.message || e).slice(0, 100)); }
}
for (const r of RAILS) { if (r.needs && !process.env[r.needs]) { console.log("SKIP " + ("shelf · " + r.id).padEnd(34) + "needs " + r.needs + " (not set here)"); continue; } try { const items = await r.make(8); row("shelf · " + r.id, items.length > 0 && items.every(shape) && (!r.rated || !process.env.OMDB_API_KEY || items.some((i) => i.rating && i.rating.rt != null)), items.length + " items" + (r.rated && process.env.OMDB_API_KEY ? " · scores " + items.slice(0, 4).map((i) => (i.rating ? i.rating.rt + "%" : "–")).join(", ") : "") + (items[0] ? " · “" + items[0].title.slice(0, 40) + "”" : "")); sample["rail|" + r.id] = items; } catch (e) { row("shelf · " + r.id, false, "threw: " + String(e.message || e).slice(0, 100)); } }
// what plays: resolve one of each kind that needs it, and fetch a few bytes of the file itself
const pick = (...keys) => { for (const k of keys) { const x = (sample[k] || [])[0]; if (x) return x; } return null; };
for (const [label, it, want] of [["archive film", pick("archive|movie", "rail|films"), "video"], ["archive music", pick("archive|music", "rail|concerts"), "audio"], ["audiobook", pick("archive|audiobook", "rail|books"), "audio"], ["NASA video", pick("nasa|video", "rail|space"), "video"], ["podcast", pick("podcasts|podcast", "rail|podcasts"), "audio"], ["TV show", pick("tvmaze|tv", "rail|tonight"), null], ["classic TV (Archive)", pick("archive|tv", "rail|classictv"), "video"], ["old-time radio", pick("archive|podcast", "rail|oldradio"), "audio"], ["Library of Congress film", pick("loc|movie", "rail|locfilm"), "video"], ["Library of Congress audio", pick("loc|music", "rail|jukebox"), "audio"]]) {
  if (!it) { row("plays · " + label, false, "no sample item to try"); continue; }
  try { const d = await item(it.id); if (!want) { row("plays · " + label, !!d.item && Array.isArray(d.episodes), (d.episodes || []).length + " episodes, " + (d.cast || []).length + " cast"); continue; }
    const u = d.play && d.play.url, s = u ? await serves(u, want) : { ok: false, status: 0, ct: "no url" }; row("plays · " + label, !!u && s.ok, (d.play.tracks ? d.play.tracks.length + " tracks · " : "") + "file " + s.status + " " + s.ct); } catch (e) { row("plays · " + label, false, "threw: " + String(e.message || e).slice(0, 100)); }
}
for (const [label, key, want] of [["radio station", "radio|radio", "audio|mpeg|ogg|aac|octet"], ["Audius track", "audius|music", "audio"], ["Openverse track", "openverse|music", "audio"], ["Commons video", "commons|video", "video|ogg|webm"], ["SomaFM station", "somafm|radio", "audio|mpeg|ogg|aac|octet"], ["ccMixter remix", "ccmixter|music", "audio"], ["Jamendo track", "jamendo|music", "audio"], ["PeerTube embed", "peertube|video", null]]) {
  const it = (sample[key] || []).find((x) => x.play); if (!it && /jamendo/.test(key) && !process.env.JAMENDO_CLIENT_ID) { console.log("SKIP " + ("plays · " + label).padEnd(34) + "needs JAMENDO_CLIENT_ID"); continue; } if (!it) { row("plays · " + label, false, "no sample item to try"); continue; }
  if (!want) { row("plays · " + label, /^https:\/\//.test(it.play.url), it.play.url.slice(0, 60)); continue; }
  const s = await serves(it.play.url, want); row("plays · " + label, s.ok, "file " + s.status + " " + s.ct);
}

// shows that play in a host's own player: the player has to load, and has to allow being framed here
async function framable(url) {
  try { const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 MentiPlayer probe", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) }); const xfo = r.headers.get("x-frame-options") || "", csp = r.headers.get("content-security-policy") || "", fa = /frame-ancestors\s+([^;]*)/i.exec(csp); await r.body.cancel().catch(() => {});
    if (r.status === 403 || r.status === 429) return { skip: true, why: r.status + " (the host turns scripts away, so this can't be checked from here; embeds are what it is built for)" }; const blocked = /deny|sameorigin/i.test(xfo) || (fa && !/\*|https:(?!\/)|mentifaber/i.test(fa[1])); return { ok: r.status === 200 && !blocked, why: r.status + (blocked ? " blocks framing (" + (xfo || "frame-ancestors " + fa[1]) + ")" : "") }; } catch (e) { return { ok: false, why: String(e.message || e).slice(0, 60) }; }
}
const embeds = [["Mixcloud widget", (sample["mixcloud|podcast"] || [])[0]], ["Dailymotion player", (sample["dailymotion|video"] || [])[0]], ["YouTube player", (sample["youtube|video"] || [])[0]], ["PeerTube player", (sample["peertube|video"] || [])[0]]];
for (const [label, it] of embeds) { if (!it || !it.play) { console.log("SKIP " + ("embed · " + label).padEnd(34) + "no sample"); continue; } const f = await framable(it.play.url); if (f.skip) console.log("SKIP " + ("embed · " + label).padEnd(34) + f.why); else row("embed · " + label, f.ok, f.why); }
{ const a = (sample["archive|movie"] || [])[0], f = a ? await framable("https://archive.org/embed/" + a.id.split("|")[2]) : { ok: false, why: "no sample" }; row("embed · Archive player", f.ok, f.why); }
// every live channel: does its channel still exist (a wrong or retired id would show a dead player)?
for (const [name, ch] of LIVE_TV) { try { const r = await fetch("https://www.youtube.com/channel/" + ch, { headers: { "user-agent": "Mozilla/5.0 MentiPlayer probe", "accept-language": "en" }, redirect: "follow", signal: AbortSignal.timeout(12000) }); await r.body.cancel().catch(() => {}); row("live channel · " + name, r.status === 200, "channel page " + r.status); } catch (e) { row("live channel · " + name, false, String(e.message || e).slice(0, 60)); } }
// a show's free copies: a classic series should list some
try { const sh = (await SOURCES.tvmaze.search("tv", "i love lucy", 3, 1))[0], d = sh && (await item(sh.id)); const raw = d && d.watch.length === 0 ? await SOURCES.archive.search("tv", sh.title, 12, 1).catch(() => []) : []; row("watch free · " + (sh ? sh.title : "?"), !!d && Array.isArray(d.watch) && d.watch.length > 0, d ? d.watch.length + " free copies · " + (d.watch[0] ? "“" + d.watch[0].title.slice(0, 40) + "”" : "(the Archive has " + raw.length + " items for the name as words: " + raw.slice(0, 3).map((x) => "“" + x.title.slice(0, 30) + "”").join(", ") + ")") : "no show"); } catch (e) { row("watch free", false, "threw: " + String(e.message || e).slice(0, 100)); }
console.log("\n" + (n - bad) + " of " + n + " checks passed" + (bad ? "; " + bad + " need a look (sources can be resting: run it again before assuming a change)" : ""));
if (process.env.GITHUB_STEP_SUMMARY) { const { appendFileSync } = await import("node:fs"); appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### MentiPlayer sources\n\n```\n" + log.join("\n") + "\n```\n"); }
