// Hive · drawings. The empty Studio holds the waggle dance: a bee runs a figure-eight, waggling on the straight run, and
// the run swings round to point at one provider at a time (drawn as flowers in their pollen colours), the way a forager
// tells the hive where the food is. A swarm's map shows its agents as pollen around the mission, ringed in honey while
// they work. No glows, no particles. Everything pauses on a hidden tab and holds still for people who prefer less motion.
(() => {
"use strict";
const rm = matchMedia("(prefers-reduced-motion: reduce)").matches, still = () => rm || document.body.classList.contains("still");
const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
const fit = (c) => { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); } return d; };
// the same pollen as the Studio's answers, here by provider name
const POLLEN = [[/anthropic|claude/i, "#e8a06a"], [/openai|gpt/i, "#8ccf9d"], [/google|gemini|gemma/i, "#7fb2ea"], [/groq/i, "#d97bb5"], [/openrouter/i, "#b8a5f0"], [/mistral/i, "#c98bc2"], [/deepseek/i, "#7d93de"],
  [/xai|grok/i, "#a7b3bf"], [/llama|meta/i, "#e3c34a"], [/qwen/i, "#e0714f"], [/agent|mentifaber/i, "#f3e3b0"], [/workers|cloudflare/i, "#f2a516"]];
const pollen = (s) => { for (const [r, c] of POLLEN) if (r.test(String(s || ""))) return c; return "#d7a77c"; };
let loops = new Set(); const tick = (t) => { if (!document.hidden) loops.forEach((f) => f(t)); requestAnimationFrame(tick); }; requestAnimationFrame(tick);

// ── the waggle dance ──
// one cycle: the run (waggling), a loop back on the right, the run again, a loop back on the left
function dancer(p, L, u, n, wag) {
  const run = (q) => { const s = -L + 2 * L * q, w = Math.sin(q * Math.PI * 2 * 7) * wag; return [u[0] * s + n[0] * w, u[1] * s + n[1] * w]; };
  const loop = (q, side) => { const a = Math.PI * q; return [u[0] * L * Math.cos(a) + n[0] * L * Math.sin(a) * side * .9, u[1] * L * Math.cos(a) + n[1] * L * Math.sin(a) * side * .9]; };
  return p < .25 ? run(p / .25) : p < .5 ? loop((p - .25) / .25, 1) : p < .75 ? run((p - .5) / .25) : loop((p - .75) / .25, -1);
}
let coreState = null;
function core(c, groups) {
  coreState = { c, groups: (groups || []).slice(0, 12) }; if (core.on) { if (still()) core.draw(0); return; } core.on = true;
  const g = c.getContext("2d"), trail = []; let th = -Math.PI / 2, tgt = 0, lastSwitch = 0;
  const draw = (t) => {
    const s = coreState; if (!s || !s.c.isConnected || !s.c.offsetParent) return; const D = fit(s.c), W = s.c.width, H = s.c.height, cx = W / 2, cy = H / 2, time = still() ? 0 : t / 1000;
    const honey = css("--cy", "#f2a516"), ink = css("--ink", "#f3e8d4"), line = css("--line2", "rgba(255,226,180,.22)"), mute = css("--mute", "#76654f");
    g.clearRect(0, 0, W, H);
    // the flowers: one per provider, round the comb, bobbing a little
    const gs = s.groups.length ? s.groups : [{ label: "Workers AI", n: 1, free: true }], N = gs.length, R = W * .37;
    if (!still() && time - lastSwitch > 6.4) { lastSwitch = time; tgt = (tgt + 1) % N; }
    const fl = gs.map((gr, i) => { const a = -Math.PI / 2 + (i / N) * Math.PI * 2 + (N === 1 ? 0 : .35), bob = still() ? 0 : Math.sin(time * 1.3 + i) * 2 * D; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R + bob, a, gr]; });
    const want = fl[tgt % fl.length][2]; let dth = want - th; while (dth > Math.PI) dth -= Math.PI * 2; while (dth < -Math.PI) dth += Math.PI * 2; th += still() ? dth : dth * .025;
    fl.forEach(([x, y, , gr], i) => { const col = pollen(gr.label), r = (4.5 + Math.min(6, Math.log2((gr.n || 1) + 1) * 1.6)) * D, on = i === tgt % fl.length;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + time * .2; g.fillStyle = rgba(col, on ? .38 : .18); g.beginPath(); g.arc(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05, r * .72, 0, 7); g.fill(); } // petals
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r * .62, 0, 7); g.fill();
      const lab = String(gr.label || "").slice(0, 14); g.font = "500 " + 9.5 * D + "px 'Martian Mono', ui-monospace, monospace"; try { g.fontStretch = "condensed"; } catch (e) {}
      const below = y > cy; g.fillStyle = rgba(on ? ink : mute, on ? .95 : .9); g.textAlign = "center"; g.fillText(lab, Math.max(40 * D, Math.min(W - 40 * D, x)), Math.max(11 * D, Math.min(H - 4 * D, y + (below ? r * 2 + 10 * D : -r * 2 - 4 * D)))); });
    // the dance floor: the figure-eight, dashed
    const L = W * .2, u = [Math.cos(th), Math.sin(th)], n = [-u[1], u[0]];
    g.strokeStyle = line; g.lineWidth = D; g.setLineDash([2 * D, 4 * D]); g.beginPath();
    for (let k = 0; k <= 120; k++) { const [x, y] = dancer(k / 120, L, u, n, 0); k ? g.lineTo(cx + x, cy + y) : g.moveTo(cx + x, cy + y); } g.stroke(); g.setLineDash([]);
    // the line it points along, out to the flower it means
    const [fx, fy] = fl[tgt % fl.length]; g.strokeStyle = rgba(honey, .28); g.lineWidth = D; g.setLineDash([1 * D, 5 * D]); g.beginPath(); g.moveTo(cx + u[0] * L, cy + u[1] * L); g.lineTo(fx, fy); g.stroke(); g.setLineDash([]);
    // the bee and its trail
    const p = still() ? .12 : (time / 3.4) % 1, [bx, by] = dancer(p, L, u, n, 3.2 * D);
    trail.push([cx + bx, cy + by]); if (trail.length > 26) trail.shift();
    trail.forEach(([x, y], i) => { g.fillStyle = rgba(honey, (i / trail.length) * .35); g.beginPath(); g.arc(x, y, 1.6 * D, 0, 7); g.fill(); });
    const bxx = cx + bx, byy = cy + by, ang = Math.atan2(u[1], u[0]);
    g.save(); g.translate(bxx, byy); g.rotate(p < .25 || (p >= .5 && p < .75) ? ang : ang + Math.PI / 2);
    g.fillStyle = rgba(ink, .55); g.beginPath(); g.ellipse(-1 * D, -4.2 * D, 3.4 * D, 2 * D, -.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(-1 * D, 4.2 * D, 3.4 * D, 2 * D, .5, 0, 7); g.fill(); // wings
    g.fillStyle = honey; g.beginPath(); g.ellipse(0, 0, 6 * D, 3.8 * D, 0, 0, 7); g.fill();
    g.fillStyle = rgba(css("--bg", "#120d09"), .85); for (const x of [-1.6, 1.4]) g.fillRect((x - .6) * D, -3.6 * D, 1.3 * D, 7.2 * D); // stripes
    g.restore();
  };
  core.draw = draw; if (still()) draw(0); else loops.add(draw);
}

// ── the swarm's map ──
let mapState = null;
function map(c, data) {
  mapState = { c, data }; if (map.on) { if (still()) map.draw(0); return; } map.on = true; const g = c.getContext("2d");
  const draw = (t) => {
    const s = mapState; if (!s || !s.c.isConnected || !s.c.offsetParent) return; const D = fit(s.c), W = s.c.width, H = s.c.height, cx = W / 2, cy = H / 2, time = still() ? 0 : t / 1000;
    const honey = css("--cy", "#f2a516"), vi = css("--vi", "#9aa3e6"), bad = css("--bad", "#e0613f"), ink = css("--ink", "#f3e8d4"), mute = css("--mute", "#76654f");
    g.clearRect(0, 0, W, H); const ags = (s.data && s.data.agents) || [], tasks = (s.data && s.data.tasks) || [], done = tasks.filter((x) => x.status === "done").length;
    const rings = [.2, .31, .42], per = [8, 14, 999]; let idx = 0; const pos = [];
    for (let r = 0; r < 3 && idx < ags.length; r++) { const cnt = Math.min(per[r], ags.length - idx); for (let k = 0; k < cnt; k++, idx++) { const a = (k / cnt) * Math.PI * 2 + time * (r % 2 ? -.04 : .05) + r; pos.push([cx + Math.cos(a) * W * rings[r], cy + Math.sin(a) * W * rings[r], ags[idx]]); } }
    for (const r of rings) { g.strokeStyle = rgba(mute, .35); g.lineWidth = D; g.setLineDash([1.5 * D, 6 * D]); g.beginPath(); g.arc(cx, cy, W * r, 0, 7); g.stroke(); } g.setLineDash([]);
    for (const [x, y, a] of pos) if (a.status === "working" || a.status === "reviewing") { g.strokeStyle = rgba(a.status === "working" ? honey : vi, .5); g.lineWidth = 1.2 * D; g.setLineDash([3 * D, 5 * D]); g.lineDashOffset = -time * 26; g.beginPath(); g.moveTo(x, y); g.lineTo(cx, cy); g.stroke(); g.setLineDash([]); }
    // the mission: how far along, in honey, and the count in the reading face
    const frac = tasks.length ? done / tasks.length : 0, RR = W * .11;
    g.strokeStyle = rgba(mute, .35); g.lineWidth = 5 * D; g.beginPath(); g.arc(cx, cy, RR, 0, 7); g.stroke();
    g.strokeStyle = honey; g.lineCap = "round"; g.beginPath(); g.arc(cx, cy, RR, -Math.PI / 2, -Math.PI / 2 + Math.max(.001, frac) * Math.PI * 2); g.stroke(); g.lineCap = "butt";
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "600 " + 17 * D + "px Literata, Georgia, serif"; g.fillText(done + "/" + tasks.length, cx, cy); g.textBaseline = "alphabetic";
    for (const [x, y, a] of pos) {
      const col = pollen(a.model || a.name), busy = a.status === "working" || a.status === "reviewing", r = (busy ? 6.5 : 5) * D;
      g.globalAlpha = a.status === "retired" ? .3 : a.status === "offline" ? .5 : 1; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      if (busy) { g.strokeStyle = a.status === "working" ? honey : vi; g.lineWidth = 1.6 * D; g.beginPath(); g.arc(x, y, r + (3 + (still() ? 0 : Math.sin(time * 4 + x) * 1.2)) * D, 0, 7); g.stroke(); }
      if (a.status === "offline") { g.strokeStyle = bad; g.lineWidth = 1.4 * D; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.stroke(); }
      if (a.score > 2) { g.fillStyle = honey; g.beginPath(); g.arc(x + r, y - r, 2.2 * D, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
  };
  map.draw = draw; if (still()) draw(0); else loops.add(draw);
}
window.HiveFX = { core, map, pollen };
})();
