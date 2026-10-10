// Hive · visuals: the drifting neural field behind everything, the core on the empty Studio (one node per provider,
// orbiting), and the live hive map of a swarm (agents on rings around the mission, lit by what they're doing).
// Everything pauses when the tab is hidden and holds still for people who prefer reduced motion.
(() => {
"use strict";
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#22e4ff";
const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
const fit = (c) => { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); } return d; };
const hex = (x, y, r) => { const p = new Path2D(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k - Math.PI / 2; p[k ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a)); } p.closePath(); return p; };
let loops = new Set(); const tick = (t) => { if (!document.hidden) loops.forEach((f) => f(t)); requestAnimationFrame(tick); }; requestAnimationFrame(tick);

// ── the field ──
const F = document.getElementById("field");
if (F) {
  const g = F.getContext("2d"), pts = []; let W = 0, H = 0, D = 1;
  const seed = () => { D = fit(F); W = F.width; H = F.height; const n = Math.round(Math.min(90, (W * H) / (D * D) / 16000)); pts.length = 0; for (let i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .12 * D, vy: (Math.random() - .5) * .12 * D, c: Math.random() < .7 ? 0 : 1 }); };
  const draw = () => {
    g.clearRect(0, 0, W, H); const cy = css("--cy"), vi = css("--vi"), R = 150 * D;
    for (const p of pts) { if (!still) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; } }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < R) { g.strokeStyle = rgba(a.c ? vi : cy, (1 - d / R) * .16); g.lineWidth = D * .8; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
    for (const p of pts) { g.fillStyle = rgba(p.c ? vi : cy, .55); g.beginPath(); g.arc(p.x, p.y, 1.3 * D, 0, 7); g.fill(); }
  };
  seed(); addEventListener("resize", () => { seed(); draw(); });
  if (still) draw(); else { let last = 0; loops.add((t) => { if (t - last > 33) { last = t; draw(); } }); }
}

// ── the core: providers orbiting the hive ──
let coreState = null;
function core(c, groups) {
  coreState = { c, groups: (groups || []).slice(0, 14) }; if (core.on) { if (still) core.draw(0); return; } core.on = true;
  const g = c.getContext("2d");
  const draw = (t) => {
    const s = coreState; if (!s || !s.c.isConnected || !s.c.offsetParent) return; const D = fit(s.c), W = s.c.width, H = s.c.height, cx = W / 2, cy0 = H / 2, cy = css("--cy"), vi = css("--vi"), hn = css("--hn"), ink = css("--ink");
    g.clearRect(0, 0, W, H); const time = still ? 0 : t / 1000;
    for (const [k, r] of [[0, .22], [1, .34], [2, .45]]) { g.strokeStyle = rgba(k === 1 ? vi : cy, .18); g.setLineDash([3 * D, 6 * D]); g.lineDashOffset = -time * 8 * (k + 1); g.lineWidth = D; g.beginPath(); g.arc(cx, cy0, W * r, 0, 7); g.stroke(); }
    g.setLineDash([]);
    const n = Math.max(3, s.groups.length), pos = [];
    s.groups.forEach((gr, i) => { const ring = [.22, .34, .45][i % 3], a = (i / n) * Math.PI * 2 + time * (.25 - (i % 3) * .07); pos.push([cx + Math.cos(a) * W * ring, cy0 + Math.sin(a) * W * ring, gr]); });
    for (const [x, y] of pos) { const grd = g.createLinearGradient(cx, cy0, x, y); grd.addColorStop(0, rgba(cy, .5)); grd.addColorStop(1, rgba(vi, .05)); g.strokeStyle = grd; g.lineWidth = D; g.beginPath(); g.moveTo(cx, cy0); g.lineTo(x, y); g.stroke(); }
    const pulse = 1 + (still ? 0 : Math.sin(time * 2) * .06);
    g.shadowColor = cy; g.shadowBlur = 30 * D; g.fillStyle = rgba(cy, .9); g.fill(hex(cx, cy0, W * .075 * pulse)); g.shadowBlur = 0;
    g.strokeStyle = rgba(ink, .5); g.lineWidth = 1.2 * D; g.stroke(hex(cx, cy0, W * .11));
    pos.forEach(([x, y, gr], i) => { const col = gr.free ? hn : i % 2 ? vi : cy; g.shadowColor = col; g.shadowBlur = 14 * D; g.fillStyle = rgba(col, .9); g.fill(hex(x, y, (6 + Math.min(10, Math.log2(gr.n + 1) * 2)) * D)); g.shadowBlur = 0;
      g.fillStyle = rgba(ink, .7); g.font = 10 * D + "px JetBrains Mono, monospace"; g.textAlign = "center"; g.fillText(gr.label.slice(0, 16), x, y + 22 * D); });
  };
  core.draw = draw; if (still) draw(0); else loops.add(draw);
}

// ── the hive map ──
let mapState = null;
function map(c, data) {
  mapState = { c, data }; if (map.on) { if (still) map.draw(0); return; } map.on = true; const g = c.getContext("2d");
  const draw = (t) => {
    const s = mapState; if (!s || !s.c.isConnected || !s.c.offsetParent) return; const D = fit(s.c), W = s.c.width, H = s.c.height, cx = W / 2, cyy = H / 2, time = still ? 0 : t / 1000;
    const C = { working: css("--cy"), reviewing: css("--vi"), idle: css("--mute"), offline: css("--bad"), retired: css("--line2") }, ink = css("--ink"), hn = css("--hn");
    g.clearRect(0, 0, W, H); const ags = (s.data && s.data.agents) || [], tasks = (s.data && s.data.tasks) || [], done = tasks.filter((x) => x.status === "done").length;
    const rings = [.2, .31, .42], per = [8, 14, 999]; let idx = 0; const pos = [];
    for (let r = 0; r < 3 && idx < ags.length; r++) { const cnt = Math.min(per[r], ags.length - idx); for (let k = 0; k < cnt; k++, idx++) { const a = (k / cnt) * Math.PI * 2 + time * (r % 2 ? -.05 : .07) + r; pos.push([cx + Math.cos(a) * W * rings[r], cyy + Math.sin(a) * W * rings[r], ags[idx]]); } }
    for (const r of rings) { g.strokeStyle = rgba(C.idle, .25); g.lineWidth = D; g.setLineDash([2 * D, 6 * D]); g.beginPath(); g.arc(cx, cyy, W * r, 0, 7); g.stroke(); } g.setLineDash([]);
    for (const [x, y, a] of pos) if (a.status === "working" || a.status === "reviewing") { const col = C[a.status]; g.strokeStyle = rgba(col, .55); g.lineWidth = 1.4 * D; g.setLineDash([4 * D, 5 * D]); g.lineDashOffset = -time * 30; g.beginPath(); g.moveTo(x, y); g.lineTo(cx, cyy); g.stroke(); g.setLineDash([]); }
    // the mission core: progress ring + hexagon
    const frac = tasks.length ? done / tasks.length : 0; g.strokeStyle = rgba(C.idle, .3); g.lineWidth = 4 * D; g.beginPath(); g.arc(cx, cyy, W * .11, 0, 7); g.stroke();
    g.strokeStyle = C.working; g.shadowColor = C.working; g.shadowBlur = 12 * D; g.beginPath(); g.arc(cx, cyy, W * .11, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = rgba(hn, .9); g.fill(hex(cx, cyy, W * .055 * (1 + (still ? 0 : Math.sin(time * 2.4) * .05))));
    g.fillStyle = ink; g.font = "600 " + 12 * D + "px JetBrains Mono, monospace"; g.textAlign = "center"; g.fillText(done + "/" + tasks.length, cx, cyy + W * .11 + 18 * D);
    for (const [x, y, a] of pos) { const col = C[a.status] || C.idle, busy = a.status === "working" || a.status === "reviewing", r = (busy ? 7 : 5) * D * (busy && !still ? 1 + Math.sin(time * 5 + x) * .15 : 1);
      g.shadowColor = col; g.shadowBlur = busy ? 16 * D : 0; g.fillStyle = rgba(col, a.status === "retired" ? .35 : .95); g.fill(hex(x, y, r)); g.shadowBlur = 0;
      if (a.score > 2) { g.strokeStyle = rgba(hn, .8); g.lineWidth = D; g.stroke(hex(x, y, r + 3 * D)); } }
  };
  map.draw = draw; if (still) draw(0); else loops.add(draw);
}
window.HiveFX = { core, map };
})();
