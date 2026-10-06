// Barycenter · the app: gate, messages, the timeline, the composer, settings, and the glue to the Void and the live line.
// Local first: every record this device has seen lives on the device (still sealed) and is shown from there before the network is asked.
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
const HID = new Set(["vote", "tick", "ladd", "edit", "move", "status"]); // messages that change another message instead of showing up themselves
B.kinds = B.kinds || {}; B.acts = B.acts || {}; B.sheets = B.sheets || {};
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

// ═══ messages: kept on the device, decrypted here, never sent anywhere readable ═════════════
let ME = null, THEM = null, evCursor = "0", M = new Map(), OUT = [], more = false, oldest = null, pollT = 0, flushing = false, seenAt = 0, tickN = 0, shown = 80, fullLocal = false;
const O = { mode: 0, van: 0, fx: "", re: null, edit: null }; // what the next message will carry
const blobURL = new Map(), sortT = (m) => (m.p && m.p.k === "note" && m.p.at) || m.ts; // only a note can be pinned to the past
const locked = (m) => m.unlock && Date.now() < m.unlock;
const gone = (m) => m.exp && m.exp <= Date.now();
const sorted = () => [...M.values()].sort((a, b) => (sortT(a) - sortT(b)) || (a.id < b.id ? -1 : 1));
const D = { votes: {}, ticks: {}, ladd: {}, edits: {}, moves: {}, status: {}, pins: new Set(), days: { a: new Set(), b: new Set() }, streak: 0 }; // everything derived from the append-only log
function derive() {
  D.votes = {}; D.ticks = {}; D.ladd = {}; D.edits = {}; D.moves = {}; D.status = {}; D.pins = new Set(); const days = {}; days[ME.user] = new Set(); days[THEM.user] = new Set();
  for (const m of sorted()) {
    const p = m.p; if (!p || gone(m)) continue;
    if (p.k === "vote") (D.votes[p.of] = D.votes[p.of] || {})[m.from] = p.i;
    else if (p.k === "tick") (D.ticks[p.of] = D.ticks[p.of] || {})[p.i] = { on: p.on, by: m.from };
    else if (p.k === "ladd") (D.ladd[p.of] = D.ladd[p.of] || []).push({ t: p.t, by: m.from, id: m.id });
    else if (p.k === "edit") { const t = M.get(p.of); if (t && t.from === m.from) D.edits[p.of] = { t: p.t, at: m.ts }; }
    else if (p.k === "move") (D.moves[p.g] = D.moves[p.g] || []).push({ by: m.from, i: p.i });
    else if (p.k === "status") D.status[m.from] = { e: p.e, t: p.t, at: m.ts, exp: m.exp };
    if (m.rx) for (const e of Object.values(m.rx)) if (e === "📌") D.pins.add(m.id);
    if (!HID.has(p.k) && p.k !== "dq" && days[m.from] && !m.tmp) days[m.from].add(dayKey(new Date(m.ts)));
  }
  // a streak is consecutive days on which you both said something (today still counts if the day is not over)
  let n = 0, d = new Date(); const both = (x) => days[ME.user].has(dayKey(x)) && days[THEM.user].has(dayKey(x)); if (!both(d)) d = new Date(d.getTime() - 864e5); while (both(d)) { n++; d = new Date(d.getTime() - 864e5); } D.streak = n;
}
const dirty = new Set(); let saveT = 0;
const rawOf = (x) => ({ id: x.id, from: x.from, ts: x.ts, lvl: x.lvl, q: x.q, unlock: x.unlock, van: x.van, exp: x.exp, blob: x.blob, dl: x.dl, rd: x.rd, ak: x.ak, rx: x.rx, ct: x.ct, iv: x.iv });
function persist(id) { dirty.add(id); clearTimeout(saveT); saveT = setTimeout(() => { const rs = [...dirty].map((i) => M.get(i)).filter((x) => x && !x.tmp && x.ct).map(rawOf); dirty.clear(); if (rs.length) B.db.put(rs); }, 1500); }
async function take(m) {
  const old = M.get(m.id); if (old && !old.tmp) { const ch = old.dl !== m.dl || old.rd !== m.rd || old.ak !== m.ak || JSON.stringify(old.rx) !== JSON.stringify(m.rx) || old.exp !== m.exp; Object.assign(old, { dl: m.dl, rd: m.rd, ak: m.ak, rx: m.rx || old.rx, exp: m.exp || old.exp }); if (ch) persist(old.id); return old; }
  const x = { id: m.id, from: m.from, ts: m.ts, lvl: m.lvl, q: m.q, unlock: m.unlock, van: m.van, exp: m.exp, blob: m.blob, dl: m.dl, rd: m.rd, ak: m.ak, rx: m.rx, ct: m.ct, iv: m.iv, p: await B.open(m) };
  if (x.p && x.p.k === "lost" && !x.ct) return x; M.set(m.id, x); persist(x.id); return x;
}
async function loadHistory(before) {
  const j = await api("history?limit=60" + (before ? "&before=" + encodeURIComponent(before) : "")), ids = new Set();
  for (const m of j.msgs) { await take(m); ids.add(m.id); }
  more = j.more && j.msgs.length > 0; if (j.msgs.length) oldest = j.msgs[0].id; if (!before) { evCursor = j.ev; // anything we hold from this window that the server no longer has was unsent, vanished or replaced
    const lo = j.msgs.length && more ? j.msgs[0].id : "", dead = []; for (const [id, x] of M) if (!x.tmp && !ids.has(id) && id >= lo && !(x.unlock && x.from !== ME.user && x.unlock > Date.now())) dead.push(id); for (const id of dead) M.delete(id); if (dead.length) B.db.del(dead); }
  return j;
}
const heard = (m) => { const p = m.p || {}, c = p.k === "pulse" ? pulseOf(p.e).c : null; B.Void.arrive(c); B.snd(p.k === "pulse" ? "pulse" : "arrive"); B.hap(m.lvl >= 2 ? [300, 100, 300] : 30, m.lvl >= 2); if (p.fx) B.Void.fx(p.fx, [B.palette().her, B.palette().me]); };
async function sync() {
  let j; try { j = await api("sync?ev=" + encodeURIComponent(evCursor)); } catch (e) { if (e.auth) return showLogin(); return; }
  seenAt = j.seen || seenAt; let changed = false;
  for (const ev of j.events) {
    if (ev.t === "new") { const had = M.has(ev.m.id), x = await take(ev.m); if (!had) { changed = true; if (x.from !== ME.user) { if (document.visibilityState === "visible" && !HID.has((x.p || {}).k)) heard(x); if (x.p && x.p.k === "note" && x.p.at) toast("A memory landed in " + when(x.p.at)); newCount++; } } }
    else { const m = M.get(ev.id); if (ev.t === "del") { if (m) { M.delete(ev.id); B.db.del([ev.id]); } changed = true; } else if (ev.t === "rx") { if (m) { m.rx = ev.rx; changed = true; persist(m.id); } } else if (m) { m[ev.t] = ev.at || Date.now(); if (ev.exp) m.exp = ev.exp; changed = true; persist(m.id); if (ev.t === "dl") B.Void.delivered(); } }
  }
  evCursor = j.ev || evCursor;
  if (changed) renderLog(); else renderCap();
  if (j.events.length >= 100) sync();
}
let newCount = 0;
const live = () => B.Live.state === "live";
function schedulePoll() { clearTimeout(pollT); pollT = setTimeout(async () => { await sync(); flush(); schedulePoll(); }, document.visibilityState !== "visible" ? 20000 : live() ? 30000 : 3500); }
B.Live.on("poke", () => sync());
B.Live.on("state", () => { renderCap(); schedulePoll(); });
B.Live.on("pres", () => { B.vs.present = B.Live.present && document.visibilityState === "visible"; if (B.Live.present) seenAt = Date.now(); renderCap(); B.Void.need(); });
// reading: pulses, check-ins and answers count as seen once on screen; words wait to be observed (see collapse)
const needsLook = (m) => m.from !== ME.user && !m.tmp && !m.rd && !m.col && !locked(m) && m.p && ["note", "drop", "clip"].includes(m.p.k);
async function ackSeen() {
  if (document.visibilityState !== "visible" || B.locked) return;
  const ids = sorted().filter((m) => m.from !== ME.user && !m.tmp && !m.rd && m.p && (["pulse", "dq", "loc", "poll", "list", "count", "ttt"].includes(m.p.k) || HID.has(m.p.k) || (m.p.k === "checkin" && m.lvl < 2))).map((m) => m.id);
  if (!ids.length) return; ids.forEach((id) => (M.get(id).rd = Date.now())); try { await post("ack", { ids }); } catch (e) { ids.forEach((id) => (M.get(id).rd = 0)); }
}
async function collapse(id) { // the moment of being observed: blurred and uncertain until then
  const m = M.get(id); if (!m || m.col || m.from === ME.user) return; m.col = 1; m.rd = m.rd || Date.now(); const el = els.get(id); if (el) { el.el.classList.add("collapsing"); setTimeout(() => el.el.classList.remove("q", "collapsing"), 650); }
  B.snd("open"); B.hap(12); B.Void.burst("me", B.palette().her); if (!m.tmp) post("ack", { ids: [id] }).then(() => { if (m.van && !m.exp) m.exp = Date.now() + m.van * 1e3; }).catch(() => {}); persist(id); setTimeout(() => renderLog(), 700);
}
async function sendMsg(p, o = {}) {
  if (O.re && !p.re && !HID.has(p.k)) { p.re = O.re; } O.re = null; replyBar();
  if (O.fx && !HID.has(p.k) && !p.fx && ["note", "pulse", "drop", "letter", "loc"].includes(p.k)) { p.fx = O.fx; B.Void.fx(O.fx, [B.palette().me, B.palette().her]); O.fx = ""; optsBar(); }
  const van = o.van != null ? o.van : (O.van && !HID.has(p.k) && !["checkin"].includes(p.k) ? O.van : 0);
  const sl = await B.seal(p), tmp = "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), ts = Date.now();
  const e = { tmp, ct: sl.ct, iv: sl.iv, lvl: o.lvl || 0, q: o.q ? 1 : 0, unlock: o.unlock || 0, van: van || 0, exp: o.exp || 0, blob: o.blob || null, ts }; OUT.push(e); store.set("us-out", JSON.stringify(OUT));
  M.set(tmp, { id: tmp, from: ME.user, ts, lvl: e.lvl, q: e.q, unlock: e.unlock, van: e.van, exp: 0, blob: e.blob, p, tmp: true, dl: 0, rd: 0, ak: 0, ct: sl.ct, iv: sl.iv });
  if (!HID.has(p.k)) { B.Void.launch(p, p.k === "pulse" ? pulseOf(p.e).c : null); B.snd("send"); B.hap(10); } renderLog(true); flush();
}
async function flush() {
  if (flushing || !OUT.length) return; flushing = true;
  try {
    while (OUT.length) {
      const e = OUT[0];
      try {
        const r = await post("send", { ct: e.ct, iv: e.iv, lvl: e.lvl, q: e.q, unlock: e.unlock, van: e.van || undefined, exp: e.exp || undefined, blob: e.blob });
        const m = M.get(e.tmp), cell = els.get(e.tmp); M.delete(e.tmp); els.delete(e.tmp); if (m) { m.id = r.id; m.tmp = false; M.set(r.id, m); persist(r.id); if (cell) { cell.el.dataset.id = r.id; els.set(r.id, cell); } }
        OUT.shift(); store.set("us-out", JSON.stringify(OUT));
      } catch (err) { if (err.auth) { showLogin(); break; } if (err.status === 400) { M.delete(e.tmp); OUT.shift(); store.set("us-out", JSON.stringify(OUT)); toast("One message couldn't be sent."); continue; } break; }
    }
  } finally { flushing = false; renderLog(); }
}
addEventListener("online", () => { flush(); sync(); B.Live.start(); });
setInterval(() => { const now = Date.now(); let ch = false; for (const [id, m] of M) if (m.exp && m.exp <= now) { M.delete(id); B.db.del([id]); ch = true; } if (ch) renderLog(); }, 1000);

// ═══ the timeline: a keyed DOM, so nothing that is already on screen is ever rebuilt ═════════
const els = new Map(); let renderQ = 0;
const VAN = { 5: "5 s", 10: "10 s", 60: "1 min", 3600: "1 h", 86400: "1 day", 604800: "7 days" };
function recState(m) {
  if (m.from !== ME.user) return m.van ? '<span class="rc">⏱ ' + (m.exp ? "vanishes in " + B.mm(m.exp - Date.now()) : "vanishes " + (VAN[m.van] || m.van + " s") + " after you look") + "</span>" : "";
  const vn = m.van ? ' <span class="rc">⏱ ' + (m.exp ? "vanishes in " + B.mm(m.exp - Date.now()) : (VAN[m.van] || m.van + " s") + " after they look") + "</span>" : "";
  if (m.tmp) return '<span class="rc">⌁ waiting for signal</span>' + vn; if (locked(m)) return '<span class="rc">⏳ sealed until ' + esc(when(m.unlock)) + "</span>"; if (m.ak) return '<span class="rc seen">✦ answered</span>' + vn; if (m.rd) return '<span class="rc seen">✦ observed ' + esc(ago(m.rd)) + "</span>" + vn; if (m.dl) return '<span class="rc">◌ in ' + esc(THEM.name) + "'s hands, not yet observed</span>" + vn; return '<span class="rc">· sent</span>' + vn;
}
const snip = (m) => { const p = m.p || {}; const t = p.k === "note" ? (D.edits[m.id] ? D.edits[m.id].t : p.t) : p.k === "letter" ? "💌 " + (p.s || "A letter") : p.k === "pulse" ? pulseOf(p.e).e + " " + pulseOf(p.e).w : p.k === "drop" ? "📷 Photo" + (p.t ? " · " + p.t : "") : p.k === "voice" ? "🎙️ Voice note" : p.k === "clip" ? "🎬 Clip" : p.k === "poll" ? "📊 " + p.q : p.k === "list" ? "📝 " + p.s : p.k === "loc" ? "📍 Location" : p.k === "count" ? "⏳ " + p.s : p.k === "ttt" ? "⭕ Tic-tac-toe" : p.k === "capsule" ? "⏳ Time capsule" : p.k === "checkin" ? (CHECKS.find((c) => c.k === p.c) || {}).w : p.k === "dq" ? "Answer" : p.t || ""; return String(t || "").replace(/\s+/g, " ").slice(0, 80); };
function body(m) {
  const mine = m.from === ME.user, p = m.p || { k: "lost" }, K = B.kinds[p.k];
  if (K && K.render) return K.render(m, B.app);
  if (p.k === "note") { const ed = D.edits[m.id], t = ed ? ed.t : p.t; return '<div class="t' + (B.jumbo(t) ? " jumbo" : "") + '">' + B.fmt(t) + (ed ? ' <span class="ed">edited</span>' : "") + "</div>"; }
  if (p.k === "pulse") { const x = pulseOf(p.e); return '<div class="pulse" style="--pc:' + x.c + '"><i></i><span>' + x.e + " " + esc(x.w) + "</span></div>" + (p.t ? '<div class="t">' + B.fmt(p.t) + "</div>" : ""); }
  if (p.k === "letter") return '<div class="env ' + (mine || m.rd ? "read" : "") + '" data-open="' + esc(m.id) + '"><span class="wax"></span><span><b>' + esc(p.s || "A letter") + "</b><small>" + (mine ? "a letter you wrote · tap to read" : m.rd ? "opened · tap to read again" : "sealed · tap to open") + "</small></span></div>";
  if (p.k === "capsule") return locked(m) ? '<div class="cap"><span class="orb"></span><span>A time capsule, sealed until<br>' + esc(when(m.unlock)) + "</span></div>" : '<div class="card"><div class="h">TIME CAPSULE · written ' + esc(when(m.ts)) + '</div><div class="t">' + B.fmt(p.t) + "</div></div>";
  if (p.k === "drop") return '<div class="drop"><div class="ph" data-img="' + esc(m.id) + '">' + (blobURL.has(m.id) ? "" : "opening…") + "</div>" + (p.t ? '<div class="t">' + B.fmt(p.t) + "</div>" : "") + "</div>";
  if (p.k === "clip") return '<div class="clip" data-vid="' + esc(m.id) + '"><span>' + (blobURL.has(m.id) ? "" : "opening…") + "</span></div>";
  if (p.k === "voice") { const w = p.w || "3568753467865346", bars = [...w].map((c) => '<i style="height:' + (4 + (+c || 0) * 2.2) + 'px"></i>').join(""); return '<div class="voice"><button data-play="' + esc(m.id) + '" aria-label="Play">▶</button><span class="bars">' + bars + '</span><span class="mono" style="font-size:11px;color:var(--dim)">' + Math.round(p.d || 0) + 's</span><button class="spd" data-act="speed" title="Playback speed">1×</button></div>'; }
  if (p.k === "checkin") { const c = CHECKS.find((q) => q.k === p.c) || CHECKS[0]; return '<div class="ck ' + (p.c === "sos" ? "sos" : "") + '"><b style="font-weight:400;font-size:20px">' + c.e + "</b><span>" + esc(c.w) + "</span></div>"; }
  if (p.k === "dq") return '<div class="rc" style="margin:2px 0">answered today\'s question ✦</div>';
  return '<div class="t" style="color:var(--faint);font-style:italic">(sealed with a key this device doesn\'t have)</div>';
}
const rxHTML = (m) => { const r = m.rx || {}, ks = Object.keys(r); return ks.length ? '<div class="rxs">' + ks.map((u) => '<span class="rx ' + (u === ME.user ? "mine" : "") + '">' + esc(r[u]) + "</span>").join("") + "</div>" : ""; };
const reHTML = (m) => { const r = m.p && m.p.re; if (!r) return ""; const t = M.get(r.id); return '<div class="qt" data-act="jump" data-id="' + esc(r.id) + '"><b>' + esc(r.f === ME.user ? "You" : THEM.name) + "</b> " + esc(t ? snip(t) : r.s) + "</div>"; };
const sig = (m, cont) => [m.tmp ? 1 : 0, m.dl, m.rd, m.ak, m.col ? 1 : 0, locked(m) ? 1 : 0, JSON.stringify(m.rx || ""), blobURL.has(m.id) ? 1 : 0, m.from === ME.user && m.rd ? tickN : 0, needsLook(m) ? 1 : 0, cont ? 1 : 0, m.exp ? Math.floor(Date.now() / 1e3) : 0, D.edits[m.id] ? D.edits[m.id].at : 0, JSON.stringify(D.votes[m.id] || ""), JSON.stringify(D.ticks[m.id] || ""), (D.ladd[m.id] || []).length, (D.moves[m.id] || []).length, (m.p && m.p.k === "count") ? Math.floor(Date.now() / 3e4) : 0, D.pins.has(m.id) ? 1 : 0].join("|");
function entryEl(m, cont) {
  const mine = m.from === ME.user, who = mine ? "You" : THEM.name, q = needsLook(m), at = m.p && m.p.k === "note" && m.p.at;
  const cell = els.get(m.id) || { el: Object.assign(document.createElement("article"), { className: "en in" }), sig: "" }; els.set(m.id, cell);
  const s = sig(m, cont); if (s === cell.sig) return cell.el; cell.sig = s; const el = cell.el, k = (m.p && m.p.k) || "";
  el.dataset.id = m.id; el.className = "en " + (mine ? "me" : "her") + " k-" + k + (q ? " q" : "") + (cell.el.classList.contains("in") ? " in" : "") + (m.lvl >= 2 ? " sos" : "") + (cont ? " cont" : "") + (D.pins.has(m.id) ? " pinned" : "") + (m.p && m.p.k === "note" && B.jumbo(D.edits[m.id] ? D.edits[m.id].t : m.p.t) ? " jb" : "");
  el.innerHTML = '<div class="h">' + esc(who) + " · " + esc(hm(m.ts)) + (at ? ' · <span class="back">↩ pinned to ' + esc(when(at)) + "</span>" : "") + (m.q ? " · 🌙" : "") + (D.pins.has(m.id) ? " · 📌" : "") + '</div><div class="bub">' + reHTML(m) + '<div class="bd">' + body(m) + "</div>" + (q ? '<div class="qhint">unobserved · tap to look</div>' : "") + "</div>" + rxHTML(m) + (recState(m) ? '<div class="meta">' + recState(m) + "</div>" : "");
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
    if (!ME || !THEM) return; derive();
    const log = $("log"), near = stick || log.scrollHeight - log.scrollTop - log.clientHeight < 140, prevTop = log.scrollTop, prevH = log.scrollHeight, want = [];
    const vis = sorted().filter((m) => !HID.has((m.p || {}).k) && !gone(m)), win = vis.slice(-shown), hasOlder = vis.length > win.length || more;
    if (hasOlder) { if (!olderEl) { olderEl = document.createElement("button"); olderEl.className = "more"; olderEl.id = "older"; olderEl.textContent = "Load earlier"; } want.push(olderEl); }
    const [qs, qh, fold] = qHTML(); if (!qCell) { qCell = document.createElement("section"); qCell.sig = ""; } if (qCell.sig !== qs) { /* never throw away what someone is halfway through writing */ const qa = qCell.querySelector("#qa"), keepV = qa ? qa.value : "", keepF = qa && document.activeElement === qa; qCell.sig = qs; qCell.className = "qd" + (fold ? " fold" : ""); qCell.innerHTML = qh; const nq = qCell.querySelector("#qa"); if (nq && keepV) { nq.value = keepV; if (keepF) nq.focus(); } } want.push(qCell);
    let lastDay = "", prev = null; const seen = new Set();
    for (const m of win) { const dl = dayLabel(sortT(m)); if (dl !== lastDay) { want.push(dayEl(dl)); lastDay = dl; prev = null; } const cont = prev && prev.from === m.from && sortT(m) - sortT(prev) < 18e4 && !m.p.re && !["capsule", "letter"].includes(m.p.k); want.push(entryEl(m, cont)); seen.add(m.id); prev = m; }
    for (const k of [...els.keys()]) if (!seen.has(k)) els.delete(k);
    if (!win.length) { if (!emptyEl) { emptyEl = document.createElement("div"); emptyEl.className = "empty"; emptyEl.textContent = "Nothing here yet. Say anything. Even one light is enough."; } want.push(emptyEl); }
    let ref = log.firstChild; for (const nd of want) { if (nd === ref) ref = ref.nextSibling; else log.insertBefore(nd, ref); } const keep = new Set(want); for (const c of [...log.children]) if (!keep.has(c)) c.remove();
    for (const nd of log.querySelectorAll(".en.in")) if (!nd.dataset.pop) { nd.dataset.pop = 1; setTimeout(() => nd.classList.remove("in"), 700); }
    if (near) { log.scrollTop = log.scrollHeight; newCount = 0; } else if (prevH !== log.scrollHeight && prevTop < 40) log.scrollTop = prevTop + (log.scrollHeight - prevH);
    hydrate(); renderCap(); renderStrip(); fab(); ackSeen(); checkSOS(); syncVoid(); cone();
  });
}
const lastTalk = () => { let t = 0; for (const m of M.values()) if (!m.tmp && !locked(m) && m.p && !HID.has(m.p.k) && m.p.k !== "dq") t = Math.max(t, m.ts); return t; };
function syncVoid() { const v = B.vs; v.seenAt = seenAt; v.gap = lastTalk(); v.capsules = [...M.values()].filter((m) => m.from === ME.user && locked(m)).length; v.flight = [...M.values()].some((m) => m.from === ME.user && !m.dl && !m.tmp && !locked(m) && !HID.has((m.p || {}).k)) || [...M.values()].some((m) => m.tmp && !m.unlock); const st = D.status[THEM.user]; v.mood = st && st.e && (!st.exp || st.exp > Date.now()) ? st.e : ""; v.names = { me: "you", her: THEM ? THEM.name : "" }; B.Void.need(); }
function renderCap() {
  if (!THEM) return; const g = lastTalk(), t = [], p = B.Live.present && document.visibilityState === "visible";
  const s = seenAt ? Date.now() - seenAt : Infinity; t.push(p ? THEM.name + " is here with you now" : s < 120e3 ? THEM.name + " was just here" : seenAt ? THEM.name + " was here " + ago(seenAt) : THEM.name + " hasn't opened it yet");
  if (g) t.push("last words " + ago(g)); $("herocap").textContent = t.join(" · ");
  $("pst").innerHTML = '<span class="ld ' + B.Live.state + '"></span>' + (B.Live.state === "live" ? "live" : navigator.onLine === false ? "offline" : "polling") + " · you & " + esc(THEM.name) + (D.streak > 1 ? " · 🔥 " + D.streak : "");
  B.vs.present = p;
}
// the strip under the stars: what is true right now (her status, streak, pinned, countdowns, where she is)
let stripSig = "";
function renderStrip() {
  const chips = [], st = D.status[THEM.user], mine = D.status[ME.user], now = Date.now();
  if (st && st.e && (!st.exp || st.exp > now)) chips.push(['<b>' + esc(st.e) + "</b> " + esc(THEM.name) + (st.t ? ": " + esc(st.t) : ""), "status"]);
  chips.push([mine && mine.e && (!mine.exp || mine.exp > now) ? "<b>" + esc(mine.e) + "</b> " + esc(mine.t || "your status") : "＋ status", "mystatus"]);
  if (D.streak > 1) chips.push(["🔥 " + D.streak + " day streak", "streak"]);
  if (D.pins.size) chips.push(["📌 " + D.pins.size + " pinned", "shared:pins"]);
  for (const m of sorted()) if (m.p && m.p.k === "count" && m.p.due > now - 864e5 && !gone(m)) chips.push(["⏳ " + esc(m.p.s) + " · " + (m.p.due > now ? B.mm(m.p.due - now) : "today"), "jump:" + m.id]);
  const lm = [...M.values()].filter((m) => m.from !== ME.user && m.p && m.p.k === "loc" && !gone(m)).sort((a, b) => b.ts - a.ts)[0]; if (lm && B.myPos) { const g = B.geo(B.myPos, lm.p); chips.push(["📍 " + B.dist(g.d) + " " + B.dir(g.brg), "jump:" + lm.id]); }
  const s = JSON.stringify(chips) + (now / 6e4 | 0); if (s === stripSig) return; stripSig = s;
  $("strip").innerHTML = chips.slice(0, 8).map(([h, a]) => '<button class="chip" data-chip="' + esc(a) + '">' + h + "</button>").join("");
}
$("strip").onclick = (e) => { const b = e.target.closest("[data-chip]"); if (!b) return; const [a, x] = b.dataset.chip.split(":"); if (a === "jump") jump(x); else if (a === "shared") B.sheets.shared && B.sheets.shared(x); else if (a === "mystatus" || a === "status") B.sheets.status && B.sheets.status(); else if (a === "streak") toast("You've both said something " + D.streak + " days in a row. Keep it going."); };
// the little arrow that takes you back to the newest message
function fab() { const log = $("log"), far = log.scrollHeight - log.scrollTop - log.clientHeight > 260; $("fab").classList.toggle("on", far); $("fab").textContent = newCount ? "↓ " + newCount + " new" : "↓"; }
$("fab").onclick = () => { newCount = 0; $("log").scrollTo({ top: $("log").scrollHeight, behavior: "smooth" }); };
// the light cone: what you are looking at is sharp and near, everything else recedes into the past (opacity only: cheap)
let coneQ = 0;
function cone() {
  fab(); if (B.vs.tier < 3 || document.documentElement.dataset.motion === "reduced") return; cancelAnimationFrame(coneQ);
  coneQ = requestAnimationFrame(() => { const log = $("log"), r = log.getBoundingClientRect(), f = r.top + r.height * .7, rows = []; for (const c of log.children) { if (!c.classList.contains("en")) continue; const b = c.getBoundingClientRect(); if (b.bottom < r.top - 60 || b.top > r.bottom + 60) continue; rows.push([c, Math.min(1, Math.abs((b.top + b.bottom) / 2 - f) / (r.height * .9))]); } for (const [c, k] of rows) c.style.setProperty("--k", k.toFixed(2)); });
}
$("log").addEventListener("scroll", cone, { passive: true });
// quantum collapse on sight: an unobserved message resolves once it has been in view for a moment
let io = null; const timers = new Map();
function watch(el) {
  if (!("IntersectionObserver" in window)) return; if (!io) io = new IntersectionObserver((es) => { for (const e of es) { const id = e.target.dataset.id; if (e.isIntersecting && document.visibilityState === "visible" && !B.locked) { if (!timers.has(id)) timers.set(id, setTimeout(() => { timers.delete(id); collapse(id); }, 1100)); } else { clearTimeout(timers.get(id)); timers.delete(id); } } }, { root: $("log"), threshold: .7 });
  io.observe(el);
}
async function blobOf(m) { let u = blobURL.get(m.id); if (u) return u; const r = await fetch("/api/us/blob/" + m.blob, { credentials: "same-origin" }); if (!r.ok) throw 0; const kind = m.p.k; u = URL.createObjectURL(new Blob([await B.openBytes(await r.arrayBuffer())], { type: m.p.m || (kind === "clip" ? "video/webm" : kind === "voice" ? "audio/webm" : "image/jpeg") })); blobURL.set(m.id, u); return u; }
async function hydrate() {
  for (const el of document.querySelectorAll("[data-img],[data-vid]")) {
    const vid = !!el.dataset.vid, id = el.dataset.img || el.dataset.vid, m = M.get(id); if (!m || !m.blob || m.tmp && !blobURL.has(id)) continue;
    try { const u = await blobOf(m), t = document.querySelector((vid ? "[data-vid=" : "[data-img=") + '"' + CSS.escape(id) + '"]'); if (t) t.outerHTML = vid ? '<video class="vid" src="' + u + '" playsinline loop muted preload="metadata" data-big="' + esc(id) + '"></video>' : '<img src="' + u + '" alt="A photo" data-big="' + esc(id) + '">'; } catch (e) { el.textContent = "couldn't open"; }
  }
}
setInterval(() => { tickN++; if (ME && document.visibilityState === "visible") { renderCap(); renderLog(); } }, 30000);
setInterval(() => { if (ME && document.visibilityState === "visible" && [...M.values()].some((m) => m.exp && m.exp > Date.now())) renderLog(); }, 1000);

// ═══ the message menu: react, reply, edit, pin, copy, info, unsend (press and hold, right-click, or double-tap) ═══
let ctxFor = null, pressT = 0;
function showCtx(id, x, y) {
  const m = M.get(id); if (!m || m.tmp) return; ctxFor = id; const mine = m.from === ME.user, p = m.p || {}, txt = p.k === "note" ? (D.edits[id] ? D.edits[id].t : p.t) : p.t || p.s || "";
  const acts = [["reply", "↩ Reply"], txt ? ["copy", "⧉ Copy text"] : null, mine && p.k === "note" ? ["edit", "✎ Edit"] : null, [D.pins.has(id) ? "unpin" : "pin", D.pins.has(id) ? "📌 Unpin" : "📌 Pin"], ["info", "ⓘ Info"], mine ? ["unsend", "🗑 Unsend"] : null].filter(Boolean);
  const b = $("ctx"); b.innerHTML = '<div class="rr">' + REACTS.map((e) => '<button data-re="' + e + '">' + e + "</button>").join("") + '<button data-re="">✕</button></div>' + acts.map(([a, l]) => '<button class="ca" data-ca="' + a + '">' + l + "</button>").join(""); b.classList.add("on");
  const w = Math.min(260, innerWidth - 16), h = 44 + acts.length * 42; b.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px"; b.style.top = Math.max(60, Math.min(innerHeight - h - 12, y - h / 2)) + "px";
}
const hideCtx = () => { $("ctx").classList.remove("on"); ctxFor = null; };
$("ctx").onclick = async (e) => {
  const id = ctxFor, m = M.get(id); if (!m) return hideCtx();
  const re = e.target.closest("[data-re]"), ca = e.target.closest("[data-ca]");
  if (re) { hideCtx(); m.rx = { ...(m.rx || {}) }; if (re.dataset.re) m.rx[ME.user] = re.dataset.re; else delete m.rx[ME.user]; B.snd("tick"); persist(id); renderLog(); try { await post("react", { id, e: re.dataset.re }); } catch (err) { toast("Couldn't react."); } return; }
  if (!ca) return; const a = ca.dataset.ca; hideCtx();
  if (a === "reply") { O.re = { id, f: m.from, s: snip(m) }; replyBar(); $("txt").focus(); }
  else if (a === "copy") { try { await navigator.clipboard.writeText(D.edits[id] ? D.edits[id].t : m.p.t || m.p.s || ""); toast("Copied"); } catch (err) { toast("Couldn't copy"); } }
  else if (a === "edit") { O.edit = { id }; $("txt").value = D.edits[id] ? D.edits[id].t : m.p.t; $("txt").dispatchEvent(new Event("input")); replyBar(); $("txt").focus(); }
  else if (a === "pin" || a === "unpin") { m.rx = { ...(m.rx || {}) }; if (a === "pin") m.rx[ME.user] = "📌"; else for (const u of Object.keys(m.rx)) if (m.rx[u] === "📌") delete m.rx[u]; persist(id); renderLog(); try { await post("react", { id, e: a === "pin" ? "📌" : "" }); } catch (err) {} if (a === "unpin") for (const u of Object.keys(m.rx || {})) if (m.rx[u] === "📌") toast("They've pinned it too. Only they can unpin it."); }
  else if (a === "info") { const row = (k, v) => '<div class="setrow"><div>' + k + "</div><b>" + v + "</b></div>"; showSheet('<h2 class="disp">Message info</h2>' + row("Sent", esc(when(m.ts))) + row("Arrived", m.dl ? esc(when(m.dl)) : "—") + row("Observed", m.rd ? esc(when(m.rd)) : "not yet") + (m.van ? row("Vanishes", m.exp ? esc(when(m.exp)) : (VAN[m.van] || m.van + " s") + " after it's observed") : "") + row("Sealed with", "AES-256-GCM, on your device") + row("Server saw", "who, when, size")); sheet.onclick = null; }
  else if (a === "unsend") { if (!confirm("Unsend this for both of you?")) return; try { await api("message/" + encodeURIComponent(id), { method: "DELETE" }); M.delete(id); B.db.del([id]); renderLog(); toast("Unsent"); } catch (err) { toast("Couldn't unsend."); } }
};
$("log").addEventListener("dblclick", (e) => { const en = e.target.closest(".en"); if (en && !en.classList.contains("q") && !e.target.closest("button,a,video")) { const m = M.get(en.dataset.id); if (m && m.from !== ME.user) { m.rx = { ...(m.rx || {}), [ME.user]: "❤️" }; persist(m.id); B.snd("tick"); renderLog(); post("react", { id: m.id, e: "❤️" }).catch(() => {}); } else showCtx(en.dataset.id, e.clientX, e.clientY); } });
$("log").addEventListener("contextmenu", (e) => { const en = e.target.closest(".en"); if (en) { e.preventDefault(); showCtx(en.dataset.id, e.clientX, e.clientY); } });
// press and hold; swipe right on a message to reply
let sw = null;
$("log").addEventListener("pointerdown", (e) => { const en = e.target.closest(".en"); clearTimeout(pressT); if (!en || e.target.closest("button,a,video,input")) return; sw = { en, x: e.clientX, y: e.clientY, dx: 0, done: false };
  if (e.pointerType === "touch") pressT = setTimeout(() => { if (sw && Math.abs(sw.dx) < 8 && !en.classList.contains("q")) { sw = null; B.hap(15); showCtx(en.dataset.id, e.clientX, e.clientY); } }, 520); });
$("log").addEventListener("pointermove", (e) => { if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw.dx = dx; if (Math.abs(dy) > 14 || Math.abs(dx) > 8) clearTimeout(pressT); if (Math.abs(dy) > Math.abs(dx) * 1.2) { if (sw.en.style.transform) sw.en.style.transform = ""; return; } if (dx > 6 && !sw.done) { sw.en.style.transform = "translateX(" + Math.min(70, dx * .6) + "px)"; if (dx > 70) { sw.done = true; B.hap(12); const m = M.get(sw.en.dataset.id); if (m && !m.tmp) { O.re = { id: m.id, f: m.from, s: snip(m) }; replyBar(); $("txt").focus(); } } } }, { passive: true });
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) $("log").addEventListener(ev, () => { clearTimeout(pressT); if (sw) { sw.en.style.transition = "transform .2s"; sw.en.style.transform = ""; const en = sw.en; setTimeout(() => (en.style.transition = ""), 220); sw = null; } }, { passive: true });
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#ctx") && !e.target.closest(".en")) hideCtx(); });
function jump(id) { closePal(); const c = els.get(id); if (!c) { const i = sorted().filter((m) => !HID.has((m.p || {}).k)).findIndex((m) => m.id === id), tot = sorted().length; if (i >= 0) { shown = tot; renderLog(); setTimeout(() => jump(id), 120); } else toast("That one is further back. Load earlier first."); return; } c.el.scrollIntoView({ block: "center", behavior: "smooth" }); c.el.classList.add("flash"); setTimeout(() => c.el.classList.remove("flash"), 1800); }
$("log").addEventListener("click", async (e) => {
  const t = e.target; if (t.closest("#older")) { const vis = sorted().filter((m) => !HID.has((m.p || {}).k)).length; if (shown < vis) shown += 80; else if (more) { await loadHistory(oldest); shown += 60; } renderLog(); return; }
  if (t.closest("#qt")) { B.set("qfold", B.cfg.qfold === dayKey() ? "" : dayKey()); renderLog(); return; }
  if (t.closest("#qs")) { const a = ($("qa").value || "").trim(); if (a) { await sendMsg({ k: "dq", d: dayKey(), a }); } return; }
  const q = t.closest(".en.q"); if (q) return collapse(q.dataset.id);
  const act = t.closest("[data-act]"); if (act) { const f = B.acts[act.dataset.act]; if (f) { const en = act.closest(".en"); return f(act.dataset, en ? M.get(en.dataset.id) : null, act); } if (act.dataset.act === "jump") return jump(act.dataset.id); if (act.dataset.act === "speed") return speed(act); }
  const en = t.closest("[data-open]"); if (en) return openLetter(en.dataset.open);
  const pl = t.closest("[data-play]"); if (pl) return playVoice(pl.dataset.play, pl);
  const big = t.closest("[data-big]"); if (big) { const m = M.get(big.dataset.big); if (m && m.p.k === "clip") { const v = big; v.muted = false; v.paused ? v.play() : v.pause(); } else { const u = blobURL.get(big.dataset.big); if (u) window.open(u, "_blank"); } }
});
function openLetter(id) {
  const m = M.get(id); if (!m || !m.p) return; const mine = m.from === ME.user;
  $("paper").innerHTML = '<button class="btn" id="rx">← Back</button><h2>' + esc(m.p.s || "A letter") + '</h2><div class="body">' + B.fmt(m.p.t) + '</div><div class="by">' + (mine ? "from you" : "from " + esc(THEM.name)) + " · " + esc(when(m.ts)) + "</div>";
  $("reader").classList.add("on"); $("rx").onclick = () => $("reader").classList.remove("on"); B.snd("open");
  if (!mine && !m.rd && !m.tmp) { m.rd = Date.now(); post("ack", { ids: [m.id] }).catch(() => {}); persist(m.id); renderLog(); }
}
let player = null, rate = 1;
const speed = (btn) => { rate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; document.querySelectorAll(".spd").forEach((b) => (b.textContent = rate + "×")); if (player) player.playbackRate = rate; };
async function playVoice(id, btn) {
  const m = M.get(id); if (!m || !m.blob) return; if (player) { player.pause(); player = null; document.querySelectorAll("[data-play]").forEach((b) => { b.textContent = "▶"; b.closest(".voice").classList.remove("playing"); }); if (btn.dataset.on === id) { btn.dataset.on = ""; return; } }
  try {
    const u = await blobOf(m), bars = btn.parentNode.querySelectorAll(".bars i");
    player = new Audio(u); player.playbackRate = rate; btn.textContent = "❚❚"; btn.dataset.on = id; btn.closest(".voice").classList.add("playing");
    player.ontimeupdate = () => { const k = player.duration ? player.currentTime / player.duration : 0; bars.forEach((b, i) => b.classList.toggle("on", i / bars.length < k)); B.Void.voice(.5); };
    player.onended = () => { btn.textContent = "▶"; btn.dataset.on = ""; btn.closest(".voice").classList.remove("playing"); bars.forEach((b) => b.classList.remove("on")); player = null; }; await player.play();
    if (m.from !== ME.user && !m.rd) { m.rd = Date.now(); post("ack", { ids: [id] }).catch(() => {}); persist(id); }
  } catch (e) { toast("Couldn't play that."); btn.textContent = "▶"; }
}

// ═══ SOS ════════════════════════════════════════════════════════════════════════════════════
let sosT = 0;
function checkSOS() {
  const s = sorted().find((m) => m.from !== ME.user && m.lvl >= 2 && !m.ak && !m.tmp && m.p);
  if (!s) { $("sos").classList.remove("on"); clearInterval(sosT); sosT = 0; return; }
  $("sos-h").textContent = THEM.name + " needs you"; $("sos-p").textContent = s.p.k === "checkin" ? (CHECKS.find((c) => c.k === s.p.c) || {}).w || "" : s.p.t || ""; $("sos").classList.add("on"); $("sos-ok").dataset.id = s.id;
  if (!sosT) { B.snd("sos"); B.hap([400, 150, 400], true); sosT = setInterval(() => { B.hap([400, 150, 400], true); B.snd("sos"); }, 2500); }
}
$("sos-ok").onclick = async (e) => { const id = e.currentTarget.dataset.id, m = M.get(id); if (m) { m.ak = m.rd = Date.now(); } $("sos").classList.remove("on"); clearInterval(sosT); sosT = 0; renderLog(); try { await post("ack", { ids: [id], ak: true }); await sendMsg({ k: "checkin", c: "ok" }); } catch (err) { toast("I'm here didn't reach the server. Trying again…"); setTimeout(() => post("ack", { ids: [id], ak: true }).catch(() => {}), 3000); } };

// ═══ the composer ═══════════════════════════════════════════════════════════════════════════
const txt = $("txt"), MODES = [["🔔", "Normal"], ["📣", "Loud: a firm alert until it's observed"], ["🌙", "Quiet: no alert at all, it will be there when they look"]];
const FX = { "": "None", confetti: "🎉 Confetti", hearts: "💗 Hearts", fireworks: "🎆 Fireworks", slam: "💥 Slam", echo: "🌊 Echo" }, VANS = [[0, "Off"], [10, "10 s"], [60, "1 min"], [3600, "1 hour"], [86400, "1 day"]];
let tyAt = 0, draftT = 0;
const sendIcon = () => { const has = !!txt.value.trim() || !!O.edit; $("b-send").textContent = has ? "➤" : "🎙"; $("b-send").setAttribute("aria-label", has ? "Send" : "Record a voice note"); };
txt.addEventListener("input", () => {
  txt.style.height = "auto"; txt.style.height = Math.min(132, txt.scrollHeight) + "px"; sendIcon();
  if (B.cfg.live !== "off" && B.Live.present && Date.now() - tyAt > 500) { tyAt = Date.now(); B.Live.send({ t: "ty", x: B.cfg.live === "words" ? txt.value.slice(-160) : "" }); }
  clearTimeout(draftT); draftT = setTimeout(() => store.set("us-draft", txt.value || null), 400); // a draft survives closing the app
});
B.Live.typing = (o) => { if (B.cfg.live === "off") { B.vs.typing = 0; return; } const g = $("ghost"); if (B.cfg.live === "words" && o.x) g.textContent = THEM.name + ": " + o.x; else g.textContent = THEM.name + " is writing…"; g.classList.add("on"); clearTimeout(g.t); g.t = setTimeout(() => g.classList.remove("on"), 4500); };
txt.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); sendText(); } });
let sendPress = 0, sendLong = false;
$("b-send").addEventListener("pointerdown", () => { sendLong = false; clearTimeout(sendPress); sendPress = setTimeout(() => { sendLong = true; B.hap(15); sendOptions(); }, 480); });
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) $("b-send").addEventListener(ev, () => clearTimeout(sendPress));
$("b-send").onclick = () => { if (sendLong) { sendLong = false; return; } sendText(); };
const setMode = () => { const b = $("b-loud"); b.textContent = MODES[O.mode][0]; b.classList.toggle("on", O.mode > 0); b.title = MODES[O.mode][1]; b.setAttribute("aria-label", MODES[O.mode][1]); optsBar(); };
$("b-loud").onclick = () => { O.mode = (O.mode + 1) % 3; setMode(); toast(MODES[O.mode][1]); };
function optsBar() { const c = []; if (O.mode) c.push([MODES[O.mode][0] + " " + (O.mode === 1 ? "loud" : "quiet"), "mode"]); if (O.van) c.push(["⏱ vanish " + VAN[O.van], "van"]); if (O.fx) c.push([FX[O.fx], "fx"]); $("opts").innerHTML = c.map(([t, k]) => '<button class="chip on" data-o="' + k + '">' + esc(t) + " ✕</button>").join(""); $("opts").classList.toggle("hidden", !c.length); }
$("opts").onclick = (e) => { const b = e.target.closest("[data-o]"); if (!b) return; const k = b.dataset.o; if (k === "mode") { O.mode = 0; setMode(); } else if (k === "van") O.van = 0; else O.fx = ""; optsBar(); };
function replyBar() { const b = $("replybar"); if (O.edit) { b.innerHTML = '<span>✎ Editing your message</span><button id="rb-x" aria-label="Cancel">✕</button>'; b.classList.remove("hidden"); } else if (O.re) { b.innerHTML = "<span>↩ " + esc(O.re.f === ME.user ? "You" : THEM.name) + ": " + esc(O.re.s) + '</span><button id="rb-x" aria-label="Cancel reply">✕</button>'; b.classList.remove("hidden"); } else b.classList.add("hidden"); if ($("rb-x")) $("rb-x").onclick = () => { if (O.edit) { txt.value = ""; txt.dispatchEvent(new Event("input")); } O.re = null; O.edit = null; replyBar(); }; sendIcon(); }
function sendOptions() {
  showSheet('<h2 class="disp">Send with…</h2><label>Effect</label><div class="seg wrap l">' + Object.entries(FX).map(([k, l]) => '<button data-fx="' + k + '" class="' + (O.fx === k ? "on" : "") + '">' + l + "</button>").join("") + '</div><label>Alert</label><div class="seg l">' + MODES.map(([e, l], i) => '<button data-md="' + i + '" class="' + (O.mode === i ? "on" : "") + '">' + e + " " + ["Normal", "Loud", "Quiet"][i] + "</button>").join("") + '</div><label>Vanish after they look</label><div class="seg wrap l">' + VANS.map(([s, l]) => '<button data-vn="' + s + '" class="' + (O.van === s ? "on" : "") + '">' + l + "</button>").join("") + '</div><p style="font-size:14px;margin-top:12px">Vanishing messages are deleted from both phones and from the server once the timer after they\'re observed runs out.</p><div class="row mt"><button class="btn pri" id="so-ok">Done</button></div>');
  sheet.onclick = (e) => { const f = e.target.closest("[data-fx]"), m = e.target.closest("[data-md]"), v = e.target.closest("[data-vn]"); if (f) O.fx = f.dataset.fx; if (m) O.mode = +m.dataset.md; if (v) O.van = +v.dataset.vn; if (f || m || v) { setMode(); sendOptions(); } };
  $("so-ok").onclick = hideSheet;
}
function sendText() {
  const t = txt.value.trim(); if (!t) { if (!O.edit) sheets.voice(); return; }
  txt.value = ""; txt.style.height = "auto"; store.set("us-draft", null); B.Live.send({ t: "ty", x: "" });
  if (O.edit) { const id = O.edit.id; O.edit = null; replyBar(); sendMsg({ k: "edit", of: id, t }); return; }
  sendMsg({ k: "note", t }, { lvl: O.mode === 1 ? 1 : 0, q: O.mode === 2 }); if (O.mode) { O.mode = 0; setMode(); } sendIcon();
}
const KINDS = [["pulse", "✨", "Pulse"], ["letter", "💌", "Letter"], ["capsule", "⏳", "Capsule"], ["memory", "↩️", "Past"], ["drop", "📷", "Photo"], ["studio", "🎨", "Draw"], ["voice", "🎙️", "Voice"], ["clip", "🎬", "Clip"], ["call", "📞", "Call"], ["loc", "📍", "Where"], ["poll", "📊", "Poll"], ["list", "📝", "List"], ["count", "⏰", "Count"], ["game", "⭕", "Game"], ["status", "😊", "Status"], ["checkin", "🛟", "Check-in"], ["shared", "🗂️", "Shared"]];
$("tray").innerHTML = KINDS.map(([k, e, w]) => '<button data-k="' + k + '"><b>' + e + "</b>" + w + "</button>").join("");
$("b-plus").onclick = (e) => { e.stopPropagation(); $("tray").classList.toggle("hidden"); };
document.addEventListener("click", (e) => { if (!e.target.closest("#tray,#b-plus")) $("tray").classList.add("hidden"); });
$("tray").onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; $("tray").classList.add("hidden"); const f = sheets[b.dataset.k] || B.sheets[b.dataset.k]; f && f(); };

const sheet = $("sheet"), scrim = $("scrim"); let rec = null, sheetTick = 0;
const showSheet = (html) => { sheet.innerHTML = html; sheet.classList.add("on"); scrim.classList.add("on"); document.body.classList.add("modal"); B.Void.pause(true); }, hideSheet = () => { sheet.classList.remove("on"); scrim.classList.remove("on"); document.body.classList.remove("modal"); B.Void.pause(false); clearInterval(sheetTick); sheet.oninput = sheet.onchange = null; if (rec && rec.state !== "inactive") try { rec.stop(); } catch (e) {} };
scrim.onclick = hideSheet; addEventListener("keydown", (e) => { if (e.key === "Escape") { hideSheet(); hideCtx(); $("reader").classList.remove("on"); closePal(); } });
async function uploadBlob(u8) { const up = await fetch("/api/us/blob", { method: "POST", credentials: "same-origin", body: await B.sealBytes(u8) }); if (!up.ok) throw 0; return (await up.json()).id; }
const sheets = {
  pulse() { showSheet('<h2 class="disp">Pulse</h2><p>One tap. They see it glow.</p><div class="grid">' + PULSES.map((x) => '<button class="opt" data-p="' + x.k + '"><b>' + x.e + "</b>" + esc(x.w) + "</button>").join("") + "</div>"); sheet.onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) { sendMsg({ k: "pulse", e: b.dataset.p }); hideSheet(); } }; },
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
    showSheet('<h2 class="disp">Photo</h2><p>Encrypted here before it leaves your phone.</p><div class="row"><label class="btn" for="pf">Choose</label><label class="btn" for="pf2">📷 Camera</label></div><input id="pf" type="file" accept="image/*" class="hidden"><input id="pf2" type="file" accept="image/*" capture="environment" class="hidden"><div id="pv" style="margin:10px 0"></div><label for="pc">Caption</label><input id="pc" maxlength="200"><label class="chk"><input type="checkbox" id="po"> View once (vanishes 10 s after they look)</label><div class="row mt"><button class="btn" id="pe" disabled>🎨 Edit</button><button class="btn pri" id="pg" disabled>Send</button></div>'); sheet.onclick = null; let jpg = null, dim = null, bmpSrc = null;
    const load = async (f) => { if (!f) return; try { const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmpSrc = c;
        let q = .82, blob; do { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); q -= .1; } while (blob.size > 1.4 * 1024 * 1024 && q > .2); jpg = new Uint8Array(await blob.arrayBuffer()); dim = [c.width, c.height]; $("pv").innerHTML = '<img src="' + URL.createObjectURL(blob) + '" style="max-width:100%;max-height:260px;border-radius:12px">'; $("pg").disabled = false; $("pe").disabled = false; } catch (e) { toast("Couldn't read that photo."); } };
    $("pf").onchange = () => load($("pf").files[0]); $("pf2").onchange = () => load($("pf2").files[0]); $("pe").onclick = () => B.studio && B.studio(bmpSrc);
    $("pg").onclick = async () => { $("pg").disabled = true; try { const id = await uploadBlob(jpg); await sendMsg({ k: "drop", m: "image/jpeg", w: dim[0], h: dim[1], t: $("pc").value.trim() }, { blob: id, van: $("po").checked ? 10 : undefined }); const last = [...M.values()].filter((m) => m.tmp).pop(); if (last) blobURL.set(last.id, URL.createObjectURL(new Blob([jpg], { type: "image/jpeg" }))); hideSheet(); } catch (e) { $("pg").disabled = false; toast("Photos need a signal. Try again in a moment."); } };
  },
  voice() {
    showSheet('<h2 class="disp">Voice note</h2><p>Say it out loud. Up to 90 seconds.</p><div class="row"><button class="btn pri" id="vr">● Record</button><span class="mono" id="vt">0:00</span></div><div class="live-wave" id="lw"></div><audio id="vp" controls class="hidden" style="width:100%;margin-top:12px"></audio><div class="row mt"><button class="btn pri" id="vs" disabled>Send</button></div>'); sheet.onclick = null; let chunks = [], t0 = 0, tick = 0, bytes = null, mime = "", peaks = "", an = null, ac2 = null, wt = 0;
    $("vr").onclick = async () => {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); rec = new MediaRecorder(st, { audioBitsPerSecond: 24000 }); chunks = []; mime = rec.mimeType || "audio/webm"; rec.ondataavailable = (e) => chunks.push(e.data); const samples = [];
        try { ac2 = new (window.AudioContext || window.webkitAudioContext)(); an = ac2.createAnalyser(); an.fftSize = 512; ac2.createMediaStreamSource(st).connect(an); const buf = new Uint8Array(an.fftSize); wt = setInterval(() => { an.getByteTimeDomainData(buf); let mx = 0; for (let i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i] - 128)); samples.push(mx / 128); const lw = $("lw"); if (lw) lw.innerHTML = samples.slice(-40).map((v) => '<i style="height:' + (3 + Math.min(1, v * 2.2) * 26) + 'px"></i>').join(""); }, 100); } catch (e) {}
        rec.onstop = async () => { clearInterval(tick); clearInterval(wt); try { ac2 && ac2.close(); } catch (e) {} st.getTracks().forEach((t) => t.stop()); $("vr").textContent = "● Again"; const blob = new Blob(chunks, { type: mime }); bytes = new Uint8Array(await blob.arrayBuffer());
          const n = 32, mxv = Math.max(.05, ...samples); peaks = Array.from({ length: n }, (_, i) => { const a = samples.slice(Math.floor(i * samples.length / n), Math.max(Math.floor((i + 1) * samples.length / n), Math.floor(i * samples.length / n) + 1)); return Math.min(9, Math.round(9 * (Math.max(0, ...a) / mxv))); }).join("");
          $("vp").src = URL.createObjectURL(blob); $("vp").classList.remove("hidden"); $("vs").disabled = bytes.length > 1.5 * 1024 * 1024; if ($("vs").disabled) toast("That one's too long. Try a shorter one."); };
        rec.start(); t0 = Date.now(); $("vr").textContent = "■ Stop"; tick = setInterval(() => { const s = (Date.now() - t0) / 1000; $("vt").textContent = Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); if (s >= 90) rec.stop(); }, 250); } catch (e) { toast("I need microphone access for that."); } };
    $("vs").onclick = async () => { $("vs").disabled = true; try { const id = await uploadBlob(bytes); await sendMsg({ k: "voice", m: mime, d: (Date.now() - t0) / 1000, w: peaks }, { blob: id }); hideSheet(); } catch (e) { $("vs").disabled = false; toast("Voice notes need a signal. Try again in a moment."); } };
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
new ResizeObserver(() => { const r = hero.getBoundingClientRect(); B.vs.hero = r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; B.Void.size(); }).observe(hero);
const stage = (on) => { B.cfg.stage = on; $("app").classList.toggle("stage", on); $("herohint").textContent = on ? "Touch the void. Hold it with " + (THEM ? THEM.name : "them") + " and you'll both feel it." : ""; };
$("b-stage").onclick = () => stage(!$("app").classList.contains("stage")); $("stage-x").onclick = () => stage(false);
$("stagebar").innerHTML = PULSES.slice(0, 5).map((x) => '<button data-sp="' + x.k + '" title="' + esc(x.w) + '">' + x.e + "</button>").join("");
$("stagebar").onclick = (e) => { const b = e.target.closest("[data-sp]"); if (b) sendMsg({ k: "pulse", e: b.dataset.sp }); };
B.vs.onContact = () => { renderCap(); toast("Contact. You're both here, touching."); };

// ═══ the command palette: type anything ═════════════════════════════════════════════════════
const pal = $("pal"); let palItems = [], palSel = 0;
const textOf = (m) => { const p = m.p || {}, ed = D.edits[m.id]; return [ed ? ed.t : p.t, p.s, p.a, p.q, p.k === "pulse" ? pulseOf(p.e).w : "", p.k === "checkin" ? (CHECKS.find((c) => c.k === p.c) || {}).w : ""].filter(Boolean).join(" ").toLowerCase(); };
function actions() {
  const A = KINDS.map(([k, e, w]) => [e + " " + ({ pulse: "Send a pulse", letter: "Write a letter", capsule: "Seal a time capsule", memory: "Send into the past", drop: "Send a photo", studio: "Draw or edit a picture", voice: "Record a voice note", clip: "Record a video clip", call: "Call " + THEM.name, loc: "Share where I am", poll: "Make a poll", list: "Make a shared list", count: "Start a countdown", game: "Play tic-tac-toe", status: "Set my status", checkin: "Check in", shared: "Shared photos, links and pins" })[k], () => (sheets[k] || B.sheets[k])()]);
  A.push(["◎ Enter the stage (touch together)", () => stage(true)], ["⚙ Settings", () => openSettings()], ["⚙ Systems & diagnostics", () => openSettings("systems")], ["🔑 Verify our key (constellation)", () => openSettings("security")], ["🔒 Lock the app", () => lockNow()], ["⬇ Export our history", () => openSettings("data")]);
  for (const [k, t] of Object.entries(B.THEMES)) A.push(["🎨 Theme: " + t.name, () => B.set("theme", k)]);
  for (const [k, f] of Object.entries(B.FONTS)) A.push(["Aa Font: " + f.name, () => B.set("font", k)]);
  for (const q of ["auto", "high", "med", "low", "off"]) A.push(["⚡ Quality: " + q, () => B.set("quality", q)]);
  for (const k of ["soft", "crystal", "retro"]) A.push(["🔊 Sounds: " + k, () => B.set("pack", k)]);
  A.push(["🔇 Sound " + (B.cfg.vol ? "off" : "on"), () => B.set("vol", B.cfg.vol ? 0 : 60)], ["🌌 Ambient hum " + (B.cfg.ambient ? "off" : "on"), () => { B.set("ambient", !B.cfg.ambient); B.ambient(B.cfg.ambient); }]);
  return A;
}
function palRender() {
  const q = $("pq").value.trim().toLowerCase(), A = actions().filter(([n]) => !q || n.toLowerCase().includes(q)).slice(0, q ? 6 : 9).map(([n, f]) => ({ n, f }));
  const hits = q ? sorted().filter((m) => !HID.has((m.p || {}).k) && (!m.tmp && !locked(m) || m.from === ME.user)).filter((m) => textOf(m).includes(q)).reverse().slice(0, 8).map((m) => ({ n: (m.from === ME.user ? "You" : THEM.name) + " · " + when(sortT(m)) + " — " + (textOf(m).slice(0, 70)), id: m.id, f: () => jump(m.id) })) : [];
  palItems = [...A, ...hits]; palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $("pl").innerHTML = palItems.length ? palItems.map((it, i) => '<button class="pi ' + (i === palSel ? "s" : "") + (it.id ? " m" : "") + '" data-i="' + i + '">' + esc(it.n) + "</button>").join("") : '<div class="empty">Nothing found.</div>';
  $("pall").classList.toggle("hidden", !q || !more);
}
function openPal() { pal.classList.add("on"); document.body.classList.add("modal"); B.Void.pause(true); $("pq").value = ""; palSel = 0; palRender(); setTimeout(() => $("pq").focus(), 30); }
function closePal() { pal.classList.remove("on"); if (!sheet.classList.contains("on")) { document.body.classList.remove("modal"); B.Void.pause(false); } }
$("b-pal").onclick = openPal; $("pq").oninput = () => { palSel = 0; palRender(); };
$("pq").onkeydown = (e) => { if (e.key === "ArrowDown") { palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); e.preventDefault(); } else if (e.key === "ArrowUp") { palSel = Math.max(0, palSel - 1); palRender(); e.preventDefault(); } else if (e.key === "Enter") { const it = palItems[palSel]; if (it) { closePal(); it.f(); } } };
$("pl").onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) { const it = palItems[+b.dataset.i]; closePal(); it.f(); } };
pal.onclick = (e) => { if (e.target === pal) closePal(); };
$("pall").onclick = async () => { $("pall").textContent = "Loading everything…"; try { while (more) await loadHistory(oldest); } catch (e) {} $("pall").textContent = "Search everything we've ever said"; renderLog(); palRender(); };
addEventListener("keydown", (e) => { if (!ME || $("app").classList.contains("hidden") || B.locked) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPal(); } else if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openPal(); } });

// ═══ app lock: a PIN that keeps whoever picks up your phone out (the key stays on the device; this is a door, not a vault) ═══
const pinHash = async (salt, pin) => sha256hex(B.enc.encode(salt + ":" + pin));
let pinBuf = "";
function lockNow() { if (!B.cfg.lock) return toast("Set a PIN first (Settings → Keys)."); B.locked = true; pinBuf = ""; $("lock").classList.add("on"); $("lock-m").textContent = ""; lockDots(); }
function lockDots() { $("lock-d").innerHTML = Array.from({ length: Math.max(4, pinBuf.length) }, (_, i) => '<i class="' + (i < pinBuf.length ? "on" : "") + '"></i>').join(""); }
$("lock-k").innerHTML = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) => k ? '<button data-n="' + k + '">' + k + "</button>" : "<span></span>").join("");
$("lock-k").onclick = async (e) => { const b = e.target.closest("[data-n]"); if (!b) return; B.hap(8); const n = b.dataset.n; if (n === "⌫") pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 8) pinBuf += n; lockDots(); if (n !== "⌫" && pinBuf.length >= 4) { const [salt, h] = B.cfg.lock.split(":"); if ((await pinHash(salt, pinBuf)) === h) { B.locked = false; $("lock").classList.remove("on"); pinBuf = ""; renderLog(); } else if (pinBuf.length >= 8 || (await pinHash(salt, pinBuf + "x")) === "") { } } };
$("lock-go").onclick = async () => { const [salt, h] = B.cfg.lock.split(":"); if ((await pinHash(salt, pinBuf)) === h) { B.locked = false; $("lock").classList.remove("on"); pinBuf = ""; renderLog(); } else { $("lock-m").textContent = "Not that one."; pinBuf = ""; lockDots(); B.hap([80, 40, 80]); } };
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") hiddenAt = Date.now(); else if (B.cfg.lock && hiddenAt && Date.now() - hiddenAt > (+B.cfg.lockMin || 0) * 6e4) lockNow(); });

// ═══ settings: one panel, tabs, every control driven from a table ═══════════════════════════
const seg = (k, opts) => '<div class="seg wrap">' + opts.map(([v, l]) => '<button data-seg="' + k + '" data-v="' + esc(v) + '" class="' + (String(B.cfg[k]) === String(v) ? "on" : "") + '">' + esc(l) + "</button>").join("") + "</div>";
const tog = (k) => '<button class="tg2 ' + (B.cfg[k] ? "on" : "") + '" data-tog="' + k + '" role="switch" aria-checked="' + !!B.cfg[k] + '"><i></i></button>';
const row = (t, d, c) => '<div class="setrow"><div>' + t + (d ? "<small>" + d + "</small>" : "") + "</div>" + c + "</div>";
const hrs = (k) => '<select data-sel="' + k + '">' + Array.from({ length: 24 }, (_, h) => '<option value="' + h + '"' + (+B.cfg[k] === h ? " selected" : "") + ">" + String(h).padStart(2, "0") + ":00</option>").join("") + "</select>";
let tab = "look";
const TABS = { look: "Look", feel: "Feel", alerts: "Alerts", perf: "Speed", security: "Keys", data: "Data", systems: "Systems" };
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function tabHTML() {
  const T = B.THEMES, F = B.FONTS;
  if (tab === "look") return '<div class="tiles">' + Object.entries(T).map(([k, t]) => '<button class="tile ' + (B.cfg.theme === k ? "on" : "") + '" data-th="' + k + '"><span><i style="background:' + t.a + '"></i><i style="background:' + t.b + '"></i></span>' + esc(t.name) + "</button>").join("") + "</div>" +
    row("Messages", "How conversations are drawn", seg("layout", [["bubbles", "Bubbles"], ["rail", "Rail"], ["lines", "Lines"]])) +
    row("Font", "How the words feel", '<div class="seg wrap">' + Object.entries(F).map(([k, f]) => '<button data-seg="font" data-v="' + k + '" class="' + (B.cfg.font === k ? "on" : "") + '" style="font-family:' + f.body.replace(/"/g, "'") + '">' + f.name + "</button>").join("") + "</div>") +
    row("Text size", B.cfg.size + "%", '<input type="range" min="85" max="140" step="5" value="' + B.cfg.size + '" data-rng="size">') + row("Spacing", "How tightly messages sit", seg("density", [["compact", "Tight"], ["cozy", "Cozy"], ["roomy", "Roomy"]])) +
    row("Your star", "Your colour on this device", '<input type="color" data-col="cme" value="' + B.palette().me + '">') + row(esc(THEM.name) + "'s star", "Their colour on this device", '<input type="color" data-col="cher" value="' + B.palette().her + '">') + (B.cfg.cme || B.cfg.cher ? row("Colours", "Back to the theme's own", '<button class="btn" id="col-reset">Reset</button>') : "");
  if (tab === "feel") return row("Sounds", "Synthesized: nothing is downloaded", seg("pack", [["soft", "Soft"], ["crystal", "Crystal"], ["retro", "Retro"]])) + row("Volume", "", '<input type="range" min="0" max="100" value="' + B.cfg.vol + '" data-rng="vol">') + row("Ambient hum", "A low drone under everything", tog("ambient")) + row("Haptics", "Taps and heartbeats you can feel", tog("haptics")) +
    row("Quiet hours", "No sounds or buzzes (SOS still rings)", tog("qh")) + (B.cfg.qh ? row("From", "", hrs("qs")) + row("Until", "", hrs("qe")) : "") +
    row("Tilt parallax", "The void moves as your phone does", tog("tilt")) + row("Motion", "Reduced turns off effects and drift", seg("motion", [["full", "Full"], ["reduced", "Reduced"]])) + row("Observation", "Messages stay blurred until you look at them", seg("collapse", [["sight", "On sight"], ["tap", "On tap"]])) +
    row("Live typing", "See each other writing. Both of you choose what to show.", seg("live", [["off", "Off"], ["typing", "Writing…"], ["words", "Live words"]]));
  if (tab === "alerts") return row("Alerts on this device", pushOK() ? "A quiet nudge when " + esc(THEM.name) + " sends something. Alerts never include what was said. While you're both here, no alert is sent at all." : "Install this app to your home screen to get alerts on iPhone.", '<button class="btn" id="st-push">…</button>') + '<p class="note">Per message: the bell by the text box cycles <b>🔔 normal</b>, <b>📣 loud</b> (keeps alerting until observed) and <b>🌙 quiet</b> (no alert at all). Hold the send button for effects and vanishing messages. SOS stays until answered.</p>';
  if (tab === "perf") return row("Graphics", "Auto watches the frame rate and adjusts by itself.", seg("quality", [["auto", "Auto"], ["high", "High"], ["med", "Med"], ["low", "Low"], ["off", "Still"]])) + row("Battery saver", "Caps the void at 30 fps and trims effects. Auto turns on under 20% battery.", seg("saver", [["auto", "Auto"], ["on", "On"], ["off", "Off"]])) + row("Show frame rate", "A tiny readout on the void", tog("fps")) + '<p class="note">Right now: tier ' + B.vs.tier + " · " + B.vs.fps + " fps · " + B.vs.ms + " ms of drawing per frame" + (B.saverOn() ? " · saver on" : "") + ". The void stops entirely while a panel is open, and runs at 30 fps when nothing is moving.</p>";
  if (tab === "security") return '<div class="fp"><canvas id="fpc" width="320" height="200"></canvas><div class="mono" id="fpw">…</div><small>Open this on both phones. If the constellation and the four words match, nobody is between you. The key never touches the server.</small></div>' +
    row("App lock", B.cfg.lock ? "A PIN opens the app after you've been away." : "A PIN that keeps whoever picks up your phone out.", B.cfg.lock ? '<div class="row"><button class="btn" id="st-lockn">Lock now</button><button class="btn" id="st-lockx">Remove</button></div>' : '<button class="btn" id="st-lock">Set PIN</button>') + (B.cfg.lock ? row("Lock after", "Time away before it asks", seg("lockMin", [[0, "Always"], [1, "1 min"], [5, "5 min"], [30, "30 min"]])) : "") +
    row("Bring " + esc(THEM.name) + " back in", "A new device, or a forgotten password. Makes a one-time link.", '<button class="btn" id="st-inv">Link</button>') + row("Change my password", "Your key stays the same.", '<button class="btn" id="st-pw">Change</button>') + row("Sign out of this device", "The key and the saved history are removed from this device.", '<button class="btn" id="st-out">Sign out</button>');
  if (tab === "data") return row("This device", M.size + " messages kept here" + (more ? " (older ones still on the server)" : ", all of them") + ". It opens and reads offline.", '<button class="btn" id="st-load">Fetch all</button>') + row("Keep our history", "Download everything, decrypted, as one page. Yours forever.", '<button class="btn" id="st-ex">Export</button>') + '<p class="note">Everything on the server is ciphertext. It can see who sent something, when, and how big. Never what.</p>';
  return '<div id="sysb" class="sys"></div>';
}
function openSettings(t) { if (t) tab = t; renderSettings(); }
function renderSettings() {
  const keep = $("tb") ? $("tb").scrollTop : 0;
  showSheet('<h2 class="disp">Settings</h2><div class="tabs">' + Object.entries(TABS).map(([k, l]) => '<button data-tab="' + k + '" class="' + (tab === k ? "on" : "") + '">' + l + "</button>").join("") + '</div><div id="tb">' + tabHTML() + '</div><div class="msg" id="sm"></div>');
  sheet.onclick = (e) => {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; return renderSettings(); }
    const th = e.target.closest("[data-th]"); if (th) { B.set("theme", th.dataset.th); return renderSettings(); }
    const sg = e.target.closest("[data-seg]"); if (sg) { const v = sg.dataset.v; B.set(sg.dataset.seg, v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) && ["lockMin"].includes(sg.dataset.seg) ? +v : v); if (sg.dataset.seg === "live" && v === "off") $("ghost").classList.remove("on"); if (["layout", "density"].includes(sg.dataset.seg)) renderLog(); if (sg.dataset.seg === "pack") B.snd("arrive"); return renderSettings(); }
    const tg = e.target.closest("[data-tog]"); if (tg) { const k = tg.dataset.tog; B.set(k, !B.cfg[k]); if (k === "ambient") B.ambient(B.cfg.ambient); if (k === "tilt" && B.cfg.tilt) B.startTilt(); return renderSettings(); }
    if (e.target.id === "col-reset") { B.set("cme", ""); B.set("cher", ""); return renderSettings(); }
  };
  sheet.oninput = (e) => { const r = e.target.closest("[data-rng]"); if (r) { B.set(r.dataset.rng, +r.value); if (r.dataset.rng === "vol") B.snd("tick"); } const c = e.target.closest("[data-col]"); if (c) B.set(c.dataset.col, c.value); };
  sheet.onchange = (e) => { if (e.target.dataset.rng === "size") renderSettings(); else if (e.target.dataset.rng === "vol") B.snd("arrive"); else if (e.target.dataset.col) renderSettings(); else if (e.target.dataset.sel) B.set(e.target.dataset.sel, +e.target.value); };
  clearInterval(sheetTick); if ($("tb") && keep) $("tb").scrollTop = keep;
  if (tab === "alerts") { pushState(); $("st-push").onclick = togglePush; }
  if (tab === "security") { drawFP(); $("st-inv").onclick = reinvite; $("st-pw").onclick = changePw; $("st-out").onclick = signOut; if ($("st-lock")) $("st-lock").onclick = setPin; if ($("st-lockn")) $("st-lockn").onclick = () => { hideSheet(); lockNow(); }; if ($("st-lockx")) $("st-lockx").onclick = () => { B.set("lock", ""); renderSettings(); }; }
  if (tab === "data") { $("st-ex").onclick = exportAll; $("st-load").onclick = async () => { $("sm").textContent = "Fetching…"; try { while (more) await loadHistory(oldest); B.db.set("full", true); renderLog(); } catch (e) {} renderSettings(); }; }
  if (tab === "systems") { const u = () => { if (!$("sysb")) return clearInterval(sheetTick); const L = B.Live, v = B.vs; const rows = [["Link", L.state === "live" ? "live (WebSocket)" : L.state === "poll" ? "polling (no live line here)" : "polling · reconnecting"], ["Round trip", L.rtt ? L.rtt + " ms" : "—"], [THEM.name, L.present ? "here, on the live line" : seenAt ? "last seen " + ago(seenAt) : "not yet"], ["Frames", L.sent + " sent · " + L.got + " received (sealed)"], ["Outbox", OUT.length + " waiting"], ["Kept on this device", M.size + " messages" + (more ? " (+ older on the server)" : "")], ["Graphics", "tier " + v.tier + " · " + v.fps + " fps · " + v.ms + " ms/frame" + (B.saverOn() ? " · saver" : "")], ["Call", B.Call.state], ["Key", "AES-256-GCM · fingerprint " + (B.fp ? B.fp.short : "…")], ["Server sees", "sender, time, size. Not words."]]; $("sysb").innerHTML = rows.map(([a, b]) => "<div><span>" + esc(a) + "</span><b>" + esc(b) + "</b></div>").join(""); }; u(); sheetTick = setInterval(u, 1000); }
}
$("b-set").onclick = () => openSettings();
async function setPin() {
  const a = prompt("Choose a PIN (4 to 8 digits):"); if (!a) return; if (!/^\d{4,8}$/.test(a)) return toast("4 to 8 digits, please."); if (a !== prompt("Once more:")) return toast("They didn't match.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(8))); B.set("lock", salt + ":" + (await pinHash(salt, a))); toast("App lock is on."); renderSettings();
}
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
async function signOut() { if (!confirm("Sign out of Barycenter on this device? The saved history on this device is removed too (it stays safe on the server).")) return; B.Live.stop(); try { await fetch("/api/logout/us", { method: "POST", credentials: "same-origin" }); } catch (e) {} store.set("us-key", null); store.set("us-out", null); store.set("us-draft", null); await B.db.wipe(); location.href = "/barycenter"; }
async function exportAll() {
  $("sm").textContent = "Gathering everything…"; try { while (more) await loadHistory(oldest); } catch (e) { $("sm").textContent = "Couldn't reach everything."; return; }
  const list = sorted().filter((m) => !m.tmp && m.p && !HID.has(m.p.k)), rows = [];
  for (const m of list) { const who = m.from === ME.user ? ME.name : THEM.name, p = m.p; let b = ""; if (p.k === "note") b = esc(D.edits[m.id] ? D.edits[m.id].t : p.t); else if (p.k === "pulse") { const x = pulseOf(p.e); b = x.e + " " + esc(x.w); } else if (p.k === "letter") b = "<b>" + esc(p.s) + "</b><br>" + esc(p.t); else if (p.k === "capsule") b = "⏳ capsule: " + esc(p.t); else if (p.k === "checkin") b = ((CHECKS.find((c) => c.k === p.c) || {}).e || "") + " " + esc((CHECKS.find((c) => c.k === p.c) || {}).w || ""); else if (p.k === "dq") b = "Answered a daily question: " + esc(p.a); else if (p.k === "drop" && m.blob) { try { const r = await fetch("/api/us/blob/" + m.blob, { credentials: "same-origin" }), u = await B.openBytes(await r.arrayBuffer()); b = '<img style="max-width:420px;border-radius:8px" src="data:' + (p.m || "image/jpeg") + ";base64," + b64(u) + '">' + (p.t ? "<br>" + esc(p.t) : ""); } catch (e) { b = "(photo)"; } } else if (p.k === "voice") b = "🎙️ voice note"; else if (p.k === "clip") b = "🎬 video clip"; else if (p.k === "poll") b = "📊 " + esc(p.q) + " — " + p.o.map(esc).join(" / "); else if (p.k === "list") b = "📝 " + esc(p.s) + ": " + p.it.map(esc).join(", "); else if (p.k === "loc") b = "📍 " + p.lat.toFixed(4) + ", " + p.lon.toFixed(4); else if (p.k === "count") b = "⏰ " + esc(p.s) + " (" + esc(when(p.due)) + ")"; else continue;
    rows.push('<div class="m"><small>' + esc(who) + " · " + esc(when(sortT(m))) + (p.k === "note" && p.at ? " (sent " + esc(when(m.ts)) + ")" : "") + "</small><div>" + b.replace(/\n/g, "<br>") + "</div></div>"); }
  const html = '<!doctype html><meta charset="utf-8"><title>Our history</title><style>body{font:17px/1.55 Georgia,serif;max-width:640px;margin:40px auto;padding:0 18px;background:#0b0d1c;color:#e9ebff}.m{margin:14px 0;padding-left:12px;border-left:2px solid #7fd8ff}small{font:11px monospace;color:#8c92ba}</style><h1>' + esc(ME.name) + " &amp; " + esc(THEM.name) + "</h1><p style='color:#8c92ba'>Exported " + esc(when(Date.now())) + " · " + rows.length + " things said</p>" + rows.join("");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "our-history-" + dayKey() + ".html"; a.click(); $("sm").textContent = "Saved " + rows.length + " entries.";
}
B.onCfg((k) => { if (k === "quality" || k === "saver" || k === "tilt") B.Void.need(); if (k === "live" && B.cfg.live === "off") B.vs.typing = 0; if (k === "theme" || k === "cme" || k === "cher") { renderStrip(); } });

// ═══ the pieces other files use ═════════════════════════════════════════════════════════════
B.app = { get ME() { return ME; }, get THEM() { return THEM; }, M, D, sorted, sendMsg, toast, showSheet, hideSheet, get sheet() { return sheet; }, blobURL, blobOf, uploadBlob, esc, fmt: B.fmt, locked, jump, snip, renderLog, persist, HID, O, get myPos() { return B.myPos; }, PULSES, hideCtx };

// ═══ start ══════════════════════════════════════════════════════════════════════════════════
async function startApp() {
  try { ME = await api("me"); } catch (e) { if (!e.offline) return showLogin(); ME = null; }
  if (!ME) { const u = store.get("us-user"), c = JSON.parse(store.get("us-me") || "null"); if (u && c) ME = c; else return gate("<p>Can't reach the server, and this device hasn't opened it before.</p>"); } else store.set("us-me", JSON.stringify(ME));
  if (!B.KEY) { const raw = store.get("us-key"); if (!raw) return showLogin(ME.name); await B.setKey(unb64(raw)); }
  THEM = ME.partner; B.who.first = ME.first; seenAt = THEM.seen; B.apply(); B.vs.names = { me: "you", her: THEM.name };
  $("gate").classList.add("hidden"); $("app").classList.remove("hidden"); setMode(); sendIcon(); const dr = store.get("us-draft"); if (dr) { txt.value = dr; txt.dispatchEvent(new Event("input")); }
  try { OUT = JSON.parse(store.get("us-out") || "[]"); } catch (e) { OUT = []; }
  M = new Map(); B.app.M = M; for (const e of OUT) M.set(e.tmp, { id: e.tmp, from: ME.user, ts: e.ts, lvl: e.lvl, q: e.q, unlock: e.unlock, van: e.van, blob: e.blob, p: await B.open(e), tmp: true, dl: 0, rd: 0, ak: 0, ct: e.ct, iv: e.iv });
  // 1) straight from this device, so it opens instantly and works with no signal at all
  const cached = (await B.db.all()) || []; for (const r of cached) if (!(r.exp && r.exp <= Date.now())) await take(r); fullLocal = !!(await B.db.get("full")); if (cached.length) { more = !fullLocal; oldest = cached.map((r) => r.id).sort()[0]; }
  renderLog(true); B.Void.need();
  // 2) then ask the server what changed
  try { await loadHistory(); if (fullLocal) more = false; else if (cached.length) { more = true; oldest = [...M.keys()].filter((i) => !i.startsWith("tmp-")).sort()[0] || oldest; } } catch (e) { if (e.auth) return showLogin(); toast("Offline. Showing what this device has."); }
  renderLog(true); schedulePoll(); flush(); swReg(); B.Live.start(); B.fingerprint().then((f) => (B.fp = f));
  if (B.cfg.tilt) B.startTilt(); if (B.cfg.stage) stage(true);
  addEventListener("pointerdown", function f() { removeEventListener("pointerdown", f); if (B.cfg.ambient) B.ambient(true); }, { once: true });
  if (!THEM.joined) toast(THEM.name + " hasn't joined yet. Use Settings → Keys to invite them.");
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); ackSeen(); schedulePoll(); renderCap(); } else B.vs.present = false; });
  if (B.cfg.lock) lockNow();
  backfill();
}
// quietly pull the rest of the history onto this device, a page at a time, while nothing else is happening
async function backfill() {
  while (more && !fullLocal && ME) { if (document.visibilityState !== "visible" || sheet.classList.contains("on")) { await new Promise((r) => setTimeout(r, 4000)); continue; } try { await loadHistory(oldest); } catch (e) { if (e.auth) return; await new Promise((r) => setTimeout(r, 8000)); continue; } renderLog(); await new Promise((r) => setTimeout(r, 400)); }
  if (!more && ME) { fullLocal = true; B.db.set("full", true); }
}
async function boot() {
  B.Void.start();
  const h = location.hash.match(/^#join=([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/);
  let st; try { st = await api("status"); } catch (e) { if (e.offline && store.get("us-me") && store.get("us-key")) return startApp(); gate("<p>Can't reach the server. Check your connection and reload.</p>"); return; }
  if (h) return showClaim(h[1], h[2]);
  if (!st.configured) return st.owner ? showSetup() : gate('<p>This space hasn\'t been created yet.</p><p>Sign in as the owner through <a href="/vigil-app">Vigil</a>, then come back here to set it up.</p>');
  startApp();
}
boot();
})();
