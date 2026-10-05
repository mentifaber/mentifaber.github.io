// Barycenter · the Void: the canvas the whole app floats on.
// Two stars orbit the point between them. How far apart they sit is how long it has been since you last spoke; when you are
// both here at once they fall into a tight, fast orbit (Kepler: closer means quicker). Words travel between them as light.
// A quality governor watches the frame time and trades beauty for battery without asking.
(() => {
"use strict";
const cv = B.$("void"), cx = cv.getContext("2d", { alpha: false });
const vs = (B.vs = { seenAt: 0, present: false, gap: 0, capsules: 0, flight: false, typing: 0, voice: 0, names: { me: "you", her: "" }, local: { x: .5, y: .5, down: 0, at: 0 }, remote: { x: .5, y: .5, down: 0, at: 0 }, tier: 3, fps: 60, hero: null, contact: 0 });
let W = 0, H = 0, dpr = 1, raf = 0, last = 0, visible = true, tier = 3, ema = 16, slow = 0, fast = 0, frames = 0, fpsT = 0, ang = 0, d = 0, neb = null, stars = [], cols = {}, still = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TIER = { 0: { stars: 0, dpr: 1, parts: 0 }, 1: { stars: 50, dpr: 1, parts: 40 }, 2: { stars: 110, dpr: 1.5, parts: 120 }, 3: { stars: 190, dpr: 2, parts: 260 } };
const sprites = new Map();
function sprite(color, r) { const k = color + r; let s = sprites.get(k); if (s) return s; s = document.createElement("canvas"); s.width = s.height = r * 2; const g = s.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, color); gr.addColorStop(.18, color + "cc"); gr.addColorStop(.45, color + "44"); gr.addColorStop(1, color + "00"); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); sprites.set(k, s); if (sprites.size > 60) sprites.delete(sprites.keys().next().value); return s; }
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function restyle() { const p = B.palette(); cols = { me: p.me, her: p.her, bg: css("--bg") || "#05060f", faint: css("--faint") || "#667", dim: css("--dim") || "#99a", light: p.t.mode === "light", neb: p.t.neb }; sprites.clear(); buildNeb(); need(); }
function buildNeb() { if (!W) return; neb = document.createElement("canvas"); const nw = Math.max(64, W >> 2), nh = Math.max(64, H >> 2); neb.width = nw; neb.height = nh; const g = neb.getContext("2d"); g.fillStyle = cols.bg; g.fillRect(0, 0, nw, nh); [[.2, .15, .7, 0], [.85, .3, .6, 1], [.5, .85, .8, 2]].forEach(([x, y, r, i]) => { const c = cols.neb[i], gr = g.createRadialGradient(nw * x, nh * y, 0, nw * x, nh * y, Math.max(nw, nh) * r); gr.addColorStop(0, c + (cols.light ? "99" : "aa")); gr.addColorStop(1, c + "00"); g.fillStyle = gr; g.fillRect(0, 0, nw, nh); }); }
function size() { const T = TIER[tier]; dpr = Math.min(devicePixelRatio || 1, T.dpr); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); buildNeb(); seed(); need(); }
function seed() { const n = TIER[tier].stars; stars = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + .25, p: Math.random() * 6.28, s: .3 + Math.random() * .9, l: Math.random() < .55 ? 0 : Math.random() < .6 ? 1 : 2 })); }
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// particles in typed arrays: no allocation per frame
const NP = 260, px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP), pl = new Float32Array(NP), pc = new Array(NP); let pn = 0;
function spawn(x, y, color, n, speed, life) { const cap = TIER[tier].parts; for (let i = 0; i < n && pn < Math.min(NP, cap); i++) { const a = Math.random() * 6.283, v = speed * (.3 + Math.random()); px[pn] = x; py[pn] = y; pvx[pn] = Math.cos(a) * v; pvy[pn] = Math.sin(a) * v; pl[pn] = life * (.6 + Math.random() * .4); pc[pn] = color; pn++; } }
const packets = [], rings = [];
const heroR = () => vs.hero || { x: 0, y: 0, w: W, h: Math.min(H * .38, 320) };
function geom(t) {
  const R = heroR(), cxx = R.x + R.w / 2, cyy = R.y + R.h * .52, lock = vs.present && visible ? 1 : 0, gapH = vs.gap ? (Date.now() - vs.gap) / 36e5 : 36;
  const target = Math.min(R.w * .72, W * .8) * (lock ? .16 : .2 + .5 * smooth(gapH / 36)); d += (target - d) * .04; if (!d) d = target;
  const w = lock ? 2.2 : 1; ang += (reduce ? 0 : 16 / Math.max(60, d)) * w * .012 * (16 / Math.max(8, ema)) ; // Kepler-ish: closer, faster
  const a = ang * 1 + Math.sin(t * .0002) * .25, ox = Math.cos(a) * d / 2, oy = Math.sin(a) * d / 2 * .55 + Math.sin(t * .0007) * 2;
  return { c: [cxx, cyy], me: [cxx - ox, cyy - oy], her: [cxx + ox, cyy + oy], R };
}
function star(x, y, color, b, r, label, extra) {
  const pulse = .9 + .1 * Math.sin(performance.now() * .003 + x), R = r * (.75 + .5 * b) * pulse, S = sprite(color, 64);
  cx.globalAlpha = (.4 + .6 * b); cx.drawImage(S, x - R * 4.2, y - R * 4.2, R * 8.4, R * 8.4);
  cx.globalAlpha = .55 + .45 * b; cx.strokeStyle = cols.light ? color : "#fff"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(x - R * 2, y); cx.lineTo(x + R * 2, y); cx.moveTo(x, y - R * 2); cx.lineTo(x, y + R * 2); cx.stroke();
  cx.fillStyle = cols.light ? color : "#fff"; cx.beginPath(); cx.arc(x, y, R * .36, 0, 7); cx.fill();
  cx.globalAlpha = .8; cx.fillStyle = cols.dim; cx.font = "10px 'JetBrains Mono',monospace"; cx.textAlign = "center"; cx.fillText(label, x, y + R * 3.4); cx.globalAlpha = 1;
  if (extra) extra(x, y, R);
}
function frame(now) {
  raf = 0; if (!visible) return;
  const dt = now - last; last = now;
  if (tier <= 1 && dt < 30 && !reduce) { raf = requestAnimationFrame(frame); return; } // 30fps on the lower tiers
  if (dt > 0 && dt < 200) { ema += (dt - ema) * .08; frames++; }
  if (now - fpsT > 1000) { vs.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
  govern(now);
  const t = now, T = TIER[tier], lt = B.cfg.tilt && !reduce ? B.tilt : { x: 0, y: 0 };
  B.tilt.x += (B.tilt.tx - B.tilt.x) * .08; B.tilt.y += (B.tilt.ty - B.tilt.y) * .08;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.globalCompositeOperation = "source-over"; cx.globalAlpha = 1;
  if (neb) { const ox = -lt.x * 14, oy = -lt.y * 14; cx.drawImage(neb, ox - 20, oy - 20, W + 40, H + 40); } else { cx.fillStyle = cols.bg; cx.fillRect(0, 0, W, H); }
  // stars at three depths; the tilt slides the near ones further than the far ones
  cx.fillStyle = cols.light ? "#5a6a99" : "#dfe5ff";
  for (const s of stars) { const dep = (s.l + 1) * 7, tw = .3 + .55 * (.5 + .5 * Math.sin(t * .001 * s.s + s.p)); cx.globalAlpha = cols.light ? tw * .35 : tw; cx.fillRect(((s.x * W - lt.x * dep + t * .002 * s.r * (s.l + 1)) % W + W) % W, (s.y * H - lt.y * dep + H) % H, s.r, s.r); }
  cx.globalAlpha = 1; if (!cols.light) cx.globalCompositeOperation = "lighter";
  const G = geom(t), me = cols.me, her = cols.her, seen = vs.seenAt ? Date.now() - vs.seenAt : Infinity, bh = vs.present ? 1 : seen < 120e3 ? 1 : seen < 36e5 ? .8 : seen < 864e5 ? .55 : .32;
  cx.globalCompositeOperation = "source-over";
  // orbit, the thread, the point between
  cx.strokeStyle = cols.faint; cx.globalAlpha = .3; cx.lineWidth = 1; cx.setLineDash([2, 6]); cx.beginPath(); cx.ellipse(G.c[0], G.c[1], d / 2, d / 2 * .55, 0, 0, 7); cx.stroke(); cx.setLineDash([4, 5]); cx.beginPath(); cx.moveTo(G.me[0], G.me[1]); cx.lineTo(G.her[0], G.her[1]); cx.stroke(); cx.setLineDash([]);
  cx.globalAlpha = .6; cx.beginPath(); cx.moveTo(G.c[0] - 5, G.c[1]); cx.lineTo(G.c[0] + 5, G.c[1]); cx.moveTo(G.c[0], G.c[1] - 5); cx.lineTo(G.c[0], G.c[1] + 5); cx.stroke(); cx.globalAlpha = 1;
  if (!cols.light) cx.globalCompositeOperation = "lighter";
  // capsules wait at the barycenter
  for (let i = 0; i < Math.min(vs.capsules, 5); i++) { const a = t * .0009 + i * 1.3, x = G.c[0] + Math.cos(a) * 16, y = G.c[1] + Math.sin(a) * 7 - 14; cx.globalAlpha = .9; cx.drawImage(sprite(her, 16), x - 8, y - 8, 16, 16); }
  // light in transit: a stream of packets while something is unanswered, plus one-shots
  if (vs.flight && !reduce && t - (frame.f || 0) > 1700) { packets.push({ from: "me", t0: t, dur: 1500, color: me }); frame.f = t; }
  for (let i = packets.length - 1; i >= 0; i--) { const m = packets[i], k = (t - m.t0) / m.dur; if (k > 1) { packets.splice(i, 1); continue; } if (k < 0) continue; const a = m.from === "me" ? G.me : G.her, b = m.from === "me" ? G.her : G.me, S = sprite(m.color, 24);
    for (let j = 0; j < (T.parts ? 7 : 2); j++) { const kk = Math.max(0, k - j * .018), x = a[0] + (b[0] - a[0]) * kk, y = a[1] + (b[1] - a[1]) * kk - Math.sin(kk * Math.PI) * 14, s = (1 - j / 7) * 14 + 4; cx.globalAlpha = (1 - j / 7) * .85; cx.drawImage(S, x - s, y - s, s * 2, s * 2); } }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i], k = (t - r.t0) / r.dur; if (k > 1) { rings.splice(i, 1); continue; } if (k < 0) continue; const p = r.at === "me" ? G.me : r.at === "her" ? G.her : G.c; cx.strokeStyle = r.color; cx.globalAlpha = (1 - k) * .8; cx.lineWidth = 2; cx.beginPath(); cx.arc(p[0], p[1], 8 + k * (r.big ? 140 : 56), 0, 7); cx.stroke(); }
  cx.globalAlpha = 1;
  // contact: both of you touching the void at the same moment
  const L = vs.local, Rm = vs.remote, rem = Rm.down && now - Rm.at < 1500, loc = L.down;
  const lx = G.R.x + L.x * G.R.w, ly = G.R.y + L.y * G.R.h, rx = G.R.x + Rm.x * G.R.w, ry = G.R.y + Rm.y * G.R.h;
  const touching = rem && loc;
  if (touching && !vs.contact) { vs.contact = now; rings.push({ at: "c", t0: now, dur: 1400, color: me, big: 1 }, { at: "c", t0: now + 160, dur: 1400, color: her, big: 1 }); spawn((lx + rx) / 2, (ly + ry) / 2, me, 40, .18, 1300); spawn((lx + rx) / 2, (ly + ry) / 2, her, 40, .18, 1300); B.snd("contact"); B.hap([40, 60, 40, 60, 90]); vs.onContact && vs.onContact(); }
  if (!touching) vs.contact = 0;
  if (loc && T.parts && now - (frame.sp || 0) > 40) { spawn(lx, ly, me, 2, .06, 700); frame.sp = now; }
  if (rem && T.parts && now - (frame.sr || 0) > 40) { spawn(rx, ry, her, 2, .06, 700); frame.sr = now; }
  // particles
  for (let i = pn - 1; i >= 0; i--) { pl[i] -= dt; if (pl[i] <= 0) { pn--; px[i] = px[pn]; py[i] = py[pn]; pvx[i] = pvx[pn]; pvy[i] = pvy[pn]; pl[i] = pl[pn]; pc[i] = pc[pn]; continue; } px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pvx[i] *= .985; pvy[i] *= .985; const s = 2 + pl[i] * .006; cx.globalAlpha = Math.min(1, pl[i] / 500) * .8; cx.drawImage(sprite(pc[i], 12), px[i] - s, py[i] - s, s * 2, s * 2); }
  cx.globalAlpha = 1;
  if (touching) { cx.strokeStyle = "#fff"; cx.globalAlpha = .5 + .3 * Math.sin(t * .02); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(rx, ry); cx.stroke(); cx.globalAlpha = 1; }
  if (loc) { cx.globalAlpha = .9; cx.drawImage(sprite(me, 32), lx - 36, ly - 36, 72, 72); cx.globalAlpha = 1; }
  if (rem) { cx.globalAlpha = .9; cx.drawImage(sprite(her, 32), rx - 36, ry - 36, 72, 72); cx.globalAlpha = 1; }
  cx.globalCompositeOperation = "source-over";
  vs.voice *= .9;
  star(G.me[0], G.me[1], me, 1, 9, vs.names.me, null);
  star(G.her[0], G.her[1], her, bh, 9, vs.names.her, (x, y, R) => {
    if (vs.typing && now - vs.typing < 4500) for (let i = 0; i < 3; i++) { const a = t * .006 + i * 2.1; cx.globalAlpha = .9; cx.fillStyle = her; cx.beginPath(); cx.arc(x + Math.cos(a) * R * 2.2, y + Math.sin(a) * R * 2.2, 2.2, 0, 7); cx.fill(); }
    if (vs.voice > .04) { cx.strokeStyle = her; cx.lineWidth = 2; for (let i = 0; i < 3; i++) { cx.globalAlpha = Math.max(0, vs.voice * (1 - i * .3)); cx.beginPath(); cx.arc(x, y, R * (2.2 + i * 1.2 + vs.voice * 2), 0, 7); cx.stroke(); } cx.globalAlpha = 1; }
  });
  if (B.cfg.fps) { cx.fillStyle = cols.dim; cx.font = "10px monospace"; cx.textAlign = "left"; cx.fillText(vs.fps + " fps · tier " + tier + " · " + dpr.toFixed(1) + "x", 8, H - 8); }
  if (tier === 0 || reduce) { still = setTimeout(() => { still = 0; need(); }, 250); return; }
  raf = requestAnimationFrame(frame);
}
// the governor: if frames get slow, drop a tier; if they've been easy for a while, climb back
function govern(now) {
  const want = tierWanted();
  if (B.cfg.quality !== "auto") { if (tier !== want) setTier(want); return; }
  if (ema > 26) { slow++; fast = 0; } else if (ema < 11) { fast++; slow = 0; } else { slow = 0; fast = 0; }
  if (slow > 90 && tier > 1) { setTier(tier - 1); slow = 0; ema = 16; } else if (fast > 600 && tier < want) { setTier(tier + 1); fast = 0; }
  if (tier > want) setTier(want);
}
function tierWanted() { const q = B.cfg.quality, cap = saver() ? 1 : 3; return Math.min(cap, q === "high" ? 3 : q === "med" ? 2 : q === "low" ? 1 : q === "off" ? 0 : 3); }
let bat = null; if (navigator.getBattery) navigator.getBattery().then((b) => { bat = b; }).catch(() => {});
const saver = () => B.cfg.saver === "on" || (B.cfg.saver === "auto" && bat && bat.level < .2 && !bat.charging) || (navigator.connection && navigator.connection.saveData);
B.saverOn = saver;
function setTier(n) { if (n === tier) return; tier = vs.tier = n; size(); }
function need() { if (!raf && visible && !still) raf = requestAnimationFrame(frame); }
addEventListener("resize", () => { size(); });
document.addEventListener("visibilitychange", () => { visible = document.visibilityState === "visible"; last = performance.now(); need(); });
B.Void = {
  start() { restyle(); tier = vs.tier = tierWanted(); size(); need(); },
  restyle, need, size,
  launch(p, color) { packets.push({ from: "me", t0: performance.now(), dur: 1100, color: color || cols.me }); need(); },
  arrive(color) { const t = performance.now(); packets.push({ from: "her", t0: t, dur: 1100, color: color || cols.her }); rings.push({ at: "me", t0: t + 1000, dur: 900, color: color || cols.her }); need(); },
  delivered() { rings.push({ at: "her", t0: performance.now(), dur: 900, color: cols.me }); need(); },
  burst(at, color) { rings.push({ at, t0: performance.now(), dur: 1000, color: color || cols.me }); need(); },
  local(x, y, down) { const L = vs.local; L.x = x; L.y = y; L.down = down; L.at = performance.now(); need(); },
  remote(x, y, down) { const R = vs.remote; R.x = x; R.y = y; R.down = down; R.at = performance.now(); if (down && !R.was) { B.hap(18); B.snd("touch"); } R.was = down; need(); },
  voice(l) { vs.voice = Math.max(vs.voice, l); },
};
})();
