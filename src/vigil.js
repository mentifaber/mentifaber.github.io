// Vigil relay (/api/vigil/*). Vigil reads most feeds straight from their source in the browser, but some
// sources can't be read that way: OpenSky, adsb.lol and adsb.fi send no CORS header for this site, GDELT
// retired its GEO API and rate-limits the DOC API to one call per 5 seconds, and NOAA's real-time solar
// wind files are 2-4 MB each. This relay fetches those server-side, for the owner only (the Vigil session),
// from a fixed list of upstreams (it is not an open proxy), trims them to what Vigil draws, and caches each
// answer at the edge so the owner's devices share one upstream call. A failed refresh serves the last good
// copy, marked stale, rather than an error.
//
// Optional Worker secrets (wrangler secret put …):
//   OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET  an OpenSky API client: global traffic every 15 s instead of
//                                              every 60 s on the anonymous quota
//   NASA_API_KEY                               a personal api.nasa.gov key (APOD) instead of DEMO_KEY

const UA = "mentifaber.org Vigil/1.0 (+https://mentifaber.org/contact)";
const flying = new Map(); // in-isolate request coalescing: one upstream call per key at a time
const backoff = {}; // upstream -> retry-not-before (ms), after a 429
let osTok = null; // OpenSky OAuth token { v, exp }
let osLeft = -1; // OpenSky credits left today, from its last answer

class Upstream extends Error {
  constructor(msg, status, retry) { super(msg); this.status = status || 502; this.retry = retry || 0; }
}
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Trailing empty fields are dropped from each row; the client reads a missing field as empty.
const trim = (row) => { while (row.length && (row[row.length - 1] === "" || row[row.length - 1] == null)) row.pop(); return row; };

async function get(url, o = {}) {
  const host = new URL(url).host;
  if (backoff[host] > Date.now()) throw new Upstream(host + " asked us to wait", 429, Math.ceil((backoff[host] - Date.now()) / 1e3));
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), o.timeout || 20000);
  let r;
  try { r = await fetch(url, { method: o.method || "GET", body: o.body, headers: { "user-agent": UA, accept: "application/json, text/plain, */*", ...(o.headers || {}) }, signal: ctl.signal }); }
  catch (e) { throw new Upstream(host + (e.name === "AbortError" ? " timed out" : " unreachable")); }
  finally { clearTimeout(to); }
  if (r.status === 429) {
    const wait = +(r.headers.get("x-rate-limit-retry-after-seconds") || r.headers.get("retry-after") || 60);
    backoff[host] = Date.now() + Math.min(Math.max(wait, 5), 3600) * 1e3;
    throw new Upstream(host + " rate limit", 429, wait);
  }
  if (!r.ok) throw new Upstream(host + " HTTP " + r.status, r.status >= 500 ? 502 : r.status);
  return o.raw ? r : o.text ? r.text() : r.json();
}

// Edge cache: fresh for `ttl` seconds, then refetched; kept a day so a failed refresh can serve it stale.
// `have` is the x-vigil-at the client already holds: when that is still the newest copy, the answer is
// {"same":true} instead of the whole body again (the global traffic snapshot is over a megabyte).
async function cached(env, ctx, origin, key, ttl, make, have) {
  const cache = typeof caches !== "undefined" ? caches.default : null, req = new Request(origin + "/__vigil_cache/" + key);
  const hit = cache ? await cache.match(req).catch(() => null) : null;
  const at = hit ? +hit.headers.get("x-vigil-at") : 0;
  if (hit && Date.now() - at < ttl * 1e3) return reply(have && +have === at ? new Response('{"same":true}') : hit, at);
  let job = flying.get(key);
  if (!job) {
    job = (async () => {
      const body = typeof make === "function" ? JSON.stringify(await make()) : make;
      const now = Date.now();
      const res = new Response(body, { headers: { "content-type": "application/json", "cache-control": "max-age=86400", "x-vigil-at": String(now) } });
      if (cache) ctx.waitUntil(cache.put(req, res.clone()).catch(() => {}));
      return { body, at: now };
    })().finally(() => flying.delete(key));
    flying.set(key, job);
  }
  try {
    const { body, at: now } = await job;
    return reply(new Response(body), now);
  } catch (e) {
    if (hit) return reply(have && +have === at ? new Response('{"same":true}') : hit, at, e);
    return new Response(JSON.stringify({ error: e.message, retry: e.retry || undefined }), { status: e.status || 502, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
}
function reply(res, at, err) {
  const h = { "content-type": "application/json", "cache-control": "no-store", "x-vigil-at": String(at), "x-vigil-age": String(Math.round((Date.now() - at) / 1e3)) };
  if (err) { h["x-vigil-stale"] = "1"; h["x-vigil-error"] = String(err.message).slice(0, 120); if (err.retry) h["x-vigil-retry"] = String(err.retry); }
  return new Response(res.body, { headers: h });
}

// ── air traffic ──
// One compact row per aircraft, shared by every air route:
//  0 hex  1 callsign  2 lat  3 lon  4 altitude ft (0 on the ground, null unknown)  5 on ground (0/1)
//  6 ground speed kt  7 track deg  8 vertical rate ft/min  9 squawk  10 emitter category (A1..C3)
//  11 registration  12 ICAO type  13 flags (1 military, 2 interesting, 4 PIA, 8 LADD, 16 MLAT, 32 TIS-B,
//  64 emergency)  14 country of registration  15 position age s  16 type description  17 operator
//  18 emergency kind
const OS_CAT = { 2: "A1", 3: "A2", 4: "A3", 5: "A4", 6: "A5", 7: "A6", 8: "A7", 9: "B1", 10: "B2", 11: "B3", 12: "B4", 14: "B6", 15: "B7", 16: "C1", 17: "C2", 18: "C3" };
const EMERG_SQ = /^7[567]00$/;
const EMERG_KIND = { "7500": "unlawful", "7600": "nordo", "7700": "general" };

function rowAdsb(a) {
  if (typeof a.lat !== "number" || typeof a.lon !== "number") return null;
  const gnd = a.alt_baro === "ground";
  const alt = gnd ? 0 : typeof a.alt_baro === "number" ? a.alt_baro : typeof a.alt_geom === "number" ? a.alt_geom : null;
  const sq = a.squawk || "", em = a.emergency && a.emergency !== "none" ? a.emergency : EMERG_KIND[sq] || "";
  let f = a.dbFlags | 0;
  if ((Array.isArray(a.mlat) && a.mlat.length) || a.type === "mlat") f |= 16;
  if (/tisb/.test(a.type || "")) f |= 32;
  if (em) f |= 64;
  const track = a.track ?? a.true_heading ?? a.mag_heading;
  return trim([String(a.hex || "").toLowerCase(), (a.flight || "").trim(), r4(a.lat), r4(a.lon), alt, gnd ? 1 : 0, r1(a.gs),
    r1(track), a.baro_rate ?? a.geom_rate ?? null, sq, a.category || "", a.r || "", a.t || "", f, "",
    r1(a.seen_pos ?? a.seen ?? 0), a.desc || "", a.ownOp || "", em]);
}
const rowsOf = (j) => (j.ac || j.aircraft || []).map(rowAdsb).filter(Boolean);

async function osToken(env) {
  if (!env.OPENSKY_CLIENT_ID || !env.OPENSKY_CLIENT_SECRET) return null;
  if (osTok && osTok.exp > Date.now() + 60e3) return osTok.v;
  const j = await get("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.OPENSKY_CLIENT_ID, client_secret: env.OPENSKY_CLIENT_SECRET }).toString(),
  });
  osTok = { v: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1e3 };
  return osTok.v;
}
async function opensky(env) {
  let tok = null;
  try { tok = await osToken(env); } catch (e) { tok = null; } // a bad client falls back to the anonymous quota
  const headers = tok ? { authorization: "Bearer " + tok } : {};
  let r;
  try { r = await get("https://opensky-network.org/api/states/all?extended=1", { headers, raw: true, timeout: 25000 }); }
  catch (e) { if (e.status !== 400) throw e; r = await get("https://opensky-network.org/api/states/all", { headers, raw: true, timeout: 25000 }); }
  const j = await r.json(), now = j.time || Math.floor(Date.now() / 1e3), ac = [];
  for (const s of j.states || []) {
    if (s[5] == null || s[6] == null) continue;
    const gnd = !!s[8], m = s[7] != null ? s[7] : s[13], sq = s[14] || "";
    ac.push(trim([s[0], (s[1] || "").trim(), r4(s[6]), r4(s[5]), gnd ? 0 : m != null ? Math.round(m * 3.28084) : null, gnd ? 1 : 0,
      s[9] != null ? r1(s[9] * 1.943844) : null, s[10] != null ? r1(s[10]) : null, s[11] != null ? Math.round(s[11] * 196.85) : null,
      sq, OS_CAT[s[17]] || "", "", "", EMERG_SQ.test(sq) ? 64 : 0, s[2] || "", Math.max(0, now - (s[3] || s[4] || now)), "", "", EMERG_KIND[sq] || ""]));
  }
  osLeft = +(r.headers.get("x-rate-limit-remaining") ?? -1);
  return { t: now * 1e3, src: "OpenSky", auth: !!tok, left: osLeft, n: ac.length, ac };
}
// A global snapshot costs 4 credits (400 a day anonymous, 4000 with an API client). Refresh as fast as the
// base rate allows while the day's credits would last four times over at that pace, slower as they run down,
// so a long session thins the refresh instead of running dry by mid-afternoon (credits reset at 00:00 UTC).
function osTTL(env) {
  const base = env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET ? 15 : 60;
  if (!(osLeft >= 0)) return base;
  const secs = 86400 - (Date.now() / 1e3) % 86400, calls = Math.max(1, osLeft / 4);
  return Math.round(Math.max(base, Math.min(600, secs / calls / 4)));
}

const ADSB = [
  { name: "adsb.lol", point: (la, lo, r) => `https://api.adsb.lol/v2/point/${la}/${lo}/${r}`, list: (k) => `https://api.adsb.lol/v2/${k}`, sqk: (s) => `https://api.adsb.lol/v2/sqk/${s}`,
    find: (k, q) => `https://api.adsb.lol/v2/${k === "registration" ? "reg" : k}/${encodeURIComponent(q)}` },
  { name: "adsb.fi", point: (la, lo, r) => `https://opendata.adsb.fi/api/v3/lat/${la}/lon/${lo}/dist/${r}`, list: (k) => `https://opendata.adsb.fi/api/v2/${k}`, sqk: (s) => `https://opendata.adsb.fi/api/v2/sqk/${s}`,
    find: (k, q) => `https://opendata.adsb.fi/api/v2/${k}/${encodeURIComponent(q)}` },
];
async function firstOf(make) {
  let last;
  for (const s of ADSB) {
    try { return { src: s.name, j: await get(make(s), { timeout: 12000 }) }; }
    catch (e) { last = e; }
  }
  throw last;
}
async function near(la, lo, r) {
  const { src, j } = await firstOf((s) => s.point(la, lo, r));
  const ac = rowsOf(j);
  return { t: j.now ? (j.now > 1e12 ? j.now : j.now * 1e3) : Date.now(), src, lat: la, lon: lo, r, n: ac.length, ac };
}
async function list(kind) {
  const { src, j } = await firstOf((s) => s.list(kind));
  const ac = rowsOf(j);
  return { t: Date.now(), src, kind, n: ac.length, ac };
}
async function emergencies() {
  const out = new Map();
  let src = "";
  for (const sq of ["7500", "7600", "7700"]) {
    const r = await firstOf((s) => s.sqk(sq));
    src = src || r.src;
    for (const row of rowsOf(r.j)) out.set(row[0], row);
  }
  return { t: Date.now(), src, n: out.size, ac: [...out.values()] };
}
// Any aircraft in the world by hex, callsign or registration (whichever the query looks like, in that order).
async function find(q) {
  const kinds = /^[0-9a-f]{6}$/.test(q) ? ["hex", "callsign", "registration"] : /-/.test(q) ? ["registration", "callsign"] : ["callsign", "registration"];
  let src = "";
  for (const k of kinds) {
    const r = await firstOf((s) => s.find(k, k === "hex" ? q : q.toUpperCase()));
    src = r.src;
    const ac = rowsOf(r.j);
    if (ac.length) return { t: Date.now(), src, q, by: k, n: ac.length, ac };
  }
  return { t: Date.now(), src, q, n: 0, ac: [] };
}
async function photo(hex) {
  const j = await get("https://api.planespotters.net/pub/photos/hex/" + hex);
  const p = (j.photos || [])[0];
  return p ? { src: (p.thumbnail_large || p.thumbnail || {}).src || null, link: p.link || null, by: p.photographer || null } : { src: null };
}

// ── space weather: NOAA real-time solar wind (RTSW) and GOES X-rays, binned to 10 minutes over 24 h ──
const BIN = 10 * 60e3;
const tms = (s) => Date.parse(/Z$/.test(s) ? s : s + "Z");
function bins(rows, pick, how) {
  const m = new Map();
  for (const r of rows) {
    const t = tms(r.time_tag); if (!isFinite(t)) continue;
    const v = pick(r); if (v == null || !isFinite(v)) continue;
    const b = Math.floor(t / BIN) * BIN, cur = m.get(b);
    if (!cur) m.set(b, [v, 1]); else if (how === "max") cur[0] = Math.max(cur[0], v); else if (how === "min") cur[0] = Math.min(cur[0], v); else { cur[0] += v; cur[1]++; }
  }
  return m;
}
function series(maps, end) {
  const t0 = Math.floor(end / BIN) * BIN - 143 * BIN, out = maps.map(() => []);
  for (let i = 0; i < 144; i++) maps.forEach(([m, how, dp], k) => { const c = m.get(t0 + i * BIN); out[k].push(c ? +(how === "avg" ? c[0] / c[1] : c[0]).toFixed(dp) : null); });
  return { t0, step: BIN, cols: out };
}
// The feed carries several spacecraft at once; `active` marks the one SWPC currently uses.
function activeRows(rows) {
  const a = rows.filter((r) => r.active);
  if (a.length) return a;
  const newest = rows.reduce((b, r) => (!b || tms(r.time_tag) > tms(b.time_tag) ? r : b), null);
  return newest ? rows.filter((r) => r.source === newest.source) : [];
}
async function solar() {
  const [w, m] = await Promise.all([
    get("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json", { timeout: 25000 }),
    get("https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json", { timeout: 25000 }),
  ]);
  const wa = activeRows(w), ma = activeRows(m);
  const latest = (rows, ok) => rows.filter(ok).sort((a, b) => tms(b.time_tag) - tms(a.time_tag))[0] || null;
  const lw = latest(wa, (r) => r.proton_speed != null), lm = latest(ma, (r) => r.bt != null);
  const end = Math.max(lw ? tms(lw.time_tag) : 0, lm ? tms(lm.time_tag) : 0) || Date.now();
  const s = series([
    [bins(wa, (r) => r.proton_speed, "avg"), "avg", 0],
    [bins(wa, (r) => r.proton_density, "avg"), "avg", 2],
    [bins(ma, (r) => r.bt, "avg"), "avg", 1],
    [bins(ma, (r) => r.bz_gsm, "min"), "min", 1],
  ], end);
  return {
    at: end, src: (lw || lm || {}).source || null,
    now: { speed: lw && lw.proton_speed, density: lw && lw.proton_density, temp: lw && lw.proton_temperature, bt: lm && lm.bt, bz: lm && lm.bz_gsm, by: lm && lm.by_gsm, t: end },
    t0: s.t0, step: s.step, speed: s.cols[0], density: s.cols[1], bt: s.cols[2], bz: s.cols[3],
  };
}
async function xray() {
  const [x, f] = await Promise.all([
    get("https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json", { timeout: 25000 }),
    get("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json").catch(() => []),
  ]);
  const long = x.filter((r) => r.energy === "0.1-0.8nm");
  const last = long.reduce((b, r) => (!b || tms(r.time_tag) > tms(b.time_tag) ? r : b), null);
  const end = last ? tms(last.time_tag) : Date.now();
  const s = series([[bins(long, (r) => r.flux, "max"), "max", 12]], end);
  const fl = Array.isArray(f) && f[0] ? f[0] : null;
  return { at: end, flux: last && last.flux, t0: s.t0, step: s.step, long: s.cols[0].map((v) => (v == null ? null : +v.toPrecision(3))),
    flare: fl && { current: fl.current_class, max: fl.max_class, maxAt: fl.max_time, begin: fl.begin_time, end: fl.end_time } };
}

// ── conflict: GDELT 2.0 events (machine-coded from world news every 15 minutes), violent root codes only ──
const CAMEO = { 180: "Unconventional violence", 181: "Abduction", 182: "Physical assault", 183: "Bombing", 184: "Human shield", 185: "Assassination", 186: "Assassination attempt",
  190: "Military force", 191: "Blockade", 192: "Occupation", 193: "Small-arms fighting", 194: "Artillery and armor", 195: "Airstrike", 196: "Ceasefire violation",
  200: "Mass violence", 201: "Mass expulsion", 202: "Mass killing", 203: "Ethnic cleansing", 204: "Weapons of mass destruction" };
async function unzipFirst(buf) {
  const v = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Upstream("GDELT: not a zip");
  const cd = v.getUint32(e + 16, true);
  if (v.getUint32(cd, true) !== 0x02014b50) throw new Upstream("GDELT: bad zip directory");
  const method = v.getUint16(cd + 10, true), size = v.getUint32(cd + 20, true), lho = v.getUint32(cd + 42, true);
  const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true), data = new Uint8Array(buf, start, size);
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new Upstream("GDELT: zip method " + method);
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
}
const stamp = (d) => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
async function conflict(files = 8) {
  const last = await get("https://data.gdeltproject.org/gdeltv2/lastupdate.txt", { text: true });
  const m = /(\d{14})\.export\.CSV\.zip/.exec(last);
  if (!m) throw new Upstream("GDELT: no export listed");
  const top = Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[1].slice(8, 10), +m[1].slice(10, 12));
  const names = Array.from({ length: files }, (_, i) => stamp(new Date(top - i * 900e3)));
  const texts = await Promise.all(names.map((n) => get("https://data.gdeltproject.org/gdeltv2/" + n + ".export.CSV.zip", { raw: true, timeout: 25000 })
    .then((r) => r.arrayBuffer()).then(unzipFirst).catch(() => "")));
  const places = new Map();
  let events = 0, used = 0;
  for (const text of texts) {
    if (text) used++;
    for (const line of text.split("\n")) {
      const c = line.split("\t");
      if (c.length < 61 || !/^(18|19|20)$/.test(c[28]) || c[56] === "" || c[57] === "") continue;
      const lat = +c[56], lon = +c[57];
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) continue;
      events++;
      const key = lat.toFixed(1) + "," + lon.toFixed(1), mentions = +c[31] || 1, code = c[27];
      let p = places.get(key);
      if (!p) places.set(key, (p = { lat: r4(lat), lon: r4(lon), name: c[52] || "", cc: c[53] || "", lvl: +c[51] || 0, n: 0, m: 0, url: "", best: 0, kinds: {}, t: "" }));
      p.n++; p.m += mentions; p.kinds[code] = (p.kinds[code] || 0) + 1;
      if (mentions > p.best && c[60]) { p.best = mentions; p.url = c[60].trim(); }
      if (c[59] > p.t) p.t = c[59];
    }
  }
  if (!used) throw new Upstream("GDELT: no export files readable");
  const points = [...places.values()].sort((a, b) => b.m - a.m).slice(0, 160).map((p) => {
    const code = Object.entries(p.kinds).sort((a, b) => b[1] - a[1])[0][0];
    const t = p.t ? Date.UTC(+p.t.slice(0, 4), +p.t.slice(4, 6) - 1, +p.t.slice(6, 8), +p.t.slice(8, 10), +p.t.slice(10, 12)) : null;
    return { lat: p.lat, lon: p.lon, name: p.name, cc: p.cc, lvl: p.lvl, n: p.n, m: p.m, kind: CAMEO[code] || CAMEO[code.slice(0, 2) + "0"] || "Violence", url: p.url, t };
  });
  return { at: top + 900e3, hours: files / 4, files: used, events, points };
}
const HEADLINE_Q = "(airstrike OR shelling OR offensive OR ceasefire) sourcelang:eng";
async function headlines() {
  const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent(HEADLINE_Q) + "&mode=artlist&maxrecords=16&sort=datedesc&format=json";
  try { return await get(url, { timeout: 25000 }); }
  catch (e) {
    if (e.status !== 429) throw e;
    delete backoff["api.gdeltproject.org"]; // GDELT's rule is one call per 5 s, so one patient retry is within it
    await sleep(6000);
    return get(url, { timeout: 25000 });
  }
}


// ── the live board in words: what Genesis (src/hive.js) reads when Anders asks about the world right now ──
// Each topic is a few lines of facts with their age; results are memoised in this isolate (the Worker's or Hive's)
// so a burst of questions shares one upstream call per topic.
const memoMap = new Map();
async function memo(key, ttl, fn) {
  const m = memoMap.get(key);
  if (m && Date.now() - m.at < ttl * 1e3) return m.v;
  try { const v = await fn(); memoMap.set(key, { at: Date.now(), v }); return v; }
  catch (e) { if (m) return m.v; throw e; }
}
export const BRIEF_TOPICS = {
  air: /\b(planes?|aircraft|airplanes?|jets?|flights?|flying|air ?traffic|airspace|squawk\w*|7[567]00|helicopters?|overhead|above (me|us)|callsign|airliners?|airport|aviation)\b/i,
  quakes: /\b(earthquakes?|quakes?|seismic|tremors?|richter|magnitude)\b/i,
  space: /\b(solar|the sun|flares?|space weather|auroras?|northern lights|geomagnetic|kp|cme|radiation storm|radio blackout)\b/i,
  conflict: /\b(conflicts?|wars?|fighting|airstrikes?|strikes|shelling|violence|attacks?|front ?lines?|military action)\b/i,
  alerts: /\b(alerts?|warnings?|tornado(es)?|severe weather|nws)\b/i,
  hazards: /\b(volcan\w*|eruptions?|tsunamis?|disasters?|cyclones?|typhoons?|hurricanes?|floods?|wildfires?|drought)\b/i,
  launches: /\b(launch(es)?|rockets?|spacex|falcon|starship|liftoff)\b/i,
  iss: /\b(iss|space station)\b/i,
  markets: /\b(bitcoin|btc|ethereum|crypto\w*|markets?|exchange rates?|dollar|euro)\b/i,
  news: /\b(news|headlines)\b/i,
};
const ALL = /\b(vigil|the board|dashboard|situation|sitrep|brief me|briefing|what'?s (happening|going on)( in the world)?|anything (big|major|notable|happening|important)|state of the world|threat)\b/i;
export function briefTopics(text, fromVigil) {
  const t = String(text || ""), out = Object.keys(BRIEF_TOPICS).filter((k) => BRIEF_TOPICS[k].test(t));
  if (ALL.test(t) || (fromVigil && !out.length)) return ["summary"];
  return out;
}
const nm = (a, b) => { const R = Math.PI / 180, x = Math.sin((b[0] - a[0]) * R / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin((b[1] - a[1]) * R / 2) ** 2; return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(x))); };
const brg = (a, b) => { const R = Math.PI / 180, dl = (b[1] - a[1]) * R, y = Math.sin(dl) * Math.cos(b[0] * R), x = Math.cos(a[0] * R) * Math.sin(b[0] * R) - Math.sin(a[0] * R) * Math.cos(b[0] * R) * Math.cos(dl); return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((Math.atan2(y, x) / R + 360) % 360) / 45) % 8]; };
const agoT = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 90 ? m + " min ago" : Math.round(m / 60) + " h ago"; };
const pos = (la, lo) => Math.abs(la).toFixed(1) + (la >= 0 ? "N " : "S ") + Math.abs(lo).toFixed(1) + (lo >= 0 ? "E" : "W");
const alt = (r) => r[5] ? "on the ground" : r[4] == null ? "altitude unknown" : r[4] >= 18000 ? "FL" + Math.round(r[4] / 100) : r[4].toLocaleString("en-US") + " ft";
const EM_TXT = { general: "general emergency", nordo: "radio failure", unlawful: "hijack / unlawful interference", minfuel: "minimum fuel", lifeguard: "medical", downed: "aircraft down" };
const acName = (r) => (r[1] || r[11] || r[0]).toUpperCase() + (r[16] || r[12] ? " (" + (r[16] || r[12]) + ")" : "");

const TOPIC = {
  async air(env, home, q) {
    const lines = [];
    const [g, em, mil, hm] = await Promise.allSettled([memo("os", 60, () => opensky(env)), memo("em", 30, emergencies), memo("mil", 60, () => list("mil")),
      home ? memo("near" + home.lat.toFixed(1) + home.lon.toFixed(1), 15, () => near(Math.round(home.lat * 4) / 4, Math.round(home.lon * 4) / 4, 100)) : Promise.reject(0)]);
    if (g.status === "fulfilled") { const v = g.value; lines.push("Worldwide: " + v.n.toLocaleString("en-US") + " aircraft broadcasting a position (" + v.ac.filter((r) => !r[5]).length.toLocaleString("en-US") + " airborne), OpenSky snapshot " + agoT(v.t) + "."); }
    if (em.status === "fulfilled") lines.push(em.value.n ? "Emergency squawks right now: " + em.value.ac.map((r) => acName(r) + " squawk " + (r[9] || "?") + " — " + (EM_TXT[r[18]] || "emergency") + ", " + alt(r) + ", at " + pos(r[2], r[3]) + (home ? " (" + Math.round(nm([home.lat, home.lon], [r[2], r[3]])).toLocaleString("en-US") + " nm from him)" : "")).join("; ") + "." : "No aircraft anywhere is squawking 7500, 7600 or 7700.");
    if (mil.status === "fulfilled") lines.push(mil.value.n + " military aircraft are broadcasting worldwide" + (mil.value.n ? ", e.g. " + mil.value.ac.filter((r) => !r[5]).slice(0, 4).map((r) => acName(r) + " " + alt(r) + " at " + pos(r[2], r[3])).join("; ") : "") + ".");
    if (hm.status === "fulfilled" && home) {
      const rows = hm.value.ac.map((r) => [r, nm([home.lat, home.lon], [r[2], r[3]])]).filter((x) => x[1] <= 60).sort((a, b) => a[1] - b[1]);
      lines.push("Within 60 nm of " + (home.name || "him") + ": " + rows.length + " aircraft" + (rows.length ? "; closest: " + rows.slice(0, 6).map(([r, d]) => acName(r) + " " + Math.round(d) + " nm " + brg([home.lat, home.lon], [r[2], r[3]]) + ", " + alt(r) + (r[6] != null && !r[5] ? ", " + Math.round(r[6]) + " kt heading " + Math.round(r[7] || 0) + "°" : "")).join("; ") : "") + ".");
    }
    const cs = (String(q || "").match(/\b([A-Z]{2,3}\d{1,4}[A-Z]?|N\d{1,5}[A-Z]{0,2})\b/i) || [])[1];
    if (cs) try { const f = await memo("find" + cs.toLowerCase(), 15, () => find(cs.toLowerCase())); lines.push(f.n ? cs.toUpperCase() + ": " + f.ac.slice(0, 2).map((r) => acName(r) + " " + alt(r) + ", " + (r[6] != null ? Math.round(r[6]) + " kt, " : "") + "at " + pos(r[2], r[3]) + (home ? " (" + Math.round(nm([home.lat, home.lon], [r[2], r[3]])) + " nm from him)" : "")).join("; ") + "." : "No aircraft is broadcasting as " + cs.toUpperCase() + " right now."); } catch (e) {}
    return lines.join("\n");
  },
  async quakes(env, home) {
    const d = await memo("usgs", 120, () => get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson"));
    const qs = d.features.map((f) => ({ m: f.properties.mag || 0, p: f.properties.place || "?", t: f.properties.time, la: f.geometry.coordinates[1], lo: f.geometry.coordinates[0], dep: f.geometry.coordinates[2], ts: f.properties.tsunami }));
    const day = qs.filter((x) => x.t > Date.now() - 864e5).sort((a, b) => b.m - a.m), week = qs.slice().sort((a, b) => b.m - a.m)[0];
    const f = (x) => "M" + x.m.toFixed(1) + " " + x.p + " (" + agoT(x.t) + ", depth " + Math.round(x.dep) + " km" + (x.ts ? ", tsunami flag" : "") + ")";
    const close = home ? qs.filter((x) => x.t > Date.now() - 7 * 864e5 && nm([home.lat, home.lon], [x.la, x.lo]) < 270).sort((a, b) => b.m - a.m)[0] : null;
    return "USGS, M2.5+: " + day.length + " quakes in the last 24 h; strongest: " + (day.slice(0, 5).map(f).join("; ") || "none") + ". Strongest this week: " + (week ? f(week) : "none") + "." + (close ? " Nearest notable to him this week: " + f(close) + "." : "");
  },
  async space() {
    const [kp, sc, sw, xr] = await Promise.allSettled([memo("kp", 300, () => get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json")), memo("scales", 300, () => get("https://services.swpc.noaa.gov/products/noaa-scales.json")), memo("solar", 120, solar), memo("xray", 300, xray)]);
    const out = [];
    if (kp.status === "fulfilled" && Array.isArray(kp.value)) { const last = kp.value[kp.value.length - 1], k = +(last.Kp ?? last.kp ?? last[1]); if (isFinite(k)) out.push("Planetary Kp " + k.toFixed(1) + " (" + (k >= 7 ? "severe storm" : k >= 5 ? "geomagnetic storm" : k >= 4 ? "unsettled" : "quiet") + "; aurora " + (k >= 5 ? "likely at mid latitudes" : k >= 4 ? "possible at high latitudes" : "unlikely away from the poles") + ")."); }
    if (sc.status === "fulfilled" && sc.value["0"]) { const c = sc.value["0"], d1 = sc.value["1"]; out.push("NOAA scales now: R" + (c.R.Scale || 0) + " radio blackout, S" + (c.S.Scale || 0) + " radiation storm, G" + (c.G.Scale || 0) + " geomagnetic storm" + (d1 ? "; today's odds R1-2 " + (d1.R.MinorProb ?? "?") + "%, R3+ " + (d1.R.MajorProb ?? "?") + "%, S1+ " + (d1.S.Prob ?? "?") + "%" : "") + "."); }
    if (sw.status === "fulfilled") { const n = sw.value.now; out.push("Solar wind " + Math.round(n.speed || 0) + " km/s, density " + (+n.density || 0).toFixed(1) + "/cm³, IMF Bt " + (+n.bt || 0).toFixed(1) + " nT, Bz " + (+n.bz || 0).toFixed(1) + " nT" + (n.bz <= -5 ? " (southward: favours aurora)" : "") + "."); }
    if (xr.status === "fulfilled") { const f = xr.value.flux, i = f > 0 ? Math.max(0, Math.min(4, Math.floor(Math.log10(f)) + 8)) : -1; out.push("GOES X-ray flux " + (i >= 0 ? "ABCMX"[i] + (f / Math.pow(10, i - 8)).toFixed(1) : "?") + (xr.value.flare && xr.value.flare.max ? "; latest flare peaked at " + xr.value.flare.max + " " + agoT(Date.parse(xr.value.flare.maxAt)) : "") + "."); }
    return out.join(" ");
  },
  async conflict() {
    const d = await memo("gdelt", 900, () => conflict(8));
    return "GDELT event stream, last " + d.hours + " h: " + d.events + " violent events coded from world news (machine-coded from headlines: where violence is being reported, not verified incidents). Most-reported places: " + d.points.slice(0, 8).map((p) => p.name + " — " + p.kind + " (" + p.n + " events, " + p.m + " mentions)").join("; ") + ".";
  },
  async alerts(env, home) {
    const out = [];
    if (home) try { const d = await memo("nws" + home.lat.toFixed(2) + home.lon.toFixed(2), 180, () => get("https://api.weather.gov/alerts/active?point=" + home.lat.toFixed(4) + "," + home.lon.toFixed(4))); const f = d.features || []; out.push("NWS alerts for " + (home.name || "his location") + ": " + (f.length ? f.slice(0, 5).map((x) => x.properties.event + " (" + x.properties.severity + ", until " + (x.properties.ends || x.properties.expires || "?") + ")").join("; ") : "none") + "."); } catch (e) {}
    const d = await memo("nwsall", 300, () => get("https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe"));
    const ev = {}; for (const x of d.features || []) ev[x.properties.event] = (ev[x.properties.event] || 0) + 1;
    out.push("Severe/extreme NWS alerts across the US: " + (Object.keys(ev).length ? Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => n + " " + k).join(", ") : "none") + ".");
    return out.join(" ");
  },
  async hazards() {
    const [v, g, t] = await Promise.allSettled([memo("hans", 1800, () => get("https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes")),
      memo("gdacs", 900, () => get("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;DR;WF;EQ;VO&alertlevel=orange;red")),
      memo("tsu", 180, () => get("https://api.weather.gov/alerts/active?event=" + encodeURIComponent("Tsunami Warning,Tsunami Watch,Tsunami Advisory")))]);
    const out = [];
    if (v.status === "fulfilled" && Array.isArray(v.value)) out.push("US volcanoes at elevated status: " + (v.value.length ? v.value.map((x) => x.volcano_name + " " + x.alert_level + "/" + x.color_code).join(", ") : "none") + ".");
    if (g.status === "fulfilled") { const f = g.value.features || []; out.push("GDACS orange/red disaster alerts: " + (f.length ? f.slice(0, 8).map((x) => { const p = x.properties || {}; return (p.name || p.eventname || p.eventtype) + " [" + p.alertlevel + "]" + (p.country ? " — " + p.country : ""); }).join("; ") : "none") + "."); }
    if (t.status === "fulfilled") { const f = t.value.features || []; out.push("Tsunami bulletins (NWS): " + (f.length ? f.map((x) => x.properties.event + " — " + String(x.properties.areaDesc || "").split(";")[0]).join("; ") : "none") + "."); }
    return out.join(" ");
  },
  async launches() {
    const d = await memo("ll", 1800, () => get("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&hide_recent_previous=true&mode=list"));
    return "Next launches: " + (d.results || []).slice(0, 5).map((l) => l.name + " — " + (l.net ? new Date(l.net).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "TBD") + (l.status && l.status.abbrev ? " [" + l.status.abbrev + "]" : "") + (l.location ? ", " + l.location : "")).join("; ") + ".";
  },
  async iss(env, home) {
    const d = await memo("iss", 10, () => get("https://api.wheretheiss.at/v1/satellites/25544"));
    return "ISS now at " + pos(d.latitude, d.longitude) + ", " + Math.round(d.altitude) + " km up, " + Math.round(d.velocity).toLocaleString("en-US") + " km/h, " + d.visibility + (home ? ", " + Math.round(nm([home.lat, home.lon], [d.latitude, d.longitude]) * 1.852).toLocaleString("en-US") + " km from him" : "") + ".";
  },
  async markets() {
    const [c, fx] = await Promise.allSettled([memo("cg", 120, () => get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin&vs_currencies=usd&include_24hr_change=true")), memo("fx", 3600, () => get("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CAD"))]);
    const out = [];
    if (c.status === "fulfilled") out.push("Crypto (CoinGecko): " + Object.entries(c.value).map(([k, v]) => k + " $" + v.usd.toLocaleString("en-US") + " (" + (v.usd_24h_change >= 0 ? "+" : "") + (v.usd_24h_change || 0).toFixed(1) + "% 24h)").join(", ") + ".");
    if (fx.status === "fulfilled") out.push("USD buys " + Object.entries(fx.value.rates || {}).map(([k, v]) => (+v).toFixed(2) + " " + k).join(", ") + ".");
    return out.join(" ");
  },
  async news() {
    const d = await memo("doc", 900, headlines);
    return "Latest conflict headlines (GDELT): " + (d.articles || []).slice(0, 6).map((a) => a.title + " — " + a.domain).join("; ") + ".";
  },
};
const LABEL = { air: "AIR TRAFFIC", quakes: "EARTHQUAKES", space: "SPACE WEATHER", conflict: "CONFLICT", alerts: "WEATHER ALERTS", hazards: "VOLCANOES, DISASTERS, TSUNAMIS", launches: "LAUNCHES", iss: "ISS", markets: "MARKETS", news: "HEADLINES" };
// topics: from briefTopics(); "summary" reads everything. home: {lat, lon, name} for overhead / nearby questions.
export async function vigilBrief(env, topics, home, q) {
  const list = !topics || topics.includes("summary") ? Object.keys(TOPIC) : topics.filter((t) => TOPIC[t]);
  const res = await Promise.all(list.map((t) => Promise.race([TOPIC[t](env, home, q), new Promise((_, no) => setTimeout(() => no(new Error("timed out")), 9000))])
    .then((x) => [t, x, null], (e) => [t, null, e])));
  const ok = res.filter((r) => r[1]), bad = res.filter((r) => !r[1]);
  return { at: Date.now(), topics: list, ok: ok.map((r) => r[0]), failed: bad.map((r) => r[0] + ": " + String(r[2] && r[2].message || r[2]).slice(0, 80)),
    text: ok.map(([t, x]) => LABEL[t] + ": " + x).join("\n") + (bad.length ? "\n(could not read just now: " + bad.map((r) => LABEL[r[0]].toLowerCase()).join(", ") + ")" : "") };
}
// What deserves a note in Genesis's journal (and, if he turned alerts on, a push to his phone) without being asked:
// big, rare, and each noted once. level: "critical" comes through quiet hours; "notable" waits for the morning.
const nmTo = (home, la, lo) => (home ? nm([home.lat, home.lon], [la, lo]) : Infinity);
export async function vigilWatch(env, home) {
  const out = [], add = (e) => out.push(e);
  const [em, qk, sc, xr, ts, gd] = await Promise.allSettled([memo("em", 30, emergencies), memo("usgs", 120, () => get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson")),
    memo("scales", 300, () => get("https://services.swpc.noaa.gov/products/noaa-scales.json")), memo("xray", 300, xray),
    memo("tsu", 180, () => get("https://api.weather.gov/alerts/active?event=" + encodeURIComponent("Tsunami Warning"))),
    memo("gdacs", 900, () => get("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;DR;WF;EQ;VO&alertlevel=red"))]);
  if (em.status === "fulfilled") for (const r of em.value.ac) {
    const hijack = r[9] === "7500" || r[18] === "unlawful";
    if (!hijack && r[9] !== "7700" && r[18] !== "general") continue;
    const d = nmTo(home, r[2], r[3]);
    add({ key: "sq:" + r[0] + ":" + r[9] + ":" + new Date().toISOString().slice(0, 10), cat: "air", level: hijack || d < 100 ? "critical" : "notable", view: "air",
      title: "✈ Squawk " + (r[9] || (hijack ? "7500" : "7700")) + " · " + (r[1] || r[11] || r[0]).toUpperCase(),
      text: acName(r) + " is squawking " + r[9] + " (" + (EM_TXT[r[18]] || "emergency") + "), " + alt(r) + " at " + pos(r[2], r[3]) + (home ? ", " + Math.round(d) + " nm from Anders" : "") });
  }
  if (qk.status === "fulfilled") for (const f of qk.value.features) {
    const m = f.properties.mag || 0, d = nmTo(home, f.geometry.coordinates[1], f.geometry.coordinates[0]), near_ = d < 160;
    if (!((m >= 6 || (near_ && m >= 3.5)) && f.properties.time > Date.now() - 6 * 3600e3)) continue;
    add({ key: "eq:" + f.id, cat: "quakes", level: m >= 7 || (near_ && m >= 5) ? "critical" : "notable", view: "earth",
      title: "🌍 M" + m.toFixed(1) + " earthquake" + (near_ ? " near you" : ""),
      text: "M" + m.toFixed(1) + " earthquake, " + f.properties.place + (near_ ? " (near Anders)" : "") + ", " + agoT(f.properties.time) + (f.properties.tsunami ? ", tsunami flag set" : "") });
  }
  if (sc.status === "fulfilled" && sc.value["0"]) { const c = sc.value["0"]; for (const k of ["R", "S", "G"]) { const n = +(c[k].Scale); if (n >= 3) add({ key: "sc:" + k + n + ":" + c.DateStamp, cat: "space", level: n >= 4 ? "critical" : "notable", view: "space",
    title: "☀ " + k + n + " " + ({ R: "radio blackout", S: "radiation storm", G: "geomagnetic storm" })[k], text: "NOAA " + k + n + " " + ({ R: "radio blackout", S: "solar radiation storm", G: "geomagnetic storm" })[k] + " in progress (" + c[k].Text + ")" + (k === "G" ? ": aurora may reach mid latitudes" : "") }); } }
  if (xr.status === "fulfilled" && xr.value.flare && /^X/.test(xr.value.flare.max || "")) add({ key: "xf:" + xr.value.flare.maxAt, cat: "space", level: parseFloat(xr.value.flare.max.slice(1)) >= 10 ? "critical" : "notable", view: "space",
    title: "☀ " + xr.value.flare.max + " solar flare", text: "X-class solar flare: " + xr.value.flare.max + " peaked " + agoT(Date.parse(xr.value.flare.maxAt)) });
  if (ts.status === "fulfilled") for (const f of ts.value.features || []) add({ key: "ts:" + f.id, cat: "hazards", level: "critical", view: "earth",
    title: "🌊 Tsunami warning", text: "Tsunami Warning: " + String(f.properties.areaDesc || "").split(";").slice(0, 3).join(", ") });
  if (gd.status === "fulfilled") for (const f of gd.value.features || []) { const p = f.properties || {}; add({ key: "gd:" + (p.eventid || p.name) + ":" + (p.episodeid || ""), cat: "hazards", level: "notable", view: "earth",
    title: "⚠ GDACS red alert", text: "GDACS red alert: " + (p.name || p.eventname || p.eventtype) + (p.country ? " — " + p.country : "") }); }
  return out;
}

export async function vigil(req, env, ctx, owner, json) {
  if (!owner) return json({ error: "signed out" }, 401);
  const url = new URL(req.url), parts = url.pathname.split("/").slice(3), [kind, what, arg] = parts, o = url.origin;
  const C = (key, ttl, make) => cached(env, ctx, o, key, ttl, make, url.searchParams.get("have"));
  if (kind === "brief") { const g = url.searchParams, la = +g.get("lat"), lo = +g.get("lon"), home = isFinite(la) && isFinite(lo) && g.get("lat") ? { lat: la, lon: lo, name: g.get("name") || null } : null;
    return json(await vigilBrief(env, g.get("topics") ? g.get("topics").split(",") : ["summary"], home, g.get("q") || "")); }
  if (kind === "status") return json({ opensky: !!(env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET), nasa: !!env.NASA_API_KEY });
  if (kind === "air") {
    if (what === "global") return C("air-global", osTTL(env), () => opensky(env));
    if (what === "near") {
      const la = +url.searchParams.get("lat"), lo = +url.searchParams.get("lon"), r = +url.searchParams.get("r") || 150;
      if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90) return json({ error: "lat and lon please" }, 400);
      // snapped so nearby views share a cache entry; the radius grows to cover the snap
      const sla = Math.round(la * 4) / 4, slo = Math.round(((lo + 540) % 360 - 180) * 4) / 4, sr = Math.min(250, Math.ceil((r + 12) / 25) * 25);
      return C("air-near-" + sla + "," + slo + "," + sr, 4, () => near(sla, slo, sr));
    }
    if (what === "list" && /^(mil|ladd|pia)$/.test(arg || "")) return C("air-list-" + arg, 30, () => list(arg));
    if (what === "emergency") return C("air-emergency", 30, emergencies);
    if (what === "find" && /^[a-z0-9-]{2,10}$/i.test(arg || "")) { const q = arg.toLowerCase(); return C("air-find-" + q, 10, () => find(q)); }
    if (what === "photo" && /^[0-9a-f]{6}$/.test(arg || "")) return C("air-photo-" + arg, 86400, () => photo(arg));
    return json({ error: "unknown air route" }, 404);
  }
  if (kind === "feed") {
    if (what === "solar") return C("feed-solar", 60, solar);
    if (what === "xray") return C("feed-xray", 120, xray);
    if (what === "conflict") return C("feed-conflict", 900, () => conflict(8));
    if (what === "headlines") return C("feed-headlines", 900, headlines);
    if (what === "apod") return C("feed-apod", 21600, () => get("https://api.nasa.gov/planetary/apod?thumbs=true&api_key=" + encodeURIComponent(env.NASA_API_KEY || "DEMO_KEY")));
    return json({ error: "unknown feed" }, 404);
  }
  return json({ error: "not found" }, 404);
}

// Exposed for tests.
export const _test = { backoff, osTTL, setLeft: (n) => (osLeft = n) };
