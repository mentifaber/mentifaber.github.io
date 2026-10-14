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
  const cache = caches.default, req = new Request(origin + "/__vigil_cache/" + key);
  const hit = await cache.match(req).catch(() => null);
  const at = hit ? +hit.headers.get("x-vigil-at") : 0;
  if (hit && Date.now() - at < ttl * 1e3) return reply(have && +have === at ? new Response('{"same":true}') : hit, at);
  let job = flying.get(key);
  if (!job) {
    job = (async () => {
      const body = typeof make === "function" ? JSON.stringify(await make()) : make;
      const now = Date.now();
      const res = new Response(body, { headers: { "content-type": "application/json", "cache-control": "max-age=86400", "x-vigil-at": String(now) } });
      ctx.waitUntil(cache.put(req, res.clone()).catch(() => {}));
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

export async function vigil(req, env, ctx, owner, json) {
  if (!owner) return json({ error: "signed out" }, 401);
  const url = new URL(req.url), parts = url.pathname.split("/").slice(3), [kind, what, arg] = parts, o = url.origin;
  const C = (key, ttl, make) => cached(env, ctx, o, key, ttl, make, url.searchParams.get("have"));
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
