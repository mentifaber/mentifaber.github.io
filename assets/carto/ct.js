/* Cartograph · a 3D atlas drawn with a plain 2D canvas: no WebGL, no library, so it opens offline and stays light on a
   phone. Every view is a different scale of the same idea: put each object where it really is (true RA, Dec and
   distance, turned into galactic coordinates; the planets from JPL's mean elements for today's date), then let you turn it
   around. Views that span many powers of ten use a logarithmic radius and say so on the grid rings. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const D = window.CT_DATA, DEG = Math.PI / 180;
const cv = $("cv"), cx = cv.getContext("2d");

// ── coordinates: equatorial (J2000) → galactic cartesian, x toward the Galactic Centre, z toward the north galactic pole ──
const EQ2GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.44482963, 0.7469822445], [-0.867666149, -0.1980763734, 0.4559837762]];
const hms = (s) => { const [h, m, x] = s.split(/\s+/).map(Number); return (h + (m || 0) / 60 + (x || 0) / 3600) * 15; };
const dms = (s) => { const neg = /^-/.test(s.trim()), [d, m, x] = s.replace("-", "").split(/\s+/).map(Number); return (neg ? -1 : 1) * (d + (m || 0) / 60 + (x || 0) / 3600); };
function galDir(o) {
  if (o.gl != null) { const l = o.gl * DEG, b = o.gb * DEG; return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]; }
  const a = hms(o.ra) * DEG, d = dms(o.dec) * DEG, e = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  return EQ2GAL.map((r) => r[0] * e[0] + r[1] * e[1] + r[2] * e[2]);
}
D.objs.forEach((o) => { o.dir = galDir(o); });

// ── the solar system, from JPL's mean elements ──
const jd = (t) => t / 864e5 + 2440587.5;
function kepler(M, e) { let E = M + e * Math.sin(M); for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
function orbitXYZ(a, e, I, om, Om, M) { // ecliptic heliocentric, AU
  const E = kepler(M, e), xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(om), sw = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp];
}
function planetEl(p, t) { const [a, e, I, L0, w, O, Lr] = p.el, T = (jd(t) - 2451545) / 36525, L = L0 + Lr * T; return { a, e, I: I * DEG, om: (w - O) * DEG, Om: O * DEG, M: (((L - w) % 360) + 360) % 360 * DEG }; }
function dwarfEl(p, t) { const [a, e, I, Om, om, Tp, P] = p.o, yr = 1970 + t / (365.25 * 864e5); return { a, e, I: I * DEG, om: om * DEG, Om: Om * DEG, M: ((((yr - Tp) / P) * 360) % 360 + 360) % 360 * DEG }; }

// ── views ──
const S = { view: "sol", sel: null, hover: null, labels: false, spin: true, trueScale: false, t: Date.now(), rate: 0, idle: 0 };
const logR = (r0, K) => (d) => Math.log10(1 + d / r0) * K;
const VIEWS = [
  { id: "sol", n: "Solar System", blurb: "The planets where they are today, from JPL's mean orbital elements. Radius is square-root compressed so Mercury and Eris fit on one screen; switch to true scale to feel the emptiness.", cam: [0.5, 0.75, 26] },
  { id: "near", n: "Neighbours", blurb: "Every star system within about 13 light-years, at true scale. Grid rings every 5 light-years in the galactic plane.", r: (d) => d, rings: [5, 10], unit: "ly", cam: [0.6, 0.45, 31] },
  { id: "bright", n: "Bright stars", blurb: "The sky's famous stars in 3D. Radius is logarithmic: the rings mark 10, 100 and 1,000 light-years.", r: logR(8, 4), rings: [10, 100, 1000], unit: "ly", cam: [0.6, 0.4, 24], also: ["Sun", "Sirius A", "Procyon"] },
  { id: "exo", n: "Exoplanets", blurb: "Systems that changed the field: the first finds, the first atmospheres, the JWST results. Logarithmic radius.", r: logR(8, 4), rings: [10, 100, 1000], unit: "ly", cam: [0.6, 0.4, 22], also: ["Sun"] },
  { id: "rem", n: "Remnants", blurb: "Black holes, pulsars, magnetars and supernova remnants: what's left after a star. Logarithmic radius.", r: logR(400, 5), rings: [1000, 10000], unit: "ly", cam: [0.6, 0.45, 24], also: ["Sun"] },
  { id: "neb", n: "Nebulae & clusters", blurb: "Stellar nurseries, the shells of dying stars, and clusters young and ancient. Logarithmic radius.", r: logR(400, 5), rings: [1000, 10000], unit: "ly", cam: [0.6, 0.45, 22], also: ["Sun"] },
  { id: "mw", n: "Milky Way", blurb: "The Galaxy from outside: the Sun sits 26,700 light-years from Sagittarius A*. Remnants, nebulae and clusters plotted at true distance. Spiral arms are schematic.", cam: [0.3, 0.85, 92] },
  { id: "local", n: "Local Group", blurb: "The Milky Way's neighbourhood: the Magellanic Clouds, Andromeda and the dwarfs. Logarithmic radius.", r: logR(4e4, 4), rings: [1e5, 1e6], unit: "ly", cam: [0.6, 0.45, 18], also: [] },
  { id: "deep", n: "Deep space", blurb: "Out to the first galaxies. Beyond a billion light-years, distances are light-travel time. Logarithmic radius.", r: logR(5e6, 3), rings: [1e7, 1e8, 1e9, 1e10], unit: "ly", cam: [0.6, 0.45, 23], also: [] },
  { id: "earth", n: "Earth orbit · live", blurb: "Live satellites, propagated with SGP4 from CelesTrak elements (shared with Overhead). Earth turns in real time.", cam: [0.4, 0.35, 70] },
];
const V = () => VIEWS.find((v) => v.id === S.view);
const fmtD = (d, deep) => d === 0 ? "here" : d < 100 ? d.toFixed(d < 20 ? 2 : 1).replace(/\.?0+$/, "") + " light-years" : d < 1e6 ? Math.round(d).toLocaleString() + " light-years" : d < 1e9 ? +(d / 1e6).toPrecision(3) + " million light-years" : +(d / 1e9).toPrecision(3) + " billion light-years" + (deep ? " (light-travel)" : "");
const ringLbl = (d) => d >= 1e9 ? d / 1e9 + " Gly" : d >= 1e6 ? d / 1e6 + " Mly" : d >= 1000 ? d / 1000 + "k ly" : d + " ly";

// what each view holds: { n, p: [x,y,z], t, size, color, obj }
const COL = { O: "#9bb8ff", B: "#aac8ff", A: "#e6efff", F: "#fff6e0", G: "#ffe6a3", K: "#ffbe7a", M: "#ff8b66", L: "#c46a4a", Y: "#8d5a5a", WD: "#d8ecff", NS: "#7df9ff", BH: "#ff9a3c", SNR: "#ff7eb6", NEB: "#ff6fa1", PN: "#7fe3d0", CL: "#bfe0ff", GC: "#ffe0b0", GAL: "#d8c8ff", CLU: "#c9b8ff", QSO: "#b8f0ff" };
const KIND = { O: "O-type star", B: "B-type star", A: "A-type star", F: "F-type star", G: "G-type star", K: "K-type star", M: "M-type star", L: "brown dwarf", Y: "brown dwarf", WD: "white dwarf", NS: "neutron star", BH: "black hole", SNR: "supernova remnant", NEB: "nebula", PN: "planetary nebula", CL: "open cluster", GC: "globular cluster", GAL: "galaxy", CLU: "galaxy cluster", QSO: "quasar" };
const SIZE = { O: 7, B: 6.5, A: 5.5, F: 5, G: 5, K: 4.6, M: 4, L: 3.2, Y: 3, WD: 3, NS: 4, BH: 6, SNR: 7, NEB: 9, PN: 6, CL: 7, GC: 7, GAL: 7, CLU: 8, QSO: 6 };
const byName = Object.fromEntries(D.objs.map((o) => [o.n, o]));
let items = [], extras = { orbits: [], rings: [], disk: null, arms: [] };
function build() {
  const v = V(); items = []; extras = { orbits: [], rings: [], disk: null, arms: [] };
  if (v.id === "sol") {
    const R = S.trueScale ? (r) => r * 1.2 : (r) => Math.sqrt(r) * 3.2;
    const place = (p) => { const r = Math.hypot(p[0], p[1], p[2]) || 1e-9, k = R(r) / r; return [p[0] * k, p[1] * k, p[2] * k]; };
    items.push({ n: "Sun", p: [0, 0, 0], color: "#ffd36b", size: 16, glow: 3, obj: { n: "Sun", t: "G", f: [["class", "G2V"], ["mass", "99.86% of the solar system"], ["light to Earth", "8 min 20 s"]], s: "IAU nominal values", x: "" }, k: 1 });
    [...D.planets.map((p) => ({ p, el: planetEl(p, S.t) })), ...D.dwarfs.map((p) => ({ p, el: dwarfEl(p, S.t) }))].forEach(({ p, el }) => {
      const pos = orbitXYZ(el.a, el.e, el.I, el.om, el.Om, el.M), r = Math.hypot(...pos);
      items.push({ n: p.n, p: place(pos), color: p.c, size: 3 + Math.log10(p.r) * 1.6, glow: 1.2, obj: { ...p, t: "PL", au: r }, k: !p.dw || p.n === "Pluto" });
      const pts = []; for (let k = 0; k <= 180; k++) pts.push(place(orbitXYZ(el.a, el.e, el.I, el.om, el.Om, (k / 180) * 2 * Math.PI)));
      extras.orbits.push({ pts, color: p.c, dw: p.dw || !p.el });
    });
    return;
  }
  if (v.id === "earth") return; // drawn live
  if (v.id === "mw") {
    const sun = [-26.67, 0, 0.07], kly = (o) => [sun[0] + (o.d / 1000) * o.dir[0], sun[1] + (o.d / 1000) * o.dir[1], sun[2] + (o.d / 1000) * o.dir[2]];
    items.push({ n: "Sun", p: sun, color: "#ffe6a3", size: 5, glow: 2, obj: byName.Sun, k: 1 });
    D.objs.filter((o) => (o.v === "rem" || o.v === "neb" || (o.v === "bright" && o.d > 1500))).forEach((o) => items.push({ n: o.n, p: kly(o), color: COL[o.t], size: SIZE[o.t] * 0.8, glow: 1, obj: o, k: MW_LBL.has(o.n) }));
    extras.disk = galaxyDisk(); extras.arms = ARMS; extras.rings = [10, 20, 30, 40, 50].map((r) => ({ r, lbl: r + "k ly", c: [0, 0, 0] }));
    return;
  }
  const pool = D.objs.filter((o) => o.v === v.id || (v.also || []).includes(o.n));
  if (v.id === "local" || v.id === "deep") items.push({ n: "Milky Way", p: [0, 0, 0], color: "#ffe9c4", size: 10, glow: 2.4, mw: 1, obj: { n: "Milky Way", t: "GAL", d: 0, f: [["kind", "barred spiral, about 100,000 ly across"], ["stars", "100–400 billion"], ["you", "26,700 ly from its centre"]], s: "Gaia · GRAVITY", x: "Home." }, k: 1 });
  pool.forEach((o) => { const r = v.r(o.d); items.push({ n: o.n, p: [o.dir[0] * r, o.dir[1] * r, o.dir[2] * r], color: COL[o.t] || "#fff", size: SIZE[o.t] || 5, glow: o.t === "BH" ? 1.6 : 1.1, obj: o, k: o.k || pool.length < 18 }); });
  extras.rings = (v.rings || []).map((d) => ({ r: v.r(d), lbl: ringLbl(d), c: [0, 0, 0] }));
}
// schematic arms: logarithmic spirals with a 12° pitch, placed so the Sun sits in the Orion spur between Sagittarius and Perseus
const MW_LBL = new Set(["Sagittarius A*", "Eta Carinae", "Omega Centauri", "Messier 13", "Westerlund 1", "Cygnus X-1", "SGR 1806−20", "PSR J1748−2446ad"]);
const ARMS = (() => { const k = Math.tan(12 * DEG), out = []; [["Perseus", 0.0, 1], ["Scutum–Centaurus", Math.PI, 1], ["Sagittarius–Carina", Math.PI * 1.5, 0.82], ["Norma–Outer", Math.PI * 0.5, 0.82]].forEach(([n, ph, s]) => { const pts = []; for (let th = 0; th < 4.6; th += 0.05) { const r = 13 * Math.exp(k * th) * s; if (r > 55) break; pts.push([r * Math.cos(th + ph + 2.2), r * Math.sin(th + ph + 2.2), 0]); } out.push({ n, pts }); }); const sp = []; for (let a = -0.5; a < 0.5; a += 0.04) sp.push([-26.7 * Math.cos(a) + 1, -26.7 * Math.sin(a) * 1.1, 0]); out.push({ n: "Orion spur", pts: sp, spur: 1 }); return out; })();
function galaxyDisk() {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, g = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pts = [];
  for (let i = 0; i < 2600; i++) {
    const u = rnd();
    if (u < 0.18) { const r = Math.abs(g()) * 4, a = rnd() * 6.283; pts.push([r * Math.cos(a) * 1.7, r * Math.sin(a) * 0.7, g() * 1.6, 0]); } // bulge and bar
    else if (u < 0.82) { const arm = ARMS[Math.floor(rnd() * 4)].pts, q = arm[Math.floor(rnd() * arm.length)]; pts.push([q[0] + g() * 1.8, q[1] + g() * 1.8, g() * 0.35, 1]); }
    else { const r = -Math.log(rnd()) * 12, a = rnd() * 6.283; if (r < 55) pts.push([r * Math.cos(a), r * Math.sin(a), g() * 0.5, 2]); }
  }
  return pts;
}

// ── the camera ──
const cam = { yaw: 0.5, pitch: 0.6, dist: 30, tgt: [0, 0, 0], goal: null };
let W = 0, H = 0, DPR = 1, F = 1, C = [0, 0, 0], R = [1, 0, 0], U = [0, 0, 1], FW = [0, 1, 0];
function fit() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0); F = Math.min(W, H) * 0.9; }
new ResizeObserver(fit).observe(cv); fit();
function setupCam() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  C = [cam.tgt[0] + cam.dist * cp * Math.sin(cam.yaw), cam.tgt[1] - cam.dist * cp * Math.cos(cam.yaw), cam.tgt[2] + cam.dist * sp];
  FW = [cam.tgt[0] - C[0], cam.tgt[1] - C[1], cam.tgt[2] - C[2]]; const fl = Math.hypot(...FW); FW = FW.map((x) => x / fl);
  R = [FW[1] * 1 - FW[2] * 0, FW[2] * 0 - FW[0] * 1, 0]; const rl = Math.hypot(...R) || 1; R = R.map((x) => x / rl);
  U = [R[1] * FW[2] - R[2] * FW[1], R[2] * FW[0] - R[0] * FW[2], R[0] * FW[1] - R[1] * FW[0]];
}
function P(p) { const v = [p[0] - C[0], p[1] - C[1], p[2] - C[2]], z = v[0] * FW[0] + v[1] * FW[1] + v[2] * FW[2]; if (z < 0.01) return null; return [W / 2 + (F * (v[0] * R[0] + v[1] * R[1] + v[2] * R[2])) / z, H / 2 - (F * (v[0] * U[0] + v[1] * U[1] + v[2] * U[2])) / z, z]; }
function Pdir(d) { const z = d[0] * FW[0] + d[1] * FW[1] + d[2] * FW[2]; if (z < 0.05) return null; return [W / 2 + (F * (d[0] * R[0] + d[1] * R[1] + d[2] * R[2])) / z, H / 2 - (F * (d[0] * U[0] + d[1] * U[1] + d[2] * U[2])) / z]; }

// ── glow sprites, cached per colour ──
const SPR = {};
function sprite(c) { if (SPR[c]) return SPR[c]; const s = document.createElement("canvas"); s.width = s.height = 64; const g = s.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.12, c); gr.addColorStop(0.4, c + "55"); gr.addColorStop(1, c + "00"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (SPR[c] = s); }
const BG = (() => { let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const a = []; for (let i = 0; i < 2200; i++) { const z = rnd() * 2 - 1, t = rnd() * 6.283, r = Math.sqrt(1 - z * z), m = Math.pow(rnd(), 3); a.push([r * Math.cos(t), r * Math.sin(t), z, 0.15 + m * 0.85, ["#ffffff", "#cfe0ff", "#ffe9c4", "#ffd0b0"][Math.floor(rnd() * 4)], rnd() * 6.28]); } return a; })();

// ── Earth orbit: live satellites (satellite.js and the land outlines are Overhead's) ──
const EARTH = { sats: [], loaded: false, src: "", land: null };
async function loadSats() {
  if (EARTH.loaded || !window.satellite) return; EARTH.loaded = true;
  const parse = (txt) => { const L = txt.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), out = []; for (let i = 0; i < L.length - 1; i++) { if (!/^1 /.test(L[i]) || !/^2 /.test(L[i + 1])) continue; try { const rec = window.satellite.twoline2satrec(L[i], L[i + 1]); if (!rec.error) out.push({ n: i > 0 && !/^[12] /.test(L[i - 1]) ? L[i - 1] : "NORAD " + L[i].slice(2, 7), rec }); } catch (e) {} i++; } return out; };
  for (const g of ["stations", "visual", "gps-ops", "geo"]) {
    let txt = null; try { const r = await fetch("/api/orbit/tle?group=" + g); if (r.ok) { const t = await r.text(); if (/^1 \d/m.test(t)) txt = t; } } catch (e) {}
    if (!txt) try { const c = JSON.parse(localStorage.getItem("ow.tle." + g) || "null"); if (c) txt = c.txt; } catch (e) {}
    if (txt) parse(txt).forEach((s) => { s.g = g; EARTH.sats.push(s); });
  }
  EARTH.src = EARTH.sats.length ? EARTH.sats.length + " satellites from CelesTrak" : "no element sets reachable (Overhead keeps a copy once it has loaded)";
  info();
}
function earthItems() {
  const t = new Date(), g = window.satellite ? window.satellite.gstime(t) : 0, out = [];
  EARTH.sats.forEach((s) => { const pv = window.satellite.propagate(s.rec, t); if (!pv || !pv.position || typeof pv.position !== "object" || !isFinite(pv.position.x)) return; const p = pv.position; const h = Math.hypot(p.x, p.y, p.z) - 6371;
    out.push({ n: s.n, p: [p.x / 1000, p.y / 1000, p.z / 1000], color: s.g === "stations" ? "#ffd166" : s.g === "geo" ? "#c9b8ff" : s.g === "gps-ops" ? "#7ee787" : "#5cc8ff", size: s.g === "stations" ? 5 : 2.6, glow: s.g === "stations" ? 1.4 : 0.8, k: s.g === "stations" && /ISS|CSS|TIANHE/.test(s.n), obj: { n: s.n, t: "SAT", f: [["altitude", Math.round(h).toLocaleString() + " km"], ["speed", Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z).toFixed(2) + " km/s"], ["group", { stations: "space station", visual: "bright satellite", "gps-ops": "GPS", geo: "geostationary" }[s.g]]], s: "CelesTrak elements · SGP4", x: "" } }); });
  return { out, g };
}

// ── drawing ──
let proj = [];
function draw(now) {
  cx.fillStyle = "#04060b"; cx.fillRect(0, 0, W, H); setupCam();
  // background stars, fixed at infinity
  BG.forEach(([x, y, z, m, c, ph]) => { const q = Pdir([x, y, z]); if (!q) return; cx.globalAlpha = m * (0.75 + 0.25 * Math.sin(now / 900 + ph)); cx.fillStyle = c; const s = m > 0.8 ? 1.6 : 1; cx.fillRect(q[0], q[1], s, s); }); cx.globalAlpha = 1;
  const v = V(); let list = items;
  if (v.id === "earth") { const e = earthItems(); list = e.out; drawEarth(e.g); }
  if (extras.disk) { extras.disk.forEach(([x, y, z, k]) => { const q = P([x, y, z]); if (!q) return; cx.fillStyle = k === 0 ? "rgba(255,214,150,.7)" : k === 1 ? "rgba(170,200,255,.62)" : "rgba(200,210,255,.32)"; const s = Math.min(2.4, Math.max(1, 160 / q[2])); cx.fillRect(q[0], q[1], s, s); }); const gc = P([0, 0, 0]); if (gc) { cx.globalCompositeOperation = "lighter"; const s = Math.max(30, 6000 / gc[2]); cx.drawImage(sprite("#ffcf8a"), gc[0] - s, gc[1] - s, s * 2, s * 2); cx.globalCompositeOperation = "source-over"; } }
  extras.arms.forEach((a) => { cx.strokeStyle = a.spur ? "rgba(255,230,163,.35)" : "rgba(170,200,255,.2)"; cx.lineWidth = 1; cx.setLineDash(a.spur ? [3, 4] : []); cx.beginPath(); let st = false; a.pts.forEach((p) => { const q = P(p); if (!q) { st = false; return; } if (!st) { cx.moveTo(q[0], q[1]); st = true; } else cx.lineTo(q[0], q[1]); }); cx.stroke(); cx.setLineDash([]); const m = P(a.pts[Math.floor(a.pts.length * (a.spur ? 0.5 : 0.7))]); if (m && S.labels) { cx.fillStyle = "rgba(170,200,255,.55)"; cx.font = "11px ui-sans-serif,sans-serif"; cx.fillText(a.n, m[0] + 4, m[1]); } });
  extras.rings.forEach((rg) => { cx.strokeStyle = "rgba(140,170,220,.13)"; cx.lineWidth = 1; cx.beginPath(); let st = false; for (let k = 0; k <= 96; k++) { const a = (k / 96) * 6.2832, q = P([rg.c[0] + rg.r * Math.cos(a), rg.c[1] + rg.r * Math.sin(a), rg.c[2]]); if (!q) { st = false; continue; } if (!st) { cx.moveTo(q[0], q[1]); st = true; } else cx.lineTo(q[0], q[1]); } cx.stroke(); const q = P([rg.c[0] + rg.r * 0.7071, rg.c[1] - rg.r * 0.7071, rg.c[2]]); if (q) { cx.fillStyle = "rgba(140,170,220,.5)"; cx.font = "10.5px ui-monospace,monospace"; cx.fillText(rg.lbl, q[0] + 3, q[1] - 3); } });
  extras.orbits.forEach((o) => { cx.strokeStyle = o.color + (o.dw ? "40" : "66"); cx.lineWidth = 1; cx.setLineDash(o.dw ? [2, 4] : []); cx.beginPath(); let st = false; o.pts.forEach((p) => { const q = P(p); if (!q) { st = false; return; } if (!st) { cx.moveTo(q[0], q[1]); st = true; } else cx.lineTo(q[0], q[1]); }); cx.stroke(); cx.setLineDash([]); });
  // objects, far to near
  const lbls = []; proj = []; list.forEach((it) => { const q = P(it.p); if (q) proj.push([q, it]); }); proj.sort((a, b) => b[0][2] - a[0][2]);
  cx.globalCompositeOperation = "lighter";
  const SCMAX = v.id === "earth" ? 1.2 : 2.2; proj.forEach(([q, it]) => { const sc = Math.max(0.6, Math.min(SCMAX, (cam.dist * 0.9) / q[2])), s = it.size * sc * (it.glow || 1) * 2.2; cx.drawImage(sprite(it.color), q[0] - s, q[1] - s, s * 2, s * 2); });
  cx.globalCompositeOperation = "source-over";
  proj.forEach(([q, it]) => {
    const sc = Math.max(0.6, Math.min(SCMAX, (cam.dist * 0.9) / q[2])), r = Math.max(1.2, it.size * 0.45 * sc);
    if (it.obj && it.obj.t === "BH") { cx.strokeStyle = "#ffb35c"; cx.lineWidth = 2; cx.beginPath(); cx.arc(q[0], q[1], r + 2.5, 0, 7); cx.stroke(); cx.fillStyle = "#000"; cx.beginPath(); cx.arc(q[0], q[1], r + 1, 0, 7); cx.fill(); }
    else { cx.fillStyle = it.color; cx.beginPath(); cx.arc(q[0], q[1], r, 0, 7); cx.fill(); }
    if (it.n === "Saturn") { cx.strokeStyle = "rgba(233,216,166,.8)"; cx.lineWidth = 1.2; cx.beginPath(); cx.ellipse(q[0], q[1], r * 2.3, r * 0.8, -0.35, 0, 7); cx.stroke(); }
    const sel = S.sel && S.sel.n === it.n, hov = S.hover && S.hover.n === it.n;
    if (sel) { cx.strokeStyle = "#fff"; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(q[0], q[1], r + 7, 0, 7); cx.stroke(); }
    if (sel || hov || S.labels || it.k) lbls.push([sel ? 3 : hov ? 2 : it.n === "Earth" || it.n === "Sun" ? 1.5 : it.k ? 1 : 0, q, it, r, sel, hov]);
  });
  // labels by priority (selected, hovered, key objects, the rest), skipping any that would land on one already drawn
  const boxes = []; lbls.sort((a, b) => b[0] - a[0] || a[1][2] - b[1][2]);
  lbls.forEach(([pri, q, it, r, sel, hov]) => { cx.font = (sel ? "600 13px" : "12px") + " ui-sans-serif,-apple-system,sans-serif"; const x = q[0] + r + 6, y = q[1] + 4, w = cx.measureText(it.n).width, bx = [x - 2, y - 12, x + w + 2, y + 4];
    if (pri < 2 && boxes.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) return; boxes.push(bx);
    cx.fillStyle = sel ? "#fff" : hov ? "#e8eeff" : "rgba(220,228,245,.72)"; cx.fillText(it.n, x, y); });
}
function drawEarth(g) {
  const Re = 6.371, c = P([0, 0, 0]); if (!c) return;
  const pr = (F * Re) / c[2];
  const gr = cx.createRadialGradient(c[0] - pr * 0.3, c[1] - pr * 0.3, pr * 0.1, c[0], c[1], pr); gr.addColorStop(0, "#1d3f6e"); gr.addColorStop(1, "#08162b");
  cx.fillStyle = gr; cx.beginPath(); cx.arc(c[0], c[1], pr, 0, 7); cx.fill(); cx.strokeStyle = "rgba(120,180,255,.35)"; cx.lineWidth = 2; cx.beginPath(); cx.arc(c[0], c[1], pr + 2, 0, 7); cx.stroke();
  if (window.OW_LAND) {
    const cg = Math.cos(g), sg = Math.sin(g), cl = Math.hypot(...C);
    cx.strokeStyle = "rgba(126,231,135,.55)"; cx.lineWidth = 1;
    window.OW_LAND.forEach((ring) => { cx.beginPath(); let st = false;
      for (let i = 0; i < ring.length; i += 2) { const lo = ring[i] * DEG, la = ring[i + 1] * DEG, x = Math.cos(la) * Math.cos(lo), y = Math.cos(la) * Math.sin(lo), z = Math.sin(la); const p = [Re * (x * cg - y * sg), Re * (x * sg + y * cg), Re * z];
        const front = (p[0] * C[0] + p[1] * C[1] + p[2] * C[2]) / (Re * cl) > Re / cl; const q = front && P(p); if (!q) { st = false; continue; } if (!st) { cx.moveTo(q[0], q[1]); st = true; } else cx.lineTo(q[0], q[1]); }
      cx.stroke(); });
  }
  [[42.164, "GEO · 35,786 km"], [26.56, "GPS · 20,200 km"]].forEach(([r, l]) => { cx.strokeStyle = "rgba(140,170,220,.18)"; cx.beginPath(); let st = false; for (let k = 0; k <= 120; k++) { const a = (k / 120) * 6.2832, q = P([r * Math.cos(a), r * Math.sin(a), 0]); if (!q) { st = false; continue; } if (!st) { cx.moveTo(q[0], q[1]); st = true; } else cx.lineTo(q[0], q[1]); } cx.stroke(); const q = P([r * 0.7071, -r * 0.7071, 0]); if (q) { cx.fillStyle = "rgba(140,170,220,.55)"; cx.font = "10.5px ui-monospace,monospace"; cx.fillText(l, q[0] + 4, q[1]); } });
}

// ── the panel ──
function card(it) {
  const o = it.obj || {}, v = V();
  const kind = o.t === "PL" ? (o.dw ? "dwarf planet" : "planet") : o.t === "SAT" ? "satellite" : KIND[o.t] || "";
  const dist = o.t === "PL" ? (o.au != null ? o.au.toFixed(2) + " AU from the Sun today" : "") : o.t === "SAT" ? "" : o.d != null ? fmtD(o.d, v.id === "deep" && o.d > 1e9) : "";
  $("card").innerHTML = '<button class="x" id="cx" aria-label="Close">✕</button><span class="kind" style="color:' + esc(it.color) + '">' + esc(kind) + "</span><h2>" + esc(it.n) + "</h2>" + (dist ? '<p class="dist">' + esc(dist) + "</p>" : "") +
    '<dl>' + (o.f || []).map(([k, val]) => "<dt>" + esc(k) + "</dt><dd>" + esc(val) + "</dd>").join("") + "</dl>" + (o.x ? '<p class="x2">' + esc(o.x) + "</p>" : "") + (o.s ? '<p class="src">' + esc(o.s) + "</p>" : "") +
    '<div class="row"><button class="btn" id="focus">Focus</button></div>';
  $("card").hidden = false;
  $("cx").onclick = () => { S.sel = null; $("card").hidden = true; };
  $("focus").onclick = () => { const p = it.p; cam.goal = { tgt: p.slice(), dist: Math.max(cam.dist * 0.35, 4) }; };
}
function select(it) { S.sel = it; if (it) card(it); else $("card").hidden = true; }
function info() { const v = V(); $("blurb").textContent = v.blurb + (v.id === "earth" ? " " + (EARTH.src || "Loading satellites…") : ""); $("count").textContent = v.id === "earth" ? EARTH.sats.length + " satellites" : items.length + " objects"; $("soltime").hidden = v.id !== "sol"; }
function go(id, keepCam) {
  S.view = id; S.sel = null; $("card").hidden = true; cam.goal = null;
  const v = V(); if (!keepCam) { cam.yaw = v.cam[0]; cam.pitch = v.cam[1]; cam.dist = v.cam[2]; cam.tgt = [0, 0, 0]; }
  document.querySelectorAll("#views button").forEach((b) => b.classList.toggle("on", b.dataset.v === id));
  if (id === "earth") loadSats();
  build(); info();
  try { history.replaceState(null, "", "#" + id); } catch (e) {}
}

// ── input ──
const ptrs = new Map(); let downAt = null, pinch0 = 0, dist0 = 0;
cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY, performance.now()]; S.idle = performance.now(); cam.goal = null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = cam.dist; } });
cv.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) { const h = pick(e); if ((h && h.n) !== (S.hover && S.hover.n)) { S.hover = h; cv.style.cursor = h ? "pointer" : "grab"; } return; }
  const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); S.idle = performance.now();
  if (ptrs.size === 1) { cam.yaw -= (e.clientX - prev[0]) * 0.006; cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch + (e.clientY - prev[1]) * 0.006)); }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) cam.dist = Math.max(0.5, Math.min(2000, dist0 * (pinch0 / d))); }
});
const up = (e) => { if (ptrs.size === 1 && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6 && performance.now() - downAt[2] < 500) select(pick(e)); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); pinch0 = 0; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist = Math.max(0.5, Math.min(2000, cam.dist * Math.exp(e.deltaY * 0.0012))); S.idle = performance.now(); }, { passive: false });
cv.addEventListener("dblclick", (e) => { const h = pick(e); if (h) { select(h); cam.goal = { tgt: h.p.slice(), dist: Math.max(cam.dist * 0.35, 4) }; } });
function pick(e) { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 22 * 22; for (let i = proj.length - 1; i >= 0; i--) { const [q, it] = proj[i], d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = it; } } return best; }
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input")) return;
  const n = "1234567890".indexOf(e.key); if (n >= 0) { go(VIEWS[n].id); return; }
  if (e.key === "l") toggle("labels"); else if (e.key === "r") go(S.view); else if (e.key === "a") toggle("spin");
  else if (e.key === "ArrowLeft") cam.yaw += 0.08; else if (e.key === "ArrowRight") cam.yaw -= 0.08; else if (e.key === "ArrowUp") cam.pitch = Math.min(1.45, cam.pitch + 0.06); else if (e.key === "ArrowDown") cam.pitch = Math.max(-1.45, cam.pitch - 0.06);
  else if (e.key === "+" || e.key === "=") cam.dist *= 0.85; else if (e.key === "-") cam.dist /= 0.85; else if (e.key === "Escape") select(null);
});
function toggle(k) { S[k] = !S[k]; $(k).classList.toggle("on", S[k]); }
$("views").innerHTML = VIEWS.map((v, i) => '<button data-v="' + v.id + '" title="' + (i + 1) % 10 + '">' + esc(v.n) + "</button>").join("");
$("views").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) go(b.dataset.v); });
$("labels").addEventListener("click", () => toggle("labels")); $("spin").addEventListener("click", () => toggle("spin")); $("reset").addEventListener("click", () => go(S.view));
$("truescale").addEventListener("change", (e) => { S.trueScale = e.target.checked; build(); cam.dist = S.trueScale ? 140 : 26; });
document.querySelector(".rates").addEventListener("click", (e) => { const b = e.target.closest("[data-rate]"); if (!b) return; S.rate = +b.dataset.rate; if (b.dataset.rate === "now") { S.rate = 0; S.t = Date.now(); build(); } document.querySelectorAll(".rates button").forEach((x) => x.classList.toggle("on", x === b)); });
// search across every view
const ALL = [...D.planets.map((p) => [p.n, "sol"]), ...D.dwarfs.map((p) => [p.n, "sol"]), ...D.objs.map((o) => [o.n, o.v])];
$("names").innerHTML = ALL.map(([n]) => '<option value="' + esc(n) + '">').join("");
$("q").addEventListener("change", (e) => { const v = e.target.value.trim().toLowerCase(), hit = ALL.find(([n]) => n.toLowerCase() === v) || ALL.find(([n]) => n.toLowerCase().includes(v)); if (!hit) return; go(hit[1]); const it = items.find((x) => x.n === hit[0]); if (it) { select(it); cam.goal = { tgt: it.p.slice(), dist: Math.max(cam.dist * 0.45, 4) }; } e.target.value = ""; e.target.blur(); });

// ── the loop ──
let last = performance.now(), lastBuild = 0;
function loop(now) {
  requestAnimationFrame(loop); if (document.hidden) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.spin && now - S.idle > 3500 && !ptrs.size) cam.yaw -= dt * 0.06;
  if (cam.goal) { const k = 1 - Math.pow(0.002, dt); cam.tgt = cam.tgt.map((x, i) => x + (cam.goal.tgt[i] - x) * k); cam.dist += (cam.goal.dist - cam.dist) * k; if (Math.hypot(...cam.tgt.map((x, i) => x - cam.goal.tgt[i])) < 1e-3 && Math.abs(cam.dist - cam.goal.dist) < 1e-2) cam.goal = null; }
  if (S.view === "sol" && S.rate) { S.t += dt * S.rate * 864e5; if (now - lastBuild > 50) { lastBuild = now; const sel = S.sel && S.sel.n; build(); if (sel) S.sel = items.find((x) => x.n === sel) || null; } }
  if (S.view === "sol") $("date").textContent = new Date(S.t).toISOString().slice(0, 10);
  draw(now);
}
const start = VIEWS.some((v) => v.id === location.hash.slice(1)) ? location.hash.slice(1) : "sol";
go(start); requestAnimationFrame(loop);
addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h !== S.view && VIEWS.some((v) => v.id === h)) go(h); });
window.Cartograph = { S, VIEWS, go, items: () => items, cam, select, P: (p) => { setupCam(); return P(p); }, galDir, D };
})();
