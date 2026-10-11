/* Omnilogos · the lattice, on a verbatim sample. Book → chapter → verse → word, fifteen texts in parallel, and the model
   that scores them, running live: normalise every English rendering (spelling, archaic forms, divine names), weight each
   word by TF-IDF across the sample, measure every pair of translations by cosine, then turn the pairs that agree into a
   Beta-posterior attestation score. Pairs inside one transmission line count for less: Geneva agreeing with Tyndale,
   which it revised, is weak evidence. Attestation is agreement between witnesses, never truth. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const O = window.OMNI, BY = Object.fromEntries(O.tr.map((t) => [t.id, t])), EN = O.tr.filter((t) => t.lang === "English");
const LINES = { orig: "the originals", V: "Vulgate line", T: "Tyndale line", F: "fresh from the Hebrew and Greek", J: "Jewish", B: "Basic English" };
const SHORT = { Tyndale: "Tyn", Geneva1599: "Gen", KJV: "KJV", Webster: "Web", ASV: "ASV", DRC: "DRC", YLT: "YLT", Darby: "Dby", Noyes: "Noy", Rotherham: "Rot", JPS: "JPS", BBE: "BBE" };
const S = { tau: 0.6, min: 0.5, ref: O.refs[0], metric: "cos", word: null, theme: null, tab: "par", normt: false };

// ── normalise: one display word → zero or more tokens ──
const MAP = { thee: "you", thou: "you", ye: "you", thy: "your", thine: "your", hath: "has", doth: "does", saith: "says", unto: "to", jehovah: "lord", yahweh: "lord", hashem: "lord", "g-d": "god", iesus: "jesus", yt: "that", shalbe: "shall be", wil: "will" };
function stem(x) { for (const s of ["eth", "est", "ed", "ing", "es", "s", "e"]) if (x.endsWith(s) && x.length - s.length >= 3 && !((s === "s" || s === "es") && /(us|ss|is)$/.test(x))) { x = x.slice(0, -s.length); break; } return x.replace(/(.)\1/g, "$1"); }
function toks(word) {
  const w = word.toLowerCase().replace(/'s$/, "").replace(/^['\-]+|['\-]+$/g, ""); if (!w) return [];
  const out = [];
  for (let p of w === "g-d" ? [w] : w.split("-").filter(Boolean)) { p = p.replace(/'/g, "").replace(/^v(?=[^aeiou])/, "u").replace(/([aeiou])u(?=[aeiou])/g, "$1v"); p = MAP[p] || p; for (const x of p.split(" ")) out.push(stem(x)); }
  return out;
}
const WORD = /([A-Za-z][A-Za-z'\-]*)/;
const norm = (t) => (t.match(/[A-Za-z][A-Za-z'\-]*/g) || []).flatMap(toks);

// ── index the sample: documents, document frequency, TF-IDF vectors, every pair ──
const DOC = {}, FORMS = {}; let N = 0; const DF = {};
for (const r of O.refs) { DOC[r] = {}; for (const t of EN) { const s = O.v[r][t.id]; if (!s) continue; const tk = norm(s); DOC[r][t.id] = tk; N++; new Set(tk).forEach((w) => (DF[w] = (DF[w] || 0) + 1));
  (s.match(/[A-Za-z][A-Za-z'\-]*/g) || []).forEach((w) => toks(w).forEach((k) => { const f = (FORMS[k] = FORMS[k] || new Map()), lw = w.toLowerCase(); f.set(lw, (f.get(lw) || 0) + 1); })); } }
const shown = (k) => { const f = FORMS[k]; return f ? [...f.entries()].sort((a, b) => b[1] - a[1])[0][0] : k; };
const IDF = (w) => Math.log((1 + N) / (1 + (DF[w] || 0))) + 1;
const STOP = new Set("a an and the of to in on upon unto for from by with at as is was be are were been am has have had do did shall will would should may might not no nor but or so that this these those which who whom whose what it its he him his she her they them their we us our i me my you your all any every there then than when now also even".split(" ").flatMap(toks));
const COMMON = (w) => STOP.has(w) || (DF[w] || 0) > N * 0.3;
function vec(tk) { const m = new Map(); tk.forEach((w) => m.set(w, (m.get(w) || 0) + 1)); let n = 0; for (const [w, c] of m) { const x = c * IDF(w); m.set(w, x); n += x * x; } return { m, n: Math.sqrt(n) }; }
const cosv = (a, b) => { let d = 0; for (const [w, x] of a.m) { const y = b.m.get(w); if (y) d += x * y; } return a.n && b.n ? d / (a.n * b.n) : 0; };
const jacv = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; A.forEach((w) => B.has(w) && i++); return i / (A.size + B.size - i || 1); };
const PAIR = {};
for (const r of O.refs) {
  const ids = EN.map((t) => t.id).filter((id) => DOC[r][id]), V = ids.map((id) => vec(DOC[r][id]));
  PAIR[r] = { ids, cos: ids.map((_, i) => ids.map((__, j) => (i === j ? 1 : cosv(V[i], V[j])))), jac: ids.map((a, i) => ids.map((b, j) => (i === j ? 1 : jacv(DOC[r][a], DOC[r][b])))) };
}
const wOf = (a, b) => (BY[a].line === BY[b].line ? 0.4 : 1);
function score(r) { const P = PAIR[r]; let k = 0, n = 0; for (let i = 0; i < P.ids.length; i++) for (let j = i + 1; j < P.ids.length; j++) { const w = wOf(P.ids[i], P.ids[j]); n += w; if (P.cos[i][j] >= S.tau) k += w; } return { k, n, s: (1 + k) / (2 + n) }; }
const mean = (r, m) => { const P = PAIR[r][m]; let a = 0, c = 0; P.forEach((row, i) => row.forEach((v, j) => { if (j > i) { a += v; c++; } })); return c ? a / c : 0; };

// ── tags: a theme sticks to a verse when 40% of its English lines use one of the theme's words ──
const THEMES = { creation: ["creat", "heaven", "earth", "begin"], light: ["light", "lamp", "dark", "darknes"], love: ["lov", "charity"], faith: ["faith", "believ", "trust", "hop"], peace: ["peac", "stil", "rest"], life: ["lif", "everlast", "eternal", "death", "perish"], strength: ["strength", "strong", "renew", "weary", "faint"], word: ["word", "law", "comand", "comandment"], time: ["tim", "season"], justice: ["mercy", "just", "justly", "humbl", "humbly", "kindnes"] };
const TAGS = {}; for (const r of O.refs) { const ids = Object.keys(DOC[r]); TAGS[r] = Object.keys(THEMES).filter((th) => ids.filter((id) => DOC[r][id].some((w) => THEMES[th].includes(w))).length >= ids.length * 0.4); }

// ── the lattice ──
const bookOf = (r) => r.replace(/ \d+:\d+$/, "");
function drawList() {
  let h = "", last = null, pass = 0, sum = 0;
  for (const r of O.refs) {
    const b = bookOf(r), sc = score(r).s, ok = sc >= S.min; sum += sc; if (ok) pass++;
    if (b !== last) { h += "<h4>" + esc(b) + "</h4>"; last = b; }
    h += '<a data-ref="' + esc(r) + '" class="' + (r === S.ref ? "on" : "") + (S.theme && !TAGS[r].includes(S.theme) ? " dim" : "") + '"><span>' + esc(r.slice(b.length + 1)) + '</span><span class="bar"><i style="width:' + Math.round(sc * 100) + '%"></i></span><span class="mk ' + (ok ? "ok" : "no") + '" title="' + (ok ? "attested" : "below threshold") + '">' + (ok ? "✓" : "·") + "</span></a>";
  }
  $("list").innerHTML = h;
  $("sum").innerHTML = "<b>" + pass + "</b> of " + O.refs.length + " attested at ≥ " + Math.round(S.min * 100) + "% · sample mean <b>" + Math.round((sum / O.refs.length) * 100) + "%</b>. The full corpus, on the shipped Jaccard model, averages 42.5%.";
  $("tauv").textContent = S.tau.toFixed(2); $("minv").textContent = Math.round(S.min * 100) + "%";
}
$("themes").innerHTML = Object.keys(THEMES).filter((th) => O.refs.some((r) => TAGS[r].includes(th))).map((th) => '<button data-th="' + th + '">' + th + "</button>").join("");

// ── the parallel view ──
function cls(tk, r, id) {
  if (COMMON(tk)) return "c0";
  const ids = Object.keys(DOC[r]).filter((x) => x !== id); if (!ids.length) return "c2";
  const f = ids.filter((x) => DOC[r][x].includes(tk)).length / ids.length;
  return f >= 0.66 ? "c3" : f >= 0.33 ? "c2" : "c1";
}
function wordsHTML(s, r, id) {
  return s.split(WORD).map((seg, i) => {
    if (i % 2 === 0) return esc(seg).replace(/\[/g, '<i class="sup">').replace(/\]/g, "</i>");
    const tk = toks(seg); if (!tk.length) return esc(seg);
    return '<span class="w ' + cls(tk[0], r, id) + (S.word && tk.includes(S.word) ? " hit" : "") + '" data-t="' + esc(tk[0]) + '" title="' + esc(tk.join(" ")) + '">' + esc(seg) + "</span>";
  }).join("");
}
function drawPar() {
  const r = S.ref, v = O.v[r], sc = score(r), P = PAIR[r];
  let h = '<div class="vh"><h2>' + esc(r) + '</h2><span class="sc">attestation ' + Math.round(sc.s * 100) + "%" + (sc.s >= S.min ? " · attested" : " · below threshold") + '</span><span class="tg">' + TAGS[r].map((t) => "<span>" + t + "</span>").join("") + "</span></div>";
  h += '<p class="legend"><span class="a">Bright</span>: most other lines use the word. <span class="b">Amber</span>: this line\'s own wording. Dim: words too common to count. Tap a word to follow it.</p>';
  const srcs = O.tr.filter((t) => t.lang !== "English" && v[t.id]);
  if (srcs.length) h += '<div class="src">' + srcs.map((t) => '<div class="r"><span class="who"><b>' + esc(t.n) + "</b>" + esc(t.lang + " · " + t.y) + '</span><p lang="' + (t.lang === "Hebrew" ? "he" : t.lang === "Greek" ? "grc" : "la") + '"' + (t.dir ? ' dir="rtl"' : "") + ">" + esc(v[t.id]) + "</p></div>").join("") + "</div>";
  for (const line of ["T", "V", "F", "J", "B"]) {
    const ts = EN.filter((t) => t.line === line && v[t.id]); if (!ts.length) continue;
    h += '<div class="ln">' + esc(LINES[line]) + "</div>";
    for (const t of ts) {
      const i = P.ids.indexOf(t.id), m = P.ids.length > 1 ? P.cos[i].reduce((a, x, j) => a + (j === i ? 0 : x), 0) / (P.ids.length - 1) : 1;
      h += '<div class="row"><span class="who"><b>' + esc(t.n) + "</b>" + esc(t.y) + "</span><p>" + wordsHTML(v[t.id], r, t.id) + (S.normt ? '<span class="nt">' + esc(DOC[r][t.id].join(" ")) + "</span>" : "") + '</p><span class="m" title="mean cosine with the other lines">' + m.toFixed(2) + "</span></div>";
    }
  }
  if (r.startsWith("Psalms")) h += '<p class="legend" style="margin-top:16px">Psalm numbering differs by tradition: the Vulgate and Douay count this psalm one lower, and the Hebrew counts the superscription as verse 1. The sample is aligned by content.</p>';
  if (BY.JPS && v.JPS) h += '<p class="legend">This JPS edition writes the divine names as G-d and HaShem; normalising maps them, with Jehovah, Yahweh and the LORD, to one token, so agreement measures the sentence rather than the naming convention.</p>';
  $("par").innerHTML = h;
}

// ── the agreement heatmap and the score ──
function drawAgr() {
  const r = S.ref, P = PAIR[r], M = P[S.metric], n = P.ids.length;
  let h = "<span></span>" + P.ids.map((id) => '<span class="lab top">' + SHORT[id] + "</span>").join("");
  P.ids.forEach((a, i) => { h += '<span class="lab">' + SHORT[a] + "</span>" + P.ids.map((b, j) => { const x = M[i][j], same = BY[a].line === BY[b].line; return '<span data-i="' + i + '" data-j="' + j + '" style="background:' + (i === j ? "rgba(242,236,218,.07)" : "rgba(230,180,80," + (0.08 + 0.92 * Math.pow(x, 1.6)).toFixed(3) + ")") + (same && i !== j ? ";outline:1px dashed rgba(242,236,218,.25);outline-offset:-1px" : "") + '"></span>'; }).join(""); });
  $("heat").style.gridTemplateColumns = "30px repeat(" + n + ", minmax(0, 1fr))"; $("heat").innerHTML = h;
  const sc = score(r), mc = mean(r, "cos"), mj = mean(r, "jac");
  $("math").innerHTML = '<span class="big">' + Math.round(sc.s * 100) + "%</span><code>k = " + sc.k.toFixed(1) + " of n = " + sc.n.toFixed(1) + " weighted pairs at cos ≥ " + S.tau.toFixed(2) + "</code><code>(1 + k) / (2 + n) = " + sc.s.toFixed(2) + "</code>" +
    "<span>Pairs inside one line (dashed cells) count 0.4: a revision agreeing with its parent is weak evidence. Pairs across lines count 1.</span>" +
    "<span>Mean pair score here: cosine <b>" + mc.toFixed(2) + "</b>, Jaccard <b>" + mj.toFixed(2) + "</b>. Jaccard counts every shared word the same, so “and”, “the” and “of” prop up short verses; TF-IDF weights each word by how rare it is across the sample.</span><span><b>Attestation is not truth.</b> It measures how consistently independent lines render a verse, nothing more.</span>";
}
$("heat").addEventListener("pointerover", (e) => { const c = e.target.closest("[data-i]"); if (!c) return; const P = PAIR[S.ref], i = +c.dataset.i, j = +c.dataset.j, a = P.ids[i], b = P.ids[j]; $("hov").textContent = i === j ? BY[a].n : SHORT[a] + " × " + SHORT[b] + " · cos " + P.cos[i][j].toFixed(2) + " · jac " + P.jac[i][j].toFixed(2) + " · " + (BY[a].line === BY[b].line ? "same line, weight 0.4" : "across lines, weight 1"); });

// ── the word level: follow one token through the sample ──
function drawWord() {
  const tk = S.word, el = $("wordc"); if (!tk) return;
  const rows = O.refs.map((r) => { const ids = Object.keys(DOC[r]); return { r, c: ids.filter((id) => DOC[r][id].includes(tk)).length, n: ids.length }; }).filter((x) => x.c).sort((a, b) => b.c / b.n - a.c / a.n);
  const forms = [...(FORMS[tk] || new Map()).keys()].slice(0, 12);
  el.innerHTML = "<b>Word · <span style=\"color:var(--acc)\">" + esc(shown(tk)) + "</span> <small style=\"color:var(--mute);font:12px ui-monospace,monospace\">token " + esc(tk) + "</small></b><p class=\"mute\">Renderings: " + esc(forms.join(", ")) + ". In " + rows.length + " of " + O.refs.length + " verses; document frequency " + (DF[tk] || 0) + " of " + N + ", idf " + IDF(tk).toFixed(2) + (COMMON(tk) ? ", too common to count for much" : "") + '.</p><div class="conc">' + rows.map((x) => '<a data-ref="' + esc(x.r) + '"><span>' + esc(x.r) + "</span><small>" + x.c + "/" + x.n + " lines</small></a>").join("") + '</div><button class="mini" id="wx" style="justify-self:start;border:1px solid var(--line);background:transparent;border-radius:8px;padding:2px 9px;color:var(--dim);cursor:pointer">clear</button>';
  $("wx").onclick = () => { S.word = null; el.innerHTML = '<b>Word</b><p class="mute">Tap any word in the parallel view to follow it through the sample.</p>'; drawPar(); graphDraw(); };
}

// ── the graph: books, verses and the distinctive words they share ──
const G = { nodes: [], edges: [], hover: null };
(function build() {
  const books = [...new Set(O.refs.map(bookOf))], idx = {};
  books.forEach((b) => { idx["b:" + b] = G.nodes.push({ k: "b", id: b, label: b }) - 1; });
  const top = {};
  O.refs.forEach((r) => {
    idx["v:" + r] = G.nodes.push({ k: "v", id: r, label: r }) - 1; G.edges.push([idx["b:" + bookOf(r)], idx["v:" + r], 46]);
    const ids = Object.keys(DOC[r]), wsc = {}; ids.forEach((id) => new Set(DOC[r][id]).forEach((w) => { if (!COMMON(w) && w.length > 2 && !["god", "lord", "you", "your"].includes(w)) wsc[w] = (wsc[w] || 0) + IDF(w) / ids.length; }));
    top[r] = Object.entries(wsc).filter(([, s]) => s > 1.2).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
  });
  const cnt = {}; Object.values(top).forEach((ws) => ws.forEach((w) => (cnt[w] = (cnt[w] || 0) + 1)));
  Object.entries(cnt).filter(([, c]) => c >= 2).forEach(([w]) => { idx["w:" + w] = G.nodes.push({ k: "w", id: w, label: shown(w) }) - 1; });
  O.refs.forEach((r) => top[r].forEach((w) => { if (idx["w:" + w] != null) G.edges.push([idx["v:" + r], idx["w:" + w], 64]); }));
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  G.nodes.forEach((n) => { n.x = rnd() * 600 - 300; n.y = rnd() * 400 - 200; n.vx = 0; n.vy = 0; });
  for (let it = 0; it < 500; it++) {
    const a = 1 - it / 500;
    for (let i = 0; i < G.nodes.length; i++) for (let j = i + 1; j < G.nodes.length; j++) { const p = G.nodes[i], q = G.nodes[j]; let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy + 0.01; const f = 900 / d2, d = Math.sqrt(d2); dx /= d; dy /= d; p.vx -= dx * f; p.vy -= dy * f; q.vx += dx * f; q.vy += dy * f; }
    G.edges.forEach(([i, j, L]) => { const p = G.nodes[i], q = G.nodes[j]; const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, f = (d - L) * 0.04; p.vx += (dx / d) * f; p.vy += (dy / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f; });
    G.nodes.forEach((n) => { n.vx -= n.x * 0.004; n.vy -= n.y * 0.006; n.x += Math.max(-12, Math.min(12, n.vx)) * a; n.y += Math.max(-12, Math.min(12, n.vy)) * a; n.vx *= 0.5; n.vy *= 0.5; });
  }
  G.adj = G.nodes.map(() => new Set()); G.edges.forEach(([i, j]) => { G.adj[i].add(j); G.adj[j].add(i); });
})();
const gc = $("gc"), gx = gc.getContext("2d"); let GW = 0, GH = 0, T = { s: 1, ox: 0, oy: 0 };
function gfit() {
  const r = gc.getBoundingClientRect(); if (!r.width) return; const D = Math.min(2, devicePixelRatio || 1); GW = r.width; GH = r.height; gc.width = GW * D; gc.height = GH * D; gx.setTransform(D, 0, 0, D, 0, 0);
  const xs = G.nodes.map((n) => n.x), ys = G.nodes.map((n) => n.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  T.s = Math.min((GW - 120) / (x1 - x0 || 1), (GH - 80) / (y1 - y0 || 1)); T.ox = GW / 2 - ((x0 + x1) / 2) * T.s; T.oy = GH / 2 - 10 - ((y0 + y1) / 2) * T.s; graphDraw();
}
const scr = (n) => [n.x * T.s + T.ox, n.y * T.s + T.oy];
const rad = (n) => (n.k === "b" ? 7 : n.k === "w" ? 4.5 : 3 + 5 * score(n.id).s);
function graphDraw() {
  if (S.tab !== "graph" || !GW) return;
  gx.clearRect(0, 0, GW, GH);
  const sel = G.nodes.findIndex((n) => n.k === "v" && n.id === S.ref), hv = G.hover, wsel = S.word ? G.nodes.findIndex((n) => n.k === "w" && n.id === S.word) : -1;
  const lit = new Set([sel, hv, wsel].filter((x) => x != null && x >= 0)); [...lit].forEach((i) => G.adj[i].forEach((j) => lit.add(j)));
  G.edges.forEach(([i, j]) => { const [ax, ay] = scr(G.nodes[i]), [bx, by] = scr(G.nodes[j]); const on = lit.has(i) && lit.has(j); gx.strokeStyle = on ? "rgba(230,180,80,.55)" : "rgba(242,236,218,.08)"; gx.lineWidth = on ? 1.4 : 1; gx.beginPath(); gx.moveTo(ax, ay); gx.lineTo(bx, by); gx.stroke(); });
  G.nodes.forEach((n, i) => {
    const [x, y] = scr(n), on = lit.has(i), r = rad(n);
    gx.fillStyle = n.k === "b" ? "#e6b450" : n.k === "w" ? "#ff9f5a" : score(n.id).s >= S.min ? "#9fd67a" : "#6f6852";
    gx.globalAlpha = lit.size && !on ? 0.35 : 1; gx.beginPath(); gx.arc(x, y, r, 0, 7); gx.fill();
    if (i === sel) { gx.strokeStyle = "#fff"; gx.lineWidth = 2; gx.stroke(); }
    if (n.k !== "v" || on) { gx.fillStyle = n.k === "w" ? "rgba(255,159,90,.9)" : n.k === "b" ? "rgba(242,236,218,.85)" : "#f2ecda"; gx.font = (n.k === "w" ? "11px ui-monospace,monospace" : n.k === "b" ? "600 12px ui-sans-serif,sans-serif" : "12px ui-sans-serif,sans-serif"); gx.fillText(n.k === "v" ? n.label.replace(bookOf(n.label) + " ", bookOf(n.label).slice(0, 4) + " ") : n.label, x + r + 4, y + 4); }
    gx.globalAlpha = 1;
  });
}
function hit(e) { const r = gc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 14 * 14; G.nodes.forEach((n, i) => { const [nx, ny] = scr(n), d = (nx - x) ** 2 + (ny - y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }
gc.addEventListener("pointermove", (e) => { const h = hit(e); if (h !== G.hover) { G.hover = h; gc.style.cursor = h != null ? "pointer" : "default"; graphDraw(); } });
gc.addEventListener("click", (e) => { const h = hit(e); if (h == null) return; const n = G.nodes[h];
  if (n.k === "v") { pick(n.id); tab("par"); } else if (n.k === "w") { S.word = n.id; drawWord(); graphDraw(); } else pick(O.refs.find((r) => bookOf(r) === n.id)); });
new ResizeObserver(gfit).observe(gc);

// ── wiring ──
function pick(r) { if (!O.v[r]) return; S.ref = r; try { history.replaceState(null, "", "#v=" + encodeURIComponent(r)); } catch (e) {} drawList(); drawPar(); drawAgr(); graphDraw(); const a = document.querySelector('#list a.on'); if (a) a.scrollIntoView({ block: "nearest" }); }
function tab(t) { S.tab = t; document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === t)); $("par").hidden = t !== "par"; $("graph").hidden = t !== "graph"; if (t === "graph") requestAnimationFrame(gfit); }
document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) tab(b.dataset.tab); });
$("list").addEventListener("click", (e) => { const a = e.target.closest("[data-ref]"); if (a) pick(a.dataset.ref); });
$("wordc").addEventListener("click", (e) => { const a = e.target.closest("[data-ref]"); if (a) { pick(a.dataset.ref); tab("par"); } });
$("par").addEventListener("click", (e) => { const w = e.target.closest(".w[data-t]"); if (!w) return; S.word = S.word === w.dataset.t ? null : w.dataset.t; drawPar(); if (S.word) drawWord(); else $("wx") && $("wx").click(); });
$("tau").addEventListener("input", (e) => { S.tau = +e.target.value; drawList(); drawPar(); drawAgr(); graphDraw(); });
$("min").addEventListener("input", (e) => { S.min = +e.target.value; drawList(); drawPar(); graphDraw(); });
$("themes").addEventListener("click", (e) => { const b = e.target.closest("[data-th]"); if (!b) return; S.theme = S.theme === b.dataset.th ? null : b.dataset.th; document.querySelectorAll("#themes button").forEach((x) => x.classList.toggle("on", x.dataset.th === S.theme)); drawList(); });
document.querySelector(".seg").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; S.metric = b.dataset.m; document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b)); drawAgr(); });
$("normt").addEventListener("change", (e) => { S.normt = e.target.checked; drawPar(); });
const m = /[#&]v=([^&]+)/.exec(location.hash); if (m) { const r = decodeURIComponent(m[1]); if (O.v[r]) S.ref = r; }
drawList(); drawPar(); drawAgr();
window.Omnilogos = { S, score, PAIR, DOC, toks, pick, tab, G };
})();
