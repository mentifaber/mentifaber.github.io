// A live check of every source behind MentiPlayer's gateway (src/media.js): does each still answer in the shape the gateway reads,
// and do the files it hands back actually serve audio or video? Run it anywhere with Node 20+ and a network:
//   node tools/media-probe.mjs            (GitHub runs it from .github/workflows/media-probe.yml)
// It exits non-zero only if the script itself breaks; a source that has changed or is down is reported as a warning.
import { SOURCES, RAILS, item } from "../src/media.js";
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
for (const [id, s] of Object.entries(SOURCES)) for (const type of s.types) {
  const q = type === "tv" ? "friends" : type === "radio" ? "jazz" : type === "audiobook" ? "dickens" : type === "podcast" ? "science" : type === "video" ? "apollo" : type === "movie" ? "night" : "love", t0 = Date.now();
  try { const r = await s.search(type, q, 6, 1), good = r.filter(shape); row(id + " · " + type, r.length > 0 && good.length === r.length, r.length + " results" + (good.length !== r.length ? " (" + (r.length - good.length) + " malformed)" : "") + " in " + (Date.now() - t0) + " ms" + (r[0] ? " · “" + r[0].title.slice(0, 40) + "”" : "")); sample[id + "|" + type] = r; }
  catch (e) { row(id + " · " + type, false, "threw: " + String(e.message || e).slice(0, 100)); }
}
for (const r of RAILS) { try { const items = await r.make(8); row("shelf · " + r.id, items.length > 0 && items.every(shape), items.length + " items" + (items[0] ? " · “" + items[0].title.slice(0, 40) + "”" : "")); sample["rail|" + r.id] = items; } catch (e) { row("shelf · " + r.id, false, "threw: " + String(e.message || e).slice(0, 100)); } }
// what plays: resolve one of each kind that needs it, and fetch a few bytes of the file itself
const pick = (...keys) => { for (const k of keys) { const x = (sample[k] || [])[0]; if (x) return x; } return null; };
for (const [label, it, want] of [["archive film", pick("archive|movie", "rail|films"), "video"], ["archive music", pick("archive|music", "rail|concerts"), "audio"], ["audiobook", pick("archive|audiobook", "rail|books"), "audio"], ["NASA video", pick("nasa|video", "rail|space"), "video"], ["podcast", pick("podcasts|podcast", "rail|podcasts"), "audio"], ["TV show", pick("tvmaze|tv", "rail|tonight"), null]]) {
  if (!it) { row("plays · " + label, false, "no sample item to try"); continue; }
  try { const d = await item(it.id); if (!want) { row("plays · " + label, !!d.item && Array.isArray(d.episodes), (d.episodes || []).length + " episodes, " + (d.cast || []).length + " cast"); continue; }
    const u = d.play && d.play.url, s = u ? await serves(u, want) : { ok: false, status: 0, ct: "no url" }; row("plays · " + label, !!u && s.ok, (d.play.tracks ? d.play.tracks.length + " tracks · " : "") + "file " + s.status + " " + s.ct); } catch (e) { row("plays · " + label, false, "threw: " + String(e.message || e).slice(0, 100)); }
}
for (const [label, key, want] of [["radio station", "radio|radio", "audio|mpeg|ogg|aac|octet"], ["Audius track", "audius|music", "audio"], ["Openverse track", "openverse|music", "audio"], ["Commons video", "commons|video", "video|ogg|webm"], ["PeerTube embed", "peertube|video", null]]) {
  const it = (sample[key] || []).find((x) => x.play); if (!it) { row("plays · " + label, false, "no sample item to try"); continue; }
  if (!want) { row("plays · " + label, /^https:\/\//.test(it.play.url), it.play.url.slice(0, 60)); continue; }
  const s = await serves(it.play.url, want); row("plays · " + label, s.ok, "file " + s.status + " " + s.ct);
}
console.log("\n" + (n - bad) + " of " + n + " checks passed" + (bad ? "; " + bad + " need a look (sources can be resting: run it again before assuming a change)" : ""));
if (process.env.GITHUB_STEP_SUMMARY) { const { appendFileSync } = await import("node:fs"); appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### MentiPlayer sources\n\n```\n" + log.join("\n") + "\n```\n"); }
