// Genesis · drawings. Genesis is a geode: one stone, many crystals. Every mind it can reach is a crystal growing in from the wall of
// the cavity, coloured by its mineral (each family of models has one: Claude copper, GPT malachite, Gemini azurite, Llama
// citrine, Qwen jasper, DeepSeek lapis, Mistral rhodochrosite, Grok hematite, Kimi peridot, the Mentifaber agent selenite);
// the wall is banded like agate, and it gains a band as sessions pile up. The same stone is the mark in the crown, the
// picture on an empty Studio, the swarm's cavity (its agents are the crystals) and the voice link (it listens and speaks).
// No glow, no particles; everything holds still on a hidden tab and for people who prefer less motion.
(() => {
"use strict";
const rm = matchMedia("(prefers-reduced-motion: reduce)").matches, still = () => rm || document.body.classList.contains("still");
const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const fit = (c) => { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); } return d; };
const rgba = (col, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(col); if (!m) return col; const n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };

// ── minerals ──
const MIN = [[/mentifaber-agent|^agent\|/i, "selenite"], [/claude|anthropic/i, "copper"], [/gpt|openai|chatgpt|\bo[134](-|\b)/i, "malachite"], [/gemini|gemma|google/i, "azurite"],
  [/llama|meta\b|meta-/i, "citrine"], [/qwen|qwq/i, "jasper"], [/deepseek/i, "lapis"], [/mistral|mixtral|codestral|magistral|devstral|ministral/i, "rhodo"], [/grok|xai/i, "hematite"],
  [/kimi|moonshot/i, "peridot"], [/hermes|nous|granite|sea-lion|command|cohere|phi-|nemotron|glm|minimax|aya/i, "tiger"]];
const mineralName = (id) => { const s = String(id || ""); for (const [r, n] of MIN) if (r.test(s)) return n; return "flint"; };
const mineral = (id) => "var(--m-" + mineralName(id) + ")";
const hex = (name) => css("--m-" + name, "#b9c3c9");

// ── the stone ──
function rng(seed) { let h = 2166136261 >>> 0; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = (h + 0x6d2b79f5) | 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a pebble outline: rounder above, flatter where it rests, with a slow irregular wobble (the same rule as the typeface)
function pebble(cx, cy, R, ph, wob, n) {
  const pts = []; n = n || 96;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = R * (1 + wob * (Math.sin(a * 2 + ph[0]) * .5 + Math.sin(a * 3 + ph[1]) * .32 + Math.sin(a * 5 + ph[2]) * .18));
    const c = Math.cos(a), s = Math.sin(a), e = 2 / (s > 0 ? 3.1 : 2.2); pts.push([cx + rr * Math.sign(c) * Math.abs(c) ** e, cy + rr * Math.sign(s) * Math.abs(s) ** e]); }
  return pts;
}
const radAt = (pts, cx, cy, a) => { let best = pts[0], bd = 9; for (const p of pts) { let d = Math.abs(Math.atan2(p[1] - cy, p[0] - cx) - a); d = Math.min(d, Math.PI * 2 - d); if (d < bd) { bd = d; best = p; } } return Math.hypot(best[0] - cx, best[1] - cy); };
// a quartz crystal seen side on: parallel sides from its root in the wall, then a pointed termination
function crystal(cx, cy, a, rc, w, L) {
  const ux = -Math.cos(a), uy = -Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a), bx = cx + Math.cos(a) * rc, by = cy + Math.sin(a) * rc, sh = L * .62;
  const P = (du, dv) => [bx + ux * du + vx * dv, by + uy * du + vy * dv];
  return { left: [P(0, -w), P(sh, -w * .92), P(L, 0), P(0, 0)], right: [P(0, 0), P(L, 0), P(sh, w * .92), P(0, w)] };
}
const path = (pts) => "M" + pts.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") + "Z";
// crystals: one per mind, grouped by mineral so families grow together, the way real geodes zone
function crystalsFor(minds, max) {
  const by = {}; for (const m of minds || []) { const k = mineralName(m.id || m.group || m.name); by[k] = (by[k] || 0) + 1; }
  let kinds = Object.entries(by).sort((a, b) => b[1] - a[1]); if (!kinds.length) kinds = [["flint", 6]];
  const total = kinds.reduce((t, k) => t + k[1], 0), N = Math.max(6, Math.min(max, total)), out = [];
  for (const [k, n] of kinds) { const c = Math.max(1, Math.round((n / total) * N)); for (let i = 0; i < c; i++) out.push(k); }
  return out.slice(0, max);
}
// the whole geode as SVG, in a 200×200 box
function geodeSVG(o) {
  o = o || {}; const r = rng(o.seed || "hive"), ph = () => [r() * 6.28, r() * 6.28, r() * 6.28], cx = 100, cy = 100, bands = Math.max(2, Math.min(9, o.bands || 4));
  const off0 = r() * 6.28, mark = !!o.mark, rind = pebble(cx, cy, 95, ph(), .045), cav = pebble(cx, cy, mark ? 58 : 60, ph(), .07);
  let s = "<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>";
  s += "<path d='" + path(rind) + "' style='fill:color-mix(in srgb,var(--ink) 30%,var(--bg))'/>";
  // agate bands between the rind and the cavity: alternating stone, one of them carrying the colour of the mind in use
  const nb = mark ? 2 : bands, bstep = (91 - (mark ? 64 : 66)) / nb, tint = Math.floor(r() * nb);
  for (let j = 0; j < nb; j++) {
    const R = 91 - j * bstep, pts = pebble(cx, cy, R, ph(), .05 + r() * .02), mix = j === tint && !mark ? "color-mix(in srgb,var(--m) 34%,var(--bg))" : "color-mix(in srgb,var(--ink) " + (j % 2 ? 9 : 19) + "%,var(--bg))";
    s += "<path d='" + path(pts) + "' style='fill:" + mix + "'/>";
  }
  s += "<path d='" + path(cav) + "' style='fill:color-mix(in srgb,var(--m) 16%,color-mix(in srgb,var(--ink) 14%,var(--bg)))'/>";
  // druzy: the cavity is a bed of short, stout crystals, each tilted its own way, three layers deep, so it reads as a mineral
  // crust and not as a ring of spikes. One crystal per mind (grouped by mineral), the rest repeat the same minerals.
  const ks = crystalsFor(o.minds, mark ? 14 : 36), N = ks.length, f = (p) => p[0].toFixed(2) + " " + p[1].toFixed(2), poly = (pts) => "M" + pts.map(f).join("L") + "Z";
  let cr = "";
  const one = (k, a, rc, w, L, tilt) => { const c = crystal(cx, cy, a + tilt, rc, w, L), col = "var(--m-" + k + ")", b = [cx + Math.cos(a) * rc, cy + Math.sin(a) * rc];
    return "<g class='cx' style='transform-origin:" + b[0].toFixed(1) + "px " + b[1].toFixed(1) + "px;animation-delay:-" + (r() * 8).toFixed(2) + "s'><path d='" + poly(c.left) + "' style='fill:" + col + "'/><path d='" + poly(c.right) + "' style='fill:color-mix(in srgb," + col + " 58%,#000)'/></g>"; };
  const layers = mark ? 2 : 3;
  for (let ly = 0; ly < layers; ly++) for (let i = 0; i < N; i++) {
    const a = off0 + ((i + ly * .37) / N) * Math.PI * 2 + (r() - .5) * .16, k = ks[(i * 5 + ly * 7) % N], rc = radAt(cav, cx, cy, a) - ly * (mark ? 4 : 7) + 3, rw = rc * Math.PI / N;
    cr += one(k, a, rc, rw * (.55 + r() * .35), rc * (.16 + r() * .16 + (layers - 1 - ly) * .035), (r() - .5) * 1.1);
  }
  s += cr + "</svg>";
  return s;
}
function geode(el, o) { if (el) el.innerHTML = geodeSVG(o); }

// ── a shared animation clock ──
const loops = new Set(); const tick = (t) => { if (!document.hidden) loops.forEach((f) => f(t)); requestAnimationFrame(tick); }; requestAnimationFrame(tick);

// ── the swarm's constellation: each agent a node in its model's metal on a gold ring, joined to its neighbours by filament;
// working ones glow and send sparks to the centre, reviewers wear a ring, idle ones dim, offline ones hollow ──
let mapState = null;
function map(c, data) {
  mapState = { c, data }; if (map.on) { if (still()) map.draw(0); return; } map.on = true; const g = c.getContext("2d");
  const draw = (t) => {
    const s = mapState; if (!s || !s.c.isConnected || !s.c.offsetParent) return; const D = fit(s.c), W = s.c.width, H = s.c.height, cx = W / 2, cy = H / 2, time = still() ? 0 : t / 1000;
    const ink = css("--ink", "#e9ebe5"), faint = css("--faint", "#5f6864"), line2 = css("--line2", "#313a3d"), bad = css("--bad", "#ec5f4f"), az = hex("azurite"), bg = css("--bg", "#0d1012");
    g.clearRect(0, 0, W, H);
    const ags = (s.data && s.data.agents) || [], tasks = (s.data && s.data.tasks) || [], done = tasks.filter((x) => x.status === "done").length, R = Math.min(W, H) * .44;
    // the constellation: two faint orbits, every agent a node on the outer one, joined to its neighbours by filament
    const fil = css("--fil", "#d9a441"), hot = css("--fil-hi", "#ffd27a"), N = Math.max(ags.length, 1), rot = time * .04;
    g.lineWidth = D; for (const [rr, sq, tl] of [[R * .98, .36, -.3], [R * .9, .3, .6]]) { g.strokeStyle = rgba(fil, .22); g.beginPath(); g.ellipse(cx, cy, rr, rr * sq, tl + rot, 0, 7); g.stroke(); }
    g.strokeStyle = rgba(fil, .35); g.beginPath(); g.arc(cx, cy, R * .78, 0, 7); g.stroke();
    const at = ags.map((a, i) => { const ang = -Math.PI / 2 + (i / N) * Math.PI * 2 + rot * .5; return [cx + Math.cos(ang) * R * .78, cy + Math.sin(ang) * R * .78]; });
    if (at.length > 1) { g.strokeStyle = rgba(fil, .5); g.lineWidth = 1.1 * D; g.beginPath(); at.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke(); }
    ags.forEach((a, i) => {
      const [x, y] = at[i], col = hex(mineralName(a.model || a.name)), busy = a.status === "working" || a.status === "reviewing", off = a.status === "offline", gone = a.status === "retired";
      // working: sparks run down the filament to the centre
      if (a.status === "working") { g.strokeStyle = rgba(hot, .35); g.lineWidth = D; g.beginPath(); g.moveTo(x, y); g.lineTo(cx, cy); g.stroke();
        const k = still() ? .5 : (time * .9 + i * .37) % 1, sx = x + (cx - x) * k, sy = y + (cy - y) * k, gr = g.createRadialGradient(sx, sy, 0, sx, sy, 9 * D);
        gr.addColorStop(0, rgba(hot, .95)); gr.addColorStop(1, rgba(hot, 0)); g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, 9 * D, 0, 7); g.fill(); }
      const r = (busy ? 7.5 + (still() ? 0 : Math.sin(time * 3 + i) * 1.2) : 5.5) * D;
      if (!off && !gone) { const gr = g.createRadialGradient(x, y, 0, x, y, r * 4); gr.addColorStop(0, rgba(col, busy ? .55 : .25)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 4, 0, 7); g.fill(); }
      g.globalAlpha = gone ? .3 : 1; g.fillStyle = off ? bg : col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      if (off) { g.strokeStyle = bad; g.lineWidth = 1.4 * D; g.stroke(); }
      if (a.status === "reviewing") { g.strokeStyle = az; g.lineWidth = 1.6 * D; g.beginPath(); g.arc(x, y, r + 5 * D, 0, 7); g.stroke(); }
      g.globalAlpha = 1;
    });
    // the centre: how far the mission is, as a closing ring and a count in Genesis's own letters
    const frac = tasks.length ? done / tasks.length : 0, RR = R * .2;
    g.strokeStyle = line2; g.lineWidth = 3 * D; g.beginPath(); g.arc(cx, cy, RR, 0, 7); g.stroke();
    g.strokeStyle = css("--fil-hi", "#ffd27a"); g.beginPath(); g.arc(cx, cy, RR, -Math.PI / 2, -Math.PI / 2 + Math.max(.001, frac) * Math.PI * 2); g.stroke();
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "300 " + 19 * D + "px 'Hive Strata', system-ui, sans-serif"; g.fillText(done + "/" + tasks.length, cx, cy);
    g.fillStyle = faint; g.font = "400 " + 10 * D + "px 'Hive Strata', system-ui, sans-serif"; g.fillText("tasks", cx, cy + 15 * D); g.textBaseline = "alphabetic";
  };
  map.draw = draw; if (still()) draw(0); else loops.add(draw);
}

// ── the voice link's orbits: the emblem's gold rings around the hollow, each carrying lit nodes. At rest they turn slowly; while
// it listens they tighten with your voice; while it thinks the nodes race; while it speaks the rings breathe with the sound ──
function orbits(g, cx, cy, s, time, mode, sm, glow, D) {
  const speed = mode === "think" ? 1.6 : mode === "talk" ? .55 + sm : mode === "listen" ? .35 + sm * .8 : .18;
  const rings = [[1.0, .38, -.32, 5], [.9, .3, .55, 4], [.8, .46, 1.35, 3], [.68, .24, -1.1, 3]];
  g.save(); g.lineCap = "round";
  rings.forEach(([r, sq, tilt, n], k) => {
    const R = s * r * (1 + (mode === "talk" ? sm * .05 : 0) - (mode === "listen" ? sm * .04 : 0)), ry = R * sq, rot = tilt + time * .05 * (k % 2 ? -1 : 1);
    g.strokeStyle = "rgba(233,183,90," + (.38 + glow * .4).toFixed(3) + ")"; g.lineWidth = (2.2 - k * .3) * D;
    g.beginPath(); g.ellipse(cx, cy, R, ry, rot, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "rgba(255,226,160," + (.12 + glow * .25).toFixed(3) + ")"; g.lineWidth = (6 - k) * D; g.beginPath(); g.ellipse(cx, cy, R, ry, rot, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < n; i++) { const a = time * speed * (1 + k * .2) * (k % 2 ? -1 : 1) + (i / n) * Math.PI * 2 + k, x = Math.cos(a) * R, y = Math.sin(a) * ry,
        px = cx + x * Math.cos(rot) - y * Math.sin(rot), py = cy + x * Math.sin(rot) + y * Math.cos(rot), rr = (2.6 + glow * 2.2) * D;
      const gr = g.createRadialGradient(px, py, 0, px, py, rr * 5); gr.addColorStop(0, "rgba(255,214,140," + (.55 + glow * .4).toFixed(3) + ")"); gr.addColorStop(1, "rgba(255,214,140,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, rr * 5, 0, 7); g.fill(); g.fillStyle = "#fff1cc"; g.beginPath(); g.arc(px, py, rr, 0, 7); g.fill(); }
  });
  g.restore();
}

// ── the voice link: the orbits above, round a hollow that is the voice: it glows with yours while it listens, a light runs
// round while it thinks, and the hollow flares with the sound while it speaks ──
const voice = { raf: 0, start(c, read) {
  voice.stop();
  let sm = 0, glow = 0; const t0 = performance.now(), waves = []; let lastWave = 0;
  const draw = (t) => {
    voice.raf = requestAnimationFrame(draw); if (document.hidden) return; const st = read(); if (!st) return;
    const D = fit(c), W = c.width, H = c.height, cx = W / 2, cy = H * .36, R = Math.min(W * .4, H * .25), time = still() ? 0 : (t - t0) / 1000;
    const col = st.color || "#d6a647", gold = "#e9b75a", mode = st.mode;
    sm += ((st.level || 0) - sm) * .22; g.clearRect(0, 0, W, H);
    const want = mode === "idle" ? .18 : mode === "listen" ? .35 + sm * .65 : mode === "think" ? .45 + .15 * Math.sin(time * 3) : .5 + sm * .5;
    glow += (want - glow) * .12;
    const s = R * (1 + (mode === "talk" ? sm * .025 : 0)), hx = cx, hy = cy + s * .02, hr = s * .35;
    // the halo the ring sits in
    let gr = g.createRadialGradient(cx, cy, s * .8, cx, cy, s * 1.5); gr.addColorStop(0, rgba(gold, .1 + glow * .14)); gr.addColorStop(1, rgba(gold, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // the hollow: dark at rest, a gold fire when it speaks
    gr = g.createRadialGradient(hx, hy + hr * .35, 0, hx, hy, hr * 1.15);
    gr.addColorStop(0, rgba("#ffd98a", .15 + glow * .75)); gr.addColorStop(.45, rgba(gold, .08 + glow * .4)); gr.addColorStop(.8, rgba(col, glow * .18)); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = "#000"; g.beginPath(); g.arc(hx, hy, hr * 1.1, 0, Math.PI * 2); g.fill(); g.fillStyle = gr; g.fill();
    // listening: your voice sends rings in from the stones to the centre
    if (mode === "listen" && !still() && sm > .08 && time - lastWave > .22 - sm * .12) { waves.push({ t: time, a: Math.min(1, sm * 1.4) }); lastWave = time; }
    g.lineWidth = 1.5 * D;
    for (let i = waves.length - 1; i >= 0; i--) { const w = waves[i], k = (time - w.t) / 1.1; if (k >= 1 || mode !== "listen") { waves.splice(i, 1); continue; }
      g.strokeStyle = rgba("#ffe2a0", w.a * (1 - k) * .8); g.beginPath(); g.arc(hx, hy, hr * (1 - k * .85), 0, Math.PI * 2); g.stroke(); }
    // the ring itself
    orbits(g, cx, cy, s, time, mode, sm, glow, D);
    // light on the stones: a sweep round the ring while it thinks, a flare with the sound while it speaks
    g.save(); g.globalCompositeOperation = "lighter"; g.beginPath(); g.arc(cx, cy, s * .9, 0, Math.PI * 2); g.arc(hx, hy, hr, 0, Math.PI * 2, true); g.clip("evenodd");
    if (mode === "think") { const a = time * 2.4; for (let k = 0; k < 2; k++) { const aa = a + k * Math.PI;
        gr = g.createRadialGradient(cx + Math.cos(aa) * s * .62, cy + Math.sin(aa) * s * .62, 0, cx + Math.cos(aa) * s * .62, cy + Math.sin(aa) * s * .62, s * .42);
        gr.addColorStop(0, "rgba(255,240,210,.32)"); gr.addColorStop(1, "rgba(255,240,210,0)"); g.fillStyle = gr; g.fillRect(cx - s, cy - s, s * 2, s * 2); } }
    else if (mode === "talk" || mode === "listen") { gr = g.createRadialGradient(hx, hy, hr, hx, hy, s * .9); gr.addColorStop(0, rgba("#ffd98a", sm * (mode === "talk" ? .45 : .22))); gr.addColorStop(1, "rgba(255,217,138,0)"); g.fillStyle = gr; g.fillRect(cx - s, cy - s, s * 2, s * 2); }
    else { g.globalCompositeOperation = "source-over"; g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(cx - s, cy - s, s * 2, s * 2); }
    g.restore();
  };
  const g = c.getContext("2d");
  voice.raf = requestAnimationFrame(draw);
}, stop() { cancelAnimationFrame(voice.raf); } };

window.HiveFX = { geode, geodeSVG, map, voice, mineral, mineralName, hex, pebble, rng, crystal };
})();
