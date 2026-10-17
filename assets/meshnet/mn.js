/* Hopline · live console. A browser front end for a LoRa mesh: a real Meshtastic or MeshCore node over Bluetooth or USB
   (the radio driver is NULLSPACE's, assets/ns/radio.js), or a simulated valley of radios that floods packets the way
   Meshtastic does: every node rebroadcasts what it hears once, until the hop limit runs out. Kill relays and watch the
   traffic take a longer road, or none. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id), R = NS.Radio;
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (t) => { if (!t) return "—"; const s = Math.max(0, (Date.now() - t) / 1000); return s < 45 ? "now" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };
const bytes = (t) => new TextEncoder().encode(t).length, MAXB = 228, HOPS = 3;

const S = { mode: "off", nodes: new Map(), me: 0, chans: [{ index: 0, name: "LongFast" }], ch: 0, msgs: [], rx: 0, tx: 0, sel: null, rings: [], flash: new Map(), log: [] };
const log = (s) => { S.log.push(new Date().toTimeString().slice(0, 8) + "  " + s); if (S.log.length > 400) S.log.shift(); if (tab === "log" || wide()) $("lg").textContent = S.log.join("\n"); };
const wide = () => innerWidth > 900;

// ═══ the simulated valley ═══════════════════════════════════════════════════════════════════
const NAMES = [["You", "YOU"], ["Ridge Relay", "RDG"], ["Mill Creek", "MILL"], ["North Barn", "BARN"], ["Fire Lookout", "FIRE"], ["Kestrel", "KSTL"], ["Valley Base", "BASE"], ["Rover 7", "RV7"], ["Orchard", "ORCH"], ["Quarry", "QRY"], ["Old Bridge", "BRDG"], ["Ranger", "RNGR"], ["Pine Camp", "PINE"], ["Lowlands", "LOW"]];
const CHATTER = ["anyone copy?", "rain moving in from the west", "solar's at 84%, all good", "checking in from the ridge", "road's washed out past the bridge", "heard you 2 hops out", "battery swap done", "power's still down here", "testing new antenna, how's my SNR?", "on my way back to base", "water at the creek is up a foot", "lookout reports smoke to the north, probably burn pile", "copy all", "anyone near the quarry?", "relay's back up after the reboot"];
const REPLIES = ["copy that", "loud and clear", "heard you via the ridge", "roger", "got it, thanks", "copy, SNR looks fine from here", "👍"];
const sim = {
  R: 0.34, W: 1.6, H: 1, timer: 0, pid: 0, seen: new Map(),
  start() {
    S.nodes = new Map(); S.msgs = []; S.chans = [{ index: 0, name: "LongFast" }, { index: 1, name: "Valley Ops" }]; S.ch = 0; S.me = 1;
    // hand-placed: a hilltop relay, a few redundant routes, a couple of chokepoints, and a ranger at the far end of one
    const pts = [[.80, .55], [.80, .24], [.55, .42], [1.06, .38], [.32, .20], [1.30, .16], [.56, .74], [1.04, .72], [.30, .56], [1.36, .48], [.07, .38], [1.52, .80], [.26, .88], [1.28, .86]];
    NAMES.forEach(([name, short], i) => S.nodes.set(i + 1, { num: i + 1, name, short, x: pts[i][0], y: pts[i][1], alive: true, heard: i ? 0 : Date.now(), snr: null, rssi: null, hops: i ? null : 0 }));
    sim.topo(); S.mode = "sim"; sys("Simulated mesh: 14 radios in a valley, hop limit 3. Tap a node to inspect it or kill it.");
    clearInterval(sim.timer); sim.timer = setInterval(sim.tick, 1000); sim.next = Date.now() + 2500; sim.beacon = Date.now() + 800;
    ui(); log("simulator on");
  },
  stop() { clearInterval(sim.timer); },
  near(a) { return [...S.nodes.values()].filter((b) => b !== a && b.alive && Math.hypot(a.x - b.x, a.y - b.y) <= sim.R); },
  topo() { // hop distance from you over living radios
    const me = S.nodes.get(S.me), dist = new Map([[me.num, 0]]), q = [me];
    while (q.length) { const a = q.shift(); if (!a.alive) continue; for (const b of sim.near(a)) if (!dist.has(b.num)) { dist.set(b.num, dist.get(a.num) + 1); q.push(b); } }
    for (const n of S.nodes.values()) { n.d = n.alive ? (dist.has(n.num) ? Math.max(0, dist.get(n.num) - 1) : Infinity) : Infinity; } // hops away = relays in between, as Meshtastic counts them
    S.nodes.get(S.me).d = 0;
  },
  snr(a, b) { const d = Math.hypot(a.x - b.x, a.y - b.y) / sim.R; return +(11 - d * 24 + (Math.random() * 2 - 1)).toFixed(1); },
  // one flood: the origin transmits; everyone alive in range hears it; each hearer rebroadcasts once while hops remain
  send(origin, text, ch, kind) {
    const id = ++sim.pid, heard = new Set([origin.num]); let reached = 0;
    const tx = (n, left, path) => {
      ring(n); if (n.num !== origin.num) flash(n.num, "relay");
      setTimeout(() => {
        for (const b of sim.near(n)) {
          if (heard.has(b.num) || !n.alive) continue; heard.add(b.num); reached++;
          const hopsAway = HOPS - left;
          if (b.num === S.me && kind !== "mine") { // it reached you
            origin.heard = Date.now(); origin.hops = hopsAway; const snr = sim.snr(n, b); origin.snr = hopsAway === 0 ? snr : origin.snr; n.snr = n.num === origin.num ? snr : n.snr;
            if (kind === "text") recv({ from: origin.num, name: origin.name, text, ch, snr, hops: hopsAway });
            else ui();
          }
          if (left > 0 && b.num !== S.me) setTimeout(() => tx(b, left - 1, path), 180 + Math.random() * 260);
        }
      }, 140);
    };
    if (origin.alive) tx(origin, HOPS, []);
    return () => reached;
  },
  tick() {
    const now = Date.now(), others = [...S.nodes.values()].filter((n) => n.num !== S.me && n.alive);
    if (now > sim.beacon && others.length) { sim.beacon = now + 4000 + Math.random() * 5000; const n = others[Math.floor(Math.random() * others.length)]; sim.send(n, "", 0, "beacon"); }
    if (now > sim.next && others.length) { sim.next = now + 9000 + Math.random() * 12000; const n = others[Math.floor(Math.random() * others.length)]; sim.send(n, CHATTER[Math.floor(Math.random() * CHATTER.length)], Math.random() < .75 ? 0 : 1, "text"); }
    if (tab === "nodes" || wide()) table();
  },
  say(text, ch) {
    const me = S.nodes.get(S.me), got = sim.send(me, text, ch, "mine");
    setTimeout(() => { const n = got(); sys(n ? "Your packet reached " + n + " radio" + (n > 1 ? "s" : "") + "." : "Nobody heard that. Every relay around you is down or out of range.");
      const back = [...S.nodes.values()].filter((x) => x.num !== S.me && x.alive && x.d <= HOPS);
      if (n && back.length && Math.random() < .8) setTimeout(() => { const r = back[Math.floor(Math.random() * back.length)]; sim.send(r, REPLIES[Math.floor(Math.random() * REPLIES.length)], ch, "text"); }, 1200 + Math.random() * 1800); }, 2600);
  },
  toggle(num) { const n = S.nodes.get(num); if (!n || num === S.me) return; n.alive = !n.alive; sim.topo(); sys(n.name + (n.alive ? " is back on the air." : " went dark.")); log(n.name + (n.alive ? " revived" : " killed")); ui(); },
};

// ═══ a real radio (Meshtastic or MeshCore) ══════════════════════════════════════════════════
R.on("state", () => {
  if (S.mode !== "radio") return;
  if (R.state === "on") { sys("Connected to " + (R.me.name || "your node") + " over " + (R.via === "ble" ? "Bluetooth" : "USB") + "."); }
  if (R.state === "off" || R.state === "error") sys(R.state === "off" ? "Radio disconnected." : "Couldn't connect.");
  ui();
});
R.on("nodes", () => { if (S.mode !== "radio") return; S.me = R.me.num; S.nodes = new Map([...R.nodes].map(([k, n]) => [k, Object.assign(n, { alive: true })])); ui(); });
R.on("channels", () => { if (S.mode !== "radio") return; S.chans = R.channels.filter(Boolean).map((c) => ({ index: c.index, name: c.name })); if (!S.chans.length) S.chans = [{ index: 0, name: "Primary" }]; chans(); });
R.on("packet", (p) => { if (S.mode !== "radio") return; flash(p.from, "rx"); recv({ from: p.from, name: p.fromName, text: p.text, ch: p.ch < 0 ? 0 : p.ch, snr: p.snr, hops: p.hops, dm: p.dm }); });
R.on("log", (s) => log(s));

async function connect(choice) {
  $("sheet").hidden = true;
  if (choice === "sim") { if (S.mode === "radio") await R.disconnect(); return sim.start(); }
  const [kind, via] = choice.split(":"); sim.stop(); S.mode = "radio"; S.nodes = new Map(); S.msgs = []; S.chans = [{ index: 0, name: "Primary" }]; S.ch = 0; S.sel = null; ui();
  try { await R.connect(kind, via); } catch (e) { sys("Couldn't connect: " + (e && e.message || e) + ". The simulator still works."); S.mode = "off"; ui(); }
}

// ═══ messages ═══════════════════════════════════════════════════════════════════════════════
function recv(m) {
  S.rx++; S.msgs.push({ ...m, at: Date.now() }); if (S.msgs.length > 500) S.msgs.shift();
  if (m.ch !== S.ch || (!wide() && tab !== "chat")) { $("unread").classList.add("on"); }
  msgs(); ui();
}
function sys(text) { S.msgs.push({ sys: true, text, ch: -1, at: Date.now() }); msgs(); }
async function say(e) {
  e.preventDefault(); const t = $("txt").value.trim(); if (!t) return; if (bytes(t) > MAXB) return sys("That's " + bytes(t) + " bytes; one LoRa packet carries " + MAXB + ".");
  if (S.mode === "off") return sys("Not connected. Tap Connect, or try the simulated mesh.");
  if (S.mode === "radio") { try { await R.sendText(t, S.ch); } catch (err) { return sys("Send failed: " + err.message); } }
  else sim.say(t, S.ch);
  S.tx++; S.msgs.push({ me: true, name: S.mode === "radio" ? (R.me.name || "You") : "You", text: t, ch: S.ch, at: Date.now() }); $("txt").value = ""; left(); msgs(); ui();
}
const left = () => { const n = MAXB - bytes($("txt").value); $("left").textContent = n; $("left").style.color = n < 0 ? "var(--bad)" : n < 30 ? "var(--warn)" : ""; };
function msgs() {
  const box = $("msgs"), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = S.msgs.filter((m) => m.sys || m.ch === S.ch).slice(-200).map((m) => m.sys ? '<div class="m sys">' + esc(m.text) + "</div>"
    : '<div class="m' + (m.me ? " me" : "") + '"><div class="h">' + esc(m.name) + "<small>" + new Date(m.at).toTimeString().slice(0, 5) + (m.me ? "" : (m.hops != null ? " · " + (m.hops ? m.hops + " hop" + (m.hops > 1 ? "s" : "") : "direct") : "") + (m.snr != null ? " · SNR " + m.snr : "")) + (m.dm ? " · direct message" : "") + "</small></div><p>" + esc(m.text) + "</p></div>").join("")
    || '<div class="m sys">Nothing on this channel yet.</div>';
  if (stick) box.scrollTop = box.scrollHeight;
}
function chans() { $("chans").innerHTML = S.chans.map((c) => '<button data-ch="' + c.index + '" class="' + (c.index === S.ch ? "on" : "") + '">#' + esc(c.name) + "</button>").join(""); }

// ═══ the node table ═════════════════════════════════════════════════════════════════════════
const qual = (n) => (!n.alive ? "#ff5a5a" : n.num === S.me ? "#ff4fa8" : S.mode === "sim" ? (n.d <= HOPS ? "#3dffa8" : n.d < Infinity ? "#ffcf4a" : "#635c77") : n.heard && Date.now() - n.heard < 2 * 3600e3 ? "#3dffa8" : "#ffcf4a");
function table() {
  const me = S.nodes.get(S.me), list = [...S.nodes.values()].sort((a, b) => (b.num === S.me) - (a.num === S.me) || (b.heard || 0) - (a.heard || 0));
  $("tb").innerHTML = list.map((n) => '<tr data-n="' + n.num + '" class="' + (n.num === S.me ? "me" : "") + (n.alive ? "" : " dead") + '"><td><span class="q" style="background:' + qual(n) + '"></span><b>' + esc(n.name) + "</b> " + esc(n.short || "") + "</td><td>" + (n.num === S.me ? "—" : S.mode === "sim" ? (n.d === Infinity ? "×" : n.d === 0 ? "direct" : n.d) : n.hops === 0 ? "direct" : n.hops ?? "?") + "</td><td>" + (n.snr ?? "—") + "</td><td>" + (n.rssi ?? "—") + "</td><td>" + (n.num === S.me ? "you" : ago(n.heard)) + "</td><td>" + (n.lat != null ? n.lat.toFixed(3) + ", " + n.lon.toFixed(3) : S.mode === "sim" ? "sim" : "—") + "</td></tr>").join("")
    || '<tr><td colspan="6" style="color:var(--mute)">No nodes yet.</td></tr>';
}

// ═══ the mesh view ══════════════════════════════════════════════════════════════════════════
const cv = $("cv"), cx = cv.getContext("2d"); let W = 0, H = 0, DPR = 1;
function size() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
function place() { // where each node sits on screen
  const pos = new Map(), pad = 34;
  if (S.mode === "sim") {
    const port = H > W * 1.1, fw = port ? sim.H : sim.W, fh = port ? sim.W : sim.H, s = Math.min((W - 2 * pad) / fw, (H - 2 * pad) / fh), ox = (W - fw * s) / 2, oy = (H - fh * s) / 2;
    for (const n of S.nodes.values()) pos.set(n.num, port ? [ox + n.y * s, oy + n.x * s] : [ox + n.x * s, oy + n.y * s]);
    pos.scale = s; return pos;
  }
  const me = S.nodes.get(S.me), withPos = [...S.nodes.values()].filter((n) => n.lat != null);
  if (me && me.lat != null && withPos.length > 1) { // a real map: equirectangular around you
    const k = Math.cos(me.lat * Math.PI / 180); let m = 1e-6; for (const n of withPos) m = Math.max(m, Math.abs((n.lon - me.lon) * k), Math.abs(n.lat - me.lat));
    const s = (Math.min(W, H) / 2 - pad) / m; for (const n of S.nodes.values()) if (n.lat != null) pos.set(n.num, [W / 2 + (n.lon - me.lon) * k * s, H / 2 - (n.lat - me.lat) * s]);
  }
  const rr = (Math.min(W, H) / 2 - pad) / (HOPS + 1.3); // the rest: rings by hop count
  for (const n of S.nodes.values()) if (!pos.has(n.num)) { if (n.num === S.me) { pos.set(n.num, [W / 2, H / 2]); continue; } const h = n.hops == null ? HOPS + 1 : Math.min(n.hops, HOPS + 1), a = ((n.num * 2654435761) >>> 0) / 4294967296 * Math.PI * 2; pos.set(n.num, [W / 2 + Math.cos(a) * rr * (h + 1), H / 2 + Math.sin(a) * rr * (h + 1)]); }
  pos.rings = rr; return pos;
}
function ring(n) { S.rings.push({ num: n.num, t: performance.now() }); }
function flash(num, kind) { S.flash.set(num, { t: performance.now(), kind }); }
let lastPos = new Map();
function draw(t) {
  requestAnimationFrame(draw);
  if (document.hidden || (!wide() && tab !== "mesh")) return;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.clearRect(0, 0, W, H);
  const pos = (lastPos = place()), me = S.nodes.get(S.me);
  // backdrop: faint contours (sim) or hop rings (radio)
  cx.lineWidth = 1;
  if (pos.rings) { for (let h = 0; h <= HOPS + 1; h++) { cx.strokeStyle = "rgba(255,255,255," + (h === HOPS + 1 ? .03 : .06) + ")"; cx.beginPath(); cx.arc(W / 2, H / 2, pos.rings * (h + 1), 0, 7); cx.stroke(); cx.fillStyle = "rgba(255,255,255,.22)"; cx.font = "500 10px ui-monospace,monospace"; cx.fillText(h === 0 ? "direct" : h <= HOPS ? h + " hop" + (h > 1 ? "s" : "") : "unknown", W / 2 + 4, H / 2 - pos.rings * (h + 1) + 12); } }
  else { cx.strokeStyle = "rgba(255,255,255,.035)"; for (let i = 1; i < 9; i++) { cx.beginPath(); for (let x = 0; x <= W; x += 24) { const y = H * i / 9 + Math.sin(x / 90 + i * 1.7) * 18 + Math.sin(x / 37 + i) * 6; x ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); } }
  // links
  if (S.mode === "sim") {
    const list = [...S.nodes.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], b = list[j]; if (Math.hypot(a.x - b.x, a.y - b.y) > sim.R) continue; const pa = pos.get(a.num), pb = pos.get(b.num), live = a.alive && b.alive;
      cx.strokeStyle = live ? (Math.max(a.d, b.d) <= HOPS ? "rgba(255,79,168,.28)" : "rgba(255,207,74,.16)") : "rgba(255,90,90,.08)"; cx.setLineDash(live ? [] : [3, 5]); cx.beginPath(); cx.moveTo(pa[0], pa[1]); cx.lineTo(pb[0], pb[1]); cx.stroke(); }
    cx.setLineDash([]);
  } else if (me) for (const n of S.nodes.values()) { if (n.num === S.me || !n.heard) continue; const p = pos.get(n.num), pm = pos.get(S.me); cx.strokeStyle = n.hops === 0 ? "rgba(255,79,168,.3)" : "rgba(255,255,255,.07)"; cx.beginPath(); cx.moveTo(pm[0], pm[1]); cx.lineTo(p[0], p[1]); cx.stroke(); }
  // transmissions: a ring per broadcast, as far as the radio reaches
  const now = performance.now(), reach = S.mode === "sim" ? sim.R * pos.scale : 60;
  S.rings = S.rings.filter((r) => now - r.t < 700);
  for (const r of S.rings) { const p = pos.get(r.num); if (!p) continue; const k = (now - r.t) / 700; cx.strokeStyle = "rgba(255,120,190," + (0.55 * (1 - k)) + ")"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p[0], p[1], 6 + k * reach, 0, 7); cx.stroke(); }
  cx.lineWidth = 1;
  // nodes
  for (const n of S.nodes.values()) {
    const p = pos.get(n.num); if (!p) continue; const c = qual(n), isMe = n.num === S.me, sel = S.sel === n.num, f = S.flash.get(n.num), fk = f ? Math.max(0, 1 - (now - f.t) / 600) : 0;
    if (fk) { cx.fillStyle = "rgba(255,200,230," + fk * .5 + ")"; cx.beginPath(); cx.arc(p[0], p[1], 10 + fk * 10, 0, 7); cx.fill(); }
    cx.fillStyle = c; cx.shadowColor = c; cx.shadowBlur = n.alive ? 12 : 0; cx.beginPath(); cx.arc(p[0], p[1], isMe ? 8 : 6, 0, 7); cx.fill(); cx.shadowBlur = 0;
    if (!n.alive) { cx.strokeStyle = "#ff5a5a"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(p[0] - 6, p[1] - 6); cx.lineTo(p[0] + 6, p[1] + 6); cx.moveTo(p[0] + 6, p[1] - 6); cx.lineTo(p[0] - 6, p[1] + 6); cx.stroke(); cx.lineWidth = 1; }
    if (sel) { cx.strokeStyle = "#fff"; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(p[0], p[1], 13, 0, 7); cx.stroke(); cx.lineWidth = 1; }
    cx.fillStyle = n.alive ? "rgba(241,238,248,.85)" : "rgba(241,238,248,.35)"; cx.font = (isMe || sel ? "700 " : "500 ") + "11px ui-monospace,monospace"; cx.textAlign = "center"; cx.fillText(n.short || n.name.slice(0, 6), p[0], p[1] + 22); cx.textAlign = "left";
  }
  if (!S.nodes.size) { cx.fillStyle = "rgba(241,238,248,.5)"; cx.font = "500 13px ui-monospace,monospace"; cx.textAlign = "center"; cx.fillText(S.mode === "radio" ? "waiting for the radio to report its nodes…" : "not connected", W / 2, H / 2); cx.textAlign = "left"; }
}
cv.addEventListener("pointerdown", (e) => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 26;
  for (const [num, p] of lastPos) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = num; } }
  if (best != null && S.mode === "sim" && best === S.sel && best !== S.me) sim.toggle(best); // tap a selected relay again to kill or revive it
  S.sel = best; card();
});
function card() {
  const n = S.nodes.get(S.sel), el = $("sel"); if (!n) { el.hidden = true; return; } el.hidden = false; const me = S.nodes.get(S.me);
  const dist = me && me.lat != null && n.lat != null ? (Math.hypot((n.lat - me.lat) * 111.2, (n.lon - me.lon) * 111.2 * Math.cos(me.lat * Math.PI / 180))).toFixed(1) + " km" : null;
  el.innerHTML = "<h3>" + esc(n.name) + "</h3><small>" + (n.num === S.me ? "this is you" : S.mode === "sim" ? "simulated radio" : "!" + (n.num >>> 0).toString(16).padStart(8, "0")) + "</small><dl>" +
    (S.mode === "sim" ? "<dt>status</dt><dd>" + (n.alive ? n.num === S.me ? "you" : n.d === 0 ? "reachable · direct" : n.d <= HOPS ? "reachable · " + n.d + " hop" + (n.d > 1 ? "s" : "") : n.d < Infinity ? "beyond the hop limit (" + n.d + " hops)" : "cut off" : "dark") + "</dd><dt>neighbours</dt><dd>" + sim.near(n).length + " in range</dd>" : "<dt>hops</dt><dd>" + (n.hops ?? "?") + "</dd>") +
    "<dt>SNR</dt><dd>" + (n.snr ?? "—") + "</dd><dt>heard</dt><dd>" + (n.num === S.me ? "—" : ago(n.heard)) + "</dd>" + (dist ? "<dt>distance</dt><dd>" + dist + "</dd>" : "") + "</dl>" +
    '<div class="row">' + (S.mode === "sim" && n.num !== S.me ? '<button class="btn sm ' + (n.alive ? "danger" : "") + '" id="kill">' + (n.alive ? "Kill this relay" : "Bring it back") + "</button>" : "") + '<button class="btn sm" id="unsel">Close</button></div>';
  const k = $("kill"); if (k) k.onclick = () => { sim.toggle(n.num); card(); }; $("unsel").onclick = () => { S.sel = null; card(); };
}

// ═══ chrome ═════════════════════════════════════════════════════════════════════════════════
let tab = "mesh";
function ui() {
  const src = $("src"), on = S.mode === "radio" && R.state === "on";
  src.className = "src " + (S.mode === "sim" ? "sim" : on ? "on" : R.state === "error" ? "err" : ""); src.textContent = S.mode === "sim" ? "simulated" : S.mode === "radio" ? (R.state === "on" ? R.kind + " · " + (R.via === "ble" ? "bt" : "usb") : R.state) : "offline";
  const all = [...S.nodes.values()].filter((n) => n.num !== S.me), reach = S.mode === "sim" ? all.filter((n) => n.alive && n.d <= HOPS).length : all.filter((n) => n.heard).length;
  $("stats").innerHTML = "<span><b>" + all.length + "</b> nodes</span><span><b>" + reach + "</b> " + (S.mode === "sim" ? "reachable" : "heard") + "</span><span><b>" + S.rx + "</b> rx</span><span><b>" + S.tx + "</b> tx</span>";
  $("legend").innerHTML = S.mode === "sim" ? '<span><i style="background:#ff4fa8"></i>you</span><span><i style="background:#3dffa8"></i>within 3 hops</span><span><i style="background:#ffcf4a"></i>beyond the hop limit</span><span><i style="background:#635c77"></i>cut off</span><span><i style="background:#ff5a5a"></i>dark</span>' : S.mode === "radio" ? '<span><i style="background:#ff4fa8"></i>you</span><span><i style="background:#3dffa8"></i>heard in the last 2h</span><span><i style="background:#ffcf4a"></i>older</span>' : "";
  $("hint").textContent = S.mode === "sim" ? "tap a radio to inspect it · tap it again to kill it" : S.mode === "off" ? "connect a radio, or start the simulated mesh" : "";
  $("b-conn").textContent = S.mode === "radio" && on ? "Radio" : "Connect";
  chans(); table(); if (S.sel != null) card();
}
function show(t) { tab = t; $("main").dataset.t = t; document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); if (t === "chat") { $("unread").classList.remove("on"); msgs(); } if (t === "log") $("lg").textContent = S.log.join("\n"); if (t === "nodes") table(); if (t === "mesh") requestAnimationFrame(size); }
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(b.dataset.t); });
$("chans").addEventListener("click", (e) => { const b = e.target.closest("[data-ch]"); if (!b) return; S.ch = +b.dataset.ch; chans(); msgs(); });
$("tb").addEventListener("click", (e) => { const r = e.target.closest("tr[data-n]"); if (!r) return; S.sel = +r.dataset.n; card(); if (!wide()) show("mesh"); });
$("say").addEventListener("submit", say); $("txt").addEventListener("input", left);
$("b-conn").addEventListener("click", () => { $("sheet").hidden = false; document.querySelectorAll(".opts [data-c]").forEach((b) => { const v = b.dataset.c.split(":")[1]; b.disabled = (v === "ble" && !R.can.ble) || (v === "serial" && !R.can.serial); }); $("b-off").hidden = S.mode === "off"; });
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet") || e.target.closest("[data-x]")) $("sheet").hidden = true; const c = e.target.closest("[data-c]"); if (c && !c.disabled) connect(c.dataset.c); });
$("b-off").addEventListener("click", async () => { $("sheet").hidden = true; sim.stop(); if (S.mode === "radio") await R.disconnect(); S.mode = "off"; S.nodes = new Map(); S.sel = null; sys("Disconnected."); ui(); });
addEventListener("resize", size); new ResizeObserver(size).observe(cv);
setInterval(() => { if (S.sel != null) card(); }, 5000);
size(); left(); sim.start(); requestAnimationFrame(draw);
setTimeout(() => { $("hint").style.transition = "opacity .8s"; $("hint").style.opacity = "0"; }, 7000); // the hint has said its piece
window.Hopline = { S, sim, connect };
})();
