// Barycenter · the app: gate, messages, the timeline, the composer, settings, and the glue to the Void and the live line.
(() => {
"use strict";
const { $, esc, store, b64, unb64, b64u, unb64u, hex, sha256hex, slug, post, api, toast, ago, hm, when, dayKey, dayLabel } = B;
const PULSES = [
  { k: "love", e: "❤️", w: "I love you", c: "#ff6b8a" }, { k: "miss", e: "🌙", w: "I miss you", c: "#8ea8ff" }, { k: "think", e: "✨", w: "Thinking of you", c: "#ffe07a" }, { k: "hug", e: "🫂", w: "Sending a hug", c: "#ffb072" },
  { k: "kiss", e: "😘", w: "A kiss", c: "#ff8fb8" }, { k: "proud", e: "🌟", w: "So proud of you", c: "#9dff9d" }, { k: "good", e: "☀️", w: "Good morning", c: "#ffd36b" }, { k: "night", e: "🌌", w: "Goodnight", c: "#9b8cff" },
  { k: "hard", e: "🫶", w: "Rough day. I'm here", c: "#7fdcc8" }, { k: "laugh", e: "😂", w: "You made me laugh", c: "#ffc15e" },
];
const CHECKS = [{ k: "ok", e: "💚", w: "I'm okay" }, { k: "home", e: "🚗", w: "Heading home" }, { k: "arrived", e: "📍", w: "I've arrived safe" }, { k: "call", e: "📞", w: "Call me when you can" }, { k: "sos", e: "🚨", w: "I need you now", lvl: 2 }];
const REACTS = ["❤️", "😂", "🥺", "🔥", "✨", "👍"];
const QUESTIONS = ["What's one small thing I did recently that you noticed and loved?", "What's a memory of us you could live inside for an hour?", "What are you looking forward to this week?", "What's something you've been worrying about that you haven't said?", "If we had a free day with no plans and no phones, what would we do?", "What song feels like us right now?", "What's something you want us to try together?", "When did you last feel really close to me?", "What's a tiny ritual of ours you'd never want to lose?", "What made you smile today that I missed?", "What do you need more of from me right now?", "What's a place you want us to see together?", "What's something you're proud of that nobody has noticed?", "What's the best part of an ordinary day with me?", "What's a fear you'd like to hold hands through?", "Which of my habits do you secretly adore?", "What did you want to tell me today but it got lost?", "What would our perfect lazy morning look like?", "What's something I taught you without meaning to?", "What are three things you're grateful for about us?", "What's the funniest thing we've ever done together?", "If you could bottle one moment of ours, which one?", "What's a dream you haven't told many people?", "How can I make your week softer?", "What's something you'd like to say thank you for?", "What do you miss most when we're apart?", "What's a small adventure we could have this month?", "What are you tired of carrying that I could take?", "What's the first thing you noticed about me?", "What should we never stop doing?", "What does home feel like to you?", "What's something you want to remember about this season of our lives?", "What's one thing you'd tell us a year ago?", "What's something that always makes you feel safe?", "What would you like to be asked more often?", "What's something you love about the way we fight and make up?", "Which day with me would you replay?", "What small kindness meant the most lately?", "What do you hope for us in five years?", "What's your favorite thing about how we talk?", "What are you curious about in me?", "What's a risk you'd like us to take?", "What did you learn about yourself recently?", "What makes a good day for you?", "What's a quiet moment we shared that you still think about?", "How are you really, underneath the okay?", "What song should be ours?", "What's a smell, sound or taste that means us?", "What are you saving for a special day?", "What do you wish I'd ask?", "What are we doing right?", "What's something small I could do tomorrow to surprise you?", "What does being loved well look like for you?", "What's something you'd like us to stop postponing?", "What's something funny you've been saving to tell me?", "What do you love about where we are in life?", "What's a hope you hold for the two of us this year?", "What would you tell the version of me who just met you?", "What's something you're looking forward to with me?", "Where do you feel most like yourself?"];
const todaysQ = () => { const d = new Date(), n = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); return QUESTIONS[n % QUESTIONS.length]; };
const pulseOf = (k) => PULSES.find((q) => q.k === k) || PULSES[2];
B.apply();

// ═══ the gate ═══════════════════════════════════════════════════════════════════════════════
const gc = $("gc");
const gate = (html) => { gc.innerHTML = '<div class="mark" aria-hidden="true"><i></i><i></i></div><h1 class="disp">Barycenter</h1>' + html; };
const busy = (btn, msg, on) => { if (btn) btn.disabled = on; if (msg) $("gm").textContent = on ? msg : ""; $("gm") && $("gm").classList.remove("bad"); };
const fail = (e) => { const g = $("gm"); if (g) { g.textContent = e.err || e.message || "Something went wrong."; g.classList.add("bad"); } };
async function signIn(user, pass) {
  const proof = await B.loginProof(user, pass);
  const r = await fetch("/api/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "us", proof }) });
  if (r.status === 429) throw { err: "Too many tries. Wait a few minutes." }; if (r.status === 401) throw { err: "That isn't right." }; if (!r.ok) throw { err: "Couldn't reach the server." };
  store.set("us-user", user);
  const me = await api("me"), raw = await B.unwrapKey(me.wrap, user + "\0" + pass);
  store.set("us-key", b64(raw)); await B.setKey(raw); return me; // the key stays on this device so tomorrow it opens straight away
}
function showLogin(name) {
  $("app").classList.add("hidden"); $("gate").classList.remove("hidden");
  gate('<p>Welcome back.</p><label for="gu">Your name</label><input id="gu" autocomplete="username" autocapitalize="off" value="' + esc(name || store.get("us-user") || "") + '"><label for="gp">Password</label><input id="gp" type="password" autocomplete="current-password"><button class="btn pri full" id="gb">Open our sky</button><div class="msg" id="gm"></div>');
  const go = async () => { const u = slug($("gu").value), p = $("gp").value; if (!u || !p) return fail({ err: "Name and password, please." }); busy($("gb"), "Unlocking… (a few seconds)", true);
    try { await signIn(u, p); startApp(); } catch (e) { busy($("gb"), "", false); fail(e); $("gp").value = ""; } };
  $("gb").onclick = go; $("gp").addEventListener("keydown", (e) => e.key === "Enter" && go()); ($("gu").value ? $("gp") : $("gu")).focus();
}
function showSetup() {
  gate('<p>Make a private place for the two of you. Everything said here is sealed with a key only you two will ever hold.</p><label for="s1">Your name</label><input id="s1" autocapitalize="words"><label for="s2">Her name</label><input id="s2" autocapitalize="words"><label for="s3">Your password</label><input id="s3" type="password" autocomplete="new-password"><label for="s4">Again</label><input id="s4" type="password" autocomplete="new-password"><button class="btn pri full" id="gb">Create our space</button><div class="msg" id="gm"></div>');
  $("gb").onclick = async () => {
    const n1 = $("s1").value.trim(), n2 = $("s2").value.trim(), p = $("s3").value, u1 = slug(n1), u2 = slug(n2);
    if (!u1 || !u2 || u1 === u2) return fail({ err: "Two different names, using letters or numbers." }); if (p.length < 8) return fail({ err: "At least 8 characters for the password." }); if (p !== $("s4").value) return fail({ err: "The passwords don't match." });
    busy($("gb"), "Making our key… (a few seconds)", true);
    try {
      const raw = crypto.getRandomValues(new Uint8Array(32)), code = hex(crypto.getRandomValues(new Uint8Array(16)));
      const body = { me: { name: n1, verifier: await B.verifierOf(u1, p), wrap: await B.wrapKey(raw, u1 + "\0" + p) }, partner: { name: n2 }, invite: await sha256hex(B.enc.encode(code)) };
      await post("setup", body); await signIn(u1, p);
      showInvite(location.origin + "/barycenter#join=" + code + "." + b64u(raw), n2);
    } catch (e) { busy($("gb"), "", false); fail(e); }
  };
}
function showInvite(link, name) {
  gate('<p>Now bring ' + esc(name) + ' in. This link holds the key to your space. Open it on her phone yourself, or send it by a channel you trust. It works once, and only for 14 days.</p><div class="linkbox" id="lk">' + esc(link) + '</div><div class="row mt"><button class="btn pri" id="cp">Copy link</button><button class="btn" id="sh">Share…</button><button class="btn" id="dn">Go to our sky</button></div><div class="msg" id="gm"></div>');
  $("cp").onclick = async () => { try { await navigator.clipboard.writeText(link); $("gm").textContent = "Copied."; } catch (e) { const r = document.createRange(); r.selectNode($("lk")); getSelection().removeAllRanges(); getSelection().addRange(r); $("gm").textContent = "Selected: copy it."; } };
  if (navigator.share) $("sh").onclick = () => navigator.share({ title: "Barycenter", text: "Our private place", url: link }).catch(() => {}); else $("sh").classList.add("hidden");
  $("dn").onclick = startApp;
}
async function showClaim(code, keyB64) {
  let inv; try { inv = await api("invite?code=" + encodeURIComponent(code)); } catch (e) { return gate("<p>This invite is not valid any more. Ask for a new one.</p>"); }
  gate('<p>' + esc(inv.from) + ' invited you, ' + esc(inv.name) + '. Choose a password for yourself. Only you will know it.</p><label for="c1">Password</label><input id="c1" type="password" autocomplete="new-password"><label for="c2">Again</label><input id="c2" type="password" autocomplete="new-password"><button class="btn pri full" id="gb">Join ' + esc(inv.from) + '</button><div class="msg" id="gm"></div>');
  $("gb").onclick = async () => {
    const p = $("c1").value; if (p.length < 8) return fail({ err: "At least 8 characters." }); if (p !== $("c2").value) return fail({ err: "The passwords don't match." });
    busy($("gb"), "Sealing your key… (a few seconds)", true);
    try { const raw = unb64u(keyB64); await post("claim", { code, verifier: await B.verifierOf(inv.user, p), wrap: await B.wrapKey(raw, inv.user + "\0" + p) }); await signIn(inv.user, p); history.replaceState(null, "", location.pathname); startApp(); } catch (e) { busy($("gb"), "", false); fail(e); }
  };
}

// ═══ messages ═══════════════════════════════════════════════════════════════════════════════
let ME = null, THEM = null, evCursor = "0", M = new Map(), OUT = [], more = false, oldest = null, mode = 0, pollT = 0, flushing = false, seenAt = 0, tickN = 0;
const blobURL = new Map(), sortT = (m) => (m.p && m.p.at) || m.ts;
const sorted = () => [...M.values()].sort((a, b) => (sortT(a) - sortT(b)) || (a.id < b.id ? -1 : 1));
const locked = (m) => m.unlock && Date.now() < m.unlock;
async function take(m) {
  const old = M.get(m.id); if (old && !old.tmp) { Object.assign(old, { dl: m.dl, rd: m.rd, ak: m.ak, rx: m.rx || old.rx }); return old; }
  const x = { id: m.id, from: m.from, ts: m.ts, lvl: m.lvl, q: m.q, unlock: m.unlock, blob: m.blob, dl: m.dl, rd: m.rd, ak: m.ak, rx: m.rx, p: await B.open(m) };
  M.set(m.id, x); return x;
}
async function loadHistory(before) {
  const j = await api("history?limit=60" + (before ? "&before=" + encodeURIComponent(before) : ""));
  for (const m of j.msgs) await take(m);
  more = j.more && j.msgs.length > 0; if (j.msgs.length) oldest = j.msgs[0].id; if (!before) evCursor = j.ev;
}
const heard = (m) => { const c = m.p && m.p.k === "pulse" ? pulseOf(m.p.e).c : null; B.Void.arrive(c); B.snd(m.p && m.p.k === "pulse" ? "pulse" : "arrive"); B.hap(m.lvl >= 2 ? [300, 100, 300] : 30); };
async function sync() {
  let j; try { j = await api("sync?ev=" + encodeURIComponent(evCursor)); } catch (e) { if (e.auth) return showLogin(); return; }
  seenAt = j.seen || seenAt; let changed = false;
  for (const ev of j.events) {
    if (ev.t === "new") { const had = M.has(ev.m.id), x = await take(ev.m); if (!had) { changed = true; if (x.from !== ME.user) { if (document.visibilityState === "visible") heard(x); if (x.p && x.p.at) toast("A memory landed in " + when(x.p.at)); } } }
    else { const m = M.get(ev.id); if (ev.t === "del") { if (m) M.delete(ev.id); changed = true; } else if (ev.t === "rx") { if (m) { m.rx = ev.rx; changed = true; } } else if (m) { m[ev.t] = ev.at || Date.now(); changed = true; if (ev.t === "dl") B.Void.delivered(); } }
  }
  evCursor = j.ev || evCursor;
  if (changed) renderLog(); else renderCap();
  if (j.events.length >= 100) sync();
}
const live = () => B.Live.state === "live";
function schedulePoll() { clearTimeout(pollT); pollT = setTimeout(async () => { await sync(); flush(); schedulePoll(); }, document.visibilityState !== "visible" ? 20000 : live() ? 30000 : 3500); }
B.Live.on("poke", () => sync());
B.Live.on("state", () => { renderCap(); schedulePoll(); });
B.Live.on("pres", () => { B.vs.present = B.Live.present && document.visibilityState === "visible"; if (B.Live.present) seenAt = Date.now(); renderCap(); B.Void.need(); });
// reading: pulses, check-ins and answers count as seen once on screen; words wait to be observed (see collapse)
const needsLook = (m) => m.from !== ME.user && !m.tmp && !m.rd && !m.col && !locked(m) && m.p && (m.p.k === "note" || m.p.k === "drop");
async function ackSeen() {
  if (document.visibilityState !== "visible") return;
  const ids = sorted().filter((m) => m.from !== ME.user && !m.tmp && !m.rd && m.p && (["pulse", "dq"].includes(m.p.k) || (m.p.k === "checkin" && m.lvl < 2))).map((m) => m.id);
  if (!ids.length) return; ids.forEach((id) => (M.get(id).rd = Date.now())); try { await post("ack", { ids }); } catch (e) { ids.forEach((id) => (M.get(id).rd = 0)); }
}
async function collapse(id) { // the moment of being observed: blurred and uncertain until then
  const m = M.get(id); if (!m || m.col || m.from === ME.user) return; m.col = 1; m.rd = m.rd || Date.now(); const el = els.get(id); if (el) { el.el.classList.add("collapsing"); setTimeout(() => el.el.classList.remove("q", "collapsing"), 650); }
  B.snd("open"); B.hap(12); B.Void.burst("me", B.palette().her); if (!m.tmp) post("ack", { ids: [id] }).catch(() => {}); setTimeout(() => renderLog(), 700);
}
async function sendMsg(p, o = {}) {
  const sl = await B.seal(p), tmp = "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), ts = Date.now();
  OUT.push({ tmp, ct: sl.ct, iv: sl.iv, lvl: o.lvl || 0, q: o.q ? 1 : 0, unlock: o.unlock || 0, blob: o.blob || null, ts }); store.set("us-out", JSON.stringify(OUT));
  M.set(tmp, { id: tmp, from: ME.user, ts, lvl: o.lvl || 0, q: o.q ? 1 : 0, unlock: o.unlock || 0, blob: o.blob, p, tmp: true, dl: 0, rd: 0, ak: 0 });
  B.Void.launch(p, p.k === "pulse" ? pulseOf(p.e).c : null); B.snd("send"); B.hap(10); renderLog(true); flush();
}
async function flush() {
  if (flushing || !OUT.length) return; flushing = true;
  try {
    while (OUT.length) {
      const e = OUT[0];
      try {
        const r = await post("send", { ct: e.ct, iv: e.iv, lvl: e.lvl, q: e.q, unlock: e.unlock, blob: e.blob });
        const m = M.get(e.tmp), cell = els.get(e.tmp); M.delete(e.tmp); els.delete(e.tmp); if (m) { m.id = r.id; m.tmp = false; M.set(r.id, m); if (cell) { cell.el.dataset.id = r.id; els.set(r.id, cell); } }
        OUT.shift(); store.set("us-out", JSON.stringify(OUT));
      } catch (err) { if (err.auth) { showLogin(); break; } if (err.status === 400) { M.delete(e.tmp); OUT.shift(); store.set("us-out", JSON.stringify(OUT)); toast("One message couldn't be sent."); continue; } break; }
    }
  } finally { flushing = false; renderLog(); }
}
addEventListener("online", () => { flush(); sync(); B.Live.start(); });

// ═══ the timeline: a keyed DOM, so nothing that is already on screen is ever rebuilt ═════════
const els = new Map(); let renderQ = 0;
function recState(m) { if (m.from !== ME.user) return ""; if (m.tmp) return '<span class="rc">⌁ waiting for signal</span>'; if (locked(m)) return '<span class="rc">⏳ sealed until ' + esc(when(m.unlock)) + "</span>"; if (m.ak) return '<span class="rc seen">✦ answered</span>'; if (m.rd) return '<span class="rc seen">✦ observed ' + esc(ago(m.rd)) + "</span>"; if (m.dl) return '<span class="rc">◌ in ' + esc(THEM.name) + "'s hands, not yet observed</span>"; return '<span class="rc">· sent</span>'; }
function body(m) {
  const mine = m.from === ME.user, p = m.p || { k: "lost" };
  if (p.k === "note") return '<div class="t">' + esc(p.t) + "</div>";
  if (p.k === "pulse") { const x = pulseOf(p.e); return '<div class="pulse" style="--pc:' + x.c + '"><i></i><span>' + x.e + " " + esc(x.w) + "</span></div>" + (p.t ? '<div class="t">' + esc(p.t) + "</div>" : ""); }
  if (p.k === "letter") return '<div class="env ' + (mine || m.rd ? "read" : "") + '" data-open="' + esc(m.id) + '"><span class="wax"></span><span><b>' + esc(p.s || "A letter") + "</b><small>" + (mine ? "a letter you wrote · tap to read" : m.rd ? "opened · tap to read again" : "sealed · tap to open") + "</small></span></div>";
  if (p.k === "capsule") return locked(m) ? '<div class="cap"><span class="orb"></span><span>A time capsule, sealed until<br>' + esc(when(m.unlock)) + "</span></div>" : '<div class="card"><div class="h">TIME CAPSULE · written ' + esc(when(m.ts)) + '</div><div class="t">' + esc(p.t) + "</div></div>";
  if (p.k === "drop") return '<div class="drop"><div class="ph" data-img="' + esc(m.id) + '">' + (blobURL.has(m.id) ? "" : "opening…") + "</div>" + (p.t ? '<div class="t">' + esc(p.t) + "</div>" : "") + "</div>";
  if (p.k === "voice") return '<div class="voice"><button data-play="' + esc(m.id) + '" aria-label="Play">▶</button><span class="bars">' + Array.from({ length: 18 }, (_, i) => '<i style="height:' + (6 + ((i * 7 + 3) % 15)) + 'px"></i>').join("") + '</span><span class="mono" style="font-size:11px;color:var(--dim)">' + Math.round(p.d || 0) + "s</span></div>";
  if (p.k === "checkin") { const c = CHECKS.find((q) => q.k === p.c) || CHECKS[0]; return '<div class="ck ' + (p.c === "sos" ? "sos" : "") + '"><b style="font-weight:400;font-size:20px">' + c.e + "</b><span>" + esc(c.w) + "</span></div>"; }
  if (p.k === "dq") return '<div class="rc" style="margin:2px 0">answered today\'s question ✦</div>';
  return '<div class="t" style="color:var(--faint);font-style:italic">(sealed with a key this device doesn\'t have)</div>';
}
function rxHTML(m) { const r = m.rx || {}, ks = Object.keys(r); return ks.length ? '<div class="rxs">' + ks.map((u) => '<span class="rx ' + (u === ME.user ? "mine" : "") + '">' + esc(r[u]) + "</span>").join("") + "</div>" : ""; }
const sig = (m) => [m.tmp ? 1 : 0, m.dl, m.rd, m.ak, m.col ? 1 : 0, locked(m) ? 1 : 0, JSON.stringify(m.rx || ""), blobURL.has(m.id) ? 1 : 0, m.from === ME.user && m.rd ? tickN : 0, needsLook(m) ? 1 : 0].join("|");
function entryEl(m) {
  const mine = m.from === ME.user, who = mine ? "You" : THEM.name, q = needsLook(m), at = m.p && m.p.at;
  const cell = els.get(m.id) || { el: Object.assign(document.createElement("article"), { className: "en in" }), sig: "" }; els.set(m.id, cell);
  const s = sig(m); if (s === cell.sig) return cell.el; cell.sig = s; const el = cell.el;
  el.dataset.id = m.id; el.className = "en " + (mine ? "me" : "her") + (q ? " q" : "") + (cell.el.classList.contains("in") ? " in" : "") + (m.lvl >= 2 ? " sos" : "");
  el.innerHTML = '<div class="h">' + esc(who) + " · " + esc(hm(m.ts)) + (at ? ' · <span class="back">↩ pinned to ' + esc(when(at)) + "</span>" : "") + (m.q ? " · 🌙" : "") + '</div><div class="bd">' + body(m) + "</div>" + (q ? '<div class="qhint">unobserved · tap to look</div>' : "") + rxHTML(m) + (recState(m) ? "<div>" + recState(m) + "</div>" : "");
  if (q && B.cfg.collapse === "sight") watch(el);
  return el;
}
const dayEls = new Map();
function dayEl(label) { let e = dayEls.get(label); if (!e) { e = document.createElement("div"); e.className = "day"; e.innerHTML = "<span>" + esc(label) + "</span>"; dayEls.set(label, e); } return e; }
function qHTML() {
  const d = dayKey(), mine = sorted().find((m) => m.p && m.p.k === "dq" && m.p.d === d && m.from === ME.user), theirs = sorted().find((m) => m.p && m.p.k === "dq" && m.p.d === d && m.from !== ME.user), fold = B.cfg.qfold === d;
  let b; if (mine && theirs) b = '<div class="both"><div><b>You</b>' + esc(mine.p.a) + "</div><div><b>" + esc(THEM.name) + "</b>" + esc(theirs.p.a) + "</div></div>";
  else if (mine) b = '<p style="color:var(--dim);margin:0">Your answer is sealed until ' + esc(THEM.name) + " answers too.</p>";
  else b = '<textarea id="qa" placeholder="' + (theirs ? esc(THEM.name) + " has answered. Yours opens theirs." : "Your answer…") + '"></textarea><div class="row mt"><button class="btn pri" id="qs">Answer</button></div>';
  return [(mine ? "m" : "") + (theirs ? "t" : "") + fold, '<button class="tg" id="qt">' + (fold ? "show" : "hide") + '</button><div class="k">Question of the day</div><h3>' + esc(todaysQ()) + '</h3><div class="body">' + b + "</div>", fold];
}
let qCell = null, olderEl = null, emptyEl = null;
function renderLog(stick) {
  cancelAnimationFrame(renderQ); renderQ = requestAnimationFrame(() => {
    const log = $("log"), near = stick || log.scrollHeight - log.scrollTop - log.clientHeight < 140, prevTop = log.scrollTop, prevH = log.scrollHeight, want = [];
    if (more) { if (!olderEl) { olderEl = document.createElement("button"); olderEl.className = "more"; olderEl.id = "older"; olderEl.textContent = "Load earlier"; } want.push(olderEl); }
    const [qs, qh, fold] = qHTML(); if (!qCell) { qCell = document.createElement("section"); qCell.sig = ""; } if (qCell.sig !== qs) { qCell.sig = qs; qCell.className = "qd" + (fold ? " fold" : ""); qCell.innerHTML = qh; } want.push(qCell);
    let lastDay = "", n = 0, seen = new Set(); for (const m of sorted()) { const dl = dayLabel(sortT(m)); if (dl !== lastDay) { want.push(dayEl(dl)); lastDay = dl; } want.push(entryEl(m)); seen.add(m.id); n++; }
    for (const k of [...els.keys()]) if (!seen.has(k)) els.delete(k);
    if (!n) { if (!emptyEl) { emptyEl = document.createElement("div"); emptyEl.className = "empty"; emptyEl.textContent = "Nothing here yet. Say anything. Even one light is enough."; } want.push(emptyEl); }
    let ref = log.firstChild; for (const nd of want) { if (nd === ref) ref = ref.nextSibling; else log.insertBefore(nd, ref); } const keep = new Set(want); for (const c of [...log.children]) if (!keep.has(c)) c.remove();
    for (const nd of log.querySelectorAll(".en.in")) if (!nd.dataset.pop) { nd.dataset.pop = 1; setTimeout(() => nd.classList.remove("in"), 700); }
    if (near) log.scrollTop = log.scrollHeight; else if (more && prevH !== log.scrollHeight && prevTop < 40) log.scrollTop = prevTop + (log.scrollHeight - prevH);
    hydrate(); renderCap(); ackSeen(); checkSOS(); syncVoid(); cone();
  });
}
const lastTalk = () => { let t = 0; for (const m of M.values()) if (!m.tmp && !locked(m) && m.p && m.p.k !== "dq") t = Math.max(t, m.ts); return t; };
function syncVoid() { const v = B.vs; v.seenAt = seenAt; v.gap = lastTalk(); v.capsules = [...M.values()].filter((m) => m.from === ME.user && locked(m)).length; v.flight = [...M.values()].some((m) => m.from === ME.user && !m.dl && !m.tmp && !locked(m)) || [...M.values()].some((m) => m.tmp && !m.unlock); v.names = { me: "you", her: THEM ? THEM.name : "" }; B.Void.need(); }
function renderCap() {
  if (!THEM) return; const g = lastTalk(), t = [], p = B.Live.present && document.visibilityState === "visible";
  const s = seenAt ? Date.now() - seenAt : Infinity; t.push(p ? THEM.name + " is here with you now" : s < 120e3 ? THEM.name + " was just here" : seenAt ? THEM.name + " was here " + ago(seenAt) : THEM.name + " hasn't opened it yet");
  if (g) t.push("last words " + ago(g)); $("herocap").textContent = t.join(" · ");
  $("pst").innerHTML = '<span class="ld ' + B.Live.state + '"></span>' + (B.Live.state === "live" ? "live" : navigator.onLine === false ? "offline" : "polling") + " · you & " + esc(THEM.name);
  B.vs.present = p;
}
// the light cone: what you are looking at is sharp and near, everything else recedes into the past
let coneQ = 0;
function cone() {
  if (B.vs.tier < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return; cancelAnimationFrame(coneQ);
  coneQ = requestAnimationFrame(() => { const log = $("log"), r = log.getBoundingClientRect(), f = r.top + r.height * .72, rows = []; for (const c of log.children) { const b = c.getBoundingClientRect(); if (b.bottom < r.top - 100 || b.top > r.bottom + 100) continue; rows.push([c, Math.min(1, Math.abs((b.top + b.bottom) / 2 - f) / (r.height * .8))]); } for (const [c, k] of rows) c.style.setProperty("--k", k.toFixed(2)); });
}
$("log").addEventListener("scroll", cone, { passive: true });
// quantum collapse on sight: an unobserved message resolves once it has been in view for a moment
let io = null, timers = new Map();
function watch(el) {
  if (!("IntersectionObserver" in window)) return; if (!io) io = new IntersectionObserver((es) => { for (const e of es) { const id = e.target.dataset.id; if (e.isIntersecting && document.visibilityState === "visible") { if (!timers.has(id)) timers.set(id, setTimeout(() => { timers.delete(id); collapse(id); }, 1100)); } else { clearTimeout(timers.get(id)); timers.delete(id); } } }, { root: $("log"), threshold: .7 });
  io.observe(el);
}
async function hydrate() {
  for (const el of document.querySelectorAll("[data-img]")) {
    const id = el.dataset.img, m = M.get(id); if (!m || !m.blob) continue;
    const put = (u) => { el.outerHTML = '<img src="' + u + '" alt="A photo" data-big="' + esc(id) + '">'; };
    if (blobURL.has(id)) { put(blobURL.get(id)); continue; }
    if (m.tmp) continue;
    try { const r = await fetch("/api/us/blob/" + m.blob, { credentials: "same-origin" }); if (!r.ok) throw 0; const u = URL.createObjectURL(new Blob([await B.openBytes(await r.arrayBuffer())], { type: m.p.m || "image/jpeg" })); blobURL.set(id, u); const t = document.querySelector('[data-img="' + CSS.escape(id) + '"]'); t && (t.outerHTML = '<img src="' + u + '" alt="A photo" data-big="' + esc(id) + '">'); } catch (e) { el.textContent = "couldn't open"; }
  }
}
setInterval(() => { tickN++; if (ME && document.visibilityState === "visible") { renderCap(); renderLog(); } }, 30000);

// ═══ interactions on the timeline ═══════════════════════════════════════════════════════════
let rxFor = null, pressT = 0;
function showRx(id, x, y) { rxFor = id; const b = $("rxbar"); b.innerHTML = REACTS.map((e) => '<button data-re="' + e + '">' + e + "</button>").join("") + '<button data-re="">✕</button>'; b.classList.add("on"); b.style.left = Math.max(8, Math.min(innerWidth - 270, x - 120)) + "px"; b.style.top = Math.max(60, y - 56) + "px"; }
$("rxbar").onclick = async (e) => { const b = e.target.closest("[data-re]"); if (!b || !rxFor) return; const m = M.get(rxFor), id = rxFor; $("rxbar").classList.remove("on"); rxFor = null; if (!m || m.tmp) return; m.rx = { ...(m.rx || {}) }; if (b.dataset.re) m.rx[ME.user] = b.dataset.re; else delete m.rx[ME.user]; B.snd("tick"); renderLog(); try { await post("react", { id, e: b.dataset.re }); } catch (err) { toast("Couldn't react."); } };
$("log").addEventListener("dblclick", (e) => { const en = e.target.closest(".en"); if (en && !en.classList.contains("q")) showRx(en.dataset.id, e.clientX, e.clientY); });
$("log").addEventListener("pointerdown", (e) => { const en = e.target.closest(".en"); clearTimeout(pressT); if (en && e.pointerType === "touch") { const x = e.clientX, y = e.clientY; pressT = setTimeout(() => { if (!en.classList.contains("q")) { B.hap(15); showRx(en.dataset.id, x, y); } }, 550); } });
for (const ev of ["pointerup", "pointercancel", "pointermove"]) $("log").addEventListener(ev, (e) => { if (ev !== "pointermove" || Math.abs(e.movementX) + Math.abs(e.movementY) > 3) clearTimeout(pressT); }, { passive: true });
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#rxbar") && !e.target.closest(".en")) $("rxbar").classList.remove("on"); });
$("log").addEventListener("click", async (e) => {
  const t = e.target; if (t.closest("#older")) { await loadHistory(oldest); renderLog(); return; }
  if (t.closest("#qt")) { B.set("qfold", B.cfg.qfold === dayKey() ? "" : dayKey()); renderLog(); return; }
  if (t.closest("#qs")) { const a = ($("qa").value || "").trim(); if (a) { await sendMsg({ k: "dq", d: dayKey(), a }); } return; }
  const q = t.closest(".en.q"); if (q) return collapse(q.dataset.id);
  const en = t.closest("[data-open]"); if (en) return openLetter(en.dataset.open);
  const pl = t.closest("[data-play]"); if (pl) return playVoice(pl.dataset.play, pl);
  const big = t.closest("[data-big]"); if (big) { const u = blobURL.get(big.dataset.big); if (u) window.open(u, "_blank"); }
});
function openLetter(id) {
  const m = M.get(id); if (!m || !m.p) return; const mine = m.from === ME.user;
  $("paper").innerHTML = '<button class="btn" id="rx">← Back</button><h2>' + esc(m.p.s || "A letter") + '</h2><div class="body">' + esc(m.p.t) + '</div><div class="by">' + (mine ? "from you" : "from " + esc(THEM.name)) + " · " + esc(when(m.ts)) + "</div>";
  $("reader").classList.add("on"); $("rx").onclick = () => $("reader").classList.remove("on"); B.snd("open");
  if (!mine && !m.rd && !m.tmp) { m.rd = Date.now(); post("ack", { ids: [m.id] }).catch(() => {}); renderLog(); }
}
let player = null;
async function playVoice(id, btn) {
  const m = M.get(id); if (!m || !m.blob) return; if (player) { player.pause(); player = null; document.querySelectorAll("[data-play]").forEach((b) => (b.textContent = "▶")); if (btn.dataset.on === id) { btn.dataset.on = ""; return; } }
  try {
    let u = blobURL.get(id); if (!u) { const r = await fetch("/api/us/blob/" + m.blob, { credentials: "same-origin" }); u = URL.createObjectURL(new Blob([await B.openBytes(await r.arrayBuffer())], { type: m.p.m || "audio/webm" })); blobURL.set(id, u); }
    player = new Audio(u); btn.textContent = "❚❚"; btn.dataset.on = id; player.onended = () => { btn.textContent = "▶"; btn.dataset.on = ""; player = null; }; await player.play();
    if (m.from !== ME.user && !m.rd) { m.rd = Date.now(); post("ack", { ids: [id] }).catch(() => {}); }
  } catch (e) { toast("Couldn't play that."); btn.textContent = "▶"; }
}

// ═══ SOS ════════════════════════════════════════════════════════════════════════════════════
let sosT = 0;
function checkSOS() {
  const s = sorted().find((m) => m.from !== ME.user && m.lvl >= 2 && !m.ak && !m.tmp && m.p);
  if (!s) { $("sos").classList.remove("on"); clearInterval(sosT); sosT = 0; return; }
  $("sos-h").textContent = THEM.name + " needs you"; $("sos-p").textContent = s.p.k === "checkin" ? (CHECKS.find((c) => c.k === s.p.c) || {}).w || "" : s.p.t || ""; $("sos").classList.add("on"); $("sos-ok").dataset.id = s.id;
  if (!sosT) { B.snd("sos"); B.hap([400, 150, 400]); sosT = setInterval(() => { B.hap([400, 150, 400]); B.snd("sos"); }, 2500); }
}
$("sos-ok").onclick = async (e) => { const id = e.currentTarget.dataset.id, m = M.get(id); if (m) { m.ak = m.rd = Date.now(); } $("sos").classList.remove("on"); clearInterval(sosT); sosT = 0; renderLog(); try { await post("ack", { ids: [id], ak: true }); await sendMsg({ k: "checkin", c: "ok" }); } catch (err) { toast("I'm here didn't reach the server. Trying again…"); setTimeout(() => post("ack", { ids: [id], ak: true }).catch(() => {}), 3000); } };

// ═══ composer ═══════════════════════════════════════════════════════════════════════════════
const txt = $("txt"), MODES = [["🔔", "Normal"], ["📣", "Loud: a firm alert until it's observed"], ["🌙", "Quiet: no alert at all, it will be there when they look"]];
let tyAt = 0;
txt.addEventListener("input", () => {
  txt.style.height = "auto"; txt.style.height = Math.min(132, txt.scrollHeight) + "px";
  if (B.cfg.live !== "off" && B.Live.present && Date.now() - tyAt > 500) { tyAt = Date.now(); B.Live.send({ t: "ty", x: B.cfg.live === "words" ? txt.value.slice(-160) : "" }); }
});
B.Live.typing = (o) => { if (B.cfg.live === "off") { B.vs.typing = 0; return; } const g = $("ghost"); if (B.cfg.live === "words" && o.x) { g.textContent = THEM.name + ": " + o.x; g.classList.add("on"); clearTimeout(g.t); g.t = setTimeout(() => g.classList.remove("on"), 4500); } else { g.textContent = THEM.name + " is writing…"; g.classList.add("on"); clearTimeout(g.t); g.t = setTimeout(() => g.classList.remove("on"), 4500); } };
txt.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); sendText(); } });
$("b-send").onclick = sendText;
const setMode = () => { const b = $("b-loud"); b.textContent = MODES[mode][0]; b.classList.toggle("on", mode > 0); b.title = MODES[mode][1]; b.setAttribute("aria-label", MODES[mode][1]); };
$("b-loud").onclick = () => { mode = (mode + 1) % 3; setMode(); toast(MODES[mode][1]); };
function sendText() { const t = txt.value.trim(); if (!t) return; txt.value = ""; txt.style.height = "auto"; B.Live.send({ t: "ty", x: "" }); sendMsg({ k: "note", t }, { lvl: mode === 1 ? 1 : 0, q: mode === 2 }); if (mode) { mode = 0; setMode(); } }
const KINDS = [["pulse", "✨", "Pulse"], ["letter", "💌", "Letter"], ["capsule", "⏳", "Capsule"], ["memory", "↩️", "Memory"], ["drop", "📷", "Photo"], ["voice", "🎙️", "Voice"], ["checkin", "📍", "Check-in"], ["call", "📞", "Call"]];
$("tray").innerHTML = KINDS.map(([k, e, w]) => '<button data-k="' + k + '"><b>' + e + "</b>" + w + "</button>").join("");
$("b-plus").onclick = (e) => { e.stopPropagation(); $("tray").classList.toggle("hidden"); };
document.addEventListener("click", (e) => { if (!e.target.closest("#tray,#b-plus")) $("tray").classList.add("hidden"); });
$("tray").onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; $("tray").classList.add("hidden"); sheets[b.dataset.k](); };

const sheet = $("sheet"), scrim = $("scrim"); let rec = null, sheetTick = 0;
const showSheet = (html) => { sheet.innerHTML = html; sheet.classList.add("on"); scrim.classList.add("on"); }, hideSheet = () => { sheet.classList.remove("on"); scrim.classList.remove("on"); clearInterval(sheetTick); if (rec && rec.state !== "inactive") try { rec.stop(); } catch (e) {} };
scrim.onclick = hideSheet; addEventListener("keydown", (e) => { if (e.key === "Escape") { hideSheet(); $("reader").classList.remove("on"); closePal(); } });
const sheets = {
  pulse() { showSheet('<h2 class="disp">Pulse</h2><p>One tap. She sees it glow.</p><div class="grid">' + PULSES.map((x) => '<button class="opt" data-p="' + x.k + '"><b>' + x.e + "</b>" + esc(x.w) + "</button>").join("") + "</div>"); sheet.onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) { sendMsg({ k: "pulse", e: b.dataset.p }); hideSheet(); } }; },
  letter() { showSheet('<h2 class="disp">A letter</h2><p>Words that deserve to be opened on purpose.</p><label for="ls">Title</label><input id="ls" maxlength="60" placeholder="For when you need it"><label for="lb">Letter</label><textarea id="lb" placeholder="Dear…"></textarea><div class="row mt"><button class="btn pri" id="lg">Seal and send</button></div>'); sheet.onclick = null; $("lg").onclick = () => { const t = $("lb").value.trim(); if (!t) return toast("Write something first."); sendMsg({ k: "letter", s: $("ls").value.trim() || "A letter", t }, { lvl: 0 }); hideSheet(); }; },
  capsule() {
    const d = (n, h) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x; }, fmt = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    showSheet('<h2 class="disp">Time capsule</h2><p>Sealed now. It opens for ' + esc(THEM.name) + " only when its time comes, even if you can't be there.</p><label for='cb'>Message</label><textarea id='cb' placeholder='Open this when…'></textarea><label for='cd'>Opens</label><input id='cd' type='datetime-local' value='" + fmt(d(1, 8)) + "'><div class='row mt'>" + [["Tomorrow morning", d(1, 8)], ["In a week", d(7, 9)], ["In a month", d(30, 9)], ["In a year", d(365, 9)]].map(([w, x]) => "<button class='btn' data-d='" + fmt(x) + "'>" + w + "</button>").join("") + "</div><div class='row mt'><button class='btn pri' id='cg'>Seal it</button></div>");
    sheet.onclick = (e) => { const b = e.target.closest("[data-d]"); if (b) $("cd").value = b.dataset.d; }; $("cg").onclick = () => { const t = $("cb").value.trim(), u = new Date($("cd").value).getTime(); if (!t) return toast("Write something first."); if (!(u > Date.now() + 60e3)) return toast("Pick a time at least a minute from now."); sendMsg({ k: "capsule", t, u }, { unlock: u }); hideSheet(); };
  },
  memory() { // a message pinned to a moment that already happened: it lands in the middle of your history, not the end
    const fmt = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16), y = new Date(); y.setFullYear(y.getFullYear() - 1);
    showSheet('<h2 class="disp">Send into the past</h2><p>Say something about a moment that already happened. It lands in your history at that exact point, for ' + esc(THEM.name) + " to find.</p><label for='mb'>What you wish you'd said</label><textarea id='mb' placeholder='That night on the porch…'></textarea><label for='md'>Pin it to</label><input id='md' type='datetime-local' value='" + fmt(y) + "'><div class='row mt'><button class='btn pri' id='mg'>Place it</button></div>"); sheet.onclick = null;
    $("mg").onclick = () => { const t = $("mb").value.trim(), at = new Date($("md").value).getTime(); if (!t) return toast("Write something first."); if (!(at < Date.now() - 6e4)) return toast("Pick a moment in the past."); sendMsg({ k: "note", t, at }, {}); hideSheet(); };
  },
  drop() {
    showSheet('<h2 class="disp">Photo</h2><p>Encrypted here before it leaves your phone.</p><input id="pf" type="file" accept="image/*"><div id="pv" style="margin:10px 0"></div><label for="pc">Caption</label><input id="pc" maxlength="200"><div class="row mt"><button class="btn pri" id="pg" disabled>Send</button></div>'); sheet.onclick = null; let jpg = null, dim = null;
    $("pf").onchange = async () => { const f = $("pf").files[0]; if (!f) return; try { const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        let q = .82, blob; do { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); q -= .1; } while (blob.size > 1.4 * 1024 * 1024 && q > .2); jpg = new Uint8Array(await blob.arrayBuffer()); dim = [c.width, c.height]; $("pv").innerHTML = '<img src="' + URL.createObjectURL(blob) + '" style="max-width:100%;max-height:260px;border-radius:12px">'; $("pg").disabled = false; } catch (e) { toast("Couldn't read that photo."); } };
    $("pg").onclick = async () => { $("pg").disabled = true; try { const up = await fetch("/api/us/blob", { method: "POST", credentials: "same-origin", body: await B.sealBytes(jpg) }); if (!up.ok) throw 0; const { id } = await up.json(); await sendMsg({ k: "drop", m: "image/jpeg", w: dim[0], h: dim[1], t: $("pc").value.trim() }, { blob: id }); const last = [...M.values()].filter((m) => m.tmp).pop(); if (last) blobURL.set(last.id, URL.createObjectURL(new Blob([jpg], { type: "image/jpeg" }))); hideSheet(); } catch (e) { $("pg").disabled = false; toast("Photos need a signal. Try again in a moment."); } };
  },
  voice() {
    showSheet('<h2 class="disp">Voice note</h2><p>Say it out loud. Up to 90 seconds.</p><div class="row"><button class="btn pri" id="vr">● Record</button><span class="mono" id="vt">0:00</span></div><audio id="vp" controls class="hidden" style="width:100%;margin-top:12px"></audio><div class="row mt"><button class="btn pri" id="vs" disabled>Send</button></div>'); sheet.onclick = null; let chunks = [], t0 = 0, tick = 0, bytes = null, mime = "";
    $("vr").onclick = async () => {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); rec = new MediaRecorder(st, { audioBitsPerSecond: 24000 }); chunks = []; mime = rec.mimeType || "audio/webm"; rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => { clearInterval(tick); st.getTracks().forEach((t) => t.stop()); $("vr").textContent = "● Again"; const blob = new Blob(chunks, { type: mime }); bytes = new Uint8Array(await blob.arrayBuffer()); $("vp").src = URL.createObjectURL(blob); $("vp").classList.remove("hidden"); $("vs").disabled = bytes.length > 1.5 * 1024 * 1024; if ($("vs").disabled) toast("That one's too long. Try a shorter one."); };
        rec.start(); t0 = Date.now(); $("vr").textContent = "■ Stop"; tick = setInterval(() => { const s = (Date.now() - t0) / 1000; $("vt").textContent = Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); if (s >= 90) rec.stop(); }, 250); } catch (e) { toast("I need microphone access for that."); } };
    $("vs").onclick = async () => { $("vs").disabled = true; try { const up = await fetch("/api/us/blob", { method: "POST", credentials: "same-origin", body: await B.sealBytes(bytes) }); if (!up.ok) throw 0; const { id } = await up.json(); await sendMsg({ k: "voice", m: mime, d: (Date.now() - t0) / 1000 }, { blob: id }); hideSheet(); } catch (e) { $("vs").disabled = false; toast("Voice notes need a signal. Try again in a moment."); } };
  },
  checkin() { showSheet('<h2 class="disp">Check-in</h2><p>Let ' + esc(THEM.name) + ' know where you are, in one tap.</p><div class="grid">' + CHECKS.map((c) => '<button class="opt ' + (c.lvl ? "s" : "") + '" data-c="' + c.k + '"><b>' + c.e + "</b>" + esc(c.w) + "</button>").join("") + '</div><p style="font-size:14px;margin-top:12px">"I need you now" keeps alerting until they tap <i>I\'m here</i>.</p>'); sheet.onclick = (e) => { const b = e.target.closest("[data-c]"); if (!b) return; const c = CHECKS.find((x) => x.k === b.dataset.c); if (c.lvl && !confirm("Send an SOS to " + THEM.name + "? It will keep alerting until they answer.")) return; sendMsg({ k: "checkin", c: c.k }, { lvl: c.lvl || 0 }); hideSheet(); }; },
  call() { startCall(); },
};

// ═══ voice calls (UI) ═══════════════════════════════════════════════════════════════════════
let ringT = 0, callT = 0;
const mmss = (ms) => Math.floor(ms / 6e4) + ":" + String(Math.floor(ms / 1e3) % 60).padStart(2, "0");
async function startCall() {
  if (!B.Live.present) { if (confirm(THEM.name + " doesn't have Barycenter open right now, so a call can't ring. Send a \"call me when you can\" alert instead?")) sendMsg({ k: "checkin", c: "call" }, {}); return; }
  B.Call.start();
}
B.Call.onState = (s, info) => {
  const c = $("call"); clearInterval(ringT); clearInterval(callT); c.className = s === "idle" ? "" : "on " + s;
  if (s === "idle") { if (info && info.nomic) toast("I need microphone access to call."); else if (info && info.missed) toast("Missed call from " + THEM.name); else if (info && info.ended && info.dur) toast("Call ended · " + mmss(info.dur)); else if (info && info.timeout) toast(THEM.name + " didn't pick up."); document.documentElement.classList.remove("incall"); return; }
  document.documentElement.classList.add("incall");
  if (s === "calling") { $("call-t").textContent = "Calling " + THEM.name + "…"; $("call-a").classList.add("hidden"); }
  else if (s === "incoming") { $("call-t").textContent = THEM.name + " is calling"; $("call-a").classList.remove("hidden"); const ring = () => { B.snd("ring"); B.hap([200, 100, 200]); }; ring(); ringT = setInterval(ring, 2200); }
  else if (s === "connecting") { $("call-t").textContent = "Connecting…"; $("call-a").classList.add("hidden"); }
  else if (s === "connected") { $("call-a").classList.add("hidden"); const upd = () => ($("call-t").textContent = "With " + THEM.name + " · " + mmss(Date.now() - B.Call.t0)); upd(); callT = setInterval(upd, 1000); B.hap([40, 40, 40]); }
};
$("call-yes").onclick = () => B.Call.accept(); $("call-no").onclick = () => B.Call.end(false); $("call-end").onclick = () => B.Call.end(false); $("call-mute").onclick = (e) => { e.currentTarget.classList.toggle("on", B.Call.mute()); };

// ═══ the stage: touch the void and your partner feels it ════════════════════════════════════
const hero = $("hero");
const heroPos = (e) => { const r = hero.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
let heroDown = false;
hero.addEventListener("pointerdown", (e) => { heroDown = true; try { hero.setPointerCapture(e.pointerId); } catch (x) {} const [x, y] = heroPos(e); B.Void.local(x, y, 1); B.Live.touch(x, y, 1); B.snd("touch"); B.hap(10); });
hero.addEventListener("pointermove", (e) => { if (!heroDown) return; const [x, y] = heroPos(e); B.Void.local(x, y, 1); B.Live.touch(x, y, 2); });
for (const ev of ["pointerup", "pointercancel"]) hero.addEventListener(ev, () => { if (!heroDown) return; heroDown = false; const L = B.vs.local; B.Void.local(L.x, L.y, 0); B.Live.touch(L.x, L.y, 0); });
new ResizeObserver(() => { const r = hero.getBoundingClientRect(); B.vs.hero = r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; B.Void.need(); }).observe(hero);
const stage = (on) => { B.cfg.stage = on; $("app").classList.toggle("stage", on); $("herohint").textContent = on ? "Touch the void. Hold it with " + (THEM ? THEM.name : "them") + " and you'll both feel it." : ""; setTimeout(() => dispatchEvent(new Event("resize")), 320); };
$("b-stage").onclick = () => stage(!$("app").classList.contains("stage")); $("stage-x").onclick = () => stage(false);
$("stagebar").innerHTML = PULSES.slice(0, 5).map((x) => '<button data-sp="' + x.k + '" title="' + esc(x.w) + '">' + x.e + "</button>").join("");
$("stagebar").onclick = (e) => { const b = e.target.closest("[data-sp]"); if (b) sendMsg({ k: "pulse", e: b.dataset.sp }); };
B.vs.onContact = () => { renderCap(); toast("Contact. You're both here, touching."); };

// ═══ the command palette: type anything ═════════════════════════════════════════════════════
const pal = $("pal"); let palItems = [], palSel = 0;
const textOf = (m) => { const p = m.p || {}; return [p.t, p.s, p.a, p.k === "pulse" ? pulseOf(p.e).w : "", p.k === "checkin" ? (CHECKS.find((c) => c.k === p.c) || {}).w : ""].filter(Boolean).join(" ").toLowerCase(); };
function actions() {
  const A = [["✨ Send a pulse", () => sheets.pulse()], ["💌 Write a letter", () => sheets.letter()], ["⏳ Seal a time capsule", () => sheets.capsule()], ["↩️ Send into the past", () => sheets.memory()], ["📷 Send a photo", () => sheets.photo ? 0 : sheets.drop()], ["🎙️ Record a voice note", () => sheets.voice()], ["📍 Check in", () => sheets.checkin()], ["📞 Call " + THEM.name, () => startCall()], ["◎ Enter the stage (touch together)", () => stage(true)], ["⚙ Settings", () => openSettings()], ["⚙ Systems & diagnostics", () => openSettings("systems")], ["🔑 Verify our key (constellation)", () => openSettings("security")], ["⬇ Export our history", () => openSettings("data")]];
  for (const [k, t] of Object.entries(B.THEMES)) A.push(["🎨 Theme: " + t.name, () => B.set("theme", k)]);
  for (const [k, f] of Object.entries(B.FONTS)) A.push(["Aa Font: " + f.name, () => B.set("font", k)]);
  for (const q of ["auto", "high", "med", "low", "off"]) A.push(["⚡ Quality: " + q, () => B.set("quality", q)]);
  A.push(["🔇 Sound " + (B.cfg.vol ? "off" : "on"), () => B.set("vol", B.cfg.vol ? 0 : 60)], ["🌌 Ambient hum " + (B.cfg.ambient ? "off" : "on"), () => { B.set("ambient", !B.cfg.ambient); B.ambient(B.cfg.ambient); }]);
  return A;
}
function palRender() {
  const q = $("pq").value.trim().toLowerCase(), A = actions().filter(([n]) => !q || n.toLowerCase().includes(q)).slice(0, q ? 6 : 9).map(([n, f]) => ({ n, f }));
  const hits = q ? sorted().filter((m) => !m.tmp && !locked(m) || m.from === ME.user).filter((m) => textOf(m).includes(q)).reverse().slice(0, 8).map((m) => ({ n: (m.from === ME.user ? "You" : THEM.name) + " · " + when(sortT(m)) + " — " + (textOf(m).slice(0, 70)), id: m.id, f: () => jump(m.id) })) : [];
  palItems = [...A, ...hits]; palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $("pl").innerHTML = palItems.length ? palItems.map((it, i) => '<button class="pi ' + (i === palSel ? "s" : "") + (it.id ? " m" : "") + '" data-i="' + i + '">' + esc(it.n) + "</button>").join("") : '<div class="empty">Nothing found. Try "load everything" below.</div>';
  $("pall").classList.toggle("hidden", !q);
}
function openPal() { pal.classList.add("on"); $("pq").value = ""; palSel = 0; palRender(); setTimeout(() => $("pq").focus(), 30); }
function closePal() { pal.classList.remove("on"); }
function jump(id) { closePal(); const c = els.get(id); if (!c) return toast("That one is further back. Load earlier first."); c.el.scrollIntoView({ block: "center", behavior: "smooth" }); c.el.classList.add("flash"); setTimeout(() => c.el.classList.remove("flash"), 1800); }
$("b-pal").onclick = openPal; $("pq").oninput = () => { palSel = 0; palRender(); };
$("pq").onkeydown = (e) => { if (e.key === "ArrowDown") { palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); e.preventDefault(); } else if (e.key === "ArrowUp") { palSel = Math.max(0, palSel - 1); palRender(); e.preventDefault(); } else if (e.key === "Enter") { const it = palItems[palSel]; if (it) { closePal(); it.f(); } } };
$("pl").onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) { const it = palItems[+b.dataset.i]; closePal(); it.f(); } };
pal.onclick = (e) => { if (e.target === pal) closePal(); };
$("pall").onclick = async () => { $("pall").textContent = "Loading everything…"; try { while (more) await loadHistory(oldest); } catch (e) {} $("pall").textContent = "Search everything we've ever said"; renderLog(); palRender(); };
addEventListener("keydown", (e) => { if (!ME || !$("app") || $("app").classList.contains("hidden")) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPal(); } else if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openPal(); } });

// ═══ settings: one panel, tabs, every control driven from a table ═══════════════════════════
const seg = (k, opts) => '<div class="seg">' + opts.map(([v, l]) => '<button data-seg="' + k + '" data-v="' + esc(v) + '" class="' + (String(B.cfg[k]) === String(v) ? "on" : "") + '">' + esc(l) + "</button>").join("") + "</div>";
const tog = (k) => '<button class="tg2 ' + (B.cfg[k] ? "on" : "") + '" data-tog="' + k + '" role="switch" aria-checked="' + !!B.cfg[k] + '"><i></i></button>';
const row = (t, d, c) => '<div class="setrow"><div>' + t + (d ? "<small>" + d + "</small>" : "") + "</div>" + c + "</div>";
let tab = "look";
const TABS = { look: "Look", feel: "Feel", alerts: "Alerts", perf: "Speed", security: "Keys", data: "Data", systems: "Systems" };
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function tabHTML() {
  const T = B.THEMES, F = B.FONTS;
  if (tab === "look") return '<div class="tiles">' + Object.entries(T).map(([k, t]) => '<button class="tile ' + (B.cfg.theme === k ? "on" : "") + '" data-th="' + k + '"><span><i style="background:' + t.a + '"></i><i style="background:' + t.b + '"></i></span>' + esc(t.name) + "</button>").join("") + "</div>" +
    row("Font", "How the words feel", '<div class="seg wrap">' + Object.entries(F).map(([k, f]) => '<button data-seg="font" data-v="' + k + '" class="' + (B.cfg.font === k ? "on" : "") + '" style="font-family:' + f.body.replace(/"/g, "'") + '">' + f.name + "</button>").join("") + "</div>") +
    row("Text size", B.cfg.size + "%", '<input type="range" min="85" max="130" step="5" value="' + B.cfg.size + '" data-rng="size">') + row("Density", "How tightly messages sit", seg("density", [["cozy", "Cozy"], ["compact", "Compact"]]));
  if (tab === "feel") return row("Sound", "Soft synthesized tones. Nothing is downloaded.", '<input type="range" min="0" max="100" value="' + B.cfg.vol + '" data-rng="vol">') + row("Ambient hum", "A low drone under everything", tog("ambient")) + row("Haptics", "Taps and heartbeats you can feel", tog("haptics")) +
    row("Tilt parallax", "The void moves as your phone does", tog("tilt")) + row("Observation", "Messages stay blurred until you look at them", seg("collapse", [["sight", "On sight"], ["tap", "On tap"]])) +
    row("Live typing", "See each other writing. Both of you choose what to show.", seg("live", [["off", "Off"], ["typing", "Writing…"], ["words", "Live words"]]));
  if (tab === "alerts") return row("Alerts on this device", pushOK() ? "A quiet nudge when " + esc(THEM.name) + " sends something. Alerts never include what was said. While you're both here, no alert is sent at all." : "Install this app to your home screen to get alerts on iPhone.", '<button class="btn" id="st-push">…</button>') + '<p class="note">Per message: the bell by the text box cycles <b>🔔 normal</b>, <b>📣 loud</b> (keeps alerting until observed) and <b>🌙 quiet</b> (no alert at all). SOS stays until answered.</p>';
  if (tab === "perf") return row("Graphics", "Auto watches the frame rate and adjusts by itself.", seg("quality", [["auto", "Auto"], ["high", "High"], ["med", "Med"], ["low", "Low"], ["off", "Still"]])) + row("Battery saver", "Caps the void at 30 fps and trims effects. Auto turns on under 20% battery.", seg("saver", [["auto", "Auto"], ["on", "On"], ["off", "Off"]])) + row("Show frame rate", "A tiny readout on the void", tog("fps")) + '<p class="note">Right now: tier ' + B.vs.tier + " · " + B.vs.fps + " fps" + (B.saverOn() ? " · saver on" : "") + ". Reduced-motion is respected automatically.</p>";
  if (tab === "security") return '<div class="fp"><canvas id="fpc" width="320" height="200"></canvas><div class="mono" id="fpw">…</div><small>Open this on both phones. If the constellation and the four words match, nobody is between you. The key never touches the server.</small></div>' +
    row("Bring " + esc(THEM.name) + " back in", "A new device, or a forgotten password. Makes a one-time link.", '<button class="btn" id="st-inv">Link</button>') + row("Change my password", "Your key stays the same.", '<button class="btn" id="st-pw">Change</button>') + row("Sign out of this device", "The key is removed from this device.", '<button class="btn" id="st-out">Sign out</button>');
  if (tab === "data") return row("Keep our history", "Download everything, decrypted, as one page. Yours forever.", '<button class="btn" id="st-ex">Export</button>') + '<p class="note">Everything on the server is ciphertext. It can see who sent something, when, and how big. Never what.</p>';
  return '<div id="sysb" class="sys"></div>';
}
function openSettings(t) { if (t) tab = t; renderSettings(); }
function renderSettings() {
  showSheet('<h2 class="disp">Settings</h2><div class="tabs">' + Object.entries(TABS).map(([k, l]) => '<button data-tab="' + k + '" class="' + (tab === k ? "on" : "") + '">' + l + "</button>").join("") + '</div><div id="tb">' + tabHTML() + '</div><div class="msg" id="sm"></div>');
  sheet.onclick = (e) => {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; return renderSettings(); }
    const th = e.target.closest("[data-th]"); if (th) { B.set("theme", th.dataset.th); return renderSettings(); }
    const sg = e.target.closest("[data-seg]"); if (sg) { const v = sg.dataset.v; B.set(sg.dataset.seg, v === "true" ? true : v === "false" ? false : v); if (sg.dataset.seg === "live" && v === "off") $("ghost").classList.remove("on"); return renderSettings(); }
    const tg = e.target.closest("[data-tog]"); if (tg) { const k = tg.dataset.tog; B.set(k, !B.cfg[k]); if (k === "ambient") B.ambient(B.cfg.ambient); if (k === "tilt" && B.cfg.tilt) B.startTilt(); return renderSettings(); }
  };
  sheet.oninput = (e) => { const r = e.target.closest("[data-rng]"); if (r) { B.set(r.dataset.rng, +r.value); if (r.dataset.rng === "vol") { B.snd("tick"); } else r.parentNode.querySelector("small") && 0; } };
  sheet.onchange = (e) => { if (e.target.dataset.rng === "size") renderSettings(); else if (e.target.dataset.rng === "vol") B.snd("arrive"); };
  clearInterval(sheetTick);
  if (tab === "alerts") { pushState(); $("st-push").onclick = togglePush; }
  if (tab === "security") { drawFP(); $("st-inv").onclick = reinvite; $("st-pw").onclick = changePw; $("st-out").onclick = signOut; }
  if (tab === "data") $("st-ex").onclick = exportAll;
  if (tab === "systems") { const u = () => { if (!$("sysb")) return clearInterval(sheetTick); const L = B.Live, v = B.vs; const rows = [["Link", L.state === "live" ? "live (WebSocket)" : L.state === "poll" ? "polling (no live line here)" : "polling · reconnecting"], ["Round trip", L.rtt ? L.rtt + " ms" : "—"], [THEM.name, L.present ? "here, on the live line" : seenAt ? "last seen " + ago(seenAt) : "not yet"], ["Frames", L.sent + " sent · " + L.got + " received (sealed)"], ["Outbox", OUT.length + " waiting"], ["Messages here", M.size + (more ? "+" : "")], ["Graphics", "tier " + v.tier + " · " + v.fps + " fps" + (B.saverOn() ? " · saver" : "")], ["Call", B.Call.state], ["Key", "AES-256-GCM · fingerprint " + (B.fp ? B.fp.short : "…")], ["Server sees", "sender, time, size. Not words."]]; $("sysb").innerHTML = rows.map(([a, b]) => "<div><span>" + esc(a) + "</span><b>" + esc(b) + "</b></div>").join(""); }; u(); sheetTick = setInterval(u, 1000); }
}
$("b-set").onclick = () => openSettings();
async function drawFP() {
  B.fp = B.fp || (await B.fingerprint()); const c = $("fpc"); if (!c) return; const g = c.getContext("2d"), P = B.fp.pts.map(([x, y]) => [20 + x * 280, 20 + y * 160]); g.fillStyle = "#000"; g.fillRect(0, 0, 320, 200);
  g.strokeStyle = "rgba(160,200,255,.45)"; g.lineWidth = 1; g.beginPath(); P.forEach((p, i) => { const q = P[(i + 1) % P.length]; g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }); g.stroke();
  P.forEach((p, i) => { const r = 3 + (i % 3) * 1.5; const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4); gr.addColorStop(0, "#fff"); gr.addColorStop(.25, i % 2 ? B.palette().her : B.palette().me); gr.addColorStop(1, "transparent"); g.fillStyle = gr; g.fillRect(p[0] - r * 4, p[1] - r * 4, r * 8, r * 8); });
  $("fpw").textContent = B.fp.words;
}
async function swReg() { try { return await navigator.serviceWorker.register("/barycenter-sw.js", { scope: "/barycenter" }); } catch (e) { return null; } }
async function pushState() { const b = $("st-push"); if (!b) return; if (!("PushManager" in window)) { b.disabled = true; b.textContent = "n/a"; return; } const r = await navigator.serviceWorker.getRegistration("/barycenter"), s = r && (await r.pushManager.getSubscription()); b.textContent = s ? "On" : "Turn on"; b.dataset.on = s ? "1" : ""; }
async function togglePush() {
  const r = (await navigator.serviceWorker.getRegistration("/barycenter")) || (await swReg()); if (!r) return ($("sm").textContent = "This browser can't do alerts.");
  const cur = await r.pushManager.getSubscription();
  if (cur) { await post("push/unsubscribe", { endpoint: cur.endpoint }).catch(() => {}); await cur.unsubscribe(); return pushState(); }
  if ((await Notification.requestPermission()) !== "granted") return ($("sm").textContent = "Alerts are blocked in this browser's settings.");
  try { const { key } = await api("push/key"), sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) }); await post("push/subscribe", { sub }); } catch (e) { $("sm").textContent = "Couldn't turn alerts on."; }
  pushState();
}
async function reinvite() {
  const raw = unb64(store.get("us-key") || ""); if (raw.length !== 32) return ($("sm").textContent = "This device doesn't hold the key. Sign in again first.");
  const code = hex(crypto.getRandomValues(new Uint8Array(16))); await post("invite", { hash: await sha256hex(B.enc.encode(code)) });
  const link = location.origin + "/barycenter#join=" + code + "." + b64u(raw); showSheet('<h2 class="disp">One-time link</h2><p>Open it on ' + esc(THEM.name) + "'s device. It sets a new password for them and works once, for 14 days.</p><div class='linkbox'>" + esc(link) + "</div><div class='row mt'><button class='btn pri' id='ic'>Copy</button></div>"); sheet.onclick = null; $("ic").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Copied"); } catch (e) { toast("Select and copy it"); } };
}
async function changePw() {
  const np = prompt("New password (at least 8 characters):"); if (!np) return; if (np.length < 8) return toast("At least 8 characters."); if (np !== prompt("Once more:")) return toast("They didn't match.");
  const raw = unb64(store.get("us-key") || ""); $("sm").textContent = "Working… (a few seconds)"; try { await post("password", { verifier: await B.verifierOf(ME.user, np), wrap: await B.wrapKey(raw, ME.user + "\0" + np) }); $("sm").textContent = "Password changed."; } catch (e) { $("sm").textContent = e.err || "Couldn't change it."; }
}
async function signOut() { if (!confirm("Sign out of Barycenter on this device?")) return; B.Live.stop(); try { await fetch("/api/logout/us", { method: "POST", credentials: "same-origin" }); } catch (e) {} store.set("us-key", null); store.set("us-out", null); location.href = "/barycenter"; }
async function exportAll() {
  $("sm").textContent = "Gathering everything…"; const all = new Map(M); let before = oldest, mm = more;
  try { while (mm) { const j = await api("history?limit=100&before=" + encodeURIComponent(before)); for (const m of j.msgs) if (!all.has(m.id)) all.set(m.id, { id: m.id, from: m.from, ts: m.ts, lvl: m.lvl, unlock: m.unlock, blob: m.blob, p: await B.open(m) }); mm = j.more && j.msgs.length; if (j.msgs.length) before = j.msgs[0].id; } } catch (e) { $("sm").textContent = "Couldn't reach everything."; return; }
  const list = [...all.values()].filter((m) => !m.tmp && m.p).sort((a, b) => sortT(a) - sortT(b)), rows = [];
  for (const m of list) { const who = m.from === ME.user ? ME.name : THEM.name, p = m.p; let b = ""; if (p.k === "note") b = esc(p.t); else if (p.k === "pulse") { const x = pulseOf(p.e); b = x.e + " " + esc(x.w); } else if (p.k === "letter") b = "<b>" + esc(p.s) + "</b><br>" + esc(p.t); else if (p.k === "capsule") b = "⏳ capsule: " + esc(p.t); else if (p.k === "checkin") b = ((CHECKS.find((c) => c.k === p.c) || {}).e || "") + " " + esc((CHECKS.find((c) => c.k === p.c) || {}).w || ""); else if (p.k === "dq") b = "Answered a daily question: " + esc(p.a); else if (p.k === "drop" && m.blob) { try { const r = await fetch("/api/us/blob/" + m.blob, { credentials: "same-origin" }), u = await B.openBytes(await r.arrayBuffer()); b = '<img style="max-width:420px;border-radius:8px" src="data:' + (p.m || "image/jpeg") + ";base64," + b64(u) + '">' + (p.t ? "<br>" + esc(p.t) : ""); } catch (e) { b = "(photo)"; } } else if (p.k === "voice") b = "🎙️ voice note"; else continue;
    rows.push('<div class="m"><small>' + esc(who) + " · " + esc(when(sortT(m))) + (p.at ? " (sent " + esc(when(m.ts)) + ")" : "") + "</small><div>" + b.replace(/\n/g, "<br>") + "</div></div>"); }
  const html = '<!doctype html><meta charset="utf-8"><title>Our history</title><style>body{font:17px/1.55 Georgia,serif;max-width:640px;margin:40px auto;padding:0 18px;background:#0b0d1c;color:#e9ebff}.m{margin:14px 0;padding-left:12px;border-left:2px solid #7fd8ff}small{font:11px monospace;color:#8c92ba}</style><h1>' + esc(ME.name) + " &amp; " + esc(THEM.name) + "</h1><p style='color:#8c92ba'>Exported " + esc(when(Date.now())) + " · " + rows.length + " things said</p>" + rows.join("");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "our-history-" + dayKey() + ".html"; a.click(); $("sm").textContent = "Saved " + rows.length + " entries.";
}
B.onCfg((k) => { if (k === "quality" || k === "saver" || k === "tilt") B.Void.need(); if (k === "live" && B.cfg.live === "off") B.vs.typing = 0; });

// ═══ start ══════════════════════════════════════════════════════════════════════════════════
async function startApp() {
  try { ME = await api("me"); } catch (e) { return showLogin(); }
  if (!B.KEY) { const raw = store.get("us-key"); if (!raw) return showLogin(ME.name); await B.setKey(unb64(raw)); }
  THEM = ME.partner; B.who.first = ME.first; seenAt = THEM.seen; B.apply(); B.vs.names = { me: "you", her: THEM.name };
  $("gate").classList.add("hidden"); $("app").classList.remove("hidden"); setMode();
  try { OUT = JSON.parse(store.get("us-out") || "[]"); } catch (e) { OUT = []; }
  M = new Map(); for (const e of OUT) M.set(e.tmp, { id: e.tmp, from: ME.user, ts: e.ts, lvl: e.lvl, q: e.q, unlock: e.unlock, blob: e.blob, p: await B.open(e), tmp: true, dl: 0, rd: 0, ak: 0 });
  try { await loadHistory(); } catch (e) { if (e.auth) return showLogin(); toast("Offline. Showing what I can."); }
  renderLog(true); B.Void.need(); schedulePoll(); flush(); swReg(); B.Live.start(); B.fingerprint().then((f) => (B.fp = f));
  if (B.cfg.tilt) B.startTilt(); if (B.cfg.stage) stage(true);
  addEventListener("pointerdown", function f() { removeEventListener("pointerdown", f); if (B.cfg.ambient) B.ambient(true); }, { once: true });
  if (!THEM.joined) toast(THEM.name + " hasn't joined yet. Use Settings → Keys to invite them.");
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); ackSeen(); schedulePoll(); renderCap(); } else B.vs.present = false; });
}
async function boot() {
  B.Void.start();
  const h = location.hash.match(/^#join=([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/);
  let st; try { st = await api("status"); } catch (e) { gate("<p>Can't reach the server. Check your connection and reload.</p>"); return; }
  if (h) return showClaim(h[1], h[2]);
  if (!st.configured) return st.owner ? showSetup() : gate('<p>This space hasn\'t been created yet.</p><p>Sign in as the owner through <a href="/vigil-app">Vigil</a>, then come back here to set it up.</p>');
  startApp();
}
boot();
})();
