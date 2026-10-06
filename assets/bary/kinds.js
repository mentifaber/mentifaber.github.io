// Barycenter · more ways to say things: polls, shared lists, countdowns, where I am, tic-tac-toe, status, video clips,
// a sketch and photo studio, and the shared gallery. Each is just a sealed message; votes, ticks and moves are small
// hidden messages that change how the first one looks, so everything stays append-only and works offline.
(() => {
"use strict";
B.kinds = B.kinds || {}; B.acts = B.acts || {}; B.sheets = B.sheets || {};
const { $, esc, toast } = B, A = () => B.app, K = B.kinds, S = B.sheets;
// ── polls ──────────────────────────────────────────────────────────────────────────────────
K.poll = { render(m) {
  const v = A().D.votes[m.id] || {}, n = m.p.o.length, counts = Array(n).fill(0); for (const i of Object.values(v)) if (i >= 0 && i < n) counts[i]++; const tot = counts.reduce((a, b) => a + b, 0), mine = v[A().ME.user];
  return '<div class="poll"><div class="pq">📊 ' + esc(m.p.q) + "</div>" + m.p.o.map((o, i) => '<button class="po ' + (mine === i ? "me" : "") + '" data-act="vote" data-i="' + i + '"><span class="bar" style="width:' + (tot ? Math.round(counts[i] / tot * 100) : 0) + '%"></span><span class="ot">' + esc(o) + "</span><b>" + (counts[i] || "") + "</b></button>").join("") + "<small>" + tot + " of 2 voted · tap to " + (mine != null ? "change" : "vote") + "</small></div>";
} };
B.acts.vote = (ds, m) => { if (m) A().sendMsg({ k: "vote", of: m.id, i: +ds.i }); };
S.poll = () => {
  A().showSheet('<h2 class="disp">Decide together</h2><p>Where to eat, what to watch. You each get one vote you can change.</p><label for="pqq">Question</label><input id="pqq" maxlength="120" placeholder="Where should we eat?"><div id="pos"></div><div class="row mt"><button class="btn" id="pad">＋ Option</button><button class="btn pri" id="pgo">Ask</button></div>'); A().sheet.onclick = null;
  const add = (v = "") => { const i = document.createElement("input"); i.maxLength = 60; i.placeholder = "Option " + ($("pos").children.length + 1); i.value = v; i.className = "po-in"; $("pos").appendChild(i); }; add(); add(); $("pad").onclick = () => { if ($("pos").children.length < 5) add(); };
  $("pgo").onclick = () => { const q = $("pqq").value.trim(), o = [...$("pos").children].map((i) => i.value.trim()).filter(Boolean); if (!q || o.length < 2) return toast("A question and at least two options."); A().sendMsg({ k: "poll", q, o }); A().hideSheet(); };
};
// ── shared lists ───────────────────────────────────────────────────────────────────────────
K.list = { render(m) {
  const T = A().D.ticks[m.id] || {}, items = [...m.p.it.map((t) => ({ t })), ...(A().D.ladd[m.id] || [])], done = items.filter((_, i) => T[i] && T[i].on).length;
  return '<div class="lst"><div class="pq">📝 ' + esc(m.p.s) + " <small>" + done + "/" + items.length + "</small></div>" + items.map((it, i) => '<button class="li ' + (T[i] && T[i].on ? "on" : "") + '" data-act="tick" data-i="' + i + '"><i>' + (T[i] && T[i].on ? "✓" : "") + "</i><span>" + esc(it.t) + "</span></button>").join("") + '<div class="ladd"><input placeholder="Add an item…" maxlength="80"><button data-act="ladd" aria-label="Add">＋</button></div></div>';
} };
B.acts.tick = (ds, m) => { if (!m) return; const T = A().D.ticks[m.id] || {}, on = !(T[+ds.i] && T[+ds.i].on); A().sendMsg({ k: "tick", of: m.id, i: +ds.i, on }); B.snd("tick"); };
B.acts.ladd = (ds, m, btn) => { const inp = btn.previousElementSibling, t = (inp.value || "").trim(); if (!t || !m) return; inp.value = ""; A().sendMsg({ k: "ladd", of: m.id, t }); };
S.list = () => {
  A().showSheet('<h2 class="disp">Shared list</h2><p>Groceries, packing, things to do. You both tick things off.</p><label for="lt">Title</label><input id="lt" maxlength="60" placeholder="Groceries"><label for="li">Items (one per line)</label><textarea id="li" placeholder="Milk&#10;Bread&#10;Coffee"></textarea><div class="row mt"><button class="btn pri" id="lgo">Create</button></div>'); A().sheet.onclick = null;
  $("lgo").onclick = () => { const s = $("lt").value.trim() || "List", it = $("li").value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 40); if (!it.length) return toast("Add at least one item."); A().sendMsg({ k: "list", s, it }); A().hideSheet(); };
};
// ── countdowns ─────────────────────────────────────────────────────────────────────────────
K.count = { render(m) {
  const left = m.p.due - Date.now(), past = left <= 0; return '<div class="cd"><div class="cdt">⏰ ' + esc(m.p.s) + '</div><div class="cdn">' + (past ? "today 🎉" : B.mm(left)) + "</div><small>" + esc(B.when(m.p.due)) + "</small></div>";
} };
S.count = () => {
  const d = new Date(Date.now() + 30 * 864e5); d.setHours(9, 0, 0, 0); const fmt = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  A().showSheet('<h2 class="disp">Countdown</h2><p>Something to look forward to. It sits under the stars until the day.</p><label for="ct">What</label><input id="ct" maxlength="40" placeholder="Seeing each other"><label for="cw">When</label><input id="cw" type="datetime-local" value="' + fmt(d) + '"><div class="row mt"><button class="btn pri" id="cgo">Start it</button></div>'); A().sheet.onclick = null;
  $("cgo").onclick = () => { const s = $("ct").value.trim(), at = new Date($("cw").value).getTime(); if (!s) return toast("Name it first."); if (!(at > Date.now() + 6e4)) return toast("Pick a time in the future."); A().sendMsg({ k: "count", s, due: at }); A().hideSheet(); };
};
// ── where I am ─────────────────────────────────────────────────────────────────────────────
K.loc = { render(m) {
  const p = m.p, my = B.myPos, g = my ? B.geo(my, p) : null, mine = m.from === A().ME.user;
  const arrow = g && !mine ? '<svg class="compass" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" opacity=".3"/><path d="M20 6 L26 24 L20 20 L14 24 Z" fill="currentColor" transform="rotate(' + Math.round(g.brg) + ' 20 20)"/></svg>' : "";
  return '<div class="loc">' + arrow + "<div><b>📍 " + (mine ? "You were here" : esc(A().THEM.name) + " is here") + "</b><div>" + p.lat.toFixed(4) + ", " + p.lon.toFixed(4) + (p.acc ? " · ±" + Math.round(p.acc) + " m" : "") + "</div>" + (g && !mine ? "<div class=\"dd\">" + B.dist(g.d) + " " + B.dir(g.brg) + " of you</div>" : "") + '<a href="https://www.openstreetmap.org/?mlat=' + p.lat + "&mlon=" + p.lon + "#map=16/" + p.lat + "/" + p.lon + '" target="_blank" rel="noopener noreferrer">Open in a map</a></div></div>';
} };
const here = () => new Promise((res, rej) => { if (!navigator.geolocation) return rej(); navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }); });
S.loc = async () => {
  A().showSheet('<h2 class="disp">Where I am</h2><p>One sealed pin, once. Nothing follows you, and the server never learns where.</p><div class="msg" id="lm">Finding you…</div><div class="row mt"><button class="btn pri" id="lgo" disabled>Send my location</button></div>'); A().sheet.onclick = null; let pos = null;
  try { pos = await here(); B.myPos = pos; $("lm").textContent = pos.lat.toFixed(4) + ", " + pos.lon.toFixed(4) + " (±" + Math.round(pos.acc) + " m)"; $("lgo").disabled = false; } catch (e) { $("lm").textContent = "I couldn't get your location. Check that location is allowed for this site."; }
  $("lgo").onclick = () => { A().sendMsg({ k: "loc", lat: +pos.lat.toFixed(5), lon: +pos.lon.toFixed(5), acc: Math.round(pos.acc) }); A().hideSheet(); };
};
try { navigator.permissions && navigator.permissions.query({ name: "geolocation" }).then((r) => { if (r.state === "granted") here().then((p) => { B.myPos = p; }).catch(() => {}); }); } catch (e) {}
// ── status ─────────────────────────────────────────────────────────────────────────────────
const MOODS = [["🙂", "free to talk"], ["💼", "working"], ["😴", "sleeping"], ["🚗", "driving"], ["🌙", "winding down"], ["💭", "thinking of you"], ["🍳", "cooking"], ["🏃", "out and about"]];
S.status = () => {
  const cur = A().D.status[A().ME.user]; let pick = MOODS[0], dur = 4;
  A().showSheet('<h2 class="disp">Your status</h2><p>A small note that sits next to your star for them to see.</p><div class="grid" id="mg">' + MOODS.map(([e, w], i) => '<button class="opt ' + (i === 0 ? "s2" : "") + '" data-mi="' + i + '"><b>' + e + "</b>" + esc(w) + "</button>").join("") + '</div><label for="mt">Or say it yourself</label><input id="mt" maxlength="40" placeholder="at the dentist, back at 3"><label>For</label><div class="seg" id="md">' + [[1, "1 hour"], [4, "4 hours"], [24, "Today"]].map(([h, l]) => '<button data-h="' + h + '" class="' + (h === 4 ? "on" : "") + '">' + l + "</button>").join("") + '</div><div class="row mt"><button class="btn pri" id="mgo">Set status</button>' + (cur && cur.e ? '<button class="btn" id="mclr">Clear</button>' : "") + "</div>");
  A().sheet.onclick = (e) => { const b = e.target.closest("[data-mi]"), h = e.target.closest("[data-h]"); if (b) { pick = MOODS[+b.dataset.mi]; document.querySelectorAll("#mg .opt").forEach((x) => x.classList.toggle("s2", x === b)); $("mt").value = ""; } if (h) { dur = +h.dataset.h; document.querySelectorAll("#md button").forEach((x) => x.classList.toggle("on", x === h)); } };
  $("mgo").onclick = () => { const t = $("mt").value.trim() || pick[1]; A().sendMsg({ k: "status", e: pick[0], t }, { exp: Date.now() + dur * 36e5 }); A().hideSheet(); };
  if ($("mclr")) $("mclr").onclick = () => { A().sendMsg({ k: "status", e: "", t: "" }, { exp: Date.now() + 36e5 }); A().hideSheet(); };
};
// ── tic-tac-toe, one message to start and one tiny move at a time ──────────────────────────
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function board(m) { const b = Array(9).fill(""), first = m.p.x, other = first === A().ME.user ? A().THEM.user : A().ME.user; let turn = first, n = 0; for (const mv of A().D.moves[m.id] || []) { if (mv.by !== turn || b[mv.i]) continue; b[mv.i] = turn === first ? "X" : "O"; turn = turn === first ? other : first; n++; } let win = null; for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) win = { l: [a, c, d], s: b[a] }; return { b, turn, first, win, full: n === 9 }; }
K.ttt = { render(m) {
  const bd = board(m), me = A().ME.user, over = bd.win || bd.full, you = bd.first === me ? "X" : "O", st = bd.win ? (bd.win.s === you ? "You won 🎉" : A().THEM.name + " won") : bd.full ? "A draw" : bd.turn === me ? "Your turn (" + you + ")" : "Waiting for " + A().THEM.name;
  return '<div class="ttt"><div class="pq">⭕ Tic-tac-toe</div><div class="tb">' + bd.b.map((c, i) => '<button class="tc ' + (bd.win && bd.win.l.includes(i) ? "w" : "") + (c === "X" ? " x" : c === "O" ? " o" : "") + '" data-act="move" data-i="' + i + '"' + (c || over || bd.turn !== me ? " disabled" : "") + ">" + c + "</button>").join("") + "</div><small>" + esc(st) + "</small>" + (over ? ' <button class="btn mini" data-act="rematch">Play again</button>' : "") + "</div>";
} };
B.acts.move = (ds, m) => { if (!m) return; const bd = board(m); if (bd.turn !== A().ME.user || bd.b[+ds.i] || bd.win || bd.full) return; A().sendMsg({ k: "move", g: m.id, i: +ds.i }); B.snd("pop"); };
B.acts.rematch = () => S.game();
S.game = () => { A().sendMsg({ k: "ttt", x: A().ME.user }); toast("Game on. You're X."); };
// ── video clips ────────────────────────────────────────────────────────────────────────────
S.clip = () => {
  A().showSheet('<h2 class="disp">Video clip</h2><p>Up to 10 seconds, sealed on this phone before it leaves.</p><div class="cam"><video id="cv" playsinline muted></video></div><div class="row mt"><button class="btn pri" id="cr">● Record</button><span class="mono" id="ct2">0:00</span></div><div class="row mt"><button class="btn pri" id="cs" disabled>Send</button></div>'); A().sheet.onclick = null;
  let st = null, rec = null, chunks = [], bytes = null, mime = "", t0 = 0, tick = 0;
  const stop = () => { if (st) st.getTracks().forEach((t) => t.stop()); st = null; }; const prev = A().hideSheet; // release the camera when the sheet closes
  (async () => { try { st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } }, audio: true }); $("cv").srcObject = st; $("cv").play().catch(() => {}); } catch (e) { toast("I need camera and microphone access for that."); } })();
  const watch = setInterval(() => { if (!$("cv") || !A().sheet.classList.contains("on")) { clearInterval(watch); stop(); try { rec && rec.state !== "inactive" && rec.stop(); } catch (e) {} } }, 500);
  $("cr").onclick = () => {
    if (rec && rec.state === "recording") return rec.stop(); if (!st) return;
    chunks = []; mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : ""; rec = new MediaRecorder(st, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 420000, audioBitsPerSecond: 32000 }); mime = rec.mimeType || "video/webm"; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => { clearInterval(tick); const blob = new Blob(chunks, { type: mime }); bytes = new Uint8Array(await blob.arrayBuffer()); if (!$("cv")) return; $("cr").textContent = "● Again"; $("cv").srcObject = null; $("cv").src = URL.createObjectURL(blob); $("cv").muted = false; $("cv").loop = true; $("cv").play().catch(() => {}); $("cs").disabled = bytes.length > 1.5 * 1024 * 1024; if ($("cs").disabled) toast("That one's too big. Try a shorter clip."); };
    rec.start(); t0 = Date.now(); $("cr").textContent = "■ Stop"; tick = setInterval(() => { const s = (Date.now() - t0) / 1000; $("ct2").textContent = "0:" + String(Math.floor(s)).padStart(2, "0"); if (s >= 10) rec.stop(); }, 200);
  };
  $("cs").onclick = async () => { $("cs").disabled = true; try { const id = await A().uploadBlob(bytes); await A().sendMsg({ k: "clip", m: mime.split(";")[0], d: (Date.now() - t0) / 1000 }, { blob: id }); stop(); A().hideSheet(); } catch (e) { $("cs").disabled = false; toast("Clips need a signal. Try again in a moment."); } };
};
// ── studio: draw on a photo or a blank page, add words, pick a look ────────────────────────
const FILTERS = [["none", "Natural"], ["grayscale(1) contrast(1.1)", "Noir"], ["sepia(.55) saturate(1.3)", "Warm"], ["saturate(1.7) contrast(1.05)", "Vivid"], ["hue-rotate(185deg) saturate(1.15)", "Cool"], ["brightness(1.12) contrast(.9) saturate(1.2)", "Dream"]];
const INK = ["#ffffff", "#111111", "#ff4d6d", "#ffb703", "#8ef28e", "#4cc9f0", "#7b5cff", "#ff8fb8"];
B.studio = (photo) => {
  const old = $("studio"); if (old) old.remove(); A().hideSheet();
  const W = photo ? photo.width : 900, H = photo ? photo.height : 1125, ov = document.createElement("div"); ov.id = "studio"; document.body.classList.add("modal"); B.Void.pause(true);
  ov.innerHTML = '<div class="sh"><button class="btn" id="sx">✕</button><b class="disp">Studio</b><button class="btn pri" id="ss">Send</button></div><div class="sc"><canvas id="sc"></canvas></div><div class="st"><div class="inks">' + INK.map((c, i) => '<button data-ink="' + c + '" class="' + (i === 0 ? "on" : "") + '" style="background:' + c + '"></button>').join("") + '<input type="range" id="sz" min="2" max="40" value="8" aria-label="Brush size"></div><div class="row"><button class="btn mini" id="su">↶ Undo</button><button class="btn mini" id="sk">Clear</button><button class="btn mini" id="st">T Text</button>' + (photo ? "" : '<button class="btn mini" id="sb">◐ Page</button>') + '</div><div class="seg wrap" id="sf">' + FILTERS.map(([f, n], i) => '<button data-f="' + esc(f) + '" class="' + (i === 0 ? "on" : "") + '">' + n + "</button>").join("") + '</div><input id="scap" maxlength="200" placeholder="Caption (optional)"></div>';
  document.body.appendChild(ov); const cv = $("sc"), g = cv.getContext("2d"); cv.width = W; cv.height = H; let ink = INK[0], filt = "none", dark = true; const strokes = []; let cur = null;
  const paint = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.filter = "none"; g.fillStyle = dark ? "#0b0d1c" : "#fafaf5"; g.fillRect(0, 0, W, H); if (photo) { g.filter = filt; g.drawImage(photo, 0, 0, W, H); g.filter = "none"; } else if (filt !== "none") { /* a page takes the look from what is drawn on it */ }
    for (const s of strokes) { if (s.t) { g.font = "700 " + s.size * 3 + "px system-ui,sans-serif"; g.textAlign = "center"; g.fillStyle = s.c; g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 8; g.fillText(s.t, s.x, s.y); g.shadowBlur = 0; continue; } g.strokeStyle = s.c; g.lineWidth = s.size; g.lineCap = g.lineJoin = "round"; if (!photo && filt !== "none") g.filter = filt; g.beginPath(); s.p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (s.p.length === 1) g.lineTo(s.p[0][0] + .1, s.p[0][1]); g.stroke(); g.filter = "none"; } };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  cv.style.touchAction = "none"; cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); cur = { c: ink, size: +$("sz").value * W / 500, p: [pt(e)] }; strokes.push(cur); paint(); }; cv.onpointermove = (e) => { if (cur) { cur.p.push(pt(e)); paint(); } }; cv.onpointerup = cv.onpointercancel = () => { cur = null; };
  ov.querySelector(".inks").onclick = (e) => { const b = e.target.closest("[data-ink]"); if (b) { ink = b.dataset.ink; ov.querySelectorAll("[data-ink]").forEach((x) => x.classList.toggle("on", x === b)); } };
  $("su").onclick = () => { strokes.pop(); paint(); }; $("sk").onclick = () => { strokes.length = 0; paint(); }; if ($("sb")) $("sb").onclick = () => { dark = !dark; paint(); };
  $("st").onclick = () => { const t = prompt("Words on the picture:"); if (t) { strokes.push({ t: t.slice(0, 60), c: ink, size: +$("sz").value * W / 500 + 8, x: W / 2, y: H * .5 }); paint(); } };
  $("sf").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { filt = b.dataset.f; $("sf").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); paint(); } };
  const close = () => { ov.remove(); document.body.classList.remove("modal"); B.Void.pause(false); }; $("sx").onclick = close;
  $("ss").onclick = async () => { $("ss").disabled = true; try { let c = cv, q = .85, blob; const MAXW = 1400; if (W > MAXW) { c = document.createElement("canvas"); c.width = MAXW; c.height = Math.round(H * MAXW / W); c.getContext("2d").drawImage(cv, 0, 0, c.width, c.height); } do { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); q -= .1; } while (blob.size > 1.4 * 1024 * 1024 && q > .2); const u8 = new Uint8Array(await blob.arrayBuffer()), id = await A().uploadBlob(u8); await A().sendMsg({ k: "drop", m: "image/jpeg", w: c.width, h: c.height, t: $("scap").value.trim(), studio: 1 }, { blob: id }); const last = [...A().M.values()].filter((m) => m.tmp).pop(); if (last) A().blobURL.set(last.id, URL.createObjectURL(blob)); close(); } catch (e) { $("ss").disabled = false; toast("That needs a signal. Try again in a moment."); } };
  paint();
};
S.studio = () => B.studio(null);
// ── shared: everything you've sent each other, by kind ─────────────────────────────────────
S.shared = (tab) => {
  tab = tab === "pins" || tab === "links" ? tab : "photos"; const msgs = A().sorted().filter((m) => !m.tmp && !A().locked(m)).reverse();
  const photos = msgs.filter((m) => m.p && (m.p.k === "drop" || m.p.k === "clip") && m.blob), links = [], pins = msgs.filter((m) => A().D.pins.has(m.id));
  for (const m of msgs) { const t = m.p && (m.p.t || ""); if (t) for (const u of String(t).match(/https?:\/\/[^\s<>"]+/g) || []) links.push({ u, m }); }
  const tabs = '<div class="tabs">' + [["photos", "Photos & clips", photos.length], ["links", "Links", links.length], ["pins", "Pinned", pins.length]].map(([k, l, n]) => '<button data-sh="' + k + '" class="' + (tab === k ? "on" : "") + '">' + l + " " + n + "</button>").join("") + "</div>";
  const body = tab === "photos" ? (photos.length ? '<div class="gal">' + photos.map((m) => '<button class="gi" data-gi="' + esc(m.id) + '">' + (A().blobURL.has(m.id) ? (m.p.k === "clip" ? '<video src="' + A().blobURL.get(m.id) + '" muted playsinline preload="metadata"></video>' : '<img src="' + A().blobURL.get(m.id) + '" alt="">') : "<span>…</span>") + (m.p.k === "clip" ? '<em>▶</em>' : "") + "</button>").join("") + "</div>" : '<p class="note">No photos or clips yet.</p>')
    : tab === "links" ? (links.length ? links.map((l) => '<a class="lk" href="' + esc(l.u) + '" target="_blank" rel="noopener noreferrer">' + esc(l.u) + "<small>" + esc(B.when(l.m.ts)) + "</small></a>").join("") : '<p class="note">No links yet.</p>')
    : (pins.length ? pins.map((m) => '<button class="pn" data-pj="' + esc(m.id) + '"><small>' + esc(m.from === A().ME.user ? "You" : A().THEM.name) + " · " + esc(B.when(m.ts)) + "</small>" + esc(A().snip(m)) + "</button>").join("") : '<p class="note">Nothing pinned. Press and hold a message, then Pin.</p>');
  A().showSheet('<h2 class="disp">Shared</h2>' + tabs + '<div id="shb">' + body + "</div>");
  A().sheet.onclick = (e) => { const t = e.target.closest("[data-sh]"); if (t) return S.shared(t.dataset.sh); const j = e.target.closest("[data-pj]"); if (j) { A().hideSheet(); return A().jump(j.dataset.pj); } const g = e.target.closest("[data-gi]"); if (g) { A().hideSheet(); A().jump(g.dataset.gi); } };
  if (tab === "photos") for (const m of photos) if (!A().blobURL.has(m.id)) A().blobOf(m).then(() => { if ($("shb") && A().sheet.querySelector('[data-sh="photos"].on')) S.shared("photos"); }).catch(() => {});
};
})();
