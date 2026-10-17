/* Overhead · live. Element sets come from CelesTrak (through the site's cached /api/orbit route, or straight from
   CelesTrak, or the last copy this browser kept), and SGP4 (satellite.js) propagates them right here: where each satellite
   is, where it's going, and when it next rises over you. A pass is "visible" when the satellite is in sunlight while your
   sky is dark (sun below −6°): that's when you can see one with your own eyes. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const SAT = window.satellite, RE = 6378.137, DEG = Math.PI / 180;
const GROUPS = [["stations", "Space stations"], ["visual", "Brightest"], ["amateur", "Amateur radio"], ["weather", "Weather"], ["science", "Science"], ["gps-ops", "GPS"], ["galileo", "Galileo"], ["geo", "Geostationary"], ["last-30-days", "Launched this month"], ["starlink", "Starlink (thousands)"]];
const S = { group: "stations", sats: [], sel: null, obs: null, T: Date.now(), speed: 1, passes: [], pass: null, pinning: false, src: "" };
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get("g") && GROUPS.some((g) => g[0] === hash.get("g"))) S.group = hash.get("g"); else if (store.get("ow.group")) S.group = store.get("ow.group");

// ── time ──
const live = () => S.speed === 1 && Math.abs(S.T - Date.now()) < 3000;
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (t) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const dur = (ms) => { const s = Math.round(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + "h " + m + "m" : m ? m + "m " + (s % 60) + "s" : s + "s"; };
const ago = (t) => { const d = (Date.now() - t) / 864e5; return d < 1 ? Math.round(d * 24) + " h" : d.toFixed(1) + " days"; };

// ── physics ──
function epochOf(rec) { return (rec.jdsatepoch + (rec.jdsatepochF || 0) - 2440587.5) * 864e5; }
function parse(txt) {
  const L = txt.split(/\r?\n/).map((s) => s.replace(/\s+$/, "")).filter(Boolean), out = [];
  for (let i = 0; i < L.length - 1; i++) {
    if (!/^1 /.test(L[i]) || !/^2 /.test(L[i + 1])) continue;
    const name = i > 0 && !/^[12] /.test(L[i - 1]) ? L[i - 1].trim() : "NORAD " + L[i].slice(2, 7).trim();
    try { const rec = SAT.twoline2satrec(L[i], L[i + 1]); if (!rec.error) out.push({ name, id: +L[i].slice(2, 7), rec, epoch: epochOf(rec) }); } catch (e) {}
    i++;
  }
  return out;
}
function at(s, t) {
  const d = new Date(t), pv = SAT.propagate(s.rec, d);
  if (!pv || !pv.position || typeof pv.position !== "object" || !isFinite(pv.position.x)) return null;
  const g = SAT.gstime(d), gd = SAT.eciToGeodetic(pv.position, g);
  return { eci: pv.position, g, lat: gd.latitude / DEG, lon: ((gd.longitude / DEG + 540) % 360) - 180, h: gd.height, v: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) };
}
function look(p) { if (!S.obs || !p) return null; const la = SAT.ecfToLookAngles({ latitude: S.obs.lat * DEG, longitude: S.obs.lon * DEG, height: 0.05 }, SAT.eciToEcf(p.eci, p.g)); return { az: la.azimuth / DEG, el: la.elevation / DEG, range: la.rangeSat }; }
function sun(t) { // low-precision solar position (Astronomical Almanac), as a unit vector in the inertial frame
  const n = t / 864e5 + 2440587.5 - 2451545, L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG, eps = (23.439 - 4e-7 * n) * DEG;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
}
function sunlit(p, t) { const s = sun(t), r = p.eci, d = r.x * s.x + r.y * s.y + r.z * s.z; if (d > 0) return true; return Math.hypot(r.x - d * s.x, r.y - d * s.y, r.z - d * s.z) > RE; }
function sunAt(t) { const s = sun(t), g = SAT.gstime(new Date(t)); const x = s.x * Math.cos(g) + s.y * Math.sin(g), y = -s.x * Math.sin(g) + s.y * Math.cos(g); return { lat: Math.asin(s.z) / DEG, lon: Math.atan2(y, x) / DEG, ecf: { x, y, z: s.z } }; }
function sunEl(lat, lon, t) { const e = sunAt(t).ecf, la = lat * DEG, lo = lon * DEG; return Math.asin(Math.cos(la) * Math.cos(lo) * e.x + Math.cos(la) * Math.sin(lo) * e.y + Math.sin(la) * e.z) / DEG; }
const elev = (s, t) => { const l = look(at(s, t)); return l ? l.el : null; };
const COMP = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (az) => COMP[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
const periodMin = (s) => (2 * Math.PI) / s.rec.no;

function bisect(s, a, b) { const ea = elev(s, a); for (let k = 0; k < 14; k++) { const m = (a + b) / 2, em = elev(s, m); if ((em > 0) === (ea > 0)) a = m; else b = m; } return (a + b) / 2; }
function predict(s, t0, hours) {
  if (!S.obs) return [];
  const out = [], step = periodMin(s) > 600 ? 600e3 : 20e3, end = t0 + hours * 3600e3; let prev = elev(s, t0), cur = prev > 0 ? { rise: t0, partial: true, maxE: prev, maxT: t0 } : null;
  if (prev == null) return out;
  for (let t = t0 + step; t <= end; t += step) {
    const e = elev(s, t); if (e == null) break;
    if (prev <= 0 && e > 0) cur = { rise: bisect(s, t - step, t), maxE: e, maxT: t };
    if (cur && e > cur.maxE) { cur.maxE = e; cur.maxT = t; }
    if (prev > 0 && e <= 0 && cur) { cur.set = bisect(s, t - step, t); out.push(finish(s, cur)); cur = null; if (out.length >= 12) break; }
    prev = e;
  }
  if (cur && !out.length && cur.partial) { cur.always = true; out.push(cur); }
  return out;
}
function finish(s, p) {
  let a = p.maxT - 20e3, b = p.maxT + 20e3; for (let k = 0; k < 18; k++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (elev(s, m1) < elev(s, m2)) a = m1; else b = m2; }
  p.maxT = (a + b) / 2; p.maxE = elev(s, p.maxT);
  const la = (t) => look(at(s, t)); p.riseAz = la(p.rise).az; p.setAz = la(p.set).az; p.maxAz = la(p.maxT).az;
  let vis = false, lit = false, dark = false;
  for (let t = p.rise; t <= p.set; t += 15e3) { const q = at(s, t), l = look(q); if (!l || l.el < 8) continue; const sl = sunlit(q, t), dk = sunEl(S.obs.lat, S.obs.lon, t) < -6; if (sl) lit = true; if (dk) dark = true; if (sl && dk) { vis = true; break; } }
  p.kind = vis ? "vis" : !dark ? "day" : "shd";
  return p;
}

// ── loading element sets: the site's cached route, then CelesTrak itself, then what this browser kept ──
async function load(group) {
  const label = (GROUPS.find((g) => g[0] === group) || [0, group])[1];
  $("src").textContent = "Loading " + label.toLowerCase() + "…"; let txt = null, src = "";
  for (const [u, nm] of [["/api/orbit/tle?group=" + group, "CelesTrak via mentifaber.org"], ["https://celestrak.org/NORAD/elements/gp.php?GROUP=" + group + "&FORMAT=tle", "CelesTrak"]]) {
    try { const r = await fetch(u); if (r.ok) { const t = await r.text(); if (/^1 \d/m.test(t)) { txt = t; src = nm; break; } } } catch (e) {}
  }
  if (txt) store.set("ow.tle." + group, JSON.stringify({ t: Date.now(), txt }));
  else { try { const c = JSON.parse(store.get("ow.tle." + group) || "null"); if (c) { txt = c.txt; src = "this browser's copy from " + ago(c.t) + " ago (offline)"; } } catch (e) {} }
  if (!txt) { $("src").textContent = "Couldn't load element sets: no connection, and nothing kept from an earlier visit."; $("sel").innerHTML = '<p class="mute">No element sets yet. Connect once and they\'re kept for offline use.</p>'; return; }
  S.sats = parse(txt); S.src = src; S.group = group; store.set("ow.group", group);
  $("names").innerHTML = S.sats.slice(0, 1500).map((s) => '<option value="' + esc(s.name + " · " + s.id) + '">').join("");
  drawMarkers();
  const want = +(hash.get("sat") || 0) || (S.sel && S.sel.id) || 25544;
  select(S.sats.find((s) => s.id === want) || S.sats[0]);
}

// ── the map ──
let map = null; const L0 = window.L;
const marks = new Map(); let track = [], foot = null, night = [], obsMark = null, lbl = null;
try {
  map = L0.map("map", { worldCopyJump: true, preferCanvas: true, minZoom: 1, zoomSnap: 0.5, attributionControl: true }).setView([20, 0], 2);
  // continents from Natural Earth sit under the tiles: when the tiles can't load (offline, no signal), the map still has land
  if (window.OW_LAND) { map.createPane("land").style.zIndex = 150; const rd = L0.canvas({ pane: "land" });
    for (const off of [-360, 0, 360]) window.OW_LAND.forEach((r) => { const ll = []; for (let i = 0; i < r.length; i += 2) ll.push([r[i + 1], r[i] + off]); L0.polygon(ll, { renderer: rd, pane: "land", color: "rgba(92,200,255,.28)", weight: 1, fillColor: "#122234", fillOpacity: 1, interactive: false }).addTo(map); }); }
  L0.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 9, attribution: "© OpenStreetMap, © CARTO · land: Natural Earth" }).addTo(map);
  map.on("click", (e) => { if (!S.pinning) return; S.pinning = false; $("pin").textContent = "Set on map"; setObs(e.latlng.lat, ((e.latlng.lng + 540) % 360) - 180, "a point you picked"); });
} catch (e) { map = null; $("nomap").hidden = false; }
function drawMarkers() {
  if (!map) return; marks.forEach((m) => m.remove()); marks.clear();
  const big = S.sats.length > 400;
  S.sats.forEach((s) => { const m = L0.circleMarker([0, 0], { radius: big ? 1.6 : 3.2, weight: 0, fillColor: "#9db0c6", fillOpacity: big ? 0.6 : 0.85, interactive: !big || S.sats.length < 2000 }); if (m.options.interactive) m.on("click", () => select(s)); marks.set(s.id, m); });
}
function splitLine(pts) { const segs = [[]]; pts.forEach((p, i) => { if (i && Math.abs(p[1] - pts[i - 1][1]) > 180) segs.push([]); segs[segs.length - 1].push(p); }); return segs.filter((x) => x.length > 1); }
function drawTrack() {
  if (!map || !S.sel) return; track.forEach((l) => l.remove()); track = [];
  const s = S.sel, P = periodMin(s) * 60e3, past = [], fut = [];
  if (P > 600 * 60e3) return; // geostationary: the track is a dot
  for (let t = S.T - P * 0.45; t <= S.T + P * 1.05; t += 30e3) { const p = at(s, t); if (p) (t < S.T ? past : fut).push([p.lat, p.lon]); }
  splitLine(past).forEach((seg) => track.push(L0.polyline(seg, { color: "#5cc8ff", weight: 1.5, opacity: 0.35, dashArray: "3 5", interactive: false }).addTo(map)));
  splitLine(fut).forEach((seg) => track.push(L0.polyline(seg, { color: "#5cc8ff", weight: 2, opacity: 0.85, interactive: false }).addTo(map)));
}
function drawNight() {
  if (!map) return; night.forEach((l) => l.remove()); night = [];
  const sp = sunAt(S.T), tl = Math.tan(sp.lat * DEG) || 1e-6, pts = [];
  for (let lon = -180; lon <= 180; lon += 3) pts.push([Math.atan(-Math.cos((lon - sp.lon) * DEG) / tl) / DEG, lon]);
  const pole = sp.lat > 0 ? -89.9 : 89.9;
  for (const off of [-360, 0, 360]) night.push(L0.polygon([[pole, -180 + off], ...pts.map(([a, b]) => [a, b + off]), [pole, 180 + off]], { stroke: false, fillColor: "#000814", fillOpacity: 0.45, interactive: false }).addTo(map));
  night.push(L0.circleMarker([sp.lat, sp.lon], { radius: 6, weight: 0, fillColor: "#ffd166", fillOpacity: 0.9, interactive: false }).addTo(map));
}
function drawObs() { if (!map || !S.obs) return; if (obsMark) obsMark.remove(); obsMark = L0.circleMarker([S.obs.lat, S.obs.lon], { radius: 6, color: "#7ee787", weight: 2, fillColor: "#06200c", fillOpacity: 1 }).bindTooltip("you", { direction: "top" }).addTo(map); }

// ── selection, observer ──
function select(s) {
  if (!s) return; S.sel = s; S.pass = null;
  try { history.replaceState(null, "", "#g=" + S.group + "&sat=" + s.id); } catch (e) {}
  if (lbl) { lbl.remove(); lbl = null; }
  replan(); drawTrack(); tick(true);
  const p = at(s, S.T); if (map && p) map.panTo([p.lat, p.lon], { animate: true });
}
function setObs(lat, lon, how) { S.obs = { lat, lon, how }; store.set("ow.obs", JSON.stringify(S.obs)); $("obs").textContent = lat.toFixed(2) + "°, " + lon.toFixed(2) + "° · " + how; drawObs(); replan(); tick(true); }
function replan() { if (!S.sel || !S.obs) { S.passes = []; drawPasses(); return; } S.passes = predict(S.sel, S.T - 10 * 60e3, 72).filter((p) => p.always || p.set > S.T); drawPasses(); }

// ── the side panel ──
function drawPasses() {
  const el = $("passes");
  if (!S.obs) { el.innerHTML = '<li class="mute" style="cursor:default">Set your location to see passes.</li>'; return; }
  if (!S.passes.length) { el.innerHTML = '<li class="mute" style="cursor:default">No passes over you in the next three days. (Some orbits never reach your latitude.)</li>'; return; }
  if (S.passes[0].always) { el.innerHTML = '<li style="cursor:default">Always above your horizon, at about ' + Math.round(S.passes[0].maxE) + "° elevation: a geostationary satellite sits still in your sky.</li>"; return; }
  el.innerHTML = S.passes.map((p, i) => '<li data-i="' + i + '" class="' + (S.pass === p ? "on" : "") + '"><span class="t"><b>' + day(p.rise) + " · " + hhmm(p.rise) + '</b><span class="tag ' + p.kind + '">' + { vis: "visible", day: "daylight", shd: "in shadow" }[p.kind] + "</span></span><small>rises " + compass(p.riseAz) + " · max " + Math.round(p.maxE) + "° " + compass(p.maxAz) + " at " + hhmm(p.maxT) + " · sets " + compass(p.setAz) + " · " + dur(p.set - p.rise) + "</small>" + (p.rise > Date.now() + 60e3 ? '<button data-remind="' + i + '">Remind me</button>' : "") + "</li>").join("");
}
function drawSky() {
  const c = $("sky"), x = c.getContext("2d"), W = c.width, R = W / 2 - 18, cx = W / 2, cy = W / 2;
  x.clearRect(0, 0, W, W); x.strokeStyle = "rgba(230,238,248,.14)"; x.lineWidth = 1;
  [0, 30, 60].forEach((e) => { x.beginPath(); x.arc(cx, cy, (R * (90 - e)) / 90, 0, 7); x.stroke(); });
  x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
  x.fillStyle = "#5c6f86"; x.font = "11px ui-monospace,monospace"; x.textAlign = "center"; x.fillText("N", cx, cy - R - 5); x.fillText("S", cx, cy + R + 13); x.fillText("E", cx + R + 9, cy + 4); x.fillText("W", cx - R - 9, cy + 4); x.fillText("30°", cx + 4, cy - (R * 60) / 90 + 12); x.fillText("60°", cx + 4, cy - (R * 30) / 90 + 12);
  const P = (az, el) => { const r = (R * (90 - Math.max(0, el))) / 90; return [cx + r * Math.sin(az * DEG), cy - r * Math.cos(az * DEG)]; };
  const s = S.sel, p = S.pass || S.passes.find((q) => !q.always && q.set > S.T);
  if (s && p && !p.always) {
    x.strokeStyle = p.kind === "vis" ? "#ffd166" : "#5cc8ff"; x.lineWidth = 2.5; x.beginPath(); let first = true;
    for (let t = p.rise; t <= p.set; t += 10e3) { const l = look(at(s, t)); if (!l) continue; const [a, b] = P(l.az, l.el); if (first) { x.moveTo(a, b); first = false; } else x.lineTo(a, b); } x.stroke();
    x.fillStyle = "#9db0c6"; x.font = "10px ui-monospace,monospace";
    for (let t = Math.ceil(p.rise / 60e3) * 60e3; t <= p.set; t += 120e3) { const l = look(at(s, t)); if (!l) continue; const [a, b] = P(l.az, l.el); x.beginPath(); x.arc(a, b, 2, 0, 7); x.fill(); }
    const [ra, rb] = P(p.riseAz, 0); x.fillStyle = "#7ee787"; x.fillText(hhmm(p.rise), ra, rb + (rb > cy ? 12 : -6));
    $("skyl").textContent = (S.pass ? "" : "next pass · ") + day(p.rise) + " " + hhmm(p.rise);
  } else $("skyl").textContent = S.obs ? "no pass coming" : "set your location";
  const l = s && look(at(s, S.T)); if (l && l.el > 0) { const [a, b] = P(l.az, l.el); x.fillStyle = "#fff"; x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); x.strokeStyle = "#5cc8ff"; x.lineWidth = 2; x.stroke(); }
}
function tick(full) {
  const s = S.sel; if (!s) return;
  const p = at(s, S.T), l = look(p);
  $("clock").textContent = live() ? "live · " + hhmm(S.T) : "sim · " + day(S.T) + " " + hhmm(S.T) + (S.speed > 1 ? " · " + S.speed + "×" : ""); $("clock").className = "pill" + (live() ? "" : " sim");
  if (!p) { $("sel").innerHTML = "<h2>" + esc(s.name) + '</h2><p class="mute">SGP4 can\'t place it at this time (decayed, or elements too old).</p>'; return; }
  const lit = sunlit(p, S.T), age = (S.T - s.epoch) / 864e5;
  $("sel").innerHTML = "<div><h2>" + esc(s.name) + '</h2><span class="id">NORAD ' + s.id + " · " + (periodMin(s) > 600 ? "geosynchronous" : periodMin(s).toFixed(1) + " min orbit") + " · " + (s.rec.inclo / DEG).toFixed(1) + '° inclination</span></div><div class="kv">' +
    "<div><small>latitude</small><b>" + p.lat.toFixed(2) + "°</b></div><div><small>longitude</small><b>" + p.lon.toFixed(2) + "°</b></div><div><small>altitude</small><b>" + Math.round(p.h).toLocaleString() + " km</b></div><div><small>speed</small><b>" + p.v.toFixed(2) + " km/s</b></div>" +
    (l ? "<div><small>from you</small><b>" + (l.el > 0 ? Math.round(l.el) + "° up, " + compass(l.az) : "below horizon") + "</b></div><div><small>range</small><b>" + Math.round(l.range).toLocaleString() + " km</b></div>" : "") +
    '<div><small>light</small><b class="' + (lit ? "lit" : "ecl") + '">' + (lit ? "sunlit" : "in Earth's shadow") + "</b></div><div><small>elements age</small><b" + (Math.abs(age) > 7 ? ' style="color:var(--bad)"' : "") + ">" + (age < 0 ? "−" : "") + Math.abs(age).toFixed(1) + " d</b></div></div>";
  const nx = S.passes.find((q) => !q.always && q.set > S.T);
  $("next").innerHTML = !S.obs ? "Set your location to see when it passes over." : S.passes[0] && S.passes[0].always ? "Always up: about <b>" + Math.round(S.passes[0].maxE) + "°</b> above your horizon." : !nx ? "No pass in the next three days." : nx.rise <= S.T ? "<b>Overhead now</b>: sets " + compass(nx.setAz) + " in " + dur(nx.set - S.T) + (nx.kind === "vis" ? ", and it's visible: look up." : ".") : "Next pass in <b>" + dur(nx.rise - S.T) + "</b>: max " + Math.round(nx.maxE) + "°, " + { vis: "visible to the eye", day: "in daylight", shd: "in Earth's shadow" }[nx.kind] + ".";
  $("src").textContent = "Elements: " + S.src + ", epoch " + new Date(s.epoch).toUTCString().slice(5, 22) + " UTC. SGP4 is good to about a kilometre near the epoch and drifts a few kilometres a day after it.";
  if (map) {
    const big = S.sats.length > 400;
    S.sats.forEach((q) => { const m = marks.get(q.id); if (!m) return; const qp = q === s ? p : at(q, S.T); if (!qp) { if (m._map) m.remove(); return; } m.setLatLng([qp.lat, qp.lon]); if (!m._map) m.addTo(map); });
    const sm = marks.get(s.id); if (sm) { sm.setStyle({ radius: 7, fillColor: lit ? "#ffd166" : "#5cc8ff", fillOpacity: 1, weight: 2, color: "#fff" }); sm.bringToFront(); if (!lbl) lbl = L0.tooltip({ permanent: true, direction: "right", offset: [8, 0], className: "satlbl" }).setContent(s.name); lbl.setLatLng([p.lat, p.lon]); if (!lbl._map) lbl.addTo(map); }
    S.sats.forEach((q) => { if (q !== s) { const m = marks.get(q.id); if (m && m.options.radius !== (big ? 1.6 : 3.2)) m.setStyle({ radius: big ? 1.6 : 3.2, weight: 0, fillColor: "#9db0c6", fillOpacity: big ? 0.6 : 0.85 }); } });
    if (foot) foot.remove(); foot = L0.circle([p.lat, p.lon], { radius: RE * Math.acos(RE / (RE + p.h)) * 1000, color: "#5cc8ff", weight: 1, opacity: 0.5, fillOpacity: 0.05, interactive: false }).addTo(map);
    if (full) { drawNight(); drawTrack(); }
  }
  drawSky(); if (full) drawPasses();
}

// ── the clock ──
let lastWall = performance.now(), lastFull = 0, lastPlan = S.T;
function loop() {
  const now = performance.now(), dt = now - lastWall; lastWall = now;
  S.T += dt * S.speed; if (S.speed === 1 && Math.abs(S.T - Date.now()) < 3000) S.T = Date.now();
  if (Math.abs(S.T - lastPlan) > 6 * 3600e3) { lastPlan = S.T; replan(); }
  const full = now - lastFull > (S.speed > 1 ? 1000 : 30000); if (full) lastFull = now;
  tick(full);
  setTimeout(loop, S.sats.length > 2000 ? 2500 : S.sats.length > 400 ? 1500 : S.speed > 1 ? 250 : 1000);
}
function jump(t) { S.T = t; lastPlan = t; replan(); tick(true); }
document.querySelector(".tbar").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.dt) jump(S.T + +b.dataset.dt);
  else if (b.dataset.sp) { S.speed = +b.dataset.sp; document.querySelectorAll(".sp button").forEach((x) => x.classList.toggle("on", x === b)); tick(true); }
  else if (b.id === "now") { S.speed = 1; document.querySelectorAll(".sp button").forEach((x) => x.classList.toggle("on", x.dataset.sp === "1")); jump(Date.now()); }
});
$("passes").addEventListener("click", (e) => {
  const r = e.target.closest("[data-remind]");
  if (r) { const p = S.passes[+r.dataset.remind]; remind(p); return; }
  const li = e.target.closest("li[data-i]"); if (!li) return; const p = S.passes[+li.dataset.i]; S.pass = S.pass === p ? null : p; drawPasses(); drawSky();
});
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (el.hidden = true), 5000); }
async function remind(p) {
  const at2 = p.rise - 2 * 60e3, name = S.sel.name;
  if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) {} }
  setTimeout(() => { const msg = name + " rises " + compass(p.riseAz) + " in 2 minutes · max " + Math.round(p.maxE) + "°"; toast(msg); try { if (Notification.permission === "granted") new Notification("Overhead", { body: msg, icon: "assets/icons/v2/orbit-192.png" }); } catch (e) {} }, Math.max(0, at2 - Date.now()));
  toast("Reminder set for " + hhmm(at2) + ". It works while this page stays open.");
}
$("group").innerHTML = GROUPS.map((g) => '<option value="' + g[0] + '">' + g[1] + "</option>").join(""); $("group").value = S.group;
$("group").addEventListener("change", (e) => { hash.delete("sat"); load(e.target.value); });
$("q").addEventListener("change", async (e) => {
  const v = e.target.value.trim(), id = +(v.match(/(\d{3,9})\s*$/) || [])[1];
  let s = S.sats.find((x) => x.id === id) || S.sats.find((x) => x.name.toLowerCase().includes(v.toLowerCase()));
  if (!s && id) { try { const r = await fetch("/api/orbit/tle?catnr=" + id); const t = r.ok ? await r.text() : ""; const got = parse(t); if (got.length) { S.sats.push(got[0]); s = got[0]; drawMarkers(); } } catch (err) {} }
  if (s) { select(s); e.target.value = ""; e.target.blur(); } else toast("Nothing called “" + v + "” in this group.");
});
$("locate").addEventListener("click", () => { if (!navigator.geolocation) return toast("This browser can't share a location."); $("locate").textContent = "Locating…"; navigator.geolocation.getCurrentPosition((p) => { $("locate").textContent = "Use my location"; setObs(p.coords.latitude, p.coords.longitude, "your location"); }, () => { $("locate").textContent = "Use my location"; toast("Location wasn't shared. Pick a point on the map instead."); }, { timeout: 12000, maximumAge: 600000 }); });
$("pin").addEventListener("click", () => { S.pinning = !S.pinning; $("pin").textContent = S.pinning ? "Tap the map…" : "Set on map"; });

// ── start: where you are (remembered, or Cloudflare's city-level guess, which needs no prompt), then the elements ──
(async () => {
  try { const o = JSON.parse(store.get("ow.obs") || "null"); if (o && isFinite(o.lat)) setObs(o.lat, o.lon, o.how); } catch (e) {}
  if (!S.obs) { try { const w = await (await fetch("/api/where")).json(); if (w && isFinite(w.lat) && w.lat !== null) setObs(w.lat, w.lon, (w.city ? w.city + " (approx.)" : "approx. from your connection")); } catch (e) {} }
  if (!S.obs) { $("obs").textContent = "not set"; drawPasses(); }
  await load(S.group); loop();
})();
window.OrbitWatch = { S, at, look, predict, sunAt, sunlit, select, setObs, jump };
})();
