/* Mentifaber · the workshop at night (assets/ui/plan.css). What a drawing can't do on paper:
   - the walls are drawn from where the rooms really are (any screen): hatched gold, each room's door with its swing,
     windows in the outside walls, the way in at the end of the corridor; on a first visit they're drafted in
   - you carry a lantern (the pointer): the walls and floor catch its light; leave it alone and a night light patrols
   - a small figure walks you to the bench you point at, along the corridor and through the door, leaving footprints;
     click and it hurries there, then the bench opens into its datasheet
   - the room you're in has its lights on; the compass shows north and where the sun is right now
   - the sheet's grid references follow you; arrow keys walk from bench to bench; "/" finds anything
   Install, the suite and the installed-app shortcut stay with assets/ui/shell.js. */
(() => {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const NS = "http://www.w3.org/2000/svg", reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  // ── find: the parts index (every page) ──
  const fd = $(".find"), idx = JSON.parse(($("#wk-index") || {}).textContent || "[]");
  if (fd) {
    const inp = $("input", fd), ol = $("ol", fd); let sel = 0, hits = [];
    const draw = () => { const ws = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const score = (x) => { const n = x.n.toLowerCase(); return ws.reduce((t, w) => t + (n.startsWith(w) ? 4 : n.includes(w) ? 3 : x.r.toLowerCase().includes(w) ? 1 : 0), 0); }; // names first, then rooms, then words in the description
      hits = idx.filter((x) => ws.every((w) => (x.n + " " + x.d + " " + x.r + " " + x.s + " " + x.p).toLowerCase().includes(w))).map((x, i) => [x, score(x), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0]).slice(0, 40);
      sel = Math.min(sel, Math.max(0, hits.length - 1));
      ol.innerHTML = hits.map((x, i) => '<li><a href="' + esc(x.h) + '"' + (i === sel ? ' class="on"' : "") + '><span class="pn">' + esc(x.p) + "</span><span><b>" + esc(x.n) + "</b><small>" + esc(x.d) + '</small></span><span class="pn">' + esc(x.s) + "</span></a></li>").join("") || '<li style="padding:14px 18px;color:var(--dim)">No bench matches. Fewer words?</li>'; };
    const open = () => { fd.classList.add("on"); inp.value = ""; sel = 0; draw(); setTimeout(() => inp.focus(), 20); }, close = () => fd.classList.remove("on");
    $$("[data-find]").forEach((b) => (b.onclick = open));
    fd.addEventListener("click", (e) => { if (e.target === fd) close(); });
    inp.addEventListener("input", () => { sel = 0; draw(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); draw(); } else if (e.key === "Enter" && hits[sel]) location.href = hits[sel].h; else if (e.key === "Escape") close(); });
    addEventListener("keydown", (e) => { if (e.key === "/" && !/input|textarea|select/i.test((document.activeElement || {}).tagName || "") && !fd.classList.contains("on")) { e.preventDefault(); open(); } });
  }

  // ── power on: the thing starts on its own bench (datasheets) ──
  const piece = $(".piece");
  if (location.hash === "#app" && piece && piece.dataset.app) { location.replace(piece.dataset.app); return; } // "open the app" links go straight to it
  $$("[data-power]").forEach((b) => (b.onclick = () => {
    if (!piece || !piece.dataset.app) return; const box = $(".frame > div", piece);
    if (!$("iframe", box)) { const f = document.createElement("iframe"); f.src = piece.dataset.app; f.title = ($("h1") ? $("h1").textContent : "the app") + ", running";
      f.allow = "fullscreen; autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation; screen-wake-lock; web-share; xr-spatial-tracking; gyroscope; accelerometer; magnetometer"; box.appendChild(f); }
    piece.classList.add("on"); $$("[data-power]").forEach((x) => { x.textContent = "Running"; x.disabled = true; });
    piece.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }));

  // ── the lexicon: find a word, copy a citation or a link, light the entry you came for ──
  const lex = $(".lex");
  if (lex) {
    const q = $(".lex-q input", lex), entries = $$(".lx-entry", lex), none = $(".lex-none", lex), idxA = $$(".lex-idx a", lex);
    if (q) q.addEventListener("input", () => { const w = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean); let n = 0;
      entries.forEach((e) => { const ok = w.every((x) => e.dataset.q.includes(x)); e.hidden = !ok; if (ok) n++; });
      idxA.forEach((a) => { const e = document.getElementById(a.getAttribute("href").slice(1)); a.parentNode.hidden = e ? e.hidden : false; }); if (none) none.hidden = n > 0; });
    const toast = (b, t) => { const was = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = was), 1600); };
    const copy = (b, text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(b, "Copied ✓"), () => prompt("Copy:", text));
    $$("[data-cite]", lex).forEach((b) => (b.onclick = () => copy(b, b.dataset.cite)));
    $$("[data-link]", lex).forEach((b) => (b.onclick = () => copy(b, b.dataset.link)));
    const light = () => { const e = location.hash && document.getElementById(location.hash.slice(1)); entries.forEach((x) => x.classList.toggle("hl", x === e)); idxA.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === location.hash)); };
    addEventListener("hashchange", light); light();
    if ("IntersectionObserver" in window) { const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) idxA.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + x.target.id)); }), { rootMargin: "-30% 0px -60% 0px" }); entries.forEach((e) => io.observe(e)); }
  }

  // ── the compass: north is up; the sun is where it is now, for roughly where you are (your time zone says) ──
  const comp = $(".compass");
  if (comp) {
    const now = new Date(), tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || ""), south = /^(Australia|Pacific\/Auckland|Pacific\/Fiji|America\/(Sao_Paulo|Argentina|Santiago|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek|Lusaka)|Indian\/(Mauritius|Reunion))/.test(tz);
    const lat = (south ? -30 : 42) * Math.PI / 180, lon = -now.getTimezoneOffset() / 4; // degrees east
    const d = (now - Date.UTC(2000, 0, 1, 12)) / 864e5, g = (357.529 + .98560028 * d) * Math.PI / 180, q = 280.459 + .98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 3.6e-7 * d) * Math.PI / 180;
    const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = ((gmst * 15 + lon) * Math.PI / 180) - ra;
    const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    const az = (Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha)) * 180 / Math.PI + 360) % 360;
    const sun = $(".sun", comp), r = 34; if (sun) { sun.setAttribute("cx", 46 + r * Math.sin(az * Math.PI / 180)); sun.setAttribute("cy", 46 - r * Math.cos(az * Math.PI / 180)); sun.classList.toggle("down", alt < 0); }
    const cap = $("figcaption", comp); if (cap) cap.textContent = alt < 0 ? "sun · below the horizon · " + Math.round(az) + "°" : "sun · " + Math.round(az) + "° · " + Math.round(alt * 180 / Math.PI) + "° up";
  }

  // ── the floor plan (home) ──
  const floor = $(".floor");
  if (!floor) return;
  const drawing = $(".drawing"), refsX = $$(".refs.x:not(.b) span"), refsY = $$(".refs.y:not(.r) span"), at = $(".tb dd.at"), note = $(".note"), lanternEl = $(".lantern", floor);
  const svg = el("svg", { class: "ink", "aria-hidden": "true" }); floor.appendChild(svg);
  let R = [], H = null, B = null, door = [], lane = null, phone = false, wk = { x: 0, y: 0, room: -1 }, walkerG = null, stepsG = null, hiMask = null;

  const rel = (e, F) => { const r = e.getBoundingClientRect(); return { x: r.left - F.left, y: r.top - F.top, w: r.width, h: r.height, el: e }; };
  function build(first) {
    const F = floor.getBoundingClientRect(); phone = matchMedia("(max-width: 760px)").matches;
    R = $$(".room", floor).map((e) => rel(e, F)); H = rel($(".hall", floor), F);
    const all = [...R, H], minX = Math.min(...all.map((r) => r.x)), minY = Math.min(...all.map((r) => r.y)), maxX = Math.max(...all.map((r) => r.x + r.w)), maxY = Math.max(...all.map((r) => r.y + r.h));
    B = { minX, minY, maxX, maxY };
    const TO = phone ? 9 : 13, TI = phone ? 5 : 7, DW = phone ? 34 : 50, snap = 3;
    // every side of every room and of the corridor, merged where rooms share a wall
    const lines = [];
    const add = (o, c, a, b, owner) => { let L = lines.find((l) => l.o === o && Math.abs(l.c - c) <= snap); if (!L) lines.push((L = { o, c, iv: [], gaps: [], owners: [] })); L.iv.push([a, b]); L.owners.push(owner); };
    all.forEach((r, k) => { add("h", r.y, r.x, r.x + r.w, k); add("h", r.y + r.h, r.x, r.x + r.w, k); add("v", r.x, r.y, r.y + r.h, k); add("v", r.x + r.w, r.y, r.y + r.h, k); });
    for (const L of lines) { L.iv.sort((a, b) => a[0] - b[0]); const m = []; for (const v of L.iv) { const t = m[m.length - 1]; if (t && v[0] <= t[1] + snap) t[1] = Math.max(t[1], v[1]); else m.push(v.slice()); } L.iv = m;
      L.out = L.o === "h" ? Math.abs(L.c - minY) <= snap || Math.abs(L.c - maxY) <= snap : Math.abs(L.c - minX) <= snap || Math.abs(L.c - maxX) <= snap; L.t = L.out ? TO : TI; }
    const lineAt = (o, c) => lines.find((l) => l.o === o && Math.abs(l.c - c) <= snap);
    // doors: each room's door is in the wall it shares with the corridor
    door = R.map((r, k) => {
      let o, c, a, b, into;
      if (!phone && Math.abs(r.y + r.h - H.y) <= snap) { o = "h"; c = H.y; a = Math.max(r.x, H.x); b = Math.min(r.x + r.w, H.x + H.w); into = -1; }
      else if (!phone && Math.abs(r.y - (H.y + H.h)) <= snap) { o = "h"; c = H.y + H.h; a = Math.max(r.x, H.x); b = Math.min(r.x + r.w, H.x + H.w); into = 1; }
      else { o = "v"; c = H.x + H.w; a = Math.max(r.y, H.y); b = Math.min(r.y + r.h, H.y + H.h); into = 1; }
      const len = b - a; if (len < DW + 20) return null;
      const pos = a + len * (phone ? .18 : into > 0 ? .84 : k % 2 ? .76 : .24), g = [pos - DW / 2, pos + DW / 2], L = lineAt(o, c); if (L) L.gaps.push(g);
      return { o, c, g, into, pos, room: k };
    });
    // the way in: the corridor's outer end
    let entrance = null;
    if (!phone) { const L = lineAt("v", H.x); if (L && L.out) { const g = [H.y + 16, H.y + H.h - 16]; L.gaps.push(g); entrance = { o: "v", c: H.x, g, dir: 1 }; } }
    else { const L = lineAt("h", H.y); if (L && L.out) { const g = [H.x + 3, H.x + H.w - 3]; L.gaps.push(g); entrance = { o: "h", c: H.y, g, dir: 1 }; } }
    // windows: in the outside walls of the rooms, one for every few metres
    const wins = [];
    for (const L of lines) { if (!L.out) continue;
      for (const r of R) { const along = L.o === "h" ? [r.x, r.x + r.w] : [r.y, r.y + r.h], onIt = L.o === "h" ? (Math.abs(r.y - L.c) <= snap || Math.abs(r.y + r.h - L.c) <= snap) : (Math.abs(r.x - L.c) <= snap || Math.abs(r.x + r.w - L.c) <= snap); if (!onIt) continue;
        const len = along[1] - along[0], n = Math.floor(len / (phone ? 200 : 250)), ww = phone ? 36 : 56; for (let i = 0; i < n; i++) { const p = along[0] + len * (i + .5) / n, g = [p - ww / 2, p + ww / 2]; if (L.gaps.some((x) => x[1] > g[0] - 8 && x[0] < g[1] + 8)) continue; L.gaps.push(g); wins.push({ o: L.o, c: L.c, g, t: L.t }); } } }
    // draw
    svg.setAttribute("viewBox", `0 0 ${F.width} ${F.height}`); svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    for (const [id, op, sw] of [["hatch", .55, .8], ["hatch-hi", 1, 1]]) { const p = el("pattern", { id, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs); el("rect", { width: 5, height: 5, fill: "#0d0b08" }, p); el("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: id === "hatch" ? "#d6a647" : "#f6dc94", "stroke-width": sw, "stroke-opacity": op }, p); }
    const halo = el("radialGradient", { id: "halo" }, defs); el("stop", { offset: 0, "stop-color": "#ffe2a0", "stop-opacity": .55 }, halo); el("stop", { offset: 1, "stop-color": "#ffe2a0", "stop-opacity": 0 }, halo);
    const lg = el("radialGradient", { id: "lglow", gradientUnits: "userSpaceOnUse", cx: -999, cy: -999, r: 230 }, defs); el("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 1 }, lg); el("stop", { offset: .55, "stop-color": "#fff", "stop-opacity": .35 }, lg); el("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 }, lg);
    hiMask = lg; const mask = el("mask", { id: "lmask", maskUnits: "userSpaceOnUse", x: -50, y: -50, width: F.width + 100, height: F.height + 100 }, defs); el("rect", { x: -50, y: -50, width: F.width + 100, height: F.height + 100, fill: "url(#lglow)" }, mask);
    const base = el("g", { class: first && !reduce ? "base" : "base" }, svg), hi = el("g", { class: "lit", mask: "url(#lmask)" }, svg);
    let n = 0;
    const piece = (L, a, b) => { if (b - a < 1) return; const t = L.t, attrs = L.o === "h" ? { x: a, y: L.c - t / 2, width: b - a, height: t } : { x: L.c - t / 2, y: a, width: t, height: b - a };
      for (const g of [base, hi]) { const r = el("rect", { ...attrs, class: "wall" + (L.out ? " out" : ""), pathLength: 1 }, g); r.style.setProperty("--i", n); } n++; };
    for (const L of lines) for (const [a0, b0] of L.iv) {
      const a = a0 - L.t / 2, b = b0 + L.t / 2, cuts = L.gaps.filter((g) => g[1] > a && g[0] < b).sort((x, y) => x[0] - y[0]); let s = a;
      for (const g of cuts) { piece(L, s, Math.max(s, g[0])); s = Math.max(s, g[1]); } piece(L, s, b);
    }
    for (const w of wins) { const g = el("g", { class: "win" }, base), [a, b] = w.g; for (const k of [-.5, 0, .5]) { const off = k * w.t; const l = w.o === "h" ? { x1: a, y1: w.c + off, x2: b, y2: w.c + off } : { x1: w.c + off, y1: a, x2: w.c + off, y2: b }; el("line", { ...l, pathLength: 1 }, g); } }
    door.forEach((d) => { if (!d) return; const g = el("g", { class: "door" }, base), [a, b] = d.g, w = b - a;
      const hinge = d.o === "h" ? [a, d.c] : [d.c, a], tip = d.o === "h" ? [a, d.c + d.into * w] : [d.c + d.into * w, a], end = d.o === "h" ? [b, d.c] : [d.c, b];
      const cross = (tip[0] - hinge[0]) * (end[1] - hinge[1]) - (tip[1] - hinge[1]) * (end[0] - hinge[0]);
      el("path", { d: `M${hinge[0]} ${hinge[1]}L${tip[0]} ${tip[1]}`, pathLength: 1 }, g);
      el("path", { class: "swing", d: `M${tip[0]} ${tip[1]}A${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${end[0]} ${end[1]}`, pathLength: 1 }, g); });
    if (entrance) { const g = el("g", { class: "entrance" }, base), [a, b] = entrance.g, m = (a + b) / 2;
      el("path", { d: entrance.o === "v" ? `M${entrance.c - 26} ${m}H${entrance.c + 6}M${entrance.c - 2} ${m - 6}L${entrance.c + 6} ${m}L${entrance.c - 2} ${m + 6}` : `M${m} ${entrance.c - 22}V${entrance.c + 6}M${m - 5} ${entrance.c - 2}L${m} ${entrance.c + 6}L${m + 5} ${entrance.c - 2}`, pathLength: 1 }, g); }
    stepsG = el("g", { class: "steps" }, svg);
    walkerG = el("g", { class: "walker" }, svg); el("circle", { class: "halo", r: 30 }, walkerG); el("path", { class: "nose", d: "M0 0L11 0" }, walkerG); el("circle", { class: "body", r: 6 }, walkerG);
    // the walker's lane: just inside the corridor, along it
    lane = phone ? { o: "v", c: H.x + H.w / 2 } : { o: "h", top: H.y + 12, bot: H.y + H.h - 12 };
    if (first) { wk = entrance ? (entrance.o === "v" ? { x: entrance.c + 22, y: (entrance.g[0] + entrance.g[1]) / 2, room: -1 } : { x: (entrance.g[0] + entrance.g[1]) / 2, y: entrance.c + 22, room: -1 }) : { x: H.x + 20, y: H.y + 20, room: -1 }; }
    else if (wk.room >= 0 && door[wk.room]) { const t = $(".bench.here"); if (t) { const c = centre(t); wk.x = c[0]; wk.y = c[1]; } }
    else wk = phone ? { x: lane.c, y: Math.max(H.y + 30, Math.min(wk.y, H.y + H.h - 20)), room: -1 } : { x: Math.max(H.x + 20, Math.min(wk.x, H.x + H.w - 20)), y: lane.top, room: -1 };
    place(0);
    if (first && !reduce && !sessionStorage.getItem("wk:drawn")) { svg.classList.add("drawing"); try { sessionStorage.setItem("wk:drawn", "1"); } catch (e) {} setTimeout(() => svg.classList.remove("drawing"), 1600 + n * 28 + 200); }
  }

  // ── the walker ──
  const centre = (e) => { const F = floor.getBoundingClientRect(), r = e.getBoundingClientRect(); return [r.left - F.left + r.width / 2, r.top - F.top + r.height / 2]; };
  let heading = 0;
  function place(dir) { if (!walkerG) return; if (dir != null && dir !== 0) heading = dir; walkerG.setAttribute("transform", `translate(${wk.x} ${wk.y}) rotate(${heading})`); }
  function route(to, k) { // waypoints from where the walker is to a bench in room k
    const d = door[k], pts = [], inner = (dd, depth) => dd.o === "h" ? [dd.pos, dd.c + dd.into * depth] : [dd.c + dd.into * depth, dd.pos], onLane = (dd) => phone ? [lane.c, dd.pos] : [dd.pos, dd.into < 0 ? lane.top : lane.bot];
    if (!d) return [to];
    if (wk.room === k) return [to];
    if (wk.room >= 0 && door[wk.room]) { const od = door[wk.room]; pts.push(inner(od, 18), [od.o === "h" ? od.pos : od.c, od.o === "h" ? od.c : od.pos], onLane(od)); }
    const here = pts.length ? pts[pts.length - 1] : [wk.x, wk.y], target = onLane(d);
    if (!phone) { if (Math.abs(here[1] - target[1]) > 2) pts.push([here[0], target[1]]); } else if (Math.abs(here[0] - target[0]) > 2) pts.push([target[0], here[1]]);
    pts.push(target, [d.o === "h" ? d.pos : d.c, d.o === "h" ? d.c : d.pos], inner(d, 20), to);
    return pts;
  }
  let walking = 0, goal = null, lastStep = 0, stepSide = 1;
  let leaving = false; // a click is on its way to a bench: nothing else may take the walker
  function walk(bench, fast, then) {
    if (leaving && !then) return;
    const k = R.findIndex((r) => r.el.contains(bench)); if (k < 0) { if (then) then(); return; }
    const to = centre(bench), pts = route(to, k); goal = bench; const id = ++walking;
    $$(".bench.here").forEach((b) => b !== bench && b.classList.remove("here"));
    if (reduce) { wk.x = to[0]; wk.y = to[1]; wk.room = k; place(0); arrive(bench, k); if (then) then(); return; }
    let total = 0, prev = [wk.x, wk.y]; for (const p of pts) { total += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
    const speed = fast ? Math.max(1400, total / .45) : Math.max(820, total / 1.6); let i = 0, t0 = performance.now(), last = t0;
    const tick = (t) => {
      if (id !== walking) return; let budget = (t - last) / 1000 * speed; last = t;
      while (budget > 0 && i < pts.length) { const p = pts[i], dx = p[0] - wk.x, dy = p[1] - wk.y, dist = Math.hypot(dx, dy);
        if (dist <= budget) { wk.x = p[0]; wk.y = p[1]; budget -= dist; i++; } else { wk.x += dx / dist * budget; wk.y += dy / dist * budget; place(Math.atan2(dy, dx) * 180 / Math.PI); budget = 0; }
        if (dist > 0) place(Math.atan2(dy, dx) * 180 / Math.PI); step(); }
      light(roomAt(wk.x, wk.y));
      if (i < pts.length) requestAnimationFrame(tick); else { wk.room = k; arrive(bench, k); if (then) then(); }
    };
    requestAnimationFrame(tick);
  }
  function step() { // footprints, a little to either side, fading behind
    const now = performance.now(); if (now - lastStep < 70 || !stepsG) return; lastStep = now; stepSide = -stepSide;
    const a = heading * Math.PI / 180, ox = -Math.sin(a) * 3.2 * stepSide, oy = Math.cos(a) * 3.2 * stepSide, c = el("circle", { cx: wk.x + ox, cy: wk.y + oy, r: 1.9 }, stepsG);
    c.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 2200, easing: "ease-out" }).onfinish = () => c.remove();
  }
  function arrive(bench, k) { bench.classList.add("here"); light(k); }
  const roomAt = (x, y) => R.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  let litK = -2;
  function light(k) { if (k === litK) return; litK = k; R.forEach((r, i) => { r.el.classList.toggle("lit", i === k); const d = door[i]; if (d) { r.el.style.setProperty("--dx", ((d.o === "h" ? d.pos - r.x : 0) / r.w * 100).toFixed(1) + "%"); r.el.style.setProperty("--dy", d.o === "h" ? (d.into < 0 ? "100%" : "0%") : ((d.pos - r.y) / r.h * 100).toFixed(1) + "%"); } }); }

  // ── the lantern, the grid references, the note ──
  let lx = -999, ly = -999, lastMove = 0, patrol = 0;
  function lantern(x, y) { lx = x; ly = y; floor.style.setProperty("--lx", x + "px"); floor.style.setProperty("--ly", y + "px"); floor.classList.add("lantern-on"); if (hiMask) { hiMask.setAttribute("cx", x); hiMask.setAttribute("cy", y); } refs(x, y); }
  function refs(x, y) { if (!drawing) return; const D = drawing.getBoundingClientRect(), F = floor.getBoundingClientRect(), px = (x + F.left - D.left) / D.width, py = (y + F.top - D.top) / D.height;
    const cx = Math.max(0, Math.min(refsX.length - 1, Math.floor(px * refsX.length))), cy = Math.max(0, Math.min(refsY.length - 1, Math.floor(py * refsY.length)));
    refsX.forEach((s, i) => s.classList.toggle("on", i === cx)); refsY.forEach((s, i) => s.classList.toggle("on", i === cy));
    $$(".refs.x.b span").forEach((s, i) => s.classList.toggle("on", i === cx)); $$(".refs.y.r span").forEach((s, i) => s.classList.toggle("on", i === cy));
    if (at && refsX[cx] && refsY[cy]) at.textContent = refsX[cx].textContent + refsY[cy].textContent; }
  floor.addEventListener("pointermove", (e) => { const F = floor.getBoundingClientRect(); lastMove = performance.now(); lantern(e.clientX - F.left, e.clientY - F.top); if (fine) light(roomAt(e.clientX - F.left, e.clientY - F.top) >= 0 ? roomAt(e.clientX - F.left, e.clientY - F.top) : wk.room); }, { passive: true });
  floor.addEventListener("pointerleave", () => { lastMove = 0; light(wk.room); });
  function patrolTick(t) { // nobody holding the lantern: a night light walks the corridor
    patrol = requestAnimationFrame(patrolTick); if (document.hidden || !H) return; if (performance.now() - lastMove < 3500 && lastMove) return;
    const s = (Math.sin(t / 5200) + 1) / 2; if (phone) lantern(H.x + H.w / 2, H.y + 40 + s * Math.max(0, H.h - 80)); else lantern(H.x + 60 + s * Math.max(0, H.w - 120), H.y + H.h / 2);
  }
  if (!reduce) patrol = requestAnimationFrame(patrolTick);
  function showNote(b) {
    if (!note || !fine) return; const r = b.getBoundingClientRect(), right = r.right + 300 < innerWidth;
    $(".lbl", note).textContent = b.dataset.pn + " · " + b.dataset.room + " · " + b.dataset.st; $("h4", note).textContent = $("b", b).textContent; $("p", note).textContent = b.dataset.desc;
    note.style.left = (right ? r.right + 18 : Math.max(10, r.left - 288)) + "px"; note.style.top = Math.max(10, Math.min(innerHeight - 190, r.top - 8)) + "px"; note.classList.add("on");
  }
  const hideNote = () => note && note.classList.remove("on");

  // ── the benches: point and the walker goes; click and it hurries, then the bench opens ──
  let intent = 0;
  $$(".bench", floor).forEach((b) => {
    b.addEventListener("pointerenter", () => { clearTimeout(intent); showNote(b); intent = setTimeout(() => walk(b, false), 140); });
    b.addEventListener("pointerleave", () => { clearTimeout(intent); hideNote(); });
    b.addEventListener("focus", () => { showNote(b); walk(b, false); });
    b.addEventListener("blur", hideNote);
    b.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); clearTimeout(intent); hideNote(); const href = b.getAttribute("href"); leaving = true;
      $$(".bench b").forEach((x) => (x.style.viewTransitionName = "")); $("b", b).style.viewTransitionName = "bench-name";
      walk(b, true, () => setTimeout(() => (location.href = href), reduce ? 0 : 80)); });
  });
  // arrow keys walk from bench to bench
  addEventListener("keydown", (e) => {
    if (!/^Arrow/.test(e.key) || /input|textarea|select/i.test((document.activeElement || {}).tagName || "") || (fd && fd.classList.contains("on"))) return;
    const all = $$(".bench", floor), cur = document.activeElement && document.activeElement.classList.contains("bench") ? document.activeElement : null;
    if (!cur) { e.preventDefault(); (goal || all[0]).focus(); return; }
    const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2, v = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    let best = null, bd = Infinity;
    for (const o of all) { if (o === cur) continue; const r = o.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy, along = dx * v[0] + dy * v[1]; if (along <= 4) continue; const off = Math.abs(dx * v[1]) + Math.abs(dy * v[0]), s = along + off * 2.2; if (s < bd) { bd = s; best = o; } }
    if (best) { e.preventDefault(); best.focus(); best.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); }
  });

  // the corridor's instruments move below the plan on a phone (the corridor is a narrow strip there)
  const inst = $(".instruments"), slot = $(".instruments-slot"), hallEl = $(".hall", floor);
  const placeInst = () => { if (!inst || !slot) return; const p = matchMedia("(max-width: 760px)").matches; if (p && inst.parentNode !== slot) { slot.appendChild(inst); inst.classList.add("out"); } else if (!p && inst.parentNode !== hallEl) { hallEl.appendChild(inst); inst.classList.remove("out"); } };
  placeInst();
  let rt = 0; const redo = () => { clearTimeout(rt); rt = setTimeout(() => { placeInst(); build(false); }, 120); };
  addEventListener("resize", redo); if (document.fonts) document.fonts.ready.then(() => build(false));
  if ("ResizeObserver" in window) new ResizeObserver(redo).observe(floor);
  build(true); light(-1);
  // back from a datasheet: the walker is still at that bench
  try { const from = sessionStorage.getItem("wk:at"); if (from) { const b = $('.bench[href="' + from + '"]', floor); if (b) { walking++; const c = centre(b); wk.x = c[0]; wk.y = c[1]; wk.room = R.findIndex((r) => r.el.contains(b)); place(0); arrive(b, wk.room); } } } catch (e) {}
  addEventListener("pageshow", (e) => { if (e.persisted) leaving = false; });
  addEventListener("pagehide", () => { try { const h = $(".bench.here", floor); if (h) sessionStorage.setItem("wk:at", h.getAttribute("href")); } catch (e) {} });
})();
