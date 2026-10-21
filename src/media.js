// MentiPlayer · the media gateway (/api/media/*). One endpoint in front of the open, keyless places that publish media people may
// actually watch and hear, each reshaped into the same small record, so the app doesn't need to know eleven APIs:
//
//   archive    Internet Archive      public-domain films, cartoons, old TV, live concerts, 78s, audiobooks (LibriVox)
//   tvmaze     TVmaze                TV metadata, tonight's schedule, episodes, cast (no streams: networks hold those rights)
//   openverse  Openverse             openly licensed audio
//   commons    Wikimedia Commons     freely licensed video and audio
//   nasa       NASA Image & Video    NASA's own footage
//   radio      Radio Browser         live internet radio stations (https streams only)
//   podcasts   Apple's podcast directory + each show's public RSS feed
//   audius     Audius                artist-uploaded music, streamed through Audius's open API
//   peertube   Sepia Search          Creative Commons video from PeerTube instances (opt-in: not curated)
//
// It is not an open proxy: every upstream is fixed here, user text only ever goes into a query string, media files themselves are
// never relayed (the browser plays them straight from their owners), and every URL handed back is https. Answers are cached at the
// edge (a failed refresh serves the last good copy), calls to one upstream at a time are coalesced, and one source failing never
// takes the others with it: the answer says which sources replied.
//
//   GET /api/media/sources                            what's behind it, with each source's last result
//   GET /api/media/featured                           the shelves (ids and titles); ?rail=<id> gives one shelf's items
//   GET /api/media/search?q=&type=&src=&page=&limit=  type: all|movie|tv|music|radio|audiobook|podcast|video
//   GET /api/media/item?id=                           what plays (url, tracks, subtitles) and a little more about it
//   GET /api/media/health                             (owner) one live probe of every source

const UA = "MentiPlayer/1.0 (+https://mentifaber.org/mentiplayer)", APP = "MentiPlayer";
const TYPES = ["movie", "tv", "music", "radio", "audiobook", "podcast", "video"];
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const unent = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { if (e[0] === "#") { const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; } return ENT[e.toLowerCase()] ?? m; });
export const plain = (h, n = 400) => clip(unent(String(h == null ? "" : h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|blockquote|section|article)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "")), n); // block tags break words; inline ones (b, i, a) just vanish
// https only, no addresses or local names: what the browser is allowed to be sent to
export const safe = (u) => { try { let x = String(u || "").trim(); if (/^http:\/\//i.test(x)) x = "https://" + x.slice(7); const p = new URL(x); if (p.protocol !== "https:" || /^\d+\.\d+\.\d+\.\d+$|^\[|^localhost$|\.local$|\.internal$/i.test(p.hostname) || p.username || p.password) return ""; return p.toString(); } catch (e) { return ""; } };
const yearOf = (s) => { const m = /\b(1[89]\d\d|20\d\d)\b/.exec(String(s || "")); return m ? m[1] : ""; };
const enc = (s) => encodeURIComponent(s);
const seg = (name) => String(name).split("/").map(enc).join("/");
const secs = (v) => { if (v == null || v === "") return 0; const s = String(v); if (/^\d+(\.\d+)?$/.test(s)) return Math.round(+s); const p = s.split(":").map(Number); return p.some((x) => !isFinite(x)) ? 0 : p.reduce((a, x) => a * 60 + x, 0); };
// words only: Lucene's operators in the Archive's search are never typed by a visitor
const words = (q) => clip(String(q || "").replace(/[^\p{L}\p{N}\s'-]/gu, " "), 100);
const STATUS = {}; // source → its last result, for /sources (this isolate only)

class Upstream extends Error { constructor(msg, status) { super(msg); this.status = status || 502; } }
async function get(url, o = {}) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: o.text ? "*/*" : "application/json", ...(o.headers || {}) }, signal: AbortSignal.timeout(o.ms || 7000), redirect: "follow", cf: { cacheTtl: o.ttl || 0 } });
  if (!r.ok) throw new Upstream(new URL(url).hostname + " answered " + r.status, r.status >= 500 ? 502 : r.status);
  if (o.text) { const t = await r.text(); return t.slice(0, o.max || 3e6); }
  return r.json();
}
// an item every source makes: the same small record
const mk = (o) => ({ id: o.source + "|" + o.type + "|" + o.key, source: o.source, type: o.type, title: clip(plain(o.title, 200), 160) || "Untitled", creator: clip(plain(o.creator, 160), 120), year: o.year ? String(o.year).slice(0, 4) : "", description: plain(o.description, 420),
  thumb: safe(o.thumb), page: safe(o.page), license: plain(o.license, 80), meta: plain(o.meta || "", 120), ...(o.play && safe(o.play.url) ? { play: { kind: o.play.kind, url: safe(o.play.url) } } : {}) });
const parseId = (id) => { const [source, type, ...k] = String(id || "").split("|"); return { source, type, key: k.join("|") }; };

// ── the Internet Archive ──
const IA = "https://archive.org";
const IA_MOVIES = "(collection:feature_films OR collection:prelinger OR collection:classic_tv OR collection:animationandcartoons OR collection:silent_films OR collection:SciFi_Horror OR collection:Film_Noir OR collection:classic_cartoons)";
const IA_MUSIC = "(mediatype:audio OR mediatype:etree) AND (collection:opensource_audio OR collection:etree OR collection:78rpm OR collection:netlabels OR collection:audio_music)";
const IA_BOOKS = "mediatype:audio AND collection:librivoxaudio";
const IA_KIND = { movie: ["movies", IA_MOVIES], music: ["audio", IA_MUSIC], audiobook: ["audio", IA_BOOKS] };
async function iaSearch(type, q, limit, page, extra) {
  const [, base] = IA_KIND[type], w = words(q), terms = w ? "(" + w.split(" ").filter(Boolean).join(" AND ") + ") AND " : "", query = terms + (extra || (type === "movie" ? "mediatype:movies AND " : "") + base);
  const j = await get(IA + "/advancedsearch.php?q=" + enc(query) + "&fl[]=identifier&fl[]=title&fl[]=description&fl[]=year&fl[]=creator&fl[]=licenseurl&fl[]=mediatype&sort[]=downloads+desc&rows=" + limit + "&page=" + (page || 1) + "&output=json", { ttl: 300 });
  return ((j.response && j.response.docs) || []).filter((d) => d.identifier).map((d) => mk({ source: "archive", type, key: d.identifier, title: d.title || d.identifier, creator: [].concat(d.creator || "")[0], year: [].concat(d.year || "")[0], description: [].concat(d.description || "")[0],
    thumb: IA + "/services/img/" + d.identifier, page: IA + "/details/" + d.identifier, license: d.licenseurl ? licenseName([].concat(d.licenseurl)[0]) : "Public domain or free to share: see its page", meta: type === "movie" ? "Internet Archive film" : type === "audiobook" ? "LibriVox audiobook" : "Internet Archive audio" }));
}
const licenseName = (u) => { const t = String(u); let m = /creativecommons\.org\/publicdomain\/(mark|zero)/i.exec(t); if (m) return m[1].toLowerCase() === "mark" ? "Public domain" : "CC0"; m = /creativecommons\.org\/licenses\/([a-z-]+)\/?([\d.]*)/i.exec(t); return m ? "CC " + m[1].toUpperCase() + (m[2] ? " " + m[2] : "") : "See the item's page"; };
// which file to play: the best video (smaller streaming encodings first), or the audio tracks in order
export function iaPick(meta, type) {
  const files = (meta.files || []).filter((f) => f && f.name && !/^__ia_thumb|_meta\.|\.xml$|\.sqlite$|\.torrent$|_files\.|_archive\.|\.gif$|\.jpe?g$|\.png$/i.test(f.name) && !f.private), id = meta.metadata && meta.metadata.identifier || "", url = (f) => IA + "/download/" + enc(id) + "/" + seg(f.name);
  const fmt = (f) => String(f.format || "").toLowerCase(), dur = (f) => secs(f.length), subs = files.filter((f) => /\.vtt$/i.test(f.name)).slice(0, 8).map((f) => ({ label: clip(f.name.replace(/\.vtt$/i, ""), 40), url: url(f) }));
  if (type === "movie") {
    const rank = (f) => /h\.264/.test(fmt(f)) ? 1 : /512kb mpeg4/.test(fmt(f)) ? 2 : /^mpeg4$/.test(fmt(f)) || /\.mp4$/i.test(f.name) ? 3 : /\.webm$/i.test(f.name) || /webm/.test(fmt(f)) ? 4 : /\.m4v$/i.test(f.name) ? 5 : /\.ogv$|ogg video/.test(fmt(f) + f.name.toLowerCase()) ? 6 : 99;
    const vids = files.filter((f) => rank(f) < 99 && !/trailer|sample|_thumb/i.test(f.name)); if (!vids.length) return null;
    const best = Math.min(...vids.map(rank)), main = vids.filter((f) => rank(f) === best).sort((a, b) => dur(b) - dur(a) || +b.size - +a.size);
    return { kind: "video", url: url(main[0]), mime: /\.webm$/i.test(main[0].name) ? "video/webm" : /\.ogv$/i.test(main[0].name) ? "video/ogg" : "video/mp4", duration: dur(main[0]) || undefined, subtitles: subs, tracks: main.length > 1 ? main.slice(0, 12).map((f, i) => ({ title: "Part " + (i + 1) + " · " + clip(f.name, 60), url: url(f), duration: dur(f) || undefined })) : undefined };
  }
  const rank = (f) => /vbr mp3/.test(fmt(f)) ? 1 : /^mp3$|\.mp3$/i.test(fmt(f) + f.name) ? 2 : /ogg vorbis|\.ogg$/.test(fmt(f) + f.name.toLowerCase()) ? 3 : /\.m4a$|aac/.test(fmt(f) + f.name.toLowerCase()) ? 4 : /\.flac$|flac/.test(fmt(f) + f.name.toLowerCase()) ? 5 : 99;
  const aud = files.filter((f) => rank(f) < 99); if (!aud.length) return null;
  const best = Math.min(...aud.map(rank)), set = aud.filter((f) => rank(f) === best).sort((a, b) => (+a.track || 0) - (+b.track || 0) || a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, 120);
  return { kind: "audio", url: url(set[0]), mime: /\.ogg$/i.test(set[0].name) ? "audio/ogg" : /\.m4a$/i.test(set[0].name) ? "audio/mp4" : "audio/mpeg", tracks: set.map((f, i) => ({ title: clip(f.title || f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " "), 90) || "Track " + (i + 1), url: url(f), duration: dur(f) || undefined })), subtitles: [] };
}
async function iaItem(type, key) {
  if (!/^[\w.-]{2,120}$/.test(key)) throw new Upstream("bad identifier", 400);
  const m = await get(IA + "/metadata/" + enc(key), { ttl: 600, ms: 9000 }), md = m.metadata || {}, play = iaPick(m, type);
  return { item: mk({ source: "archive", type, key, title: md.title || key, creator: [].concat(md.creator || "")[0], year: [].concat(md.year || md.date || "")[0], description: [].concat(md.description || "")[0], thumb: IA + "/services/img/" + key, page: IA + "/details/" + key, license: md.licenseurl ? licenseName(md.licenseurl) : "Public domain or free to share: see its page" }), play: play || { kind: "none" }, links: [{ label: "Internet Archive", url: IA + "/details/" + key }, { label: "Download", url: IA + "/download/" + key }] };
}

// ── TVmaze ──
const TVM = "https://api.tvmaze.com", tvImg = (s) => s && (s.image && (s.image.original || s.image.medium)) || "";
const tvShow = (s, meta) => mk({ source: "tvmaze", type: "tv", key: s.id, title: s.name, creator: (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || "", year: s.premiered, description: s.summary, thumb: tvImg(s) && (s.image.medium || s.image.original), page: s.url, license: "Metadata by TVmaze (CC BY-SA)", meta: meta || [s.type, [].concat(s.genres || []).slice(0, 3).join(", "), s.rating && s.rating.average ? "★ " + s.rating.average : ""].filter(Boolean).join(" · ") });
async function tvSearch(q, limit) { const j = q ? await get(TVM + "/search/shows?q=" + enc(words(q) || q), { ttl: 600 }) : await get(TVM + "/shows?page=0", { ttl: 3600 }); return (j || []).slice(0, limit).map((r) => tvShow(r.show || r)); }
async function tvTonight(limit) {
  const j = await get(TVM + "/schedule?country=US", { ttl: 900 }), by = new Map();
  for (const e of j || []) { const s = e.show || (e._embedded && e._embedded.show); if (!s || !s.id || by.has(s.id) || !tvImg(s)) continue; by.set(s.id, { s, e }); }
  return [...by.values()].sort((a, b) => (b.s.weight || 0) - (a.s.weight || 0)).slice(0, limit).map(({ s, e }) => tvShow(s, [e.airtime, e.season ? "S" + e.season + "E" + e.number : "", clip(e.name, 40)].filter(Boolean).join(" · ")));
}
async function tvItem(key) {
  if (!/^\d{1,8}$/.test(key)) throw new Upstream("bad show id", 400);
  const s = await get(TVM + "/shows/" + key + "?embed[]=episodes&embed[]=cast", { ttl: 900 }), eps = ((s._embedded && s._embedded.episodes) || []).slice(-24).reverse(), cast = ((s._embedded && s._embedded.cast) || []).slice(0, 12);
  return { item: tvShow(s), play: { kind: "none", note: "Streams belong to the networks. Use the official links to watch." }, episodes: eps.map((e) => ({ season: e.season, number: e.number, title: clip(e.name, 90), date: e.airdate, summary: plain(e.summary, 200) })),
    cast: cast.map((c) => ({ name: clip(c.person && c.person.name, 60), as: clip(c.character && c.character.name, 60), photo: safe(c.person && c.person.image && c.person.image.medium) })), status: s.status, links: [s.officialSite && { label: "Official site", url: s.officialSite }, { label: "TVmaze", url: s.url }].filter((l) => l && safe(l.url)).map((l) => ({ label: l.label, url: safe(l.url) })) };
}

// ── Openverse ──
async function ovSearch(q, limit, page) {
  const j = await get("https://api.openverse.org/v1/audio/?q=" + enc(words(q) || "instrumental") + "&page_size=" + limit + "&page=" + (page || 1) + "&mature=false", { ttl: 600 });
  return (j.results || []).map((r) => mk({ source: "openverse", type: "music", key: r.id, title: r.title, creator: r.creator, description: [].concat(r.genres || []).join(", "), thumb: r.thumbnail || (r.thumbnail_url), page: r.foreign_landing_url, license: r.license ? "CC " + String(r.license).toUpperCase() + (r.license_version ? " " + r.license_version : "") : "", meta: "Openverse" + (r.duration ? " · " + fmtDur(Math.round(r.duration / 1000)) : ""), play: { kind: "audio", url: r.url } })).filter((i) => i.play);
}
const fmtDur = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

// ── Wikimedia Commons ──
async function cmSearch(type, q, limit, page) {
  const kind = type === "music" ? "audio" : "video", w = words(q) || (kind === "video" ? "film" : "music");
  const j = await get("https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrsearch=" + enc(w + " filetype:" + kind) + "&gsrlimit=" + limit + "&gsroffset=" + ((page || 1) - 1) * limit + "&prop=imageinfo&iiprop=url|mime|size|mediatype|extmetadata&iiurlwidth=480", { ttl: 600 });
  const pages = ((j.query && j.query.pages) || []).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map((p) => { const i = p.imageinfo && p.imageinfo[0]; if (!i || !/^(video|audio)\/|^application\/ogg$/i.test(i.mime || "")) return null; const x = i.extmetadata || {}, v = (k) => x[k] && x[k].value;
    return mk({ source: "commons", type: kind === "audio" ? "music" : "video", key: String(p.title || "").replace(/^File:/, ""), title: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "), creator: v("Artist"), year: v("DateTimeOriginal"), description: v("ImageDescription"), thumb: i.thumburl, page: i.descriptionurl, license: v("LicenseShortName") || "Free licence", meta: "Wikimedia Commons", play: { kind: kind, url: i.url } }); }).filter((i) => i && i.play);
}

// ── NASA ──
const NASA_Q = ["apollo", "mars rover", "hubble telescope", "space station", "earth from space", "jupiter", "james webb", "moon landing", "rocket launch", "astronaut"];
const nasaItem = (d, thumb) => mk({ source: "nasa", type: "video", key: d.nasa_id, title: d.title, creator: d.center ? "NASA · " + d.center : "NASA", year: d.date_created, description: d.description, thumb, page: "https://images.nasa.gov/details/" + enc(d.nasa_id), license: "NASA media: generally public domain", meta: "NASA" });
async function nasaSearch(q, limit, page) {
  const j = await get("https://images-api.nasa.gov/search?q=" + enc(words(q) || NASA_Q[Math.floor(Date.now() / 864e5) % NASA_Q.length]) + "&media_type=video&page_size=" + limit + "&page=" + (page || 1), { ttl: 600 });
  return ((j.collection && j.collection.items) || []).map((it) => { const d = it.data && it.data[0]; if (!d || !d.nasa_id) return null; const th = (it.links || []).find((l) => l.render === "image" || /\.jpg$/i.test(l.href || "")); return nasaItem(d, th && th.href); }).filter(Boolean);
}
export function nasaPick(urls) {
  const u = (urls || []).map(String), pick = (re) => u.find((x) => re.test(x)), v = pick(/~medium\.mp4$/i) || pick(/~mobile\.mp4$/i) || pick(/~small\.mp4$/i) || pick(/~orig\.mp4$/i) || pick(/\.mp4$/i);
  return { video: v, subs: u.filter((x) => /\.vtt$/i.test(x)).map((x) => ({ label: "English", url: x })).slice(0, 2) };
}
async function nasaGetItem(key) {
  if (!/^[\w.-]{2,120}$/.test(key)) throw new Upstream("bad NASA id", 400);
  const [col, meta] = await Promise.all([get("https://images-assets.nasa.gov/video/" + enc(key) + "/collection.json", { ttl: 3600 }), get("https://images-api.nasa.gov/search?nasa_id=" + enc(key), { ttl: 3600 }).catch(() => null)]);
  const it = meta && meta.collection && meta.collection.items && meta.collection.items[0], d = (it && it.data && it.data[0]) || { nasa_id: key, title: key }, pk = nasaPick(col);
  return { item: nasaItem(d, it && it.links && it.links[0] && it.links[0].href), play: pk.video ? { kind: "video", url: safe(pk.video), mime: "video/mp4", subtitles: pk.subs.map((s) => ({ label: s.label, url: safe(s.url) })).filter((s) => s.url) } : { kind: "none" }, links: [{ label: "NASA Image and Video Library", url: "https://images.nasa.gov/details/" + enc(key) }] };
}

// ── Radio Browser ──
const RB = ["https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info"];
async function rbGet(path) { let err; for (const h of RB) try { return await get(h + path, { ttl: 300, ms: 6000 }); } catch (e) { err = e; } throw err; }
// a station's stream stays as it is: an http one would only break once upgraded, so it is left out
const rbItem = (s) => { const raw = String(s.url_resolved || s.url || ""), url = /^https:\/\//i.test(raw) ? safe(raw) : ""; return url ? mk({ source: "radio", type: "radio", key: s.stationuuid, title: s.name, creator: s.country, description: [s.tags && String(s.tags).split(",").slice(0, 4).join(", "), s.language].filter(Boolean).join(" · "), thumb: s.favicon, page: s.homepage, license: "Live stream: © the station", meta: [String(s.codec || "").toUpperCase(), s.bitrate ? s.bitrate + " kbps" : ""].filter(Boolean).join(" "), play: { kind: "live", url } }) : null; };
async function rbSearch(q, limit) {
  const w = words(q), common = "&limit=" + limit + "&hidebroken=true&is_https=true&order=clickcount&reverse=true";
  if (!w) return (await rbGet("/json/stations/search?lastcheckok=1" + common)).map(rbItem).filter(Boolean);
  const [byName, byTag] = await Promise.all([rbGet("/json/stations/search?name=" + enc(w) + common), rbGet("/json/stations/search?tag=" + enc(w) + common).catch(() => [])]), seen = new Set();
  return [...byName, ...byTag].filter((s) => s.stationuuid && !seen.has(s.stationuuid) && seen.add(s.stationuuid)).map(rbItem).filter(Boolean).slice(0, limit);
}

// ── podcasts ──
const tagOf = (xml, t) => { const m = new RegExp("<" + t + "\\b[^>]*>([\\s\\S]*?)</" + t + ">", "i").exec(xml); if (!m) return ""; return unent(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")); };
export function parseRss(xml) {
  const ch = String(xml || "").split(/<item\b/i), head = ch[0], image = (/<itunes:image[^>]*\bhref=["']([^"']+)["']/i.exec(head) || [])[1] || (/<image>[\s\S]*?<url>([^<]+)<\/url>/i.exec(head) || [])[1] || "";
  const eps = ch.slice(1, 61).map((b) => { const enc2 = /<enclosure\b[^>]*\burl=["']([^"']+)["']/i.exec(b), url = enc2 && safe(unent(enc2[1])); if (!url) return null; return { title: clip(plain(tagOf(b, "title"), 140), 140) || "Episode", url, duration: secs(tagOf(b, "itunes:duration")) || undefined, date: clip(tagOf(b, "pubDate"), 40), notes: plain(tagOf(b, "description") || tagOf(b, "itunes:summary"), 260) }; }).filter(Boolean);
  return { title: plain(tagOf(head, "title"), 140), image: safe(unent(image)), episodes: eps };
}
const podItem = (r) => mk({ source: "podcasts", type: "podcast", key: r.collectionId || r.id, title: r.collectionName || r.name, creator: r.artistName, description: r.primaryGenreName || [].concat(r.genres || []).map((g) => g.name).filter((g) => g && g !== "Podcasts").join(", "), thumb: String(r.artworkUrl600 || r.artworkUrl100 || "").replace("100x100", "600x600"), page: r.collectionViewUrl || r.url, license: "Public RSS feed: © its publisher", meta: r.trackCount ? r.trackCount + " episodes" : "Podcast" });
async function podSearch(q, limit) { const j = await get("https://itunes.apple.com/search?media=podcast&entity=podcast&limit=" + Math.min(50, limit * 2) + "&term=" + enc(words(q) || "news"), { ttl: 600 }); return (j.results || []).filter((r) => r.collectionId && r.collectionExplicitness !== "explicit").slice(0, limit).map(podItem); }
async function podTop(limit) { const j = await get("https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/" + Math.min(25, limit) + "/podcasts.json", { ttl: 1800 }); return ((j.feed && j.feed.results) || []).map(podItem); }
async function podGetItem(key) {
  if (!/^\d{1,12}$/.test(key)) throw new Upstream("bad podcast id", 400);
  const l = await get("https://itunes.apple.com/lookup?id=" + key + "&entity=podcast", { ttl: 3600 }), r = (l.results || [])[0], feed = r && safe(r.feedUrl); if (!feed) throw new Upstream("that podcast has no public feed", 404);
  const f = parseRss(await get(feed, { text: true, ms: 9000, max: 3e6, ttl: 900, headers: { accept: "application/rss+xml, application/xml, text/xml, */*" } }));
  return { item: podItem(r), play: f.episodes.length ? { kind: "audio", url: f.episodes[0].url, tracks: f.episodes } : { kind: "none" }, links: [{ label: "Apple Podcasts", url: safe(r.collectionViewUrl) }, { label: "RSS feed", url: feed }].filter((x) => x.url) };
}

// ── Audius ──
let audiusHost = { at: 0, v: "https://discoveryprovider.audius.co" };
async function audius() { if (Date.now() - audiusHost.at < 36e5) return audiusHost.v; try { const j = await get("https://api.audius.co", { ttl: 3600, ms: 4000 }), h = safe((j.data || [])[0]); if (h) audiusHost = { at: Date.now(), v: h.replace(/\/$/, "") }; else audiusHost.at = Date.now() - 3e6; } catch (e) { audiusHost.at = Date.now() - 3e6; } return audiusHost.v; }
const auItem = (h, t) => t && t.id && t.is_streamable !== false ? mk({ source: "audius", type: "music", key: t.id, title: t.title, creator: t.user && t.user.name, year: t.release_date, description: [t.genre, t.mood].filter(Boolean).join(" · "), thumb: t.artwork && (t.artwork["480x480"] || t.artwork["150x150"] || t.artwork["1000x1000"]), page: t.permalink ? "https://audius.co" + t.permalink : "", license: "Uploaded by the artist on Audius", meta: "Audius" + (t.duration ? " · " + fmtDur(t.duration) : ""), play: { kind: "audio", url: h + "/v1/tracks/" + enc(t.id) + "/stream?app_name=" + APP } }) : null;
async function auSearch(q, limit) { const h = await audius(), j = await get(h + "/v1/tracks/search?query=" + enc(words(q) || "chill") + "&limit=" + limit + "&app_name=" + APP, { ttl: 300 }); return (j.data || []).map((t) => auItem(h, t)).filter((i) => i && i.play); }
async function auTrending(limit) { const h = await audius(), j = await get(h + "/v1/tracks/trending?limit=" + limit + "&app_name=" + APP, { ttl: 900 }); return (j.data || []).map((t) => auItem(h, t)).filter((i) => i && i.play); }

// ── PeerTube, through Sepia Search (Creative Commons only, and only when asked for) ──
async function ptSearch(q, limit, page) {
  const j = await get("https://sepiasearch.org/api/v1/search/videos?search=" + enc(words(q) || "documentary") + "&count=" + limit + "&start=" + ((page || 1) - 1) * limit + "&sort=-match&nsfw=false&isLive=false&" + [1, 2, 3, 4, 5, 6, 7].map((n) => "licenceOneOf=" + n).join("&"), { ttl: 600, ms: 8000 });
  return (j.data || []).map((v) => { const e = safe(v.embedUrl); return e && v.name ? mk({ source: "peertube", type: "video", key: v.uuid || v.id, title: v.name, creator: (v.channel && v.channel.displayName) || (v.account && v.account.displayName), year: v.publishedAt, description: v.description, thumb: v.thumbnailUrl, page: v.url, license: v.licence && v.licence.label ? v.licence.label : "Creative Commons", meta: "PeerTube" + (v.duration ? " · " + fmtDur(v.duration) : ""), play: { kind: "embed", url: e } }) : null; }).filter(Boolean);
}

// ── what's behind it ──
// search(type, q, limit, page) per source, for the types it serves; `on` is whether the all-sources blend includes it
export const SOURCES = {
  archive: { name: "Internet Archive", url: "https://archive.org", types: ["movie", "music", "audiobook"], on: true, note: "Public-domain films, cartoons, old TV, live concerts, 78s and LibriVox audiobooks", search: (t, q, n, p) => iaSearch(t, q, n, p) },
  tvmaze: { name: "TVmaze", url: "https://www.tvmaze.com", types: ["tv"], on: true, note: "TV details, schedules, episodes and cast. No streams: the networks hold those rights", search: (t, q, n) => tvSearch(q, n) },
  openverse: { name: "Openverse", url: "https://openverse.org", types: ["music"], on: true, note: "Openly licensed audio", search: (t, q, n, p) => ovSearch(q, n, p) },
  commons: { name: "Wikimedia Commons", url: "https://commons.wikimedia.org", types: ["video", "music"], on: true, note: "Freely licensed video and audio (WebM and Ogg: some browsers may not play them)", search: (t, q, n, p) => cmSearch(t, q, n, p) },
  nasa: { name: "NASA Image and Video Library", url: "https://images.nasa.gov", types: ["video"], on: true, note: "NASA's own footage", search: (t, q, n, p) => nasaSearch(q, n, p) },
  radio: { name: "Radio Browser", url: "https://www.radio-browser.info", types: ["radio"], on: true, note: "Live internet radio (https streams only)", search: (t, q, n) => rbSearch(q, n) },
  podcasts: { name: "Podcasts (Apple directory + public RSS)", url: "https://podcasts.apple.com", types: ["podcast"], on: true, note: "Shows and episodes from each publisher's public feed; explicit shows are left out", search: (t, q, n) => podSearch(q, n) },
  audius: { name: "Audius", url: "https://audius.co", types: ["music"], on: true, note: "Artist-uploaded music through Audius's open API", search: (t, q, n) => auSearch(q, n) },
  peertube: { name: "PeerTube (Sepia Search)", url: "https://sepiasearch.org", types: ["video"], on: false, note: "Creative Commons video from open PeerTube servers. Not curated, so it's off unless you turn it on", search: (t, q, n, p) => ptSearch(q, n, p) },
};
// the shelves on the home screen
export const RAILS = [
  { id: "films", title: "Classic films", type: "movie", make: (n) => iaSearch("movie", "", n, 1, "mediatype:movies AND collection:feature_films") },
  { id: "tonight", title: "On TV tonight (US)", type: "tv", make: (n) => tvTonight(n) },
  { id: "live", title: "Live radio", type: "radio", make: (n) => rbSearch("", n) },
  { id: "space", title: "From NASA", type: "video", make: (n) => nasaSearch("", n, 1) },
  { id: "trending", title: "Trending music", type: "music", make: (n) => auTrending(n) },
  { id: "concerts", title: "Live concerts", type: "music", make: (n) => iaSearch("music", "", n, 1, "mediatype:etree AND collection:etree") },
  { id: "books", title: "Audiobooks", type: "audiobook", make: (n) => iaSearch("audiobook", "", n, 1) },
  { id: "podcasts", title: "Top podcasts", type: "podcast", make: (n) => podTop(n) },
  { id: "cartoons", title: "Cartoons", type: "movie", make: (n) => iaSearch("movie", "", n, 1, "mediatype:movies AND (collection:classic_cartoons OR collection:animationandcartoons)") },
  { id: "silent", title: "Silent era", type: "movie", make: (n) => iaSearch("movie", "", n, 1, "mediatype:movies AND collection:silent_films") },
];
const RESOLVE = { archive: iaItem, tvmaze: (t, k) => tvItem(k), nasa: (t, k) => nasaGetItem(k), podcasts: (t, k) => podGetItem(k) };

const timed = async (id, fn) => { const t0 = Date.now(); try { const v = await fn(); STATUS[id] = { ok: true, at: Date.now(), ms: Date.now() - t0, n: Array.isArray(v) ? v.length : undefined }; return v; } catch (e) { STATUS[id] = { ok: false, at: Date.now(), ms: Date.now() - t0, error: clip(e && e.message || e, 120) }; throw e; } };
const roundRobin = (lists) => { const out = [], seen = new Set(); for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) { const it = l[i]; if (!it) continue; const k = it.type + "|" + it.title.toLowerCase().slice(0, 40); if (seen.has(k)) continue; seen.add(k); out.push(it); } return out; };
export async function search({ q, type, src, page, limit }) {
  type = TYPES.includes(type) ? type : "all"; page = Math.max(1, Math.min(10, +page || 1)); limit = Math.max(2, Math.min(24, +limit || (type === "all" ? 6 : 16))); q = clip(q, 100);
  const want = src ? String(src).split(",").map((s) => s.trim()).filter((s) => SOURCES[s]) : Object.keys(SOURCES).filter((s) => SOURCES[s].on), jobs = [];
  for (const s of want) for (const t of SOURCES[s].types) if (type === "all" || type === t) jobs.push([s, t]);
  const settled = await Promise.allSettled(jobs.map(([s, t]) => timed(s + (jobs.filter((j) => j[0] === s).length > 1 ? ":" + t : ""), () => SOURCES[s].search(t, q, limit, page)))), report = {};
  const lists = settled.map((r, i) => { const [s] = jobs[i], rep = report[s] || (report[s] = { ok: false, n: 0 }); if (r.status === "fulfilled") { rep.ok = true; rep.n += r.value.length; return r.value; } rep.error = rep.error || clip(r.reason && r.reason.message, 100); return []; });
  const bySrc = {}; settled.forEach((r, i) => { const s = jobs[i][0]; (bySrc[s] = bySrc[s] || []).push(...(lists[i] || [])); });
  return { q, type, page, items: roundRobin(Object.values(bySrc)), sources: report };
}
export async function item(id) {
  const { source, type, key } = parseId(id); if (!SOURCES[source] || !key) throw new Upstream("unknown item", 404);
  const fn = RESOLVE[source]; if (!fn) throw new Upstream("this item plays from its list entry", 400);
  return timed(source + ":item", () => fn(type, key));
}

// ── the route ──
const flying = new Map(), hits = new Map();
async function cached(ctx, origin, key, ttl, make) {
  const cache = typeof caches !== "undefined" ? caches.default : null, req = new Request(origin + "/__media_cache/" + enc(key));
  const hit = cache ? await cache.match(req).catch(() => null) : null, at = hit ? +hit.headers.get("x-media-at") : 0;
  if (hit && Date.now() - at < ttl * 1e3) return { body: await hit.text(), at, stale: false };
  let job = flying.get(key);
  if (!job) { job = (async () => { const body = JSON.stringify(await make()), now = Date.now(); if (cache) { const p = cache.put(req, new Response(body, { headers: { "content-type": "application/json", "cache-control": "max-age=86400", "x-media-at": String(now) } })).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(p); } return { body, at: now }; })().finally(() => flying.delete(key)); flying.set(key, job); }
  try { const r = await job; return { ...r, stale: false }; } catch (e) { if (hit) return { body: await hit.text(), at, stale: true, error: e }; throw e; }
}
export async function media(req, env, ctx, json, isOwner) {
  const url = new URL(req.url), sub = url.pathname.replace(/^\/api\/media/, "") || "/", cors = { "access-control-allow-origin": "*" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET", "access-control-max-age": "86400" } });
  if (req.method !== "GET") return json({ error: "GET only" }, 405, cors);
  // a soft limit per address (per isolate): the edge cache does the real work
  const ip = req.headers.get("cf-connecting-ip") || "x", now = Date.now(), h = hits.get(ip) || { n: 0, t: now }; if (now - h.t > 6e4) { h.n = 0; h.t = now; } if (++h.n > 90) return json({ error: "easy: too many requests a minute" }, 429, { ...cors, "retry-after": "30" }); hits.set(ip, h); if (hits.size > 5000) hits.clear();
  const q = url.searchParams, reply = (r, ttl) => json(JSON.parse(r.body), 200, { ...cors, "cache-control": "public, max-age=" + ttl, ...(r.stale ? { "x-media-stale": "1" } : {}), "x-media-age": String(Math.round((Date.now() - r.at) / 1e3)) }, true);
  const fail = (e) => json({ error: clip(e && e.message || e, 160) }, e && e.status >= 400 && e.status < 600 ? e.status : 502, cors);
  try {
    if (sub === "/" || sub === "/sources") return json({ types: TYPES, sources: Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name, url: s.url, types: s.types, on: s.on, note: s.note, last: STATUS[id] || (s.types.length > 1 && STATUS[id + ":" + s.types[0]]) || null })) }, 200, { ...cors, "cache-control": "public, max-age=60" });
    if (sub === "/featured") {
      const id = q.get("rail"); if (!id) return json({ rails: RAILS.map((r) => ({ id: r.id, title: r.title, type: r.type })) }, 200, { ...cors, "cache-control": "public, max-age=600" });
      const rail = RAILS.find((r) => r.id === id); if (!rail) return json({ error: "no such shelf" }, 404, cors);
      return reply(await cached(ctx, url.origin, "rail:" + id, 1800, async () => ({ id, title: rail.title, type: rail.type, items: await timed("rail:" + id, () => rail.make(14)) })), 300);
    }
    if (sub === "/search") {
      const p = { q: q.get("q"), type: q.get("type"), src: q.get("src"), page: q.get("page"), limit: q.get("limit") };
      return reply(await cached(ctx, url.origin, "s:" + JSON.stringify([clip(p.q, 100).toLowerCase(), p.type || "all", p.src || "", +p.page || 1, +p.limit || 0]), 600, () => search(p)), 120);
    }
    if (sub === "/item") { const id = clip(q.get("id"), 300); return reply(await cached(ctx, url.origin, "i:" + id, 3600, () => item(id)), 600); }
    if (sub === "/health") {
      if (!(await isOwner())) return json({ error: "owner only" }, 401, cors);
      const out = {}; await Promise.all(Object.entries(SOURCES).map(async ([id, s]) => { const t0 = Date.now(); try { const r = await timed(id + ":health", () => s.search(s.types[0], "love", 3, 1)); out[id] = { ok: true, n: r.length, ms: Date.now() - t0, sample: r[0] && r[0].title }; } catch (e) { out[id] = { ok: false, ms: Date.now() - t0, error: clip(e && e.message || e, 140) }; } }));
      return json({ at: Date.now(), sources: out }, 200, { ...cors, "cache-control": "no-store" });
    }
    return json({ error: "no such media route" }, 404, cors);
  } catch (e) { return fail(e); }
}
