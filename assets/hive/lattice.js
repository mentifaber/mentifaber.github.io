// AutoFaber · the lattice. The emblem is an AF drawn as lit nodes joined by gold filament, held in gold orbits; the app is the
// inside of that emblem. Behind every screen a field of nodes drifts in three depths, joined by filament where they come close,
// crossed by slow orbits. It answers what happens: typing sends sparks up from the composer, thinking sends a pulse out through
// the filament, every word of an answer lights a node, and every finished exchange adds a node that stays for the session, so a
// conversation builds its own constellation. Each saved session keeps a sigil: its constellation, drawn small.
// Holds still for people who prefer less motion (or turn Motion off), and sleeps on a hidden tab.
(() => {
"use strict";
const rm = matchMedia("(prefers-reduced-motion: reduce)"), still = () => rm.matches || document.body.classList.contains("still");
const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return [217, 173, 85]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
function rng(seed) { let h = 2166136261 >>> 0; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = (h + 0x6d2b79f5) | 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const c = document.createElement("canvas"); c.id = "lattice"; c.setAttribute("aria-hidden", "true");
document.body.prepend(c);
const g = c.getContext("2d");
let W = 0, H = 0, D = 1, nodes = [], grown = [], sparks = [], pulses = [], heat = 0, last = 0, raf = 0, gold, hot, ink, light;

function palette() { light = document.documentElement.dataset.theme === "light"; gold = rgb(css("--fil", "#d9a441")); hot = rgb(css("--fil-hi", "#ffd27a")); ink = rgb(css("--ink", "#efe6d4")); }
function size() {
  D = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight; c.width = Math.round(W * D); c.height = Math.round(H * D);
  const r = rng("autofaber"), n = Math.round(Math.min(110, Math.max(36, (W * H) / 15000)));
  nodes = []; for (let i = 0; i < n; i++) { const z = i % 3; nodes.push({ x: r() * W, y: r() * H, z, vx: (r() - .5) * (.05 + z * .05), vy: (r() - .5) * (.04 + z * .04), tw: r() * 6.28, lit: 0 }); }
  palette(); if (still()) frame(0);
}

// what happens in the app reaches the lattice as events
const from = (el) => { const b = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; return b && b.width ? { x: b.left + b.width * (.2 + Math.random() * .6), y: b.top + 4 } : { x: W / 2, y: H * .4 }; };
addEventListener("af:type", () => { if (still() || sparks.length > 40) return; const o = from(document.getElementById("composer")); sparks.push({ x: o.x, y: o.y, vx: (Math.random() - .5) * .6, vy: -.6 - Math.random() * .9, life: 1 }); wake(); });
addEventListener("af:think", (e) => { heat = 1; const o = e.detail && e.detail.at ? from(e.detail.at) : { x: W * .5, y: H * .45 }; pulses.push({ x: o.x, y: o.y, r: 0, a: 1 }); wake(); });
addEventListener("af:token", () => { heat = Math.max(heat, .6); const n = nodes[(Math.random() * nodes.length) | 0]; if (n) n.lit = 1; wake(); });
addEventListener("af:done", (e) => { heat = .35; const k = Math.max(0, Math.min(40, (e.detail && e.detail.n) || grown.length + 1)); grow(k, e.detail && e.detail.seed); const p = grown[grown.length - 1]; if (p) pulses.push({ x: p.x, y: p.y, r: 0, a: .8 }); wake(); });
addEventListener("af:reset", (e) => { grown = []; grow((e.detail && e.detail.n) || 0, e.detail && e.detail.seed); wake(); });
// the session's own stars, placed by its id so a session always draws the same constellation
function grow(n, seed) { const r = rng(seed || "now"); while (grown.length < n) { r(); const i = grown.length, a = i * 2.39996 + r() * .5, rad = 14 + Math.sqrt(i) * (W > 1240 ? 26 : 16), cx = W > 1240 ? W - Math.min(170, W * .1) : W - 46, cy = H * (W > 760 ? .52 : .3);
    grown.push({ x: cx + Math.cos(a) * rad * .8, y: cy + Math.sin(a) * rad * 2.1, born: performance.now() }); } if (grown.length > n) grown.length = n; }
addEventListener("resize", () => { cancelAnimationFrame(raf); raf = 0; size(); wake(); });
new MutationObserver(() => { palette(); if (still()) frame(0); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
new MutationObserver(() => { if (still()) frame(0); else wake(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });

function wake() { if (!raf && !still() && !document.hidden) raf = requestAnimationFrame(loop); }
function loop(t) { raf = 0; if (document.hidden || still()) return; if (t - last > 30) { frame(t); last = t; } raf = requestAnimationFrame(loop); }

function frame(t) {
  const time = t / 1000, s = still(); g.setTransform(D, 0, 0, D, 0, 0); g.clearRect(0, 0, W, H);
  heat *= .985;
  // orbits: the emblem's gold rings, very faint, turning slowly
  g.lineWidth = 1;
  for (let k = 0; k < 3; k++) { const rot = (s ? 0 : time * (.012 + k * .005)) + k * 1.1, rx = W * (.46 + k * .1), ry = H * (.16 + k * .07);
    g.strokeStyle = rgba(gold, (light ? .16 : .09) + heat * .05); g.beginPath(); g.ellipse(W * .62, H * .5, rx, ry, rot, 0, Math.PI * 2); g.stroke(); }
  // drift
  if (!s) for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < -20) n.x = W + 20; if (n.x > W + 20) n.x = -20; if (n.y < -20) n.y = H + 20; if (n.y > H + 20) n.y = -20; n.lit *= .94; }
  // pulses: a ring running out through the field, lighting what it passes
  for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i]; p.r += 9; p.a *= .975; if (p.a < .03 || p.r > Math.max(W, H) * 1.2) { pulses.splice(i, 1); continue; }
    for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (Math.abs(d - p.r) < 14) n.lit = Math.max(n.lit, p.a); } }
  // filament between near nodes
  const all = nodes.concat(grown.map((p) => ({ x: p.x, y: p.y, z: 2, lit: W > 1240 ? .55 : W > 760 ? .25 : .08, tw: 0, own: W > 760 ? 1 : .35 }))), max = W > 760 ? 150 : 110;
  for (let i = 0; i < all.length; i++) { const a = all[i];
    for (let j = i + 1; j < all.length; j++) { const b = all[j], dx = a.x - b.x, dy = a.y - b.y; if (dx > max || dx < -max || dy > max || dy < -max) continue;
      const d = Math.hypot(dx, dy); if (d > max) continue; const k = 1 - d / max, l = Math.max(a.lit, b.lit);
      g.strokeStyle = rgba(l > .2 ? hot : gold, k * ((light ? .22 : .16) + l * .55 + heat * .05) * (a.own && b.own ? 1.8 : 1)); g.lineWidth = a.own && b.own ? 1.2 : .8; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
  // the session's constellation, joined in the order it grew
  if (grown.length > 1) { g.strokeStyle = rgba(hot, (light ? .5 : .38) * (W > 1240 ? 1 : W > 760 ? .5 : .22)); g.lineWidth = 1.1; g.beginPath(); grown.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
  // nodes
  for (const n of all) { const tw = s ? .6 : .55 + .45 * Math.sin(time * (.6 + n.z * .3) + n.tw), r = (n.own ? 2.3 : .7 + n.z * .55) + n.lit * 1.6, a = (light ? .55 : .45) * tw + n.lit * .55 + (n.own || 0) * .4;
    if (n.lit > .15 || n.own) { const gl = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 6); gl.addColorStop(0, rgba(hot, (n.own ? n.own * .35 : n.lit * .4))); gl.addColorStop(1, rgba(hot, 0)); g.fillStyle = gl; g.beginPath(); g.arc(n.x, n.y, r * 6, 0, 7); g.fill(); }
    g.fillStyle = rgba(n.lit > .2 || n.own ? hot : gold, a); g.beginPath(); g.arc(n.x, n.y, r, 0, 7); g.fill(); }
  // sparks from the composer
  for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy *= .99; p.life -= .018; if (p.life <= 0) { sparks.splice(i, 1); continue; }
    g.fillStyle = rgba(hot, p.life); g.beginPath(); g.arc(p.x, p.y, 1.4, 0, 7); g.fill(); g.strokeStyle = rgba(hot, p.life * .4); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 8, p.y - p.vy * 8); g.stroke(); }
}

// a session's sigil: its constellation, small, the same every time for the same session
function sigil(seed, n) {
  const r = rng(seed || "s"), k = Math.max(3, Math.min(9, n || 3)), pts = [];
  for (let i = 0; i < k; i++) { const a = r() * 6.283, d = 4 + r() * 11; pts.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d]); }
  pts.sort((a, b) => Math.atan2(a[1] - 16, a[0] - 16) - Math.atan2(b[1] - 16, b[0] - 16));
  let s = "<svg class='sigil' viewBox='0 0 32 32' aria-hidden='true'><path d='M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "'/>";
  for (const [i, p] of pts.entries()) s += "<circle cx='" + p[0].toFixed(1) + "' cy='" + p[1].toFixed(1) + "' r='" + (i === pts.length - 1 ? 1.9 : 1.2) + "'/>";
  return s + "</svg>";
}

size(); wake();
window.Lattice = { sigil, grow: (n, seed) => dispatchEvent(new CustomEvent("af:reset", { detail: { n, seed } })) };
})();
