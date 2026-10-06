// Barycenter · the Void: the canvas the top of the app floats on.
// Two stars orbit the point between them. How far apart they sit is how long it has been since you last spoke; when you are
// both here at once they fall into a tight, fast orbit (Kepler: closer means quicker). Words travel between them as light.
//
// Built to be cheap: the canvas covers only the part of the screen you can see it through (the page behind is plain CSS), the
// starfield is painted once into three offscreen layers and moved with the tilt (three blits a frame, not two hundred fills),
// idle frames run at 30 fps and only touch, voice, packets and effects ask for 60, and it stops completely while a sheet is open.
(() => {
"use strict";
const cv = B.$("void"), cx = cv.getContext("2d", { alpha: true, desynchronized: true });
const vs = (B.vs = { seenAt: 0, present: false, gap: 0, capsules: 0, flight: false, typing: 0, voice: 0, names: { me: "you", her: "" }, mood: "", local: { x: .5, y: .5, down: 0, at: 0 }, remote: { x: .5, y: .5, down: 0, at: 0 }, tier: 3, fps: 60, hero: null, contact: 0, ms: 0 });
let W = 0, H = 0, dpr = 1, raf = 0, last = 0, visible = true, paused = false, tier = 3, ema = 16, slow = 0, fast = 0, frames = 0, fpsT = 0, ang = 0, d = 0, layers = [], twink = [], cols = {}, still = 0, sk = 0, shoot = null, cost = 0, costN = 0;
const reduce = () => document.documentElement.dataset.motion === "reduced";
const TIER = { 0: { dpr: 1, tw: 0, parts: 0, n: 0 }, 1: { dpr: 1, tw: 0, parts: 40, n: 60 }, 2: { dpr: 1.5, tw: 8, parts: 120, n: 110 }, 3: { dpr: 2, tw: 16, parts: 260, n: 170 } };
const sprites = new Map();
function sprite(color, r) { const k = color + r; let s = sprites.get(k); if (s) return s; s = document.createElement("canvas"); s.width = s.height = r * 2; const g = s.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, color); gr.addColorStop(.18, color + "cc"); gr.addColorStop(.45, color + "44"); gr.addColorStop(1, color + "00"); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); sprites.set(k, s); if (sprites.size > 60) sprites.delete(sprites.keys().next().value); return s; }
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function restyle() { const p = B.palette(); cols = { me: p.me, her: p.her, bg: css("--bg") || "#05060f", faint: css("--faint") || "#667", dim: css("--dim") || "#99a", light: p.t.mode === "light", neb: p.t.neb }; sprites.clear(); paintBackdrop(); layout(); need(); }
// the page behind the canvas is a few static gradients: no per-frame cost at all
function paintBackdrop() { const n = cols.neb || []; document.body.style.background = "radial-gradient(70% 45% at 18% 8%," + n[0] + (cols.light ? "88" : "aa") + ",transparent 70%),radial-gradient(60% 40% at 88% 22%," + n[1] + (cols.light ? "88" : "99") + ",transparent 70%),radial-gradient(90% 50% at 50% 100%," + n[2] + (cols.light ? "66" : "77") + ",transparent 70%)," + cols.bg; }
function layout() {
  const T = TIER[tier]; dpr = Math.min(devicePixelRatio || 1, T.dpr); W = innerWidth; const hr = vs.hero; H = hr ? Math.min(innerHeight, Math.ceil(hr.y + hr.h + 24)) : innerHeight;
  cv.style.width = W + "px"; cv.style.height = H + "px"; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  // three static star layers (far, mid, near), each a little larger than the screen so the tilt can slide them
  layers = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (T.n) for (let l = 0; l < 3; l++) { const c = document.createElement("canvas"); c.width = Math.round((W + 60) * dpr); c.height = Math.round((H + 60) * dpr); const g = c.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = cols.light ? "#5a6a99" : "#dfe5ff"; const n = Math.round(T.n * [.5, .3, .2][l]); for (let i = 0; i < n; i++) { g.globalAlpha = (cols.light ? .22 : .35) + rnd() * .5; const r = (.4 + rnd() * .9) * (1 + l * .45); g.fillRect(rnd() * (W + 60), rnd() * (H + 60), r, r); } layers.push(c); }
  twink = Array.from({ length: T.tw }, () => ({ x: rnd() * W, y: rnd() * H, r: 6 + rnd() * 8, p: rnd() * 6.28, s: .4 + rnd() }));
}
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// particles in typed arrays: no allocation per frame
const NP = 260, px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP), pl = new Float32Array(NP), pc = new Array(NP); let pn = 0;
function spawn(x, y, color, n, speed, life) { const cap = TIER[tier].parts; for (let i = 0; i < n && pn < Math.min(NP, cap); i++) { const a = Math.random() * 6.283, v = speed * (.3 + Math.random()); px[pn] = x; py[pn] = y; pvx[pn] = Math.cos(a) * v; pvy[pn] = Math.sin(a) * v; pl[pn] = life * (.6 + Math.random() * .4); pc[pn] = color; pn++; } }
const packets = [], rings = [];
const heroR = () => vs.hero || { x: 0, y: 0, w: W, h: Math.min(H * .38, 320) };
function geom(t) {
  const R = heroR(), cxx = R.x + R.w / 2, cyy = R.y + R.h * .52, lock = vs.present && visible ? 1 : 0, gapH = vs.gap ? (Date.now() - vs.gap) / 36e5 : 36;
  const target = Math.min(R.w * .72, W * .8) * (lock ? .16 : .2 + .5 * smooth(gapH / 36)); d += (target - d) * .05; if (!d) d = target;
  ang += (reduce() ? 0 : 16 / Math.max(60, d)) * (lock ? 2.2 : 1) * .012;
  const a = ang + Math.sin(t * .0002) * .25, ox = Math.cos(a) * d / 2, oy = Math.sin(a) * d / 2 * .55 + Math.sin(t * .0007) * 2;
  return { c: [cxx, cyy], me: [cxx - ox, cyy - oy], her: [cxx + ox, cyy + oy], R };
}
function star(x, y, color, b, r, label, extra) {
  const pulse = .9 + .1 * Math.sin(performance.now() * .003 + x), R = r * (.75 + .5 * b) * pulse, S = sprite(color, 64);
  cx.globalAlpha = (.4 + .6 * b); cx.drawImage(S, x - R * 4.2, y - R * 4.2, R * 8.4, R * 8.4);
  cx.globalAlpha = .55 + .45 * b; cx.strokeStyle = cols.light ? color : "#fff"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(x - R * 2, y); cx.lineTo(x + R * 2, y); cx.moveTo(x, y - R * 2); cx.lineTo(x, y + R * 2); cx.stroke();
  cx.fillStyle = cols.light ? color : "#fff"; cx.beginPath(); cx.arc(x, y, R * .36, 0, 7); cx.fill();
  cx.globalAlpha = .85; cx.fillStyle = cols.dim; cx.font = "10px 'JetBrains Mono',monospace"; cx.textAlign = "center"; cx.fillText(label, x, y + R * 3.4); cx.globalAlpha = 1;
  if (extra) extra(x, y, R);
}
const busy = () => packets.length || rings.length || pn || vs.local.down || vs.remote.down || vs.voice > .04 || (vs.typing && performance.now() - vs.typing < 4500) || vs.flight || vs.contact;
function frame(now) {
  raf = 0; if (!visible || paused) return;
  const dt = now - last, hot = busy(), T = TIER[tier];
  if (!hot && dt < 31 && !reduce()) { raf = requestAnimationFrame(frame); return; } // idle: 30 fps is plenty for a slow orbit
  if (tier <= 1 && dt < 31 && !reduce()) { raf = requestAnimationFrame(frame); return; }
  last = now; if (dt > 0 && dt < 250) { ema += (dt - ema) * .08; frames++; }
  if (now - fpsT > 1000) { vs.fps = Math.round(frames * 1000 / (now - fpsT)); vs.ms = costN ? +(cost / costN).toFixed(2) : 0; cost = costN = 0; frames = 0; fpsT = now; }
  govern(); const t0 = performance.now();
  const t = now, tl = B.cfg.tilt && !reduce() ? B.tilt : { x: 0, y: 0 };
  B.tilt.x += (B.tilt.tx - B.tilt.x) * .08; B.tilt.y += (B.tilt.ty - B.tilt.y) * .08;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.globalCompositeOperation = "source-over"; cx.globalAlpha = 1; cx.clearRect(0, 0, W, H);
  for (let i = 0; i < layers.length; i++) cx.drawImage(layers[i], -30 - tl.x * (i + 1) * 7, -30 - tl.y * (i + 1) * 7, W + 60, H + 60);
  for (const s of twink) { cx.globalAlpha = (cols.light ? .35 : .9) * (.35 + .65 * (.5 + .5 * Math.sin(t * .0012 * s.s + s.p))); cx.drawImage(sprite(cols.light ? "#6a7ab0" : "#ffffff", 8), s.x - tl.x * 10 - s.r, s.y - tl.y * 10 - s.r, s.r * 2, s.r * 2); }
  cx.globalAlpha = 1;
  if (!reduce() && T.tw && !shoot && Math.random() < .0007) shoot = { x: Math.random() * W, y: Math.random() * H * .4, t0: t }; if (shoot) { const k = (t - shoot.t0) / 700; if (k > 1) shoot = null; else { cx.strokeStyle = cols.light ? "#6a7ab0" : "#fff"; cx.globalAlpha = (1 - k) * .8; cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(shoot.x + k * 160, shoot.y + k * 70); cx.lineTo(shoot.x + k * 160 - 40, shoot.y + k * 70 - 17); cx.stroke(); cx.globalAlpha = 1; } }
  const G = geom(t), me = cols.me, her = cols.her, seen = vs.seenAt ? Date.now() - vs.seenAt : Infinity, bh = vs.present ? 1 : seen < 120e3 ? 1 : seen < 36e5 ? .8 : seen < 864e5 ? .55 : .32;
  cx.strokeStyle = cols.faint; cx.globalAlpha = .3; cx.lineWidth = 1; cx.setLineDash([2, 6]); cx.beginPath(); cx.ellipse(G.c[0], G.c[1], d / 2, d / 2 * .55, 0, 0, 7); cx.stroke(); cx.setLineDash([4, 5]); cx.beginPath(); cx.moveTo(G.me[0], G.me[1]); cx.lineTo(G.her[0], G.her[1]); cx.stroke(); cx.setLineDash([]);
  cx.globalAlpha = .6; cx.beginPath(); cx.moveTo(G.c[0] - 5, G.c[1]); cx.lineTo(G.c[0] + 5, G.c[1]); cx.moveTo(G.c[0], G.c[1] - 5); cx.lineTo(G.c[0], G.c[1] + 5); cx.stroke(); cx.globalAlpha = 1;
  if (!cols.light) cx.globalCompositeOperation = "lighter";
  for (let i = 0; i < Math.min(vs.capsules, 5); i++) { const a = t * .0009 + i * 1.3, x = G.c[0] + Math.cos(a) * 16, y = G.c[1] + Math.sin(a) * 7 - 14; cx.globalAlpha = .9; cx.drawImage(sprite(her, 16), x - 8, y - 8, 16, 16); }
  if (vs.flight && !reduce() && t - (frame.f || 0) > 1700) { packets.push({ from: "me", t0: t, dur: 1500, color: me }); frame.f = t; }
  for (let i = packets.length - 1; i >= 0; i--) { const m = packets[i], k = (t - m.t0) / m.dur; if (k > 1) { packets.splice(i, 1); continue; } if (k < 0) continue; const a = m.from === "me" ? G.me : G.her, b = m.from === "me" ? G.her : G.me, S = sprite(m.color, 24);
    for (let j = 0; j < (T.parts ? 7 : 2); j++) { const kk = Math.max(0, k - j * .018), x = a[0] + (b[0] - a[0]) * kk, y = a[1] + (b[1] - a[1]) * kk - Math.sin(kk * Math.PI) * 14, s = (1 - j / 7) * 14 + 4; cx.globalAlpha = (1 - j / 7) * .85; cx.drawImage(S, x - s, y - s, s * 2, s * 2); } }
  cx.globalCompositeOperation = "source-over";
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i], k = (t - r.t0) / r.dur; if (k > 1) { rings.splice(i, 1); continue; } if (k < 0) continue; const p = r.at === "me" ? G.me : r.at === "her" ? G.her : G.c; cx.strokeStyle = r.color; cx.globalAlpha = (1 - k) * .8; cx.lineWidth = 2; cx.beginPath(); cx.arc(p[0], p[1], 8 + k * (r.big ? 140 : 56), 0, 7); cx.stroke(); }
  cx.globalAlpha = 1;
  const L = vs.local, Rm = vs.remote, rem = Rm.down && now - Rm.at < 1500, loc = L.down;
  const lx = G.R.x + L.x * G.R.w, ly = G.R.y + L.y * G.R.h, rx = G.R.x + Rm.x * G.R.w, ry = G.R.y + Rm.y * G.R.h, touching = rem && loc;
  if (touching && !vs.contact) { vs.contact = now; rings.push({ at: "c", t0: now, dur: 1400, color: me, big: 1 }, { at: "c", t0: now + 160, dur: 1400, color: her, big: 1 }); spawn((lx + rx) / 2, (ly + ry) / 2, me, 40, .18, 1300); spawn((lx + rx) / 2, (ly + ry) / 2, her, 40, .18, 1300); B.snd("contact"); B.hap([40, 60, 40, 60, 90]); vs.onContact && vs.onContact(); }
  if (!touching) vs.contact = 0;
  if (loc && T.parts && now - (frame.sp || 0) > 40) { spawn(lx, ly, me, 2, .06, 700); frame.sp = now; }
  if (rem && T.parts && now - (frame.sr || 0) > 40) { spawn(rx, ry, her, 2, .06, 700); frame.sr = now; }
  if (!cols.light) cx.globalCompositeOperation = "lighter";
  for (let i = pn - 1; i >= 0; i--) { pl[i] -= dt; if (pl[i] <= 0) { pn--; px[i] = px[pn]; py[i] = py[pn]; pvx[i] = pvx[pn]; pvy[i] = pvy[pn]; pl[i] = pl[pn]; pc[i] = pc[pn]; continue; } px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pvx[i] *= .985; pvy[i] *= .985; const s = 2 + pl[i] * .006; cx.globalAlpha = Math.min(1, pl[i] / 500) * .8; cx.drawImage(sprite(pc[i], 12), px[i] - s, py[i] - s, s * 2, s * 2); }
  cx.globalCompositeOperation = "source-over"; cx.globalAlpha = 1;
  if (touching) { cx.strokeStyle = cols.light ? me : "#fff"; cx.globalAlpha = .5 + .3 * Math.sin(t * .02); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(rx, ry); cx.stroke(); cx.globalAlpha = 1; }
  if (loc) { cx.globalAlpha = .9; cx.drawImage(sprite(me, 32), lx - 36, ly - 36, 72, 72); cx.globalAlpha = 1; }
  if (rem) { cx.globalAlpha = .9; cx.drawImage(sprite(her, 32), rx - 36, ry - 36, 72, 72); cx.globalAlpha = 1; }
  vs.voice *= .9;
  star(G.me[0], G.me[1], me, 1, 9, vs.names.me, null);
  star(G.her[0], G.her[1], her, bh, 9, vs.names.her + (vs.mood ? " " + vs.mood : ""), (x, y, R) => {
    if (vs.typing && now - vs.typing < 4500) for (let i = 0; i < 3; i++) { const a = t * .006 + i * 2.1; cx.globalAlpha = .9; cx.fillStyle = her; cx.beginPath(); cx.arc(x + Math.cos(a) * R * 2.2, y + Math.sin(a) * R * 2.2, 2.2, 0, 7); cx.fill(); }
    if (vs.voice > .04) { cx.strokeStyle = her; cx.lineWidth = 2; for (let i = 0; i < 3; i++) { cx.globalAlpha = Math.max(0, vs.voice * (1 - i * .3)); cx.beginPath(); cx.arc(x, y, R * (2.2 + i * 1.2 + vs.voice * 2), 0, 7); cx.stroke(); } cx.globalAlpha = 1; }
  });
  if (B.cfg.fps) { cx.fillStyle = cols.dim; cx.font = "10px monospace"; cx.textAlign = "left"; cx.fillText(vs.fps + " fps · " + vs.ms + " ms · tier " + tier, 8, H - 8); }
  cost += performance.now() - t0; costN++;
  if (tier === 0 || reduce()) { still = setTimeout(() => { still = 0; need(); }, 250); return; }
  raf = requestAnimationFrame(frame);
}
// the governor: if frames get slow, drop a tier; if they have been easy for a while, climb back
function govern() {
  const want = tierWanted();
  if (B.cfg.quality !== "auto") { if (tier !== want) setTier(want); return; }
  if (ema > 26) { slow++; fast = 0; } else if (ema < 20) { fast++; slow = 0; } else { slow = 0; fast = 0; }
  if (slow > 60 && tier > 1) { setTier(tier - 1); slow = 0; ema = 16; } else if (fast > 900 && tier < want) { setTier(tier + 1); fast = 0; }
  if (tier > want) setTier(want);
}
function tierWanted() { const q = B.cfg.quality, cap = saver() ? 1 : 3; return Math.min(cap, q === "high" ? 3 : q === "med" ? 2 : q === "low" ? 1 : q === "off" ? 0 : 3); }
let bat = null; if (navigator.getBattery) navigator.getBattery().then((b) => { bat = b; }).catch(() => {});
const saver = () => B.cfg.saver === "on" || (B.cfg.saver === "auto" && bat && bat.level < .2 && !bat.charging) || (navigator.connection && navigator.connection.saveData);
B.saverOn = saver;
function setTier(n) { if (n === tier) return; tier = vs.tier = n; layout(); }
function need() { if (!raf && visible && !paused && !still) { last = performance.now() - 40; raf = requestAnimationFrame(frame); } }
addEventListener("resize", () => { layout(); need(); });
document.addEventListener("visibilitychange", () => { visible = document.visibilityState === "visible"; need(); });

// ── whole-screen effects (confetti, hearts, fireworks, slam): their own canvas, created for a moment and then gone ──
let fxc = null, fxg = null, fxp = [], fxraf = 0, fxl = 0;
function fxLoop(now) {
  const dt = Math.min(40, now - fxl); fxl = now; fxg.clearRect(0, 0, fxc.width, fxc.height); const w = fxc.width / (fxc.dpr || 1);
  for (let i = fxp.length - 1; i >= 0; i--) { const p = fxp[i]; p.life -= dt; if (p.life <= 0 || p.y > innerHeight + 30 || p.y < -60) { fxp.splice(i, 1); continue; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; fxg.globalAlpha = Math.min(1, p.life / 400); fxg.save(); fxg.translate(p.x, p.y); fxg.rotate(p.rot); fxg.fillStyle = p.c;
    if (p.k === "h") { const s = p.s; fxg.beginPath(); fxg.moveTo(0, s * .35); fxg.bezierCurveTo(-s, -s * .3, -s * .5, -s, 0, -s * .45); fxg.bezierCurveTo(s * .5, -s, s, -s * .3, 0, s * .35); fxg.fill(); } else if (p.k === "c") fxg.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); else { fxg.beginPath(); fxg.arc(0, 0, p.s / 2, 0, 7); fxg.fill(); } fxg.restore(); }
  if (fxp.length) fxraf = requestAnimationFrame(fxLoop); else { fxraf = 0; if (fxc) { fxc.remove(); fxc = null; } }
}
function fx(name, colors) {
  if (reduce()) return; const pal = colors && colors.length ? colors : [cols.me, cols.her, "#ffd36b", "#ff6b8a", "#9dff9d"], W2 = innerWidth, H2 = innerHeight, n = tier >= 3 ? 1 : .5;
  if (!fxc) { fxc = document.createElement("canvas"); fxc.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80"; fxc.width = W2; fxc.height = H2; fxc.dpr = 1; document.body.appendChild(fxc); fxg = fxc.getContext("2d"); }
  const add = (o) => fxp.push({ x: 0, y: 0, vx: 0, vy: 0, g: 0, s: 8, rot: 0, vr: 0, life: 2200, c: "#fff", k: "c", ...o }), R = Math.random;
  if (name === "confetti") for (let i = 0; i < 90 * n; i++) add({ x: R() * W2, y: -20 - R() * 200, vx: (R() - .5) * .25, vy: .08 + R() * .2, g: .0002, s: 6 + R() * 8, rot: R() * 6, vr: (R() - .5) * .02, c: pal[i % pal.length], life: 3200 });
  else if (name === "hearts") for (let i = 0; i < 40 * n; i++) add({ k: "h", x: R() * W2, y: H2 + 20 + R() * 100, vx: (R() - .5) * .08, vy: -.12 - R() * .2, g: -.00001, s: 10 + R() * 16, rot: (R() - .5) * .5, vr: (R() - .5) * .002, c: ["#ff6b8a", "#ff3d6e", "#ff9ab3"][i % 3], life: 3400 });
  else if (name === "fireworks") for (let b = 0; b < 4; b++) setTimeout(() => { const x = W2 * (.2 + R() * .6), y = H2 * (.2 + R() * .35), c = pal[b % pal.length]; for (let i = 0; i < 46 * n; i++) { const a = R() * 6.283, v = .1 + R() * .22; add({ k: "d", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .0003, s: 3 + R() * 3, c, life: 1400 }); } B.snd("pop"); }, b * 380);
  else if (name === "slam") { const a = B.$("app"); a.classList.remove("slam"); void a.offsetWidth; a.classList.add("slam"); B.hap([60, 30, 120]); for (let i = 0; i < 40 * n; i++) add({ k: "d", x: W2 / 2, y: H2 * .6, vx: (R() - .5) * .7, vy: -R() * .4, g: .0006, s: 4 + R() * 5, c: pal[i % pal.length], life: 1100 }); }
  else if (name === "echo") for (let i = 0; i < 3; i++) setTimeout(() => { for (let j = 0; j < 30 * n; j++) { const a = R() * 6.283, v = .05 + R() * .18; add({ k: "d", x: W2 / 2, y: H2 * .5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, s: 3 + R() * 3, c: pal[i % pal.length], life: 1200 }); } }, i * 250);
  B.snd("fx"); if (!fxraf) { fxl = performance.now(); fxraf = requestAnimationFrame(fxLoop); }
}
B.Void = {
  start() { restyle(); tier = vs.tier = tierWanted(); layout(); need(); },
  restyle, need, size() { layout(); need(); }, fx,
  pause(on) { paused = !!on; if (!on) need(); },
  launch(p, color) { packets.push({ from: "me", t0: performance.now(), dur: 1100, color: color || cols.me }); need(); },
  arrive(color) { const t = performance.now(); packets.push({ from: "her", t0: t, dur: 1100, color: color || cols.her }); rings.push({ at: "me", t0: t + 1000, dur: 900, color: color || cols.her }); need(); },
  delivered() { rings.push({ at: "her", t0: performance.now(), dur: 900, color: cols.me }); need(); },
  burst(at, color) { rings.push({ at, t0: performance.now(), dur: 1000, color: color || cols.me }); need(); },
  local(x, y, down) { const L = vs.local; L.x = x; L.y = y; L.down = down; L.at = performance.now(); need(); },
  remote(x, y, down) { const R = vs.remote; R.x = x; R.y = y; R.down = down; R.at = performance.now(); if (down && !R.was) { B.hap(18); B.snd("touch"); } R.was = down; need(); },
  voice(l) { vs.voice = Math.max(vs.voice, l); need(); },
};
})();
