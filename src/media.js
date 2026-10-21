// MentiPlayer · the media gateway (/api/media/*). One endpoint in front of the open, keyless places that publish media people may
// actually watch and hear, each reshaped into the same small record, so the app doesn't need to know seventeen APIs. Shows that sit on a host's own player (Mixcloud, Dailymotion, YouTube, Live TV, the Archive's embed) are shown
// through that player, in a sandboxed frame: that is how a show hosted elsewhere is watched without being copied:
//
//   archive    Internet Archive      public-domain films, classic TV, cartoons, live concerts, 78s, old-time radio, LibriVox audiobooks
//   loc        Library of Congress   early films, historic recordings, the National Jukebox
//   tvmaze     TVmaze                TV metadata, tonight's schedule, episodes, cast; a show's free copies are looked up elsewhere
//   livetv     Live TV               news and public channels that stream free on their own YouTube channels (their player)
//   openverse  Openverse             openly licensed audio
//   ccmixter   ccMixter              Creative Commons remixes and samples
//   audius     Audius                artist-uploaded music, streamed through Audius's open API
//   commons    Wikimedia Commons     freely licensed video and audio
//   nasa       NASA Image & Video    NASA's own footage
//   radio      Radio Browser         live internet radio (https streams only)
//   somafm     SomaFM                listener-supported radio, streamed from SomaFM
//   podcasts   Apple's podcast directory + each show's public RSS feed
//   mixcloud   Mixcloud              DJ mixes and radio shows, in Mixcloud's own widget
//   youtube    YouTube               embeddable videos in YouTube's player (needs YOUTUBE_API_KEY)
//   jamendo    Jamendo               independent artists' music (needs JAMENDO_CLIENT_ID)
//   dailymotion Dailymotion          embeddable videos in Dailymotion's player (opt-in: not curated)
//   peertube   Sepia Search          Creative Commons video from PeerTube instances (opt-in: not curated)
//
// It is not an open proxy: every upstream is fixed here, user text only ever goes into a query string, media files themselves are
// never relayed (the browser plays them straight from their owners), and every URL handed back is https. Answers are cached at the
// edge (a failed refresh serves the last good copy), calls to one upstream at a time are coalesced, and one source failing never
// takes the others with it: the answer says which sources replied.
//
//   GET /api/media/sources                            what's behind it, with each source's last result
//   GET /api/media/featured                           the shelves (ids and titles); ?rail=<id> gives one shelf's items
//   GET /api/media/search?q=&type=&src=&page=&limit=  type: all|movie|tv|music|radio|audiobook|podcast|video|live
//   GET /api/media/item?id=                           what plays (url, tracks, subtitles) and a little more about it
//   GET /api/media/health                             (owner) one live probe of every source

const UA = "MentiPlayer/1.0 (+https://mentifaber.org/mentiplayer)", APP = "MentiPlayer";
const TYPES = ["movie", "tv", "music", "radio", "audiobook", "podcast", "video", "live"];
// the owner can add keys for the sources that ask for one (set as Worker secrets): a source whose key is missing stays out, and says so
const ENV = { cur: {} };
export const setEnv = (e) => { ENV.cur = e || {}; }; // for the live probe, which runs outside a Worker
const key_ = (k) => String((ENV.cur && ENV.cur[k]) || "").trim();
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
  thumb: safe(o.thumb), page: safe(o.page), license: plain(o.license, 80), meta: plain(o.meta || "", 120), ...(o.play && safe(o.play.url) ? { play: { kind: o.play.kind, url: safe(o.play.url), ...(o.play.height ? { height: o.play.height } : {}) } } : {}) });
const parseId = (id) => { const [source, type, ...k] = String(id || "").split("|"); return { source, type, key: k.join("|") }; };

// ── the Internet Archive ──
const IA = "https://archive.org";
const IA_MOVIES = "(collection:feature_films OR collection:prelinger OR collection:animationandcartoons OR collection:silent_films OR collection:SciFi_Horror OR collection:Film_Noir OR collection:classic_cartoons OR collection:fedflix OR collection:moviesandfilms)";
const IA_TV = "mediatype:movies AND (collection:classic_tv OR collection:classic_tv_commercials OR collection:television)";
const IA_RADIO = "mediatype:audio AND (collection:oldtimeradio OR collection:radioprograms)";
const IA_MUSIC = "(mediatype:audio OR mediatype:etree) AND (collection:opensource_audio OR collection:etree OR collection:78rpm OR collection:netlabels OR collection:audio_music)";
const IA_BOOKS = "mediatype:audio AND collection:librivoxaudio";
const IA_KIND = { movie: ["movies", IA_MOVIES], tv: ["movies", IA_TV], music: ["audio", IA_MUSIC], audiobook: ["audio", IA_BOOKS], podcast: ["audio", IA_RADIO] };
const IA_META = { movie: "Internet Archive film", tv: "Classic TV · Internet Archive", audiobook: "LibriVox audiobook", podcast: "Old-time radio · Internet Archive", music: "Internet Archive audio" };
async function iaSearch(type, q, limit, page, extra) {
  const [, base] = IA_KIND[type], w = words(q), terms = w ? "(" + w.split(" ").filter(Boolean).join(" AND ") + ") AND " : "", query = terms + (extra || (type === "movie" ? "mediatype:movies AND " : "") + base);
  const j = await get(IA + "/advancedsearch.php?q=" + enc(query) + "&fl[]=identifier&fl[]=title&fl[]=description&fl[]=year&fl[]=creator&fl[]=licenseurl&fl[]=mediatype&sort[]=downloads+desc&rows=" + limit + "&page=" + (page || 1) + "&output=json", { ttl: 300 });
  return ((j.response && j.response.docs) || []).filter((d) => d.identifier).map((d) => mk({ source: "archive", type, key: d.identifier, title: d.title || d.identifier, creator: [].concat(d.creator || "")[0], year: [].concat(d.year || "")[0], description: [].concat(d.description || "")[0],
    thumb: IA + "/services/img/" + d.identifier, page: IA + "/details/" + d.identifier, license: d.licenseurl ? licenseName([].concat(d.licenseurl)[0]) : "Public domain or free to share: see its page", meta: IA_META[type] || "Internet Archive" }));
}
const licenseName = (u) => { const t = String(u); let m = /creativecommons\.org\/publicdomain\/(mark|zero)/i.exec(t); if (m) return m[1].toLowerCase() === "mark" ? "Public domain" : "CC0"; m = /creativecommons\.org\/licenses\/([a-z-]+)\/?([\d.]*)/i.exec(t); return m ? "CC " + m[1].toUpperCase() + (m[2] ? " " + m[2] : "") : "See the item's page"; };
// which file to play: the best video (smaller streaming encodings first), or the audio tracks in order
export function iaPick(meta, type) {
  const files = (meta.files || []).filter((f) => f && f.name && !/^__ia_thumb|_meta\.|\.xml$|\.sqlite$|\.torrent$|_files\.|_archive\.|\.gif$|\.jpe?g$|\.png$/i.test(f.name) && !f.private), id = meta.metadata && meta.metadata.identifier || "", url = (f) => IA + "/download/" + enc(id) + "/" + seg(f.name);
  const fmt = (f) => String(f.format || "").toLowerCase(), dur = (f) => secs(f.length), subs = files.filter((f) => /\.vtt$/i.test(f.name)).slice(0, 8).map((f) => ({ label: clip(f.name.replace(/\.vtt$/i, ""), 40), url: url(f) }));
  if (type === "movie" || type === "tv" || type === "video") {
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
  return { item: mk({ source: "archive", type, key, title: md.title || key, creator: [].concat(md.creator || "")[0], year: [].concat(md.year || md.date || "")[0], description: [].concat(md.description || "")[0], thumb: IA + "/services/img/" + key, page: IA + "/details/" + key, license: md.licenseurl ? licenseName(md.licenseurl) : "Public domain or free to share: see its page" }), play: play ? { ...play, ...(play.kind === "video" ? { embed: IA + "/embed/" + enc(key) } : {}) } : { kind: "none" }, links: [{ label: "Internet Archive", url: IA + "/details/" + key }, { label: "Download", url: IA + "/download/" + key }] };
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
  const watch = await tvWatch(s.name);
  return { item: tvShow(s), play: { kind: "none", note: watch.length ? "The networks hold the streams of current shows. These are the ones that can be watched free, through their hosts' own players." : "Streams belong to the networks. Use the official links to watch." }, watch, episodes: eps.map((e) => ({ season: e.season, number: e.number, title: clip(e.name, 90), date: e.airdate, summary: plain(e.summary, 200) })),
    cast: cast.map((c) => ({ name: clip(c.person && c.person.name, 60), as: clip(c.character && c.character.name, 60), photo: safe(c.person && c.person.image && c.person.image.medium) })), status: s.status, links: [s.officialSite && { label: "Official site", url: s.officialSite }, s.network && s.network.officialSite && { label: (s.network.name || "Network") + " (where it airs)", url: s.network.officialSite }, s.webChannel && s.webChannel.officialSite && { label: (s.webChannel.name || "Channel") + " (where it streams)", url: s.webChannel.officialSite }, { label: "TVmaze", url: s.url }].filter((l) => l && safe(l.url)).map((l) => ({ label: l.label, url: safe(l.url) })) };
}

// a show's free episodes, where there are any: the Internet Archive's classic TV, plus YouTube when the owner has set a key. Each one plays through its host.
async function tvWatch(name) {
  const w = words(name).toLowerCase().split(" ").filter(Boolean); if (!w.length) return [];
  const jobs = [within(iaSearch("tv", name, 8, 1), 4500).catch(() => [])];
  if (key_("YOUTUBE_API_KEY")) jobs.push(within(ytSearch(name + " full episode", 8, 1), 4500).catch(() => []));
  return (await Promise.all(jobs)).flat().filter((i) => { const t = i.title.toLowerCase(); return w.every((x) => t.includes(x)); }).slice(0, 10);
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
  if (!/^[\w.~() -]{2,160}$/.test(key)) throw new Upstream("bad NASA id", 400); // real ones carry spaces, brackets and tildes: never a slash or a query
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

// ── SomaFM: listener-supported radio, with its own stream addresses ──
async function somaAll() { const j = await get("https://somafm.com/channels.json", { ttl: 900 }); return (j.channels || []).filter((c) => /^[\w-]{1,40}$/.test(c.id || "") && c.title); }
const somaItem = (c) => mk({ source: "somafm", type: "radio", key: c.id, title: "SomaFM · " + c.title, creator: c.dj ? "DJ " + c.dj : "", description: c.description + (c.genre ? " (" + String(c.genre).split("|").join(", ") + ")" : ""), thumb: c.xlimage || c.largeimage || c.image, page: "https://somafm.com/" + c.id + "/", license: "Listener-supported radio: © SomaFM", meta: "SomaFM" + (c.listeners ? " · " + c.listeners + " listening" : ""), play: { kind: "live", url: "https://ice1.somafm.com/" + c.id + "-128-mp3" } });
async function somaSearch(q, limit) {
  const all = await somaAll(), w = words(q).toLowerCase().split(" ").filter(Boolean), hit = w.length ? all.filter((c) => { const t = (c.title + " " + c.description + " " + c.genre).toLowerCase(); return w.every((x) => t.includes(x)); }) : all;
  return hit.sort((a, b) => (+b.listeners || 0) - (+a.listeners || 0)).slice(0, limit).map(somaItem);
}

// ── Mixcloud: DJ mixes and radio shows, played in Mixcloud's own widget ──
const mcItem = (c) => { const k = String(c.key || ""); return /^\/[\w.-]+\/[\w.%~-]+\/$/.test(k) && c.name ? mk({ source: "mixcloud", type: "podcast", key: k, title: c.name, creator: c.user && (c.user.name || c.user.username), year: c.created_time, description: [].concat(c.tags || []).map((t) => t.name).filter(Boolean).slice(0, 5).join(", "), thumb: c.pictures && (c.pictures.large || c.pictures.medium || c.pictures.extra_large), page: c.url || "https://www.mixcloud.com" + k, license: "Streamed through Mixcloud's licensed player", meta: "Mixcloud" + (c.audio_length ? " · " + fmtDur(c.audio_length) : ""), play: { kind: "embed", url: "https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=0&feed=" + enc(k), height: 180 } }) : null; };
async function mcSearch(q, limit, page) {
  const w = words(q), j = await get(w ? "https://api.mixcloud.com/search/?type=cloudcast&q=" + enc(w) + "&limit=" + limit + "&offset=" + ((page || 1) - 1) * limit : "https://api.mixcloud.com/popular/hot/?limit=" + limit, { ttl: 600 });
  return (j.data || []).map(mcItem).filter(Boolean).slice(0, limit);
}

// ── ccMixter: remixes and samples, each under a Creative Commons licence ──
async function ccSearch(q, limit, page) {
  const w = words(q), j = await get("https://ccmixter.org/api/query?f=json&datasource=uploads&sort=rank&dir=desc&limit=" + limit + "&offset=" + ((page || 1) - 1) * limit + (w ? "&search_type=all&search=" + enc(w) : "&type=remix"), { ttl: 600, ms: 8000 });
  return (Array.isArray(j) ? j : []).map((u) => { const f = (u.files || []).find((x) => /\.mp3$/i.test(x.download_url || "")); return f && u.upload_id && u.upload_name ? mk({ source: "ccmixter", type: "music", key: u.upload_id, title: u.upload_name, creator: u.user_real_name || u.user_name, year: u.upload_date_format || u.upload_date, description: u.upload_description_plain || (u.upload_extra && u.upload_extra.usertags ? String(u.upload_extra.usertags).replace(/,/g, ", ") : ""), thumb: "", page: u.file_page_url, license: u.license_name ? "CC " + plain(u.license_name, 40) : "Creative Commons", meta: "ccMixter", play: { kind: "audio", url: f.download_url } }) : null; }).filter(Boolean);
}

// ── Library of Congress: free-to-use films and recordings ──
const LOC = "https://www.loc.gov", locUrl = (u) => { const t = String(u || ""); return t.startsWith("//") ? "https:" + t : t; };
async function locSearch(type, q, limit, page) {
  const film = type === "movie", w = words(q), j = await get(LOC + (film ? "/film-and-videos/" : "/audio/") + "?fo=json&fa=online-format:" + (film ? "video" : "audio") + "&c=" + limit + "&sp=" + (page || 1) + (w ? "&q=" + enc(w) : ""), { ttl: 900, ms: 8000 });
  return (j.results || []).map((r) => { const m = /\/item\/([\w.-]{2,60})\/?/.exec(String(r.id || r.url || "")); if (!m || !r.title) return null; return mk({ source: "loc", type, key: m[1], title: [].concat(r.title)[0], creator: [].concat(r.contributor || r.contributor_names || [])[0], year: r.date, description: [].concat(r.description || r.summary || [])[0], thumb: locUrl([].concat(r.image_url || [])[0]), page: LOC + "/item/" + m[1] + "/", license: "Library of Congress: see the item's rights statement", meta: film ? "Library of Congress film" : "Library of Congress recording" }); }).filter(Boolean);
}
// the item's files sit at different depths: gather every {url, mimetype} pair wherever it is
export function locFiles(node, out = [], depth = 0) {
  if (!node || depth > 8 || out.length > 400) return out;
  if (Array.isArray(node)) { for (const n of node) locFiles(n, out, depth + 1); return out; }
  if (typeof node === "object") { if (typeof node.url === "string" && typeof node.mimetype === "string") out.push({ url: node.url, mime: node.mimetype.toLowerCase(), size: +node.size || 0 }); for (const k of Object.keys(node)) if (node[k] && typeof node[k] === "object") locFiles(node[k], out, depth + 1); }
  return out;
}
async function locGetItem(type, key) {
  if (!/^[\w.-]{2,60}$/.test(key)) throw new Upstream("bad Library of Congress id", 400);
  const j = await get(LOC + "/item/" + enc(key) + "/?fo=json", { ttl: 3600, ms: 9000 }), it = j.item || {}, files = locFiles(j.resources || j), film = type === "movie";
  const ok = (f) => film ? /^video\/(mp4|webm)/.test(f.mime) : /^audio\/(mpeg|mp3|mp4|ogg)/.test(f.mime), ordered = files.filter((f) => ok(f) && safe(locUrl(f.url))).sort((a, b) => (/mp4|mpeg|mp3/.test(b.mime) ? 1 : 0) - (/mp4|mpeg|mp3/.test(a.mime) ? 1 : 0) || b.size - a.size), seen = new Set(), uniq = ordered.filter((f) => !seen.has(f.url) && seen.add(f.url));
  const first = uniq[0], page = LOC + "/item/" + key + "/";
  return { item: mk({ source: "loc", type, key, title: it.title || key, creator: [].concat(it.contributor_names || it.contributors || [])[0], year: it.date || it.created_published_date, description: [].concat(it.description || it.notes || [])[0], thumb: locUrl([].concat(it.image_url || (j.item && j.item.image_url) || [])[0]), page, license: "Library of Congress: see the item's rights statement" }),
    play: first ? { kind: film ? "video" : "audio", url: safe(locUrl(first.url)), mime: first.mime, tracks: uniq.length > 1 ? uniq.slice(0, 40).map((f, i) => ({ title: "Part " + (i + 1), url: safe(locUrl(f.url)) })) : undefined, subtitles: [] } : { kind: "none" }, links: [{ label: "Library of Congress", url: page }] };
}

// ── video that sits on other people's players: Dailymotion (opt-in) and YouTube (with a key) ──
async function dmSearch(q, limit, page) {
  const w = words(q), j = await get("https://api.dailymotion.com/videos?fields=id,title,description,thumbnail_360_url,owner.screenname,duration,created_time,allow_embed&family_filter=1&limit=" + limit + "&page=" + (page || 1) + (w ? "&search=" + enc(w) + "&sort=relevance" : "&sort=trending"), { ttl: 600 });
  return (j.list || []).filter((v) => v.allow_embed !== false && /^[\w]{3,20}$/.test(v.id || "")).map((v) => mk({ source: "dailymotion", type: "video", key: v.id, title: v.title, creator: v["owner.screenname"], year: v.created_time ? new Date(v.created_time * 1e3).getUTCFullYear() : "", description: v.description, thumb: v.thumbnail_360_url, page: "https://www.dailymotion.com/video/" + v.id, license: "Shown through Dailymotion's player: © its owner", meta: "Dailymotion" + (v.duration ? " · " + fmtDur(v.duration) : ""), play: { kind: "embed", url: "https://www.dailymotion.com/embed/video/" + v.id } }));
}
async function ytSearch(q, limit, page) {
  const k = key_("YOUTUBE_API_KEY"); if (!k) throw new Upstream("YouTube needs a key (YOUTUBE_API_KEY)", 503);
  const j = await get("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoSyndicated=true&safeSearch=moderate&maxResults=" + Math.min(25, limit) + "&q=" + enc(words(q) || "documentary") + "&key=" + enc(k), { ttl: 600 });
  return (j.items || []).filter((v) => v.id && /^[\w-]{6,20}$/.test(v.id.videoId || "") && v.snippet).map((v) => mk({ source: "youtube", type: "video", key: v.id.videoId, title: v.snippet.title, creator: v.snippet.channelTitle, year: v.snippet.publishedAt, description: v.snippet.description, thumb: v.snippet.thumbnails && ((v.snippet.thumbnails.high || v.snippet.thumbnails.medium || v.snippet.thumbnails.default) || {}).url, page: "https://www.youtube.com/watch?v=" + v.id.videoId, license: "Shown through YouTube's player: © its owner", meta: "YouTube", play: { kind: "embed", url: "https://www.youtube-nocookie.com/embed/" + v.id.videoId } }));
}

// ── Jamendo: independent artists' music, free to stream (needs a client id) ──
async function jmSearch(q, limit, page) {
  const id = key_("JAMENDO_CLIENT_ID"); if (!id) throw new Upstream("Jamendo needs a client id (JAMENDO_CLIENT_ID)", 503);
  const w = words(q), j = await get("https://api.jamendo.com/v3.0/tracks/?client_id=" + enc(id) + "&format=json&audioformat=mp32&imagesize=300&limit=" + limit + "&offset=" + ((page || 1) - 1) * limit + (w ? "&search=" + enc(w) : "&order=popularity_week"), { ttl: 600 });
  return (j.results || []).filter((t) => t.id && t.audio).map((t) => mk({ source: "jamendo", type: "music", key: t.id, title: t.name, creator: t.artist_name, year: t.releasedate, description: t.album_name, thumb: t.image || t.album_image, page: t.shareurl, license: t.license_ccurl ? licenseName(t.license_ccurl) : "Creative Commons", meta: "Jamendo" + (t.duration ? " · " + fmtDur(t.duration) : ""), play: { kind: "audio", url: t.audio } }));
}

// ── live TV: news and public channels that stream free on their own YouTube channels, shown in YouTube's player ──
export const LIVE_TV = [
  ["NASA", "UCLA_DiR1FfKNvjuUpBHmylQ", "NASA's channel: launches, spacewalks and live views from orbit"], ["Al Jazeera English", "UCNye-wNBqNL5ZzHSJj3l8Bg", "Live news from Doha"], ["DW News", "UCknLrEdhRCp1aegoMqRaCZg", "Germany's international broadcaster, live"],
  ["France 24 English", "UCQfwfsi5VrQ8yKZ-UWmAEFg", "Live international news from Paris"], ["Euronews", "UCSrZ3UV4jOidv8ppoVuvW9Q", "Live European news"], ["Sky News", "UCoMdktPbSTixAyNGwb-UYkQ", "Live news from the UK"],
  ["Bloomberg Television", "UCIALMKvObZNtJ6AmdCLP7Lg", "Live business and markets"], ["ABC News", "UCBi2mrWuNuyYy4gbM6fU18Q", "Live news from ABC"], ["NBC News", "UCeY0bbntWzzVIaj2z3QigXg", "Live news from NBC"],
  ["CBS News", "UC8p1vwvWtl6T73JiExfWs1g", "Live news from CBS"], ["Reuters", "UChqUTb7kYRX8-EiaN3XFrSQ", "Live news from Reuters"], ["Associated Press", "UC52X5wxOL_s5yw0dQk7NtgA", "Live news from the AP"], ["Lofi Girl", "UCSJ4gkVC6NrvII8umztf0Ow", "Beats to relax and study to, live"],
];
const liveItem = ([name, ch, note]) => mk({ source: "livetv", type: "live", key: ch, title: name, creator: "Live", description: note, thumb: "", page: "https://www.youtube.com/channel/" + ch + "/live", license: "Live on its own channel: © the broadcaster", meta: "Live TV", play: { kind: "embed", url: "https://www.youtube-nocookie.com/embed/live_stream?channel=" + ch } });
async function liveSearch(q, limit) { const w = words(q).toLowerCase().split(" ").filter(Boolean); return LIVE_TV.filter(([n, , d]) => w.every((x) => (n + " " + d).toLowerCase().includes(x))).slice(0, limit).map(liveItem); }

// ── what's behind it ──
// search(type, q, limit, page) per source, for the types it serves; `on` is whether the all-sources blend includes it
export const SOURCES = {
  archive: { name: "Internet Archive", url: "https://archive.org", types: ["movie", "tv", "music", "audiobook", "podcast"], on: true, note: "Public-domain films, classic TV, cartoons, live concerts, 78s, old-time radio and LibriVox audiobooks", search: (t, q, n, p) => iaSearch(t, q, n, p) },
  tvmaze: { name: "TVmaze", url: "https://www.tvmaze.com", types: ["tv"], on: true, note: "TV details, schedules, episodes and cast, with free episodes found where they exist", search: (t, q, n) => tvSearch(q, n) },
  loc: { name: "Library of Congress", url: "https://www.loc.gov", types: ["movie", "music"], on: true, note: "Early films, historic recordings and the National Jukebox", search: (t, q, n, p) => locSearch(t, q, n, p) },
  livetv: { name: "Live TV", url: "https://www.youtube.com", types: ["live"], on: true, note: "News and public channels that stream free, shown in the channel's own player", search: (t, q, n) => liveSearch(q, n) },
  openverse: { name: "Openverse", url: "https://openverse.org", types: ["music"], on: true, note: "Openly licensed audio", search: (t, q, n, p) => ovSearch(q, n, p) },
  ccmixter: { name: "ccMixter", url: "https://ccmixter.org", types: ["music"], on: true, note: "Remixes and samples under Creative Commons licences", search: (t, q, n, p) => ccSearch(q, n, p) },
  audius: { name: "Audius", url: "https://audius.co", types: ["music"], on: true, note: "Artist-uploaded music through Audius's open API", search: (t, q, n) => auSearch(q, n) },
  commons: { name: "Wikimedia Commons", url: "https://commons.wikimedia.org", types: ["video", "music"], on: true, note: "Freely licensed video and audio (WebM and Ogg: some browsers may not play them)", search: (t, q, n, p) => cmSearch(t, q, n, p) },
  nasa: { name: "NASA Image and Video Library", url: "https://images.nasa.gov", types: ["video"], on: true, note: "NASA's own footage", search: (t, q, n, p) => nasaSearch(q, n, p) },
  radio: { name: "Radio Browser", url: "https://www.radio-browser.info", types: ["radio"], on: true, note: "Live internet radio (https streams only)", search: (t, q, n) => rbSearch(q, n) },
  somafm: { name: "SomaFM", url: "https://somafm.com", types: ["radio"], on: true, note: "Listener-supported, commercial-free internet radio", search: (t, q, n) => somaSearch(q, n) },
  podcasts: { name: "Podcasts (Apple directory + public RSS)", url: "https://podcasts.apple.com", types: ["podcast"], on: true, note: "Shows and episodes from each publisher's public feed; explicit shows are left out", search: (t, q, n) => podSearch(q, n) },
  mixcloud: { name: "Mixcloud", url: "https://www.mixcloud.com", types: ["podcast"], on: true, note: "DJ mixes and radio shows, played in Mixcloud's own widget", search: (t, q, n, p) => mcSearch(q, n, p) },
  youtube: { name: "YouTube", url: "https://www.youtube.com", types: ["video"], on: true, needs: "YOUTUBE_API_KEY", note: "Videos their owners allow to be embedded, shown in YouTube's own player. Needs the site owner's API key", search: (t, q, n, p) => ytSearch(q, n, p) },
  jamendo: { name: "Jamendo", url: "https://www.jamendo.com", types: ["music"], on: true, needs: "JAMENDO_CLIENT_ID", note: "Independent artists' music, free to stream. Needs the site owner's client id", search: (t, q, n, p) => jmSearch(q, n, p) },
  dailymotion: { name: "Dailymotion", url: "https://www.dailymotion.com", types: ["video"], on: false, note: "Videos their owners allow to be embedded, shown in Dailymotion's own player. Not curated, so it's off unless you turn it on", search: (t, q, n, p) => dmSearch(q, n, p) },
  peertube: { name: "PeerTube (Sepia Search)", url: "https://sepiasearch.org", types: ["video"], on: false, note: "Creative Commons video from open PeerTube servers. Not curated, so it's off unless you turn it on", search: (t, q, n, p) => ptSearch(q, n, p) },
};
const ready = (s) => !s.needs || !!key_(s.needs);
// the shelves on the home screen
export const RAILS = [
  { id: "films", title: "Classic films", type: "movie", make: (n) => iaSearch("movie", "", n, 1, "mediatype:movies AND collection:feature_films") },
  { id: "classictv", title: "Classic TV, free", type: "tv", make: (n) => iaSearch("tv", "", n, 1) },
  { id: "tonight", title: "On TV tonight (US)", type: "tv", make: (n) => tvTonight(n) },
  { id: "livetv", title: "Live TV", type: "live", make: (n) => liveSearch("", n) },
  { id: "live", title: "Live radio", type: "radio", make: (n) => rbSearch("", n) },
  { id: "soma", title: "SomaFM", type: "radio", make: (n) => somaSearch("", n) },
  { id: "space", title: "From NASA", type: "video", make: (n) => nasaSearch("", n, 1) },
  { id: "trending", title: "Trending music", type: "music", make: (n) => auTrending(n) },
  { id: "concerts", title: "Live concerts", type: "music", make: (n) => iaSearch("music", "", n, 1, "mediatype:etree AND collection:etree") },
  { id: "jukebox", title: "Library of Congress recordings", type: "music", make: (n) => locSearch("music", "", n, 1) },
  { id: "remixes", title: "Remixes (ccMixter)", type: "music", make: (n) => ccSearch("", n, 1) },
  { id: "oldradio", title: "Old-time radio", type: "podcast", make: (n) => iaSearch("podcast", "", n, 1) },
  { id: "books", title: "Audiobooks", type: "audiobook", make: (n) => iaSearch("audiobook", "", n, 1) },
  { id: "podcasts", title: "Top podcasts", type: "podcast", make: (n) => podTop(n) },
  { id: "mixes", title: "Mixes and radio shows", type: "podcast", make: (n) => mcSearch("", n, 1) },
  { id: "cartoons", title: "Cartoons", type: "movie", make: (n) => iaSearch("movie", "", n, 1, "mediatype:movies AND (collection:classic_cartoons OR collection:animationandcartoons)") },
  { id: "silent", title: "Silent era", type: "movie", make: (n) => iaSearch("movie", "", n, 1, "mediatype:movies AND collection:silent_films") },
  { id: "locfilm", title: "Library of Congress films", type: "movie", make: (n) => locSearch("movie", "", n, 1) },
];
const RESOLVE = { archive: iaItem, tvmaze: (t, k) => tvItem(k), nasa: (t, k) => nasaGetItem(k), podcasts: (t, k) => podGetItem(k), loc: locGetItem };

const timed = async (id, fn) => { const t0 = Date.now(); try { const v = await fn(); STATUS[id] = { ok: true, at: Date.now(), ms: Date.now() - t0, n: Array.isArray(v) ? v.length : undefined }; return v; } catch (e) { STATUS[id] = { ok: false, at: Date.now(), ms: Date.now() - t0, error: clip(e && e.message || e, 120) }; throw e; } };
const roundRobin = (lists) => { const out = [], seen = new Set(); for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) { const it = l[i]; if (!it) continue; const k = it.type + "|" + it.title.toLowerCase().slice(0, 40); if (seen.has(k)) continue; seen.add(k); out.push(it); } return out; };
// one slow source must not hold the whole screen: each gets this long to answer a search (Openverse, anonymous, is sometimes slow)
export const BUDGET = { search: 5500 };
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Upstream("took too long to answer", 504)), ms))]);
export async function search({ q, type, src, page, limit }) {
  type = TYPES.includes(type) ? type : "all"; page = Math.max(1, Math.min(10, +page || 1)); limit = Math.max(2, Math.min(24, +limit || (type === "all" ? 6 : 16))); q = clip(q, 100);
  const want = src ? String(src).split(",").map((s) => s.trim()).filter((s) => SOURCES[s] && ready(SOURCES[s])) : Object.keys(SOURCES).filter((s) => SOURCES[s].on && ready(SOURCES[s])), jobs = [];
  for (const s of want) for (const t of SOURCES[s].types) if (type === "all" || type === t) jobs.push([s, t]);
  const settled = await Promise.allSettled(jobs.map(([s, t]) => timed(s + (jobs.filter((j) => j[0] === s).length > 1 ? ":" + t : ""), () => within(SOURCES[s].search(t, q, limit, page), BUDGET.search)))), report = {};
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
  ENV.cur = env || {}; const url = new URL(req.url), sub = url.pathname.replace(/^\/api\/media/, "") || "/", cors = { "access-control-allow-origin": "*" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET", "access-control-max-age": "86400" } });
  if (req.method !== "GET") return json({ error: "GET only" }, 405, cors);
  // a soft limit per address (per isolate): the edge cache does the real work
  const ip = req.headers.get("cf-connecting-ip") || "x", now = Date.now(), h = hits.get(ip) || { n: 0, t: now }; if (now - h.t > 6e4) { h.n = 0; h.t = now; } if (++h.n > 90) return json({ error: "easy: too many requests a minute" }, 429, { ...cors, "retry-after": "30" }); hits.set(ip, h); if (hits.size > 5000) hits.clear();
  const q = url.searchParams, reply = (r, ttl) => json(JSON.parse(r.body), 200, { ...cors, "cache-control": "public, max-age=" + ttl, ...(r.stale ? { "x-media-stale": "1" } : {}), "x-media-age": String(Math.round((Date.now() - r.at) / 1e3)) }, true);
  const fail = (e) => json({ error: clip(e && e.message || e, 160) }, e && e.status >= 400 && e.status < 600 ? e.status : 502, cors);
  try {
    if (sub === "/" || sub === "/sources") return json({ types: TYPES, sources: Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name, url: s.url, types: s.types, on: s.on, ready: ready(s), ...(s.needs ? { needs: s.needs } : {}), note: s.note, last: STATUS[id] || (s.types.length > 1 && STATUS[id + ":" + s.types[0]]) || null })) }, 200, { ...cors, "cache-control": "public, max-age=60" });
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
      const out = {}; await Promise.all(Object.entries(SOURCES).map(async ([id, s]) => { const t0 = Date.now(); if (!ready(s)) { out[id] = { ok: true, skipped: "needs " + s.needs }; return; } try { const r = await timed(id + ":health", () => s.search(s.types[0], "love", 3, 1)); out[id] = { ok: true, n: r.length, ms: Date.now() - t0, sample: r[0] && r[0].title }; } catch (e) { out[id] = { ok: false, ms: Date.now() - t0, error: clip(e && e.message || e, 140) }; } }));
      return json({ at: Date.now(), sources: out }, 200, { ...cors, "cache-control": "no-store" });
    }
    return json({ error: "no such media route" }, 404, cors);
  } catch (e) { return fail(e); }
}
