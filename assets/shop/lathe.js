/* The Shop · lathe simulator. Runs a turning program written for a FANUC 0i-T style control before it runs in steel.
   X is a diameter, Z runs along the spindle (Z0 at the face, negative toward the chuck). Understood: G0 G1 G2 G3 (R or
   I/K, I as a radius), G28, G50 S (max rpm), G96/G97, G98/G99, G71 roughing and G70 finishing (FANUC two-block format),
   U/W incremental moves, T, M3/M4/M5, M8/M9, M30. It cuts a stock bar as it goes and stops the way a machine would on
   the mistakes that scrap parts: a rapid into material, feeding with the spindle stopped, no feed rate, the chuck. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const SAMPLES = {
  pin: `%
O1001 (TURNED PIN, 25 MM BAR)
G21 G40 G99
G28 U0. W0.
T0101 (OD ROUGH 80 DEG)
G50 S2500
G96 S180 M03
G00 X27. Z0. M08
G01 X-1.6 F0.15 (FACE)
G00 Z2.
X26.
G71 U1.5 R0.5
G71 P100 Q200 U0.4 W0.1 F0.25
N100 G00 X8.
G01 Z0. F0.12
X10. Z-1.
Z-12.
G02 X16. Z-15. R3.
G01 X20.
X22. Z-16.
Z-32.
N200 X26.
G70 P100 Q200
G00 X60. Z60. M09
M05
M30
%`,
  groove: `%
O2002 (SHAFT WITH A GROOVE)
G21 G99
T0101
G97 S1400 M03
G00 X32. Z2.
G01 Z0. F0.2
X-1.6 F0.15
G00 X29. Z2.
G01 Z-38. F0.25
G00 X31. Z2.
X26.
G01 Z-38.
G00 X28. Z2.
X24.
G01 Z-20.
X26. Z-21.
G00 X40. Z40.
T0303 (GROOVE 3 MM)
G97 S800 M03
G00 X28. Z-10.
G01 X19. F0.05
G04 X0.5
G00 X28.
G00 X60. Z60.
M05
M30
%`,
  crash: `%
O3003 (THE CRASH: FIND THE MISTAKE)
G21 G99
T0101
G97 S1500 M03
G00 X30. Z2.
G01 Z0. F0.2
X-1.6 F0.15
G00 Z2.
G00 X20. Z-15. (RAPID STRAIGHT INTO THE BAR)
G01 X18. F0.2
G00 X60. Z60.
M30
%`,
};

// ── reading the program ──
function parse(src) {
  return src.split("\n").map((raw, i) => {
    const code = raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").toUpperCase().trim();
    const words = { G: [], M: [] }; let m; const re = /([A-Z])\s*([-+]?\d*\.?\d+)/g;
    if (!code || /^%/.test(code) || /^O\d+/.test(code)) return { i, raw, words: null };
    while ((m = re.exec(code))) { const k = m[1], v = parseFloat(m[2]); if (k === "G" || k === "M") words[k].push(Math.round(v * 10) / 10); else words[k] = v; }
    return { i, raw, words };
  });
}

// ── running it into a list of moves ──
function run(blocks, stock) {
  const S = { x: stock.d + 60, z: 60, mot: 0, perRev: true, css: false, s: 0, max: 3000, spin: 0, f: null, t: "—", cool: false, end: false };
  const moves = [], msgs = [], warn = (line, text, cls) => msgs.push({ line, text, cls: cls || "w" });
  const home = { x: stock.d + 60, z: 60 };
  const rpmAt = (x) => (S.css ? Math.min(S.max, (1000 * S.s) / (Math.PI * Math.max(Math.abs(x), 1))) : S.s);
  const push = (type, x, z, line, extra) => { moves.push({ type, x0: S.x, z0: S.z, x1: x, z1: z, line, f: S.f, perRev: S.perRev, rpm: rpmAt((S.x + x) / 2), spin: S.spin, ...extra }); S.x = x; S.z = z; };
  const arc = (dir, x1, z1, w, line) => { // in (z, r) with r = x/2; dir 2 = G2 (clockwise with +X up, +Z right)
    const r0 = S.x / 2, r1 = x1 / 2, z0 = S.z; let cz, cr;
    if (w.R != null) { const R = Math.abs(w.R), dz = z1 - z0, dr = r1 - r0, c = Math.hypot(dz, dr); if (c < 1e-9 || c > 2 * R + 1e-6) { warn(line, "Arc radius R" + w.R + " can't span that chord", "e"); return push("feed", x1, z1, line); }
      const h = Math.sqrt(Math.max(0, R * R - (c / 2) ** 2)), mz = (z0 + z1) / 2, mr = (r0 + r1) / 2, nz = -dr / c, nr = dz / c, s = (dir === 2 ? -1 : 1) * (w.R < 0 ? -1 : 1); cz = mz + s * nz * h; cr = mr + s * nr * h; }
    else { cz = z0 + (w.K || 0); cr = r0 + (w.I || 0); }
    let a0 = Math.atan2(r0 - cr, z0 - cz), a1 = Math.atan2(r1 - cr, z1 - cz); const R = Math.hypot(r0 - cr, z0 - cz);
    if (dir === 2) { while (a1 > a0) a1 -= 2 * Math.PI; } else { while (a1 < a0) a1 += 2 * Math.PI; }
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 60)));
    for (let k = 1; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; push("feed", 2 * (cr + R * Math.sin(a)), cz + R * Math.cos(a), line, { arc: true }); }
  };
  const target = (w) => ({ x: w.X != null ? w.X : w.U != null ? S.x + w.U : S.x, z: w.Z != null ? w.Z : w.W != null ? S.z + w.W : S.z });
  const motion = (w, line, mot) => {
    if (w.X == null && w.Z == null && w.U == null && w.W == null) return;
    const t = target(w);
    if (mot === 0) return push("rapid", t.x, t.z, line);
    if (S.f == null) warn(line, "Feed move with no F word: the control would alarm (PS0011)", "e");
    if (mot === 1) return push("feed", t.x, t.z, line);
    return arc(mot, t.x, t.z, w, line);
  };
  const findN = (n) => blocks.findIndex((b) => b.words && b.words.N === n);
  const profile = (p, q) => { // the finished contour, as points (x diameter, z), from the start point
    const a = findN(p), b = findN(q); if (a < 0 || b < 0 || b < a) return null;
    const save = { ...S }, startLen = moves.length, pts = [{ x: S.x, z: S.z }]; let mot = S.mot;
    for (let k = a; k <= b; k++) { const w = blocks[k].words; if (!w) continue; for (const g of w.G) if ([0, 1, 2, 3].includes(g)) mot = g; if (w.F != null) S.f = w.F; motion(w, k, mot); }
    const got = moves.splice(startLen); got.forEach((m) => pts.push({ x: m.x1, z: m.z1 })); Object.assign(S, { x: save.x, z: save.z, f: save.f }); return { pts, a, b };
  };
  let g71 = null;
  for (let k = 0; k < blocks.length && !S.end; k++) {
    const b = blocks[k], w = b.words; if (!w) continue;
    for (const g of w.G) {
      if ([0, 1, 2, 3].includes(g)) S.mot = g;
      if (g === 96) S.css = true; if (g === 97) S.css = false; if (g === 98) S.perRev = false; if (g === 99) S.perRev = true;
      if (g === 50 && w.S != null) S.max = w.S;
    }
    if (w.F != null) S.f = w.F;
    if (w.S != null && !w.G.includes(50)) S.s = w.S;
    if (w.T != null) { S.t = "T" + String(Math.floor(w.T)).padStart(4, "0"); moves.push({ type: "tool", line: k, t: S.t, x0: S.x, z0: S.z, x1: S.x, z1: S.z }); }
    for (const mm of w.M) { if (mm === 3 || mm === 4) S.spin = mm === 3 ? 1 : -1; if (mm === 5) S.spin = 0; if (mm === 8) S.cool = true; if (mm === 9) S.cool = false; if (mm === 30 || mm === 2) S.end = true; }
    if (w.G.includes(28)) { push("rapid", home.x, home.z, k); continue; }
    if (w.G.includes(4)) { moves.push({ type: "dwell", line: k, sec: w.X || w.P / 1000 || 0, x0: S.x, z0: S.z, x1: S.x, z1: S.z }); continue; }
    if (w.G.includes(71)) {
      if (w.P == null) { g71 = { d: w.U || 1, e: w.R || 0.5 }; continue; }
      const pr = profile(w.P, w.Q); if (!pr) { warn(k, "G71 can't find blocks N" + w.P + " to N" + w.Q, "e"); continue; }
      const d = (g71 || { d: 1 }).d, e = (g71 || { e: 0.5 }).e, du = w.U || 0, dw = w.W || 0, F = w.F != null ? w.F : S.f, x0 = S.x, z0 = S.z;
      // the contour offset by the finishing allowance; rough passes step down in radius by d until they reach it
      const off = pr.pts.map((p) => ({ x: p.x + du, z: p.z + dw })), rmin = Math.min(...off.map((p) => p.x)) / 2;
      const zAt = (r) => { for (let i = 1; i < off.length; i++) { const a = off[i - 1], c = off[i]; const ra = a.x / 2, rc = c.x / 2; if (rc >= r && ra < r && c.z !== a.z) return a.z + ((r - ra) / (rc - ra)) * (c.z - a.z); if (rc >= r && ra >= r && i === 1) return a.z; } return off[off.length - 1].z; };
      S.f = F; let r = x0 / 2 - d, passes = 0;
      while (r > rmin + 1e-6 && passes < 200) { const zEnd = zAt(r); push("rapid", 2 * r, z0, k); push("feed", 2 * r, zEnd, k, { rough: true }); push("feed", 2 * (r + e), zEnd + e, k); push("rapid", 2 * (r + e), z0, k); r -= d; passes++; }
      // a semi-finish pass along the offset contour leaves exactly the allowance
      push("rapid", off[0].x, z0, k); off.slice(1).forEach((p) => push("feed", p.x, p.z, k, { rough: true })); push("rapid", x0, z0, k);
      msgs.push({ line: k, text: "G71: " + passes + " roughing passes at " + d + " mm a side, leaving U" + du + " W" + dw, cls: "ok" });
      k = pr.b; continue;
    }
    if (w.G.includes(70)) { const pr = profile(w.P, w.Q); if (!pr) { warn(k, "G70 can't find N" + w.P + " to N" + w.Q, "e"); continue; } const x0 = S.x, z0 = S.z; pr.pts.slice(1).forEach((p) => push("feed", p.x, p.z, k, { finish: true })); push("rapid", x0, z0, k); continue; }
    if (w.G.includes(50)) continue;
    motion(w, k, S.mot);
  }
  if (!S.end) warn(blocks.length - 1, "No M30 at the end: the program never finishes the cycle");
  return { moves, msgs };
}

// ── the bar, and the checks a machine would stop on ──
function cutAll(moves, stock) {
  const BIN = 0.1, z0 = -stock.l - 2, n = Math.ceil((stock.l + 4) / BIN), R0 = stock.d / 2, mat = new Float32Array(n);
  for (let i = 0; i < n; i++) { const z = z0 + i * BIN; mat[i] = z <= 1e-6 && z >= -stock.l ? R0 : 0; } // the bar ends at the face, Z0
  const idx = (z) => Math.round((z - z0) / BIN);
  const events = [];
  for (let m = 0; m < moves.length; m++) {
    const mv = moves[m]; mv.snap = null; if (mv.type !== "rapid" && mv.type !== "feed") continue;
    const len = Math.hypot((mv.x1 - mv.x0) / 2, mv.z1 - mv.z0), steps = Math.max(1, Math.ceil(len / 0.05));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, r = Math.abs((mv.x0 + (mv.x1 - mv.x0) * t) / 2), z = mv.z0 + (mv.z1 - mv.z0) * t, i = idx(z);
      if (z < -stock.l + 0.2 && r < R0 + 6 && r > R0 - 4) { events.push({ m, text: "Crash: the tool reached the chuck jaws at Z" + z.toFixed(2), cls: "e" }); return { mat, events, stopAt: m }; }
      if (i < 0 || i >= n || r >= mat[i] - 0.01) continue;
      if (mv.type === "rapid") { events.push({ m, text: "Crash: rapid (G00) into material at X" + (2 * r).toFixed(2) + " Z" + z.toFixed(2), cls: "e" }); return { mat, events, stopAt: m }; }
      if (!mv.spin) { events.push({ m, text: "Spindle stopped while cutting: tool breaks", cls: "e" }); return { mat, events, stopAt: m }; }
      mat[i] = r;
    }
  }
  return { mat, events, stopAt: moves.length };
}
function timeOf(mv) {
  if (mv.type === "dwell") return mv.sec || 0;
  const len = Math.hypot((mv.x1 - mv.x0) / 2, mv.z1 - mv.z0);
  if (mv.type === "rapid") return len / (10000 / 60); // 10 m/min rapid
  if (mv.type !== "feed" || !mv.f) return 0;
  const perMin = mv.perRev ? mv.f * Math.max(mv.rpm || 0, 1) : mv.f; return len / (perMin / 60);
}

// ── drawing ──
const cv = $("cv"), cx = cv.getContext("2d"); let view = null;
function fit() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; cx.setTransform(d, 0, 0, d, 0, 0); view = { w: r.width, h: r.height }; }
function draw(sim, upto, tool) {
  if (!view) fit(); const { w, h } = view, st = sim.stock, zmin = -st.l - 18, zmax = 12, rmax = st.d / 2 + 14;
  const sc = Math.min((w - 40) / (zmax - zmin), (h - 40) / (2 * rmax)), ox = 20 - zmin * sc, oy = h / 2;
  const P = (z, r) => [ox + z * sc, oy - r * sc];
  cx.clearRect(0, 0, w, h);
  cx.strokeStyle = "rgba(232,235,239,.12)"; cx.setLineDash([8, 6]); cx.beginPath(); cx.moveTo(0, oy); cx.lineTo(w, oy); cx.stroke(); cx.setLineDash([]);
  // chuck jaws
  cx.fillStyle = "#2a2f36"; for (const sgn of [1, -1]) { const [a, b] = P(-st.l - 16, sgn * (st.d / 2 + 9)), [c, d2] = P(-st.l, sgn * (st.d / 2 - 1)); cx.fillRect(a, Math.min(b, d2), c - a, Math.abs(d2 - b)); }
  // the bar as cut so far
  const mat = sim.matAt(upto), z0 = -st.l - 2, BIN = 0.1, g = cx.createLinearGradient(0, oy - st.d / 2 * sc, 0, oy + st.d / 2 * sc);
  g.addColorStop(0, "#5d6772"); g.addColorStop(0.35, "#c5ced8"); g.addColorStop(0.5, "#e8eef4"); g.addColorStop(0.65, "#aeb8c3"); g.addColorStop(1, "#4b545e");
  cx.fillStyle = g; cx.beginPath(); let started = false;
  for (let i = 0; i < mat.length; i++) { const r = mat[i]; if (r <= 0) continue; const [x, y] = P(z0 + i * BIN, r); if (!started) { cx.moveTo(x, oy); started = true; } cx.lineTo(x, y); }
  for (let i = mat.length - 1; i >= 0; i--) { const r = mat[i]; if (r <= 0) continue; const [x, y] = P(z0 + i * BIN, -r); cx.lineTo(x, y); }
  cx.closePath(); cx.fill();
  // the path so far
  for (let m = 0; m < Math.min(upto, sim.moves.length); m++) { const mv = sim.moves[m]; if (mv.type !== "rapid" && mv.type !== "feed") continue; const [a, b] = P(mv.z0, mv.x0 / 2), [c, d] = P(mv.z1, mv.x1 / 2);
    cx.strokeStyle = mv.type === "rapid" ? "rgba(255,90,74,.75)" : mv.finish ? "#a5f3ff" : "rgba(79,195,247,.9)"; cx.lineWidth = mv.type === "rapid" ? 1 : 1.6; cx.setLineDash(mv.type === "rapid" ? [5, 4] : []); cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.stroke(); }
  cx.setLineDash([]);
  // the insert
  if (tool) { const [x, y] = P(tool.z, tool.x / 2); cx.fillStyle = "#ffcf4a"; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 9, y - 9); cx.lineTo(x + 3, y - 20); cx.lineTo(x - 6, y - 11); cx.closePath(); cx.fill(); cx.fillStyle = "#3a3f46"; cx.fillRect(x - 2, y - 46, 12, 28); }
  // labels
  cx.fillStyle = "rgba(232,235,239,.4)"; cx.font = "11px ui-monospace,monospace"; const [zx] = P(0, 0); cx.fillText("Z0", zx - 8, h - 8); cx.fillText("chuck", P(-st.l - 16, 0)[0], h - 8);
}

// ── the simulation and controls ──
const sim = { moves: [], msgs: [], stock: null, snaps: [], stopAt: 0, at: 0, t: 0, running: false, total: 0 };
function build() {
  const stock = { d: Math.max(2, +$("sd").value || 25), l: Math.max(2, +$("sl").value || 45) };
  const blocks = parse($("code").value), r = run(blocks, stock), cut = cutAll(r.moves, stock);
  // snapshots of the bar after each move are recomputed lazily: keep the final cut and re-cut on demand
  Object.assign(sim, { moves: r.moves, msgs: r.msgs.concat(cut.events.map((e) => ({ line: r.moves[e.m] && r.moves[e.m].line, text: e.text, cls: e.cls }))), stock, stopAt: cut.stopAt, at: 0, t: 0, total: r.moves.slice(0, cut.stopAt).reduce((a, m) => a + timeOf(m), 0), blocks });
  sim.matCache = new Map(); sim.matAt = (upto) => { if (sim.matCache.has(upto)) return sim.matCache.get(upto); const c = cutAll(sim.moves.slice(0, upto), sim.stock).mat; sim.matCache.clear(); sim.matCache.set(upto, c); return c; };
  msgs(); dro(); draw(sim, 0, sim.moves[0] ? { x: sim.moves[0].x0, z: sim.moves[0].z0 } : null);
}
function msgs(extra) {
  const lines = sim.msgs.map((m) => '<p class="' + m.cls + '">' + (m.line != null ? "L" + (m.line + 1) + " · " : "") + m.text + "</p>");
  const feed = sim.moves.filter((m) => m.type === "feed").reduce((a, m) => a + Math.hypot((m.x1 - m.x0) / 2, m.z1 - m.z0), 0);
  $("msgs").innerHTML = (extra || "") + lines.join("") + '<p>Estimated cycle time <b>' + fmtT(sim.total) + "</b> · cutting path " + feed.toFixed(0) + " mm · " + sim.moves.filter((m) => m.type === "tool").length + " tool call(s)</p>";
}
const fmtT = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
function dro(mv, x, z) {
  mv = mv || sim.moves[Math.max(0, sim.at - 1)] || {}; const t = sim.moves.slice(0, sim.at).filter((m) => m.type === "tool").pop();
  $("dro").innerHTML = "<span>X</span><b>" + (x != null ? x : mv.x1 != null ? mv.x1 : 0).toFixed(3) + "</b><span>Z</span><b>" + (z != null ? z : mv.z1 != null ? mv.z1 : 0).toFixed(3) + "</b><span>F</span><b>" + (mv.f != null ? mv.f : "—") + "</b><span>S</span><b>" + (mv.rpm ? Math.round(mv.rpm) : "—") + "</b><span>T</span><b>" + (t ? t.t : "—") + "</b><span>⏱</span><b>" + fmtT(sim.t) + "</b>";
  const ln = mv.line; $("gut").innerHTML = $("code").value.split("\n").map((_, i) => '<span class="' + (i === ln ? "cur" : "") + '">' + (i + 1) + "</span>").join("\n");
}
let raf = 0, last = 0, segT = 0;
function play() {
  if (sim.running) return pause();
  if (sim.at >= sim.stopAt) { build(); }
  sim.running = true; $("run").textContent = "❚❚ Feed hold"; $("run").classList.add("running"); last = performance.now(); segT = 0; raf = requestAnimationFrame(tick);
}
function pause() { sim.running = false; cancelAnimationFrame(raf); $("run").textContent = "▶ Cycle start"; $("run").classList.remove("running"); }
function tick(now) {
  const ov = +$("ov").value, dt = Math.min(0.05, (now - last) / 1000) * ov * 6; last = now;
  let budget = dt;
  while (budget > 0 && sim.at < sim.stopAt) { const mv = sim.moves[sim.at], need = Math.max(0.0001, timeOf(mv)); if (segT + budget >= need) { budget -= need - segT; sim.t += need - segT; segT = 0; sim.at++; } else { segT += budget; sim.t += budget; budget = 0; } }
  const mv = sim.moves[sim.at], k = mv ? Math.min(1, segT / Math.max(0.0001, timeOf(mv))) : 1, tip = mv ? { x: mv.x0 + (mv.x1 - mv.x0) * k, z: mv.z0 + (mv.z1 - mv.z0) * k } : (sim.moves[sim.at - 1] ? { x: sim.moves[sim.at - 1].x1, z: sim.moves[sim.at - 1].z1 } : null);
  draw(sim, sim.at, tip); dro(mv, tip && tip.x, tip && tip.z);
  if (sim.at >= sim.stopAt) { pause(); const crash = sim.stopAt < sim.moves.length; msgs(crash ? '<p class="e">⛔ STOPPED: ' + (sim.msgs.find((m) => /Crash|Spindle/.test(m.text)) || { text: "alarm" }).text + "</p>" : '<p class="ok">✓ Cycle complete in ' + fmtT(sim.total) + "</p>"); return; }
  raf = requestAnimationFrame(tick);
}
function step() { pause(); if (sim.at >= sim.stopAt) build(); const line = sim.moves[sim.at] && sim.moves[sim.at].line; while (sim.at < sim.stopAt && sim.moves[sim.at].line === line) { sim.t += timeOf(sim.moves[sim.at]); sim.at++; } const mv = sim.moves[sim.at - 1]; draw(sim, sim.at, mv ? { x: mv.x1, z: mv.z1 } : null); dro(mv); }
$("run").addEventListener("click", play); $("step").addEventListener("click", step); $("reset").addEventListener("click", () => { pause(); build(); });
$("ov").addEventListener("input", () => ($("ovv").textContent = Math.round($("ov").value * 100) + "%"));
$("sample").addEventListener("change", () => { $("code").value = SAMPLES[$("sample").value]; pause(); build(); });
let edit = 0; $("code").addEventListener("input", () => { clearTimeout(edit); edit = setTimeout(() => { pause(); build(); }, 400); });
$("code").addEventListener("scroll", () => ($("gut").scrollTop = $("code").scrollTop));
["sd", "sl"].forEach((id) => $(id).addEventListener("change", () => { pause(); build(); }));
new ResizeObserver(() => { fit(); const mv = sim.moves[Math.max(0, sim.at - 1)]; draw(sim, sim.at, mv ? { x: mv.x1, z: mv.z1 } : null); }).observe(cv);
$("code").value = SAMPLES.pin; build();
window.Lathe = { sim, build, play, step, parse, run };
})();
