// Hive · drawings. Hive is a geode: one stone, many crystals. Every mind it can reach is a crystal growing in from the wall of
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

// ── the swarm's cavity: each agent a crystal in the wall, coloured by its model; working crystals lengthen and thread to
// the centre, reviewers are outlined, idle ones dim, offline ones hollow ──
let mapState = null;
function map(c, data) {
  mapState = { c, data }; if (map.on) { if (still()) map.draw(0); return; } map.on = true; const g = c.getContext("2d");
  const draw = (t) => {
    const s = mapState; if (!s || !s.c.isConnected || !s.c.offsetParent) return; const D = fit(s.c), W = s.c.width, H = s.c.height, cx = W / 2, cy = H / 2, time = still() ? 0 : t / 1000;
    const ink = css("--ink", "#e9ebe5"), faint = css("--faint", "#5f6864"), line2 = css("--line2", "#313a3d"), bad = css("--bad", "#ec5f4f"), az = hex("azurite"), bg = css("--bg", "#0d1012");
    g.clearRect(0, 0, W, H);
    const ags = (s.data && s.data.agents) || [], tasks = (s.data && s.data.tasks) || [], done = tasks.filter((x) => x.status === "done").length, R = Math.min(W, H) * .44;
    // the wall
    const wall = pebble(cx, cy, R, [1.1, 2.3, .7], .04, 120); g.beginPath(); wall.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    g.fillStyle = bg; g.fill(); g.strokeStyle = line2; g.lineWidth = 1.2 * D; g.stroke();
    const inner = pebble(cx, cy, R * .93, [2.1, .4, 1.9], .05, 120); g.beginPath(); inner.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.setLineDash([2 * D, 5 * D]); g.stroke(); g.setLineDash([]);
    const N = Math.max(ags.length, 1), hw = Math.min(.26, (Math.PI / N) * .8), fillPoly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
    ags.forEach((a, i) => {
      const ang = -Math.PI / 2 + (i / N) * Math.PI * 2, busy = a.status === "working" || a.status === "reviewing", col = hex(mineralName(a.model || a.name)), rc = radAt(inner, cx, cy, ang);
      const len = rc * (busy ? .42 + (still() ? 0 : Math.sin(time * 2.4 + i) * .04) : a.status === "offline" || a.status === "retired" ? .2 : .3);
      const b1 = [cx + Math.cos(ang - hw) * rc, cy + Math.sin(ang - hw) * rc], b2 = [cx + Math.cos(ang + hw) * rc, cy + Math.sin(ang + hw) * rc], tip = [cx + Math.cos(ang) * (rc - len), cy + Math.sin(ang) * (rc - len)], bm = [cx + Math.cos(ang) * rc, cy + Math.sin(ang) * rc];
      if (a.status === "working") { g.strokeStyle = rgba(ink, .35); g.lineWidth = D; g.setLineDash([3 * D, 5 * D]); g.lineDashOffset = -time * 24; g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(cx, cy); g.stroke(); g.setLineDash([]); }
      const alpha = a.status === "retired" ? .25 : busy ? 1 : .55;
      const cs = crystal(cx, cy, ang, rc, rc * Math.tan(hw) * .8, len);
      if (a.status === "offline") { g.globalAlpha = .9; g.strokeStyle = bad; g.lineWidth = 1.2 * D; g.beginPath(); [...cs.left.slice(0, 3), ...cs.right.slice(2)].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
      else { g.globalAlpha = alpha; g.fillStyle = col; fillPoly(cs.left); g.globalAlpha = alpha * .58; fillPoly(cs.right); }
      g.globalAlpha = 1;
      if (a.status === "reviewing") { g.strokeStyle = az; g.lineWidth = 1.6 * D; g.beginPath(); [...cs.left.slice(0, 3), ...cs.right.slice(2)].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
    });
    // the centre: how far the mission is, as a closing ring and a count in Hive's own letters
    const frac = tasks.length ? done / tasks.length : 0, RR = R * .2;
    g.strokeStyle = line2; g.lineWidth = 3 * D; g.beginPath(); g.arc(cx, cy, RR, 0, 7); g.stroke();
    g.strokeStyle = ink; g.beginPath(); g.arc(cx, cy, RR, -Math.PI / 2, -Math.PI / 2 + Math.max(.001, frac) * Math.PI * 2); g.stroke();
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "300 " + 19 * D + "px 'Hive Strata', system-ui, sans-serif"; g.fillText(done + "/" + tasks.length, cx, cy);
    g.fillStyle = faint; g.font = "400 " + 10 * D + "px 'Hive Strata', system-ui, sans-serif"; g.fillText("tasks", cx, cy + 15 * D); g.textBaseline = "alphabetic";
  };
  map.draw = draw; if (still()) draw(0); else loops.add(draw);
}

// ── the voice link: the geode listens (its bands ripple with your voice), thinks (its crystals grow in turn) and speaks
// (they lengthen with the sound) ──
const voice = { raf: 0, start(c, read) {
  voice.stop(); const g = c.getContext("2d"), seed = rng("voice"), ph = [seed() * 6, seed() * 6, seed() * 6]; let sm = 0; const t0 = performance.now();
  const draw = (t) => {
    voice.raf = requestAnimationFrame(draw); if (document.hidden) return; const st = read(); if (!st) return;
    const D = fit(c), W = c.width, H = c.height, cx = W / 2, cy = H * .4, R = Math.min(W * .34, H * .26), time = still() ? 0 : (t - t0) / 1000;
    const ink = css("--ink", "#e9ebe5"), bg = css("--bg", "#0d1012"), col = st.color || ink;
    sm += ((st.level || 0) - sm) * .22; g.clearRect(0, 0, W, H);
    // the bands: each a closed pebble line; listening, they ripple with the voice
    const nb = 7;
    for (let k = 0; k < nb; k++) {
      const rr = R * (1 - k * .055), amp = st.mode === "listen" ? R * .06 * sm * (1 - k / nb) : 0, pts = pebble(cx, cy, rr, [ph[0] + k * .3, ph[1], ph[2] + k * .2], .045, 140);
      g.beginPath(); pts.forEach((p, i) => { const a = (i / pts.length) * Math.PI * 2, w = Math.sin(a * (4 + k) + time * (2.2 - k * .2)) * amp, dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1, x = p[0] + (dx / d) * w, y = p[1] + (dy / d) * w; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = bg; g.fill(); g.fillStyle = k === 2 ? rgba(col, .26 + sm * .3) : rgba(ink, k % 2 ? .07 : .14); g.fill();
    }
    const cav = pebble(cx, cy, R * .6, ph, .07, 140); g.beginPath(); cav.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = bg; g.fill();
    // the crystals: short and stout, each tilted its own way, two layers deep; they lengthen when it thinks or speaks
    const N = 22;
    for (let ly = 0; ly < 2; ly++) for (let i = 0; i < N; i++) {
      const a = ((i + ly * .45) / N) * Math.PI * 2 + .2, rc = radAt(cav, cx, cy, a) + 2 - ly * 5 * D, tilt = Math.sin(i * 2.3 + ly) * .5, base = .13 + ((i * 7 + ly * 3) % 5) * .018 + (ly ? 0 : .03), w = rc * Math.PI / N * (.62 + ((i * 3) % 4) * .09);
      let grow = base; if (st.mode === "talk") grow = base + sm * .2 * (.6 + .4 * Math.sin(i * 1.7 + time * 6)); else if (st.mode === "think") { const p2 = ((time * 1.2 - i / N) % 1 + 1) % 1; grow = base + Math.max(0, Math.sin(p2 * Math.PI)) * .12; } else if (st.mode === "listen") grow = base + sm * .05;
      const cs = crystal(cx, cy, a + tilt, rc, w, rc * grow), fp = (pts) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
      g.fillStyle = col; g.globalAlpha = st.mode === "idle" ? .5 : .95; fp(cs.left); g.globalAlpha *= .58; fp(cs.right); g.globalAlpha = 1;
    }
  };
  voice.raf = requestAnimationFrame(draw);
}, stop() { cancelAnimationFrame(voice.raf); } };

window.HiveFX = { geode, geodeSVG, map, voice, mineral, mineralName, hex, pebble, rng, crystal };
})();
