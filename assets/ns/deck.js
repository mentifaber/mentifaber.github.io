// NULLSPACE · the deck. A comms terminal: frequencies on the left, the transmission stream in the middle, the command line at the
// bottom, and the scope, operators and mesh on the right. Every message is sealed here with the frequency's key and leaves by
// whatever route is open: the internet relay (NET), the LoRa radio (RF), or both. A device with both can bridge the two.
(() => {
"use strict";
const { $, esc, store, clock } = NS, N = NS.Net, R = NS.Radio;
NS.apply();
const T = new Map(); // frequency tag (or "ob<channel>" for open band) → { msgs: Map(id → msg), unread, loaded }
const seen = new Set(); // message ids already handled (so a message that comes by RF and NET shows once)
const ops = new Map(); // tag → Map(node → { h, c, at })
let CUR = null, outbox = store.get("outbox", []), hist = store.get("hist", []), histI = -1, typingAt = 0;
const room = (tag) => T.get(tag) || T.set(tag, { msgs: new Map(), unread: 0, loaded: false }).get(tag);
const freqOf = (tag) => NS.freqs.find((f) => f.tag === tag);
const isOpen = (tag) => tag && tag.startsWith("ob");
const route = () => NS.cfg.route;
const netUp = () => N.state !== "down" && N.state !== "off" && navigator.onLine !== false;
const rfUp = () => R.state === "on";
const sys = (tag, text, cls) => (tag || CUR) ? addMsg({ f: tag || CUR, id: "sys-" + NS.rid(6), ts: Date.now(), kind: "sys", t: text, cls: cls || "" }, { quiet: true, nosave: true }) : toast(text);
const toast = (t) => { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600); };

// ═══ boot and jack-in ════════════════════════════════════════════════════════════════════════
function bootSeq() {
  return new Promise((done) => {
    if (!NS.cfg.boot || NS.cfg.fx === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    const el = $("boot"), lines = ["NULLSPACE // comms deck", "> init crypto core ........ AES-256-GCM ok", "> operator ............... " + (NS.me ? NS.me.handle.toUpperCase() + " #" + NS.me.node.slice(0, 4) : "unregistered"), "> frequencies ............ " + NS.freqs.length + " tuned", "> relay ................... " + (navigator.onLine ? "reachable" : "OFFLINE"), "> radio .................. " + (R.can.ble || R.can.serial ? "bluetooth/usb available" : "simulator only"), "> ready."];
    el.classList.add("on"); let i = 0; NS.snd("boot"); const tick = () => { if (i >= lines.length) { setTimeout(() => { el.classList.remove("on"); done(); }, 350); return; } el.innerHTML += "<div>" + esc(lines[i++]) + "</div>"; setTimeout(tick, 130); }; tick();
    el.onclick = () => { i = lines.length; };
  });
}
function jackIn() {
  return new Promise((done) => {
    const el = $("jack"); el.classList.add("on"); $("jh").focus();
    const go = () => { const h = NS.cleanHandle($("jh").value); if (h.length < 2) { $("jm").textContent = "2–16 letters or numbers"; NS.snd("err"); return; } NS.newMe(h); el.classList.remove("on"); NS.snd("link"); done(); };
    $("jg").onclick = go; $("jh").onkeydown = (e) => { if (e.key === "Enter") go(); };
  });
}

// ═══ messages ════════════════════════════════════════════════════════════════════════════════
// a message on screen: { f, id, ts, h, n, c, t, kind, img, loc, burn, exp, mine, via: { net, rf: { snr, rssi, hops, ch } }, state }
const saveQ = new Set(); let saveT = 0;
function persist(m) { if (m.nosave || m.kind === "sys") return; saveQ.add(m); clearTimeout(saveT); saveT = setTimeout(() => { const rs = [...saveQ].map((x) => ({ ...x, k: x.f + "|" + x.id, imgLocal: undefined })); saveQ.clear(); NS.db.put(rs); }, 800); }
function addMsg(m, o = {}) {
  const r = room(m.f), old = r.msgs.get(m.id);
  if (old) { // the same message by another route: just add the route
    if (m.via && m.via.net) old.via.net = true; if (m.via && m.via.rf && !old.via.rf) old.via.rf = m.via.rf; if (m.state) old.state = m.state; persist(old); paintMsg(old); return old;
  }
  m.via = m.via || {}; r.msgs.set(m.id, m); if (m.kind !== "sys") seen.add(m.id); if (!o.nosave) persist(m);
  if (m.f === CUR) { paintMsg(m, !o.quiet); scope(m.via.rf ? "rf" : "net"); } else if (!m.mine && m.kind !== "sys") { r.unread++; renderTuner(); }
  if (!m.mine && !o.quiet && m.kind !== "sys") { NS.snd(m.via.rf ? "rf" : "net"); NS.hap(m.via.rf ? [20, 30, 20] : 15); if (document.visibilityState !== "visible") document.title = "◈ " + (m.h || "") + " · NULLSPACE"; }
  return m;
}
async function loadLocal(tag) { const r = room(tag); if (r.loaded) return; r.loaded = true; const rows = (await NS.db.all(tag)) || []; for (const x of rows) { if (x.exp && x.exp < Date.now()) continue; if (!r.msgs.has(x.id)) { r.msgs.set(x.id, x); seen.add(x.id); } } }

// ═══ sending ═════════════════════════════════════════════════════════════════════════════════
async function transmit(text, extra = {}) {
  if (!CUR) return toast("tune a frequency first");
  if (isOpen(CUR)) { // open band: plain text to everyone on that radio channel
    if (!rfUp()) return sys(CUR, "no radio: connect one with /radio", "err");
    const ch = +CUR.slice(2); try { await R.sendText(text, ch); addMsg({ f: CUR, id: NS.rid(8), ts: Date.now(), h: NS.me.handle, n: NS.me.node, c: NS.me.color, t: text, kind: "msg", mine: true, via: { rf: { ch } }, state: "rf" }); NS.snd("send"); } catch (e) { sys(CUR, "radio: " + (e.message || e), "err"); }
    return;
  }
  const f = freqOf(CUR), id = NS.rid(8), burn = extra.burn != null ? extra.burn : NS.cfg.burn || 0;
  const o = { v: 1, id, h: NS.me.handle, n: NS.me.node, c: NS.me.color, t: text, k: extra.kind || "msg", at: Date.now(), ...(burn ? { burn } : {}), ...(extra.img ? { img: extra.img } : {}), ...(extra.loc ? { loc: extra.loc } : {}) };
  const m = addMsg({ f: f.tag, id, ts: o.at, h: o.h, n: o.n, c: o.c, t: text, kind: o.k, img: o.img, imgLocal: extra.imgLocal, loc: o.loc, burn, exp: burn ? o.at + burn * 1000 : 0, mine: true, via: {}, state: "queued" });
  NS.snd("send"); NS.hap(10);
  const r = route(), fits = NS.enc.encode(text).length <= R.maxText() && !extra.img && !burn, wantRF = f.rf >= 0 && rfUp() && fits && (r === "rf" || r === "both" || (r === "auto" && !netUp())), wantNET = r !== "rf";
  if (wantRF) { try { await R.sendText(await NS.rfPack(f, o), f.rf); m.via.rf = { ch: f.rf }; m.state = "rf"; scope("rf"); } catch (e) { sys(f.tag, "radio: " + (e.message || e), "err"); } }
  if (wantNET) { outbox.push({ tag: f.tag, o, rf: !!m.via.rf }); store.set("outbox", outbox); flush(); }
  if (!wantNET && !m.via.rf) { m.state = "failed"; sys(f.tag, r === "rf" ? (f.rf < 0 ? "this frequency isn't bound to a radio channel (/radio)" : !rfUp() ? "no radio connected" : "too long for one radio packet (" + R.maxText() + " bytes)") : "nothing sent", "err"); }
  paintMsg(m); persist(m);
}
let flushing = false;
async function flush() {
  if (flushing || !outbox.length) return; flushing = true;
  try { while (outbox.length) { const q = outbox[0], f = freqOf(q.tag); if (!f) { outbox.shift(); continue; } const s = await NS.seal(f, q.o);
      try { await N.tx(f, s.ct, s.iv, { id: q.o.id, ...(q.o.burn ? { burn: q.o.burn } : {}), ...(q.o.img ? { b: q.o.img.b } : {}), ...(q.rf ? { rf: 1 } : {}) }); } catch (e) { if (e.status === 400) { outbox.shift(); store.set("outbox", outbox); continue; } break; }
      outbox.shift(); store.set("outbox", outbox); const m = room(q.tag).msgs.get(q.o.id); if (m) { m.via.net = true; m.state = "sent"; paintMsg(m); persist(m); } scope("net"); } }
  finally { flushing = false; }
}
setInterval(flush, 5000); addEventListener("online", () => { flush(); pollAll(); });

// ═══ receiving: the relay ════════════════════════════════════════════════════════════════════
async function pull(f) {
  let j; try { j = await N.rx(f); } catch (e) { return; }
  for (const x of j.tx) {
    if (seen.has(x.id) && !room(f.tag).msgs.get(x.id)) continue; const o = await NS.open(f, x.ct, x.iv); if (!o || o.id !== x.id) continue;
    const had = room(f.tag).msgs.get(x.id), m = addMsg({ f: f.tag, id: o.id, ts: o.at || x.ts, h: o.h, n: o.n, c: o.c, t: o.t, kind: o.k, img: o.img, loc: o.loc, burn: o.burn || 0, exp: o.burn ? x.exp : 0, mine: o.n === NS.me.node, via: { net: true }, state: "sent", rfOrigin: !!x.rf }, { quiet: !!had || o.n === NS.me.node });
    if (!had && NS.cfg.bridge && rfUp() && f.rf >= 0 && !x.rf && o.n !== NS.me.node && ["msg", "loc"].includes(o.k) && !o.burn && !o.img && NS.enc.encode(o.t || "").length <= R.maxText()) { // bridge: NET → RF
      try { await R.sendText(await NS.rfPack(f, o), f.rf); m.bridged = "→RF"; paintMsg(m); scope("rf"); } catch (e) {}
    }
  }
}
const pollAll = () => { for (const f of NS.freqs) pull(f); };
let pollT = 0; const schedulePoll = () => { clearTimeout(pollT); pollT = setTimeout(async () => { if (CUR && freqOf(CUR)) await pull(freqOf(CUR)); if (Math.random() < .25 || !N.live()) pollAll(); schedulePoll(); }, document.visibilityState !== "visible" ? 30000 : N.live() ? 25000 : 5000); };
N.on("poke", (f) => pull(f));
N.on("burn", (f, id) => { const m = room(f.tag).msgs.get(id); if (m) burnMsg(m); });
N.on("state", () => hud()); N.on("open", () => pollAll());
// ═══ receiving: the radio ════════════════════════════════════════════════════════════════════
R.on("packet", async (p) => {
  scope("rf"); const via = { rf: { snr: p.snr, rssi: p.rssi, hops: p.hops, ch: p.ch, from: p.fromName } }, u = await NS.rfUnpack(p.text);
  if (u && u.f) { // one of ours: decrypt, show, and (if bridging) pass it on to the internet
    const o = u.o, f = u.f, had = room(f.tag).msgs.has(o.id); addMsg({ f: f.tag, id: o.id, ts: o.at || Date.now(), h: o.h, n: o.n, c: null, t: o.t, kind: o.k, mine: false, via, state: "rf", loc: o.k === "loc" ? parseLoc(o.t) : null }, { quiet: had });
    if (!had && NS.cfg.bridge && netUp()) { const full = { v: 1, id: o.id, h: o.h, n: o.n, t: o.t, k: o.k, at: o.at, c: null }; const s = await NS.seal(f, full); try { await N.tx(f, s.ct, s.iv, { id: o.id, rf: 1 }); const m = room(f.tag).msgs.get(o.id); if (m) { m.bridged = "→NET"; m.via.net = true; paintMsg(m); persist(m); } scope("net"); } catch (e) {} }
    return;
  }
  const tag = "ob" + (p.ch < 0 ? "dm" : p.ch); ensureOpen(p.ch);
  if (u && (u.unknown || u.bad)) return addMsg({ f: tag, id: NS.rid(8), ts: p.at, h: p.fromName, n: "", t: "⟁ sealed transmission on an unknown frequency", kind: "sealed", via, state: "rf" });
  addMsg({ f: tag, id: NS.rid(8), ts: p.at, h: p.fromName, n: "", t: p.text, kind: "msg", via, state: "rf" });
});
R.on("state", () => { hud(); renderTuner(); if (R.state === "on") { sys(CUR, "radio link up · " + R.kind.toUpperCase() + " · " + (R.me.name || "node"), "ok"); NS.snd("link"); for (const c of R.channels.filter(Boolean)) ensureOpen(c.index); } if (R.state === "error") sys(CUR, R.log[R.log.length - 1] || "radio error", "err"); if ($("pnl").dataset.p === "radio") panels.radio(); });
R.on("nodes", () => { hud(); if ($("side").dataset.tab === "mesh") renderMesh(); if ($("pnl").dataset.p === "radio") renderRadioNodes(); });
R.on("channels", () => { for (const c of R.channels.filter(Boolean)) ensureOpen(c.index); renderTuner(); });
R.on("log", () => { const l = $("rlog"); if (l) { l.textContent = R.log.slice(-60).join("\n"); l.scrollTop = l.scrollHeight; } });
const OPEN = new Set(store.get("open", []));
function ensureOpen(ch) { const k = "ob" + (ch < 0 ? "dm" : ch); if (!OPEN.has(k)) { OPEN.add(k); store.set("open", [...OPEN]); renderTuner(); } }
const parseLoc = (t) => { const m = String(t || "").match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/); return m ? { lat: +m[1], lon: +m[2] } : null; };

// ═══ ephemeral frames: who's here, who's typing, pings ═══════════════════════════════════════
N.on("fx", (f, o) => {
  const m = ops.get(f.tag) || ops.set(f.tag, new Map()).get(f.tag);
  if (o.n && o.n !== NS.me.node) m.set(o.n, { h: o.h, c: o.c, at: Date.now(), ty: o.t === "ty" ? Date.now() : (m.get(o.n) || {}).ty || 0 });
  if (o.t === "ping" && o.n !== NS.me.node) N.fx(f, { t: "pong", id: o.id, at: o.at, h: NS.me.handle, n: NS.me.node, c: NS.me.color });
  if (o.t === "pong" && pings.has(o.id)) sys(f.tag, "◈ PONG " + o.h.toUpperCase() + " #" + o.n.slice(0, 4) + " · " + (Date.now() - o.at) + " ms via relay", "ok");
  if (f.tag === CUR) { renderOps(); typingLine(); }
});
const pings = new Set();
setInterval(() => { if (document.visibilityState !== "visible") return; for (const f of NS.freqs) N.fx(f, { t: "here", h: NS.me.handle, n: NS.me.node, c: NS.me.color }); renderOps(); typingLine(); }, 20000);
function typingLine() { const m = ops.get(CUR), now = Date.now(), who = m ? [...m.values()].filter((x) => now - x.ty < 4000).map((x) => x.h) : []; $("typing").textContent = who.length ? who.join(", ").toUpperCase() + (who.length > 1 ? " ARE" : " IS") + " TRANSMITTING…" : ""; }

// ═══ the stream ══════════════════════════════════════════════════════════════════════════════
const els = new Map();
const routeTag = (m) => { const v = m.via || {}, out = []; if (v.net) out.push('<b class="rt net">NET</b>'); if (v.rf) out.push('<b class="rt rf">RF' + (v.rf.snr != null ? " " + v.rf.snr + "dB" : "") + (v.rf.rssi ? " " + v.rf.rssi + "dBm" : "") + (v.rf.hops != null ? " " + v.rf.hops + "hop" : "") + (v.rf.from && isOpen(m.f) ? "" : "") + "</b>"); if (m.bridged) out.push('<b class="rt br">BRIDGED ' + m.bridged + "</b>"); if (m.mine && m.state === "queued") out.push('<b class="rt q">QUEUED</b>'); if (m.mine && m.state === "failed") out.push('<b class="rt err">FAILED</b>'); return out.join(""); };
function body(m) {
  if (m.kind === "sys") return '<span class="sy">-- ' + esc(m.t) + " --</span>";
  let t = esc(m.t || "").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  if (m.kind === "loc" || m.loc) { const l = m.loc || parseLoc(m.t); if (l) t = '⌖ <span class="loc">' + l.lat.toFixed(5) + ", " + l.lon.toFixed(5) + "</span>" + (NS.myPos ? " · " + dist(NS.myPos, l) : "") + ' · <a href="https://www.openstreetmap.org/?mlat=' + l.lat + "&mlon=" + l.lon + '#map=16/' + l.lat + "/" + l.lon + '" target="_blank" rel="noopener noreferrer">map</a>'; }
  if (m.img) t += '<div class="img" data-img="' + esc(m.id) + '">DECRYPTING IMAGE…</div>';
  if (m.kind === "sealed") t = '<span class="sealed">' + t + "</span>";
  return t;
}
const dist = (a, b) => { const R0 = 6371e3, r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2, d = 2 * R0 * Math.asin(Math.sqrt(h)); return d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km"; };
function paintMsg(m, fresh) {
  if (m.f !== CUR) return; const log = $("stream"), near = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  let el = els.get(m.id); const isNew = !el; if (!el) { el = document.createElement("div"); els.set(m.id, el); }
  el.className = "tx" + (m.mine ? " me" : "") + (m.kind === "sys" ? " sys " + (m.cls || "") : "") + (m.burn ? " burn" : "") + (m.via && m.via.rf && !m.via.net ? " viarf" : "");
  el.dataset.id = m.id; const color = m.mine ? "var(--b)" : m.c || "var(--a)";
  el.innerHTML = m.kind === "sys" ? body(m) : '<span class="ts">' + clock(m.ts) + '</span><span class="who" style="--u:' + color + '">' + (m.n ? NS.sigil(m.n, color, 14) : '<i class="anon">◌</i>') + "<b>" + esc((m.h || "?").toUpperCase()) + "</b></span><span class=\"msg\">" + body(m) + '</span><span class="meta">' + routeTag(m) + (m.burn ? '<b class="rt burnt" data-exp="' + (m.exp || 0) + '">☠ ' + fmtLeft(m) + "</b>" : "") + "</span>";
  if (isNew) { const after = [...log.children].reverse().find((c) => { const x = room(CUR).msgs.get(c.dataset.id); return x && x.ts <= m.ts; }); if (after) after.after(el); else log.prepend(el); }
  if (fresh && !m.mine && m.kind !== "sys" && NS.cfg.fx !== "off") decrypt(el.querySelector(".msg"));
  if (m.img) hydrateImg(m);
  if (near || m.mine) log.scrollTop = log.scrollHeight;
}
const fmtLeft = (m) => { const s = Math.max(0, Math.ceil(((m.exp || 0) - Date.now()) / 1000)); return Math.floor(s / 60) + ":" + NS.pad2(s % 60); };
// the decryption effect: the words arrive as noise and resolve left to right
const GLY = "▓▒░█▚▞▙▟◢◣◤◥⌁⟁◈ΞΨΩ#%&@$01";
function decrypt(el) { if (!el) return; const nodes = []; const walk = (n) => { for (const c of n.childNodes) if (c.nodeType === 3 && c.textContent.trim()) nodes.push([c, c.textContent]); else if (c.nodeType === 1) walk(c); }; walk(el); const total = nodes.reduce((a, [, t]) => a + t.length, 0); if (!total || total > 600) return; let k = 0; el.classList.add("glitch");
  const step = () => { k += Math.max(2, total / 14); let left = k; for (const [n, t] of nodes) { const show = Math.max(0, Math.min(t.length, Math.floor(left))); n.textContent = t.slice(0, show) + [...t.slice(show)].map((ch) => (ch === " " ? " " : GLY[(Math.random() * GLY.length) | 0])).join(""); left -= t.length; } if (k < total) requestAnimationFrame(step); else { for (const [n, t] of nodes) n.textContent = t; el.classList.remove("glitch"); } }; step(); }
async function hydrateImg(m) { const el = document.querySelector('[data-img="' + CSS.escape(m.id) + '"]'); if (!el || el.dataset.done) return; el.dataset.done = 1; try { const f = freqOf(m.f), u8 = m.imgLocal || (await N.blobDown(f, m.img.b)); el.innerHTML = '<img src="' + URL.createObjectURL(new Blob([u8], { type: "image/jpeg" })) + '" alt="">'; } catch (e) { el.textContent = "IMAGE UNAVAILABLE (relay unreachable or burned)"; } }
function burnMsg(m) { const el = els.get(m.id); room(m.f).msgs.delete(m.id); NS.db.del([m.f + "|" + m.id]); if (el) { el.classList.add("burning"); setTimeout(() => { el.remove(); els.delete(m.id); }, 900); } }
setInterval(() => { const now = Date.now(); for (const r of T.values()) for (const m of r.msgs.values()) if (m.exp && m.exp <= now) burnMsg(m); if (CUR) document.querySelectorAll("[data-exp]").forEach((b) => { const m = room(CUR).msgs.get(b.closest(".tx").dataset.id); if (m) b.textContent = "☠ " + fmtLeft(m); }); }, 1000);
async function tune(tag) {
  CUR = tag; store.set("cur", tag); els.clear(); $("stream").innerHTML = ""; const r = room(tag); r.unread = 0; document.title = "NULLSPACE";
  await loadLocal(tag); const list = [...r.msgs.values()].sort((a, b) => a.ts - b.ts).slice(-400); for (const m of list) paintMsg(m);
  const f = freqOf(tag); if (f) { $("fname").textContent = f.name.toUpperCase(); $("fsub").innerHTML = NS.mhz(f.tag) + " MHz · " + (f.rf >= 0 ? "RF CH" + f.rf : "RF unbound") + ' · <span id="ffp"></span>'; NS.fingerprint(f).then((fp) => { const e = $("ffp"); if (e) e.textContent = "KEY " + fp; }); }
  else if (isOpen(tag)) { const ch = tag.slice(2), c = R.channels[+ch]; $("fname").textContent = "OPEN BAND " + (ch === "dm" ? "DIRECT" : "CH" + ch + (c ? " · " + c.name.toUpperCase() : "")); $("fsub").textContent = "plain text on the mesh · anyone on this channel can read it"; }
  if (!list.length) sys(tag, isOpen(tag) ? "open band: what you send here is plain text to everyone on the channel" : "frequency is quiet. /key shows the tune code to bring others in", "dim");
  renderTuner(); renderOps(); counter(); $("app").classList.remove("drawer"); if (f) pull(f); $("cmd").focus({ preventScroll: true });
}

// ═══ the tuner (left) ════════════════════════════════════════════════════════════════════════
function renderTuner() {
  const el = $("tuner"), rows = NS.freqs.map((f) => { const r = room(f.tag); return '<button class="fq ' + (CUR === f.tag ? "on" : "") + '" data-t="' + f.tag + '"><span class="mhz">' + NS.mhz(f.tag) + '</span><span class="fn">' + esc(f.name.toUpperCase()) + "</span>" + (f.rf >= 0 ? '<i class="rfb" title="bound to radio channel ' + f.rf + '">RF' + f.rf + "</i>" : "") + (r.unread ? '<i class="un">' + Math.min(99, r.unread) + "</i>" : "") + "</button>"; });
  const ob = [...OPEN].sort().map((k) => { const ch = k.slice(2), c = R.channels[+ch], r = room(k); return '<button class="fq ob ' + (CUR === k ? "on" : "") + '" data-t="' + k + '"><span class="mhz">' + (ch === "dm" ? "DIRECT" : "CH" + ch) + '</span><span class="fn">' + esc(ch === "dm" ? "MESH DMS" : (c ? c.name : "CHANNEL " + ch).toUpperCase()) + "</span>" + (r.unread ? '<i class="un">' + Math.min(99, r.unread) + "</i>" : "") + "</button>"; });
  el.innerHTML = '<div class="lbl">// FREQUENCIES</div>' + (rows.join("") || '<div class="dim">none tuned</div>') + (ob.length ? '<div class="lbl">// OPEN BAND</div>' + ob.join("") : "");
}
$("tuner").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) tune(b.dataset.t); };

// ═══ the HUD ═════════════════════════════════════════════════════════════════════════════════
function hud() {
  const net = $("h-net"), rf = $("h-rf"), br = $("h-br");
  net.className = "hb " + (N.state === "live" ? "on" : N.state === "poll" ? "mid" : "off"); net.innerHTML = "<i></i>NET <b>" + (N.state === "live" ? N.rtt + "ms" : N.state === "poll" ? "POLL" : N.state === "down" ? "DOWN" : "…") + "</b>";
  rf.className = "hb " + (R.state === "on" ? "on" : R.state === "connecting" ? "mid" : R.state === "error" ? "err" : "off"); rf.innerHTML = "<i></i>RF <b>" + (R.state === "on" ? (R.kind === "sim" ? "SIM" : R.kind.slice(0, 4).toUpperCase()) + " · " + R.nodes.size + "N" : R.state === "connecting" ? "LINK…" : "OFF") + "</b>";
  br.className = "hb " + (NS.cfg.bridge ? (rfUp() && netUp() ? "on" : "mid") : "off"); br.innerHTML = "<i></i>BRIDGE <b>" + (NS.cfg.bridge ? (rfUp() && netUp() ? "ACTIVE" : "ARMED") : "OFF") + "</b>";
  $("h-op").innerHTML = NS.me ? NS.sigil(NS.me.node, NS.me.color, 18) + "<b>" + esc(NS.me.handle.toUpperCase()) + "</b>" : ""; counter();
}
setInterval(() => { $("h-clock").textContent = clock(Date.now()); }, 1000);
$("h-net").onclick = () => panels.system(); $("h-rf").onclick = () => panels.radio(); $("h-br").onclick = () => { NS.set("bridge", !NS.cfg.bridge); hud(); toast("bridge " + (NS.cfg.bridge ? "armed: RF ⇄ NET relaying" : "off")); }; $("h-op").onclick = () => panels.operator();
$("b-menu").onclick = () => { $("app").classList.remove("sidebar"); $("app").classList.toggle("drawer"); }; $("b-side").onclick = () => { $("app").classList.remove("drawer"); $("app").classList.toggle("sidebar"); };
$("main").addEventListener("pointerdown", () => $("app").classList.remove("drawer", "sidebar")); // tap the stream to put the drawers away

// ═══ the side: scope, operators, mesh ════════════════════════════════════════════════════════
$("side").onclick = (e) => { const b = e.target.closest("[data-st]"); if (b) { $("side").dataset.tab = b.dataset.st; document.querySelectorAll("[data-st]").forEach((x) => x.classList.toggle("on", x === b)); if (b.dataset.st === "mesh") renderMesh(); else renderOps(); } };
function renderOps() { if ($("side").dataset.tab === "mesh") return; const m = ops.get(CUR), now = Date.now(), list = m ? [...m.entries()].filter(([, x]) => now - x.at < 50000) : []; $("sidebody").innerHTML = '<div class="lbl">// OPERATORS ON FREQ</div><div class="op me">' + NS.sigil(NS.me.node, NS.me.color, 16) + "<b>" + esc(NS.me.handle.toUpperCase()) + "</b><small>YOU</small></div>" + list.map(([n, x]) => '<div class="op">' + NS.sigil(n, x.c || "var(--a)", 16) + "<b>" + esc(String(x.h).toUpperCase()) + "</b><small>#" + n.slice(0, 4) + " · " + NS.ago(x.at) + "</small></div>").join("") + (isOpen(CUR) ? '<p class="dim">open band has no operator list; see MESH</p>' : list.length ? "" : '<p class="dim">nobody else on the live line right now</p>'); }
function renderMesh() {
  const nodes = [...R.nodes.values()].filter((n) => n.num !== R.me.num).sort((a, b) => (b.heard || 0) - (a.heard || 0));
  $("sidebody").innerHTML = '<div class="lbl">// MESH ' + (R.state === "on" ? "· " + esc((R.me.name || "").toUpperCase()) : "· NO RADIO") + '</div><canvas id="radar" width="240" height="240"></canvas>' + nodes.map((n) => '<div class="node"><b>' + esc(n.name) + "</b><small>" + (n.snr != null ? n.snr + "dB " : "") + (n.rssi ? n.rssi + "dBm " : "") + (n.hops != null ? n.hops + "hop " : "") + (n.heard ? "· " + NS.ago(n.heard) : "") + '</small><i class="bar" style="--q:' + Math.max(0, Math.min(1, ((n.snr ?? -10) + 15) / 25)) + '"></i></div>').join("") + (nodes.length ? "" : '<p class="dim">' + (R.state === "on" ? "no other nodes heard yet" : "connect a radio: /radio") + "</p>");
  radar(nodes);
}
function radar(nodes) { const c = $("radar"); if (!c) return; const g = c.getContext("2d"), W = 240, cxy = 120, a = getComputedStyle(document.documentElement).getPropertyValue("--a").trim() || "#0ff", b2 = getComputedStyle(document.documentElement).getPropertyValue("--b").trim() || "#f0f"; g.clearRect(0, 0, W, W); g.strokeStyle = a; g.globalAlpha = .35; for (let r = 30; r <= 110; r += 40) { g.beginPath(); g.arc(cxy, cxy, r, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(cxy, 6); g.lineTo(cxy, 234); g.moveTo(6, cxy); g.lineTo(234, cxy); g.stroke(); g.globalAlpha = 1; g.fillStyle = b2; g.fillRect(cxy - 3, cxy - 3, 6, 6);
  const me = [...R.nodes.values()].find((n) => n.num === R.me.num) || NS.myPos || null;
  for (const n of nodes) { let ang, rad; if (me && me.lat != null && n.lat != null) { const dy = n.lat - me.lat, dx = (n.lon - me.lon) * Math.cos(me.lat * Math.PI / 180), d = Math.hypot(dx, dy) * 111; ang = Math.atan2(-dy, dx); rad = Math.min(108, 20 + Math.log2(1 + d) * 18); } else { let h = 0; for (const ch of String(n.num)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; ang = (h % 628) / 100; rad = 30 + Math.min(3, n.hops ?? 1) * 26; } const x = cxy + Math.cos(ang) * rad, y = cxy + Math.sin(ang) * rad; g.fillStyle = a; g.shadowColor = a; g.shadowBlur = 8; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.shadowBlur = 0; g.font = "10px 'Share Tech Mono',monospace"; g.fillText(String(n.short || n.name).slice(0, 8), x + 6, y + 3); } }
function renderRadioNodes() { const el = $("rnodes"); if (!el) return; const ns = [...R.nodes.values()].filter((n) => n.num !== R.me.num).sort((a, b) => (b.heard || 0) - (a.heard || 0)); el.innerHTML = ns.length ? ns.map((n) => '<div class="node"><b>' + esc(n.name) + "</b><small>" + (n.snr != null ? n.snr + "dB " : "") + (n.hops != null ? n.hops + "hop " : "") + (n.heard ? "· " + NS.ago(n.heard) : "") + "</small></div>").join("") : '<p class="dim">none yet</p>'; }
// the scope: a trace of traffic (NET in one colour, RF in the other). Cheap: 8 fps when quiet, 30 fps for a moment after anything happens.
const SC = { hits: [], raf: 0, last: 0, hot: 0 };
function scope(kind) { SC.hits.push({ k: kind, t: performance.now() }); SC.hot = performance.now() + 1500; if (!SC.raf) SC.raf = requestAnimationFrame(drawScope); }
function drawScope(now) {
  SC.raf = 0; const c = $("scope"); if (!c || document.visibilityState !== "visible") return; const dt = now - SC.last, hot = now < SC.hot; if (dt < (hot ? 33 : 125)) { SC.raf = requestAnimationFrame(drawScope); return; } SC.last = now;
  const g = c.getContext("2d"), W = c.width, H = c.height, cs = getComputedStyle(document.documentElement), a = cs.getPropertyValue("--a").trim(), b = cs.getPropertyValue("--b").trim(); g.clearRect(0, 0, W, H);
  g.strokeStyle = a; g.globalAlpha = .15; for (let x = 0; x < W; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } g.globalAlpha = 1;
  SC.hits = SC.hits.filter((h) => now - h.t < 4000); for (const [k, col] of [["net", a], ["rf", b]]) { g.strokeStyle = col; g.lineWidth = 1.5; g.shadowColor = col; g.shadowBlur = NS.cfg.fx === "high" ? 8 : 0; g.beginPath(); for (let x = 0; x <= W; x += 3) { const t = now - (W - x) * 12; let y = H / 2 + (k === "rf" ? 10 : -10) + Math.sin(t * .01 + (k === "rf" ? 2 : 0)) * 1.5 + (Math.random() - .5) * 1.4; for (const h of SC.hits) if (h.k === k) { const d = (t - h.t) / 120; if (d > 0 && d < 6) y += Math.sin(d * 5) * Math.exp(-d * .6) * 18 * (k === "rf" ? 1 : -1); } x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } g.shadowBlur = 0;
  SC.raf = requestAnimationFrame(drawScope);
}

// ═══ the command line ════════════════════════════════════════════════════════════════════════
const cmd = $("cmd");
function counter() { const n = NS.enc.encode(cmd.value).length, f = freqOf(CUR), lim = R.maxText(), rfOk = f && f.rf >= 0 && rfUp(); $("count").textContent = isOpen(CUR) ? n + " B · PLAIN" : rfOk ? n + "/" + lim + " B" + (n > lim ? " · NET ONLY" : " · RF OK") : n + " B"; $("count").classList.toggle("over", rfOk && n > lim); $("route").textContent = "⇄ " + route().toUpperCase(); $("burnb").textContent = NS.cfg.burn ? "☠ " + NS.cfg.burn + "s" : "☠ OFF"; $("burnb").classList.toggle("on", !!NS.cfg.burn); }
cmd.addEventListener("input", () => { counter(); NS.snd("key"); const f = freqOf(CUR); if (f && Date.now() - typingAt > 2500 && cmd.value && cmd.value[0] !== "/") { typingAt = Date.now(); N.fx(f, { t: "ty", h: NS.me.handle, n: NS.me.node, c: NS.me.color }); } hint(); });
cmd.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  else if (e.key === "ArrowUp" && !cmd.value.includes("\n")) { if (hist.length) { histI = histI < 0 ? hist.length - 1 : Math.max(0, histI - 1); cmd.value = hist[histI]; e.preventDefault(); counter(); } }
  else if (e.key === "ArrowDown" && histI >= 0) { histI = Math.min(hist.length, histI + 1); cmd.value = hist[histI] || ""; e.preventDefault(); counter(); }
  else if (e.key === "Tab" && cmd.value.startsWith("/")) { e.preventDefault(); const m = Object.keys(CMDS).filter((k) => k.startsWith(cmd.value.slice(1).split(" ")[0])); if (m.length === 1) cmd.value = "/" + m[0] + " "; hint(); }
});
function hint() { const v = cmd.value; if (!v.startsWith("/")) return ($("hint").textContent = ""); const w = v.slice(1).split(" ")[0], m = Object.entries(CMDS).filter(([k]) => k.startsWith(w)).slice(0, 5); $("hint").innerHTML = m.map(([k, c]) => "<span><b>/" + k + "</b> " + esc(c.h) + "</span>").join(""); }
$("send").onclick = submit;
async function submit() {
  const v = cmd.value.trim(); if (!v) return; hist.push(v); if (hist.length > 50) hist.shift(); store.set("hist", hist); histI = -1; cmd.value = ""; counter(); hint();
  if (v[0] === "/") { const [c, ...rest] = v.slice(1).split(" "), arg = rest.join(" ").trim(), C = CMDS[c.toLowerCase()]; if (!C) { NS.snd("err"); return sys(CUR, "unknown command /" + c + " · /help", "err"); } try { await C.f(arg); } catch (e) { sys(CUR, String(e.message || e), "err"); } return; }
  transmit(v);
}
const CMDS = {
  help: { h: "every command", f: () => panels.help() },
  new: { h: "<name> make a frequency", f: async (a) => { const f = await NS.addFreq(NS.newKey(), (a || "freq-" + NS.rid(2)).slice(0, 24)); N.resub(); renderTuner(); tune(f.tag); sys(f.tag, "frequency created · /key to bring people in", "ok"); } },
  tune: { h: "<code or link> join a frequency", f: async (a) => { const t = NS.parseTune(a); if (!t) throw new Error("that isn't a tune code"); const f = await NS.addFreq(t.key, t.name); N.resub(); renderTuner(); tune(f.tag); sys(f.tag, "tuned in · key " + (await NS.fingerprint(f)), "ok"); } },
  key: { h: "show this frequency's tune code", f: () => panels.freq() },
  rename: { h: "<name> rename this frequency (on this device)", f: (a) => { const f = freqOf(CUR); if (!f || !a) throw new Error("usage: /rename <name>"); f.name = a.slice(0, 24); NS.saveFreqs(); renderTuner(); tune(f.tag); } },
  leave: { h: "forget this frequency", f: async () => { const f = freqOf(CUR); if (!f) throw new Error("not on a frequency"); if (!confirm("Forget " + f.name + "? Its history on this device is deleted.")) return; NS.freqs = NS.freqs.filter((x) => x !== f); NS.saveFreqs(); const r = room(f.tag); NS.db.del([...r.msgs.keys()].map((id) => f.tag + "|" + id)); T.delete(f.tag); N.resub(); CUR = null; renderTuner(); if (NS.freqs[0]) tune(NS.freqs[0].tag); else { $("stream").innerHTML = ""; panels.start(); } } },
  nick: { h: "<handle> change your handle", f: (a) => { const h = NS.cleanHandle(a); if (h.length < 2) throw new Error("2–16 letters or numbers"); NS.me.handle = h; NS.saveMe(); hud(); sys(CUR, "you are now " + h.toUpperCase(), "ok"); } },
  color: { h: "<a|b|c|#hex> your colour", f: (a) => { const t = NS.THEMES[NS.cfg.theme], c = { a: t.a, b: t.b, c: t.c }[a] || (/^#[0-9a-f]{6}$/i.test(a) ? a : null); if (!c) throw new Error("usage: /color a | b | c | #ff00aa"); NS.me.color = c; NS.saveMe(); hud(); } },
  radio: { h: "connect a LoRa radio", f: () => panels.radio() },
  bind: { h: "<channel> send this frequency over that radio channel", f: (a) => { const f = freqOf(CUR); if (!f) throw new Error("not on a frequency"); f.rf = a === "off" || a === "" ? -1 : Math.max(0, Math.min(7, parseInt(a, 10) || 0)); NS.saveFreqs(); tune(f.tag); sys(f.tag, f.rf >= 0 ? "bound to radio channel " + f.rf + ": everyone on this frequency needs the same channel" : "unbound from the radio", "ok"); } },
  bridge: { h: "on|off relay between RF and NET", f: (a) => { NS.set("bridge", a ? a === "on" : !NS.cfg.bridge); hud(); sys(CUR, "bridge " + (NS.cfg.bridge ? "armed: messages heard on RF go to the relay and back" : "off"), "ok"); } },
  route: { h: "auto|net|rf|both how messages leave", f: (a) => { if (!["auto", "net", "rf", "both"].includes(a)) throw new Error("usage: /route auto | net | rf | both"); NS.set("route", a); counter(); sys(CUR, "route " + a.toUpperCase() + (a === "auto" ? ": relay when online, radio when not" : ""), "ok"); } },
  burn: { h: "<seconds>|off messages self-destruct", f: (a) => { const s = a === "off" || !a ? 0 : Math.max(5, Math.min(604800, parseInt(a, 10) || 0)); NS.set("burn", s); counter(); sys(CUR, s ? "burn " + s + "s: new messages delete themselves everywhere (relay only)" : "burn off", "ok"); } },
  ping: { h: "ping everyone on this frequency", f: () => { const f = freqOf(CUR); if (!f) throw new Error("not on a frequency"); const id = NS.rid(4); pings.add(id); N.fx(f, { t: "ping", id, at: Date.now(), h: NS.me.handle, n: NS.me.node, c: NS.me.color }); NS.snd("ping"); sys(CUR, "◈ PING sent", "dim"); } },
  loc: { h: "send your position", f: () => new Promise((res, rej) => { if (!navigator.geolocation) return rej(new Error("no location on this device")); navigator.geolocation.getCurrentPosition((p) => { const loc = { lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) }; NS.myPos = loc; transmit(loc.lat + "," + loc.lon, { kind: "loc", loc }); res(); }, () => rej(new Error("location denied")), { enableHighAccuracy: true, timeout: 12000 }); }) },
  img: { h: "send an image (relay only)", f: () => $("file").click() },
  scan: { h: "list mesh nodes", f: () => { $("app").classList.add("sidebar"); $("side").querySelector('[data-st="mesh"]').click(); } },
  theme: { h: "<name> " + Object.keys(NS.THEMES).join("|"), f: (a) => { if (!NS.THEMES[a]) return panels.system(); NS.set("theme", a); hud(); } },
  fx: { h: "off|low|med|high visual effects", f: (a) => { if (!["off", "low", "med", "high"].includes(a)) throw new Error("usage: /fx off | low | med | high"); NS.set("fx", a); } },
  sound: { h: "on|off", f: (a) => NS.set("sound", a === "off" ? 0 : 70) },
  clear: { h: "clear the screen (history stays)", f: () => { $("stream").innerHTML = ""; els.clear(); } },
  whoami: { h: "your operator id", f: () => sys(CUR, "operator " + NS.me.handle.toUpperCase() + " · node #" + NS.me.node + " · device " + NS.dev, "ok") },
  export: { h: "download this frequency's log", f: () => exportLog() },
  wipe: { h: "erase everything on this device", f: async () => { if (!confirm("Wipe NULLSPACE from this device? Identity, frequencies and history are erased. This cannot be undone.")) return; await NS.db.wipe(); for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith("ns:" + NS.profile + ":")) localStorage.removeItem(k); } location.reload(); } },
};
// the little buttons over the command line, for thumbs
$("tools").onclick = (e) => { const b = e.target.closest("[data-tool]"); if (!b) return; const t = b.dataset.tool; if (t === "img") $("file").click(); else if (t === "loc") CMDS.loc.f().catch((er) => sys(CUR, er.message, "err")); else if (t === "burn") { const s = [0, 30, 300, 3600][([0, 30, 300, 3600].indexOf(NS.cfg.burn) + 1) % 4]; NS.set("burn", s); counter(); } else if (t === "route") { const r = ["auto", "net", "rf", "both"]; NS.set("route", r[(r.indexOf(route()) + 1) % 4]); counter(); toast("route " + route().toUpperCase()); } else if (t === "cmds") { cmd.value = "/"; cmd.focus(); hint(); } };
$("file").onchange = async () => { const file = $("file").files[0]; $("file").value = ""; if (!file) return; const f = freqOf(CUR); if (!f) return toast("images go on frequencies, not open band"); try {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); const g = c.getContext("2d"); g.drawImage(bmp, 0, 0, c.width, c.height);
  let q = .8, blob; do { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); q -= .1; } while (blob.size > 900 * 1024 && q > .2); const u8 = new Uint8Array(await blob.arrayBuffer()); sys(CUR, "encrypting and uploading image…", "dim");
  const b = await N.blobUp(f, u8); transmit("", { img: { b, w: c.width, h: c.height }, imgLocal: u8 }); } catch (e) { sys(CUR, "image failed: " + (e.err || e.message || "offline?"), "err"); } };
function exportLog() { const f = freqOf(CUR) || { name: CUR }; const rows = [...room(CUR).msgs.values()].filter((m) => m.kind !== "sys").sort((a, b) => a.ts - b.ts).map((m) => new Date(m.ts).toISOString() + "  " + (m.h || "?") + "  [" + Object.keys(m.via || {}).join("+").toUpperCase() + "]  " + (m.t || (m.img ? "<image>" : ""))); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/plain" })); a.download = "nullspace-" + String(f.name).toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".log"; a.click(); }

// ═══ panels ══════════════════════════════════════════════════════════════════════════════════
const pnl = $("pnl");
const show = (p, title, html) => { pnl.dataset.p = p; pnl.innerHTML = '<div class="ph"><b>// ' + title + '</b><button class="x" id="px" aria-label="Close">✕</button></div><div class="pb">' + html + "</div>"; pnl.classList.add("on"); $("px").onclick = hide; };
const hide = () => { pnl.classList.remove("on"); pnl.dataset.p = ""; cmd.focus({ preventScroll: true }); };
addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
const panels = {
  start() { show("start", "NO SIGNAL", '<p>You aren\'t tuned to anything yet.</p><div class="row"><button class="nb pri" id="ps-new">CREATE FREQUENCY</button></div><label>Or paste a tune code / link</label><input id="ps-code" placeholder="NS-… or https://…/nullspace#tune=…" autocomplete="off"><div class="row"><button class="nb" id="ps-tune">TUNE IN</button></div><p class="dim">A frequency is a shared key. Whoever has it can read and write; nobody else, including the relay, can.</p>'); $("ps-new").onclick = async () => { hide(); await CMDS.new.f(""); }; $("ps-tune").onclick = async () => { try { await CMDS.tune.f($("ps-code").value); hide(); } catch (e) { toast(e.message); NS.snd("err"); } }; },
  async freq() { const f = freqOf(CUR); if (!f) return toast("not on a frequency"); const link = NS.tuneLink(f), code = "NS-" + f.key + "." + NS.b64u(NS.enc.encode(f.name));
    show("freq", "FREQUENCY · " + esc(f.name.toUpperCase()), '<div class="big">' + NS.mhz(f.tag) + ' MHz</div><label>Key fingerprint (compare with friends)</label><div class="code">' + (await NS.fingerprint(f)) + '</div><label>Tune code</label><div class="code sel" id="pf-code">' + esc(code) + '</div><label>Tune link</label><div class="code sel" id="pf-link">' + esc(link) + '</div><div class="row"><button class="nb pri" id="pf-cp">COPY LINK</button><button class="nb" id="pf-sh">SHARE</button></div><p class="dim">Anyone holding this can read and transmit on this frequency. Hand it over in person or through a channel you trust. Over the radio the key never travels; your friends need it first.</p><label>Radio channel</label><div class="row">' + [-1, 0, 1, 2, 3].map((c) => '<button class="nb ' + (f.rf === c ? "pri" : "") + '" data-bind="' + c + '">' + (c < 0 ? "NONE" : "CH" + c) + "</button>").join("") + "</div>");
    $("pf-cp").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("copied"); } catch (e) { toast("select and copy"); } }; if (navigator.share) $("pf-sh").onclick = () => navigator.share({ title: "NULLSPACE frequency", url: link }).catch(() => {}); else $("pf-sh").remove();
    pnl.onclick = (e) => { const b = e.target.closest("[data-bind]"); if (b) { CMDS.bind.f(b.dataset.bind); panels.freq(); } }; },
  radio() {
    const st = R.state, nodes = [...R.nodes.values()].length;
    show("radio", "RADIO LINK", '<div class="rstat ' + st + '">' + (st === "on" ? "LINKED · " + esc(R.kind.toUpperCase()) + " · " + esc(R.via.toUpperCase()) + " · " + esc(R.me.name || "") + " · " + nodes + " NODES" : st === "connecting" ? "LINKING…" : st === "error" ? "ERROR" : "NO RADIO") + "</div>" +
      '<div class="drv"><b>MESHTASTIC</b><small>Heltec, T-Beam, RAK, T-Echo… on Meshtastic firmware</small><div class="row"><button class="nb" data-c="meshtastic:ble" ' + (R.can.ble ? "" : "disabled") + '>BLUETOOTH</button><button class="nb" data-c="meshtastic:serial" ' + (R.can.serial ? "" : "disabled") + ">USB</button></div></div>" +
      '<div class="drv"><b>MESHCORE <i>BETA</i></b><small>companion-radio firmware</small><div class="row"><button class="nb" data-c="meshcore:ble" ' + (R.can.ble ? "" : "disabled") + '>BLUETOOTH</button><button class="nb" data-c="meshcore:serial" ' + (R.can.serial ? "" : "disabled") + ">USB</button></div></div>" +
      '<div class="drv"><b>SIMULATOR</b><small>other tabs on this computer (add ?profile=b to the address) act as other nodes</small><div class="row"><button class="nb" data-c="sim:air">AIR</button></div></div>' +
      (st === "on" || st === "connecting" ? '<div class="row"><button class="nb warn" id="pr-off">DISCONNECT</button><button class="nb" id="pr-adv">ANNOUNCE</button></div>' : "") +
      (R.can.ble || R.can.serial ? "" : '<p class="warn">This browser can\'t reach radios directly. Use Chrome or Edge on a computer or Android (iPhone browsers don\'t allow Bluetooth for web apps).</p>') +
      '<label>Nodes heard</label><div id="rnodes"></div><label>Radio log</label><pre id="rlog"></pre><p class="dim">Your messages ride inside ordinary channel text, sealed with the frequency key, so they cross any mesh. Bind each frequency to a channel with /bind. Over RF a message holds about ' + (R.maxText() || 100) + " bytes; longer ones, images and burn timers go by the relay.</p>");
    $("rlog").textContent = R.log.slice(-60).join("\n"); renderRadioNodes();
    pnl.onclick = async (e) => { const b = e.target.closest("[data-c]"); if (b) { const [k, v] = b.dataset.c.split(":"); try { await R.connect(k, v); } catch (er) { NS.snd("err"); } panels.radio(); } };
    if ($("pr-off")) $("pr-off").onclick = async () => { await R.disconnect(); panels.radio(); }; if ($("pr-adv")) $("pr-adv").onclick = () => { if (R.kind === "meshcore") R.send2(R._mc.mcCmd.advert()); toast("announced"); };
  },
  operator() { show("operator", "OPERATOR", '<div class="opbig">' + NS.sigil(NS.me.node, NS.me.color, 64) + "<div><b>" + esc(NS.me.handle.toUpperCase()) + '</b><small>NODE #' + NS.me.node + '</small></div></div><label>Handle</label><input id="po-h" value="' + esc(NS.me.handle) + '" maxlength="16"><label>Colour</label><div class="row">' + ["a", "b", "c"].map((k) => '<button class="sw" data-col="' + NS.THEMES[NS.cfg.theme][k] + '" style="background:' + NS.THEMES[NS.cfg.theme][k] + '"></button>').join("") + '<input type="color" id="po-c" value="' + NS.me.color + '"></div><div class="row"><button class="nb pri" id="po-s">SAVE</button></div><p class="dim">No account, no email, no phone number. Your identity is this device. /wipe erases it.</p>'); pnl.onclick = (e) => { const b = e.target.closest("[data-col]"); if (b) $("po-c").value = b.dataset.col; }; $("po-s").onclick = () => { const h = NS.cleanHandle($("po-h").value); if (h.length >= 2) NS.me.handle = h; NS.me.color = $("po-c").value; NS.saveMe(); hud(); hide(); }; },
  system() {
    show("system", "SYSTEM", '<label>Theme</label><div class="themes">' + Object.entries(NS.THEMES).map(([k, t]) => '<button class="th ' + (NS.cfg.theme === k ? "on" : "") + '" data-th="' + k + '" style="--ta:' + t.a + ";--tb:" + t.b + '"><i></i><i></i>' + t.name + "</button>").join("") + '</div><label>Visual effects</label><div class="row">' + ["off", "low", "med", "high"].map((x) => '<button class="nb ' + (NS.cfg.fx === x ? "pri" : "") + '" data-fx="' + x + '">' + x.toUpperCase() + "</button>").join("") + '</div><label>Route</label><div class="row">' + ["auto", "net", "rf", "both"].map((x) => '<button class="nb ' + (route() === x ? "pri" : "") + '" data-rt="' + x + '">' + x.toUpperCase() + "</button>").join("") + '</div><label>Sound ' + NS.cfg.sound + '%</label><input type="range" min="0" max="100" value="' + NS.cfg.sound + '" id="ps-snd"><div class="row"><button class="nb ' + (NS.cfg.keys ? "pri" : "") + '" id="ps-keys">KEY CLICKS</button><button class="nb ' + (NS.cfg.bridge ? "pri" : "") + '" id="ps-br">BRIDGE</button><button class="nb ' + (NS.cfg.boot ? "pri" : "") + '" id="ps-boot">BOOT SEQUENCE</button><button class="nb" id="ps-push">ALERTS</button></div>' +
      '<label>Status</label><pre class="stat">NET   ' + N.state.toUpperCase() + (N.rtt ? " " + N.rtt + "ms" : "") + "  tx " + N.sent + " rx " + N.got + "\nRF    " + R.state.toUpperCase() + (R.kind ? " " + R.kind : "") + "  tx " + R.sent + " rx " + R.got + "\nQUEUE " + outbox.length + "\nFREQS " + NS.freqs.length + "\nDEVICE " + NS.dev + "\nPROFILE " + NS.profile + "</pre><p class=\"dim\">The relay sees frequency tags, sizes and times. Never keys, never words. Your radio's mesh sees sealed noise.</p>");
    pnl.onclick = (e) => { const t = e.target.closest("[data-th]"), x = e.target.closest("[data-fx]"), r = e.target.closest("[data-rt]"); if (t) NS.set("theme", t.dataset.th); if (x) NS.set("fx", x.dataset.fx); if (r) NS.set("route", r.dataset.rt); if (t || x || r) { hud(); panels.system(); } };
    $("ps-snd").oninput = (e) => NS.set("sound", +e.target.value); $("ps-keys").onclick = () => { NS.set("keys", !NS.cfg.keys); panels.system(); }; $("ps-br").onclick = () => { NS.set("bridge", !NS.cfg.bridge); hud(); panels.system(); }; $("ps-boot").onclick = () => { NS.set("boot", !NS.cfg.boot); panels.system(); }; $("ps-push").onclick = togglePush;
  },
  help() { show("help", "COMMANDS", '<div class="cmds">' + Object.entries(CMDS).map(([k, c]) => "<div><b>/" + k + "</b><span>" + esc(c.h) + "</span></div>").join("") + '</div><p class="dim">Tab completes a command. ↑ recalls what you sent. Plain text transmits. Route AUTO sends by relay when you\'re online and by radio when you\'re not; BOTH always does both. BRIDGE turns this device into a gateway: what it hears on the radio goes to the relay, and what comes from the relay goes out on the radio.</p>'); },
};
$("b-sys").onclick = () => panels.system(); $("b-help").onclick = () => panels.help(); $("b-new").onclick = () => panels.start(); $("b-key").onclick = () => panels.freq(); $("b-radio").onclick = () => panels.radio();
async function togglePush() {
  try { const reg = (await navigator.serviceWorker.getRegistration("/nullspace")) || (await navigator.serviceWorker.register("/nullspace-sw.js", { scope: "/nullspace" })); const cur = await reg.pushManager.getSubscription();
    if (cur) { await N.api("push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: cur, off: 1 }) }).catch(() => {}); await cur.unsubscribe(); return toast("alerts off"); }
    if ((await Notification.requestPermission()) !== "granted") return toast("alerts blocked by the browser"); const { key } = await N.api("push/key"), sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: NS.unb64u(key) });
    await N.api("push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub, fs: NS.freqs.map((f) => f.tag), dev: NS.dev }) }); toast("alerts on: a silent nudge when a frequency moves"); } catch (e) { toast("alerts unavailable here"); }
}

// ═══ start ═══════════════════════════════════════════════════════════════════════════════════
async function start() {
  const t = NS.parseTune(location.hash); if (t) history.replaceState(null, "", location.pathname + location.search);
  await bootSeq(); if (!NS.me) await jackIn();
  $("app").classList.remove("hidden"); hud(); renderTuner(); N.start(); flush(); schedulePoll(); scope("net");
  if (t) { const f = await NS.addFreq(t.key, t.name); N.resub(); renderTuner(); await tune(f.tag); sys(f.tag, "tuned in from link · key " + (await NS.fingerprint(f)), "ok"); }
  else { const last = store.get("cur", null); if (last && (freqOf(last) || isOpen(last))) await tune(last); else if (NS.freqs[0]) await tune(NS.freqs[0].tag); else panels.start(); }
  const rr = store.get("radio", null); if (rr && rr.kind === "sim") R.connect("sim", "air").catch(() => {});
  try { navigator.serviceWorker.register("/nullspace-sw.js", { scope: "/nullspace" }); } catch (e) {}
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { document.title = "NULLSPACE"; pollAll(); schedulePoll(); } });
  addEventListener("pointerdown", function f() { removeEventListener("pointerdown", f); NS.snd("key"); }, { once: true });
}
NS.onCfg((k) => { if (k === "theme") { hud(); if ($("side").dataset.tab === "mesh") renderMesh(); } });
NS.deck = { transmit, tune, CMDS, T, panels, pull };
start();
})();
