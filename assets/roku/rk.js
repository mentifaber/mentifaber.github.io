/* Eightysixty · the remote. In a browser it drives a demo TV; inside the Eightysixty Android app (android/eightysixty) the
   app's bridge finds the real Rokus on the Wi-Fi and every press goes to them (see REAL below). In a browser: Every Roku listens on port 8060 for the External Control Protocol: plain
   HTTP, no pairing, no PIN. The real remote is a page plus a tiny Node relay on the home network (a browser can't send the
   SSDP multicast that finds the TV, and the TV doesn't send the headers a page would need). Here the relay and the TVs are
   simulated, but every request in the log is the one the real remote sends, and the TVs behave the way real ones do:
   keyboard input only lands in a text field, and a TV that's fully off can't hear PowerOn. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

// ── the house: two TVs, one with Fast TV Start and one without ──
const CH = { "151908": ["The Roku Channel", "#6c3ab5"], "12": ["Netflix", "#a30a12"], "837": ["YouTube", "#c4161a"], "13": ["Prime Video", "#0f6fa3"], "2285": ["Hulu", "#178f4c"], "291097": ["Disney+", "#1438b8"], "13535": ["Plex", "#c58a06"], "22297": ["Spotify", "#178a43"], "74519": ["Pluto TV", "#3a3a48"], "41468": ["Tubi", "#6a22c4"] };
const INPUTS = [["InputTuner", "Live TV", "tvinput.dtv"], ["InputHDMI1", "HDMI 1", "tvinput.hdmi1"], ["InputHDMI2", "HDMI 2", "tvinput.hdmi2"], ["InputHDMI3", "HDMI 3", "tvinput.hdmi3"], ["InputHDMI4", "HDMI 4", "tvinput.hdmi4"], ["InputAV1", "AV", "tvinput.cvbs"]];
const DEVS = [
  { ip: "192.168.1.42", name: "Living Room TV", model: "demo-55", sw: "14.0.4", fast: true, usn: "uuid:roku:ecp:YN00K4200042", ch: ["151908", "12", "837", "13", "2285", "291097", "13535", "22297", "74519", "41468"] },
  { ip: "192.168.1.57", name: "Bedroom TV", model: "demo-43", sw: "13.1.4", fast: false, usn: "uuid:roku:ecp:YN00K5700057", ch: ["151908", "837", "12", "41468", "74519", "22297"] },
];
const TITLES = ["The Long Field", "Night Shift", "Coastline", "Static", "Paper Moons", "Low Orbit", "Signal & Noise", "Half Light", "The Quiet Year", "Northbound", "Glass Harbor", "Second Sun"];
const TUNE = ["2.1", "4.1", "5.1", "7.1", "9.1", "11.1", "13.1"];
const KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("").concat(["space", "del"]);
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const tilesOf = (d) => [{ id: "tvinput.dtv", n: "Live TV", c: "#2d2d44", tvin: "Live TV" }, { id: "tvinput.hdmi1", n: "HDMI 1", c: "#2d2d44", tvin: "HDMI 1" }, { id: "tvinput.hdmi2", n: "HDMI 2", c: "#2d2d44", tvin: "HDMI 2" }].concat(d.ch.map((id) => ({ id, n: CH[id][0], c: CH[id][1] })));
const TV = new Map(DEVS.map((d) => [d.ip, { d, on: true, boot: 0, vol: 24, mute: false, v: { v: "home", zone: "grid", si: 0, gi: 3, top: 0 }, opts: null, q: "", cc: false, ch: 3, osdAt: 0, tiles: tilesOf(d) }]));
let ip = null; const cur = () => TV.get(ip);
let kbPrev = ""; const setKb = (v) => { $("kb").value = v; kbPrev = v; };

// ── the traffic log ──
const L = $("log"); let lastReq = null;
const now = () => new Date().toTimeString().slice(0, 8);
function line(html, cls) { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; L.appendChild(d); while (L.children.length > 260) L.firstChild.remove(); L.scrollTop = L.scrollHeight; return d; }
function req(method, path, status, note, body) {
  const ok = status && status < 400, sig = method + path + status + (note || "");
  if (lastReq && lastReq.sig === sig && Date.now() - lastReq.at < 2500 && !body) { lastReq.n++; lastReq.at = Date.now(); lastReq.el.querySelector(".n").textContent = " ×" + lastReq.n; L.scrollTop = L.scrollHeight; return; }
  const el = line('<span class="x">' + now() + '</span> <span class="m">' + method + "</span> " + esc(path) + " " + (status ? '<span class="' + (ok ? "ok" : "bad") + '">' + status + (ok ? " OK" : "") + "</span>" : '<span class="bad">no answer after 3000 ms</span>') + '<span class="n"></span>' + (note ? ' <span class="x">· ' + esc(note) + "</span>" : ""));
  lastReq = { sig, at: Date.now(), n: 1, el };
  if (body) { line(esc(body), "x"); lastReq = null; }
}
const say = (t, cls) => { line(esc(t), cls || "w"); lastReq = null; };

// ── the Android app: Eightysixty for Android loads this page and lends it what a browser can't do, finding TVs on the Wi-Fi
// (SSDP) and talking to them on port 8060 (window.RokuBridge, given to mentifaber.org alone). Then every button is real.
const NB = window.RokuBridge || null, REAL = !!NB, pend = new Map(); let rq = 0;
if (NB) NB.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } const f = pend.get(m.req); if (f) { pend.delete(m.req); f(m); } };
const bridge = (op, x) => new Promise((res) => { const r = ++rq; pend.set(r, res); NB.postMessage(JSON.stringify(Object.assign({ op, req: r }, x || {}))); setTimeout(() => { if (pend.has(r)) { pend.delete(r); res({ ok: false, error: "the app didn't answer" }); } }, 9000); });
const tag = (xml, k) => { const m = new RegExp("<" + k + ">([^<]*)</" + k + ">").exec(xml || ""); return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : ""; };
async function ecp(method, path, note, at) {
  const t = TV.get(at || ip); if (!t) return {};
  const m = await bridge("ecp", { ip: t.d.ip, method, path });
  req(method, path, m.status || 0, refused(m) ? "refused · the TV said \"" + String(m.body).trim().slice(0, 90) + "\"" : note || m.error || "");
  if (method === "POST") await checked(t, m, path);
  return m;
}
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
// Roku OS 14.1 and later ship "Control by mobile apps" set to Limited: the TV still answers questions (its name, its channels) and
// still takes a few keys (volume and mute), so it looks connected and half works. Everything else it refuses, and not always with
// an error: often it answers 200 OK with the words "ECP command not allowed" in the body (openHAB checks for the same text).
const refused = (m) => m.status === 403 || /ECP command not allowed|not allowed in limited/i.test(m.body || "");
const done = (m) => m.status >= 200 && m.status < 300 && !refused(m);
const LIMITED = (t) => t.d.name + " answers but won't take button presses: its \"Control by mobile apps\" setting is on Limited, which Roku OS 14.1 and later turn on by default. With the TV's own remote, open Settings › System › Advanced system settings › Control by mobile apps and choose Enabled (Permissive works too). Volume can work while it's on Limited; nothing else will. Then press any button here.";
async function checked(t, m, path) {
  if (done(m)) { if ((t.limited && !/Volume/.test(path)) || t.slept) { t.limited = t.slept = false; draw(); } return; }   // volume gets through even on Limited: proves nothing
  if (!refused(m)) return;
  const i = await bridge("info", { ip: t.d.ip }); if (i.status === 200) realTV(t.d.ip, i.body);   // asleep, or locked out?
  if (!t.on && !/PowerOn/.test(path)) { if (!t.slept) say(t.d.name + " is in standby, and a TV in standby only listens for Power. Press ⏻ to wake it."); t.slept = true; }
  else if (!t.limited) { t.limited = true; say(LIMITED(t)); }
  draw();
}
function realTV(ipAddr, info) {
  const d = { ip: ipAddr, name: tag(info, "user-device-name") || tag(info, "friendly-device-name") || "Roku at " + ipAddr, model: tag(info, "model-name") || tag(info, "friendly-model-name") || "Roku",
    sw: tag(info, "software-version"), wol: tag(info, "supports-wake-on-wlan") === "true", tv: tag(info, "is-tv") === "true",
    mac: (tag(info, "wifi-mac") || tag(info, "ethernet-mac")).toLowerCase(), pm: tag(info, "power-mode") || "PowerOn" };
  const t = TV.get(ipAddr) || { real: true, v: { v: "real" }, tiles: [], active: "", on: true };
  t.d = d; t.on = /^PowerOn$/i.test(d.pm); TV.set(ipAddr, t); return t;
}
// Power: off is one press; on is Wake-on-LAN (the app sends the magic packet to the TV's MAC), then PowerOn, then a check that it woke
let powering = false;
async function powerReal(t, k) {
  if (powering) return; powering = true;
  try {
    const i = await bridge("info", { ip: t.d.ip }), up = i.status === 200; if (up) realTV(t.d.ip, i.body);
    if (k === "PowerOff" || (k === "Power" && up && t.on)) {
      const m = await ecp("POST", t.d.tv ? "/keypress/PowerOff" : "/keypress/Power", "off");
      if (done(m)) { t.on = false; t.d.pm = "Ready"; draw(); } return;
    }
    say("Waking " + t.d.name + "…", "x");
    if (t.d.mac) { const w = await bridge("wake", { ip: t.d.ip, mac: t.d.mac });
      line('<span class="x">' + now() + '</span> <span class="m">WoL</span> magic packet → ' + esc(t.d.mac) + " " + (w.ok ? '<span class="ok">sent</span>' : '<span class="bad">' + esc(w.error || "not sent") + "</span>" + (w.error === "unknown request" ? ' <span class="x">· update Eightysixty from Foundry to wake TVs from deep sleep</span>' : ""))); lastReq = null; }
    let m = {};
    for (let n = 0; n < 6; n++) { m = await ecp("POST", "/keypress/PowerOn", n ? "again" : "waking"); if (done(m)) break; if (refused(m) && t.limited) return; await nap(1500); }
    for (let n = 0; n < 10 && !t.on; n++) { await nap(1000); const r = await bridge("info", { ip: t.d.ip }); if (r.status === 200) realTV(t.d.ip, r.body); }
    if (t.on) { say(t.d.name + " is on.", "x"); refresh(); }
    else if (!t.limited) say(t.d.name + " didn't wake. A Roku TV can only be switched on over the network while Fast TV Start keeps its Wi-Fi awake: on the TV, Settings › System › Power › Fast TV Start. Some TVs still drop off Wi-Fi after hours asleep; a wired connection, or the TV's own remote, covers those.");
  } finally { powering = false; draw(); }
}
let refreshT = 0;
function refresh() { clearTimeout(refreshT); refreshT = setTimeout(async () => { const t = cur(); if (!t || !t.real) return;   // what's on screen now
  const m = await bridge("ecp", { ip: t.d.ip, method: "GET", path: "/query/active-app" }); if (m.status === 200 && !refused(m)) { t.active = tag(m.body, "app") || "Home"; t.on = true; }
  else if (!m.status) t.on = false; draw(); }, 700); }
$("clr").addEventListener("click", () => { L.innerHTML = ""; lastReq = null; });

// ── what a key does to the TV ──
const view = (t, v) => { t.v = v; t.opts = null; };
function goHome(t) { view(t, { v: "home", zone: "grid", si: 0, gi: Math.min(t.v.gi || 3, t.tiles.length - 1), top: 0 }); fixTop(t.v); }
function fixTop(v) { const r = Math.floor(v.gi / 3); if (r < v.top) v.top = r; if (r > v.top + 2) v.top = r - 2; }
function open(t, tile) {
  if (tile.tvin) { view(t, tile.tvin === "Live TV" ? { v: "tuner" } : { v: "input", n: tile.tvin }); return "switched to " + tile.tvin; }
  view(t, { v: "splash", app: tile }); setTimeout(() => { if (t.v.v === "splash" && t.v.app === tile) { view(t, { v: "app", app: tile, z: "hero", ri: 0 }); draw(); } }, 850);
  return "opened " + tile.n;
}
const titlesFor = (app) => { const h = hash(app.id); return [0, 1, 2, 3, 4, 5].map((k) => TITLES[(h + k * 5) % TITLES.length]); };
function play(t, app, title) { view(t, { v: "play", app, title, pos: 0, dur: 1800 + (hash(title) % 3600), speed: 1, paused: false, ui: performance.now() }); return "playing " + title; }
const SPD = { 1: 1, 2: 8, 3: 32, "-2": -8, "-3": -32 };
function results(t) { const q = t.q.trim().toLowerCase(); const ch = t.tiles.filter((x) => !x.tvin); return q ? ch.filter((x) => x.n.toLowerCase().includes(q)) : ch.slice(0, 6); }

function key(k) { // returns a short note for the log
  const t = cur(), v = t.v;
  if (/^Volume/.test(k)) { if (k === "VolumeMute") t.mute = !t.mute; else { t.mute = false; t.vol = Math.max(0, Math.min(100, t.vol + (k === "VolumeUp" ? 2 : -2))); } t.osdAt = performance.now(); return t.mute ? "muted" : "volume " + t.vol; }
  if (k === "Home") { goHome(t); return "home"; }
  if (k === "Search") { view(t, { v: "search", zone: "keys", ki: 0, ri: 0 }); t.q = ""; setKb(""); return "search"; }
  const inp = INPUTS.find((x) => x[0] === k); if (inp) { view(t, k === "InputTuner" ? { v: "tuner" } : { v: "input", n: inp[1] }); return inp[1]; }
  if (t.opts) { const o = t.opts; if (k === "Up") o.i = Math.max(0, o.i - 1); else if (k === "Down") o.i = Math.min(o.items.length - 1, o.i + 1); else if (k === "Select") { const it = o.items[o.i]; if (/^Captions/.test(it)) { t.cc = !t.cc; o.items[o.i] = "Captions: " + (t.cc ? "On" : "Off"); return "captions " + (t.cc ? "on" : "off"); } t.opts = null; } else if (k === "Back" || k === "Info") t.opts = null; return t.opts ? "" : "options closed"; }
  if (k === "Info") { t.opts = { i: 0, items: v.v === "play" ? ["Captions: " + (t.cc ? "On" : "Off"), "Audio: Stereo", "Picture: Auto"] : v.v === "home" ? ["Move channel", "Remove channel", "Sort A–Z"] : ["Picture: Standard", "Sound: Auto", "Sleep timer: Off"] }; return "options"; }
  if (v.v === "home") {
    if (v.zone === "side") { if (k === "Up") v.si = Math.max(0, v.si - 1); else if (k === "Down") v.si = Math.min(2, v.si + 1); else if (k === "Right") v.zone = "grid"; else if (k === "Select") { if (v.si === 0) v.zone = "grid"; else if (v.si === 1) return key("Search"); else { view(t, { v: "settings" }); return "settings"; } } return ""; }
    const n = t.tiles.length;
    if (k === "Up" && v.gi >= 3) v.gi -= 3; else if (k === "Down") { if (v.gi + 3 < n) v.gi += 3; else if (Math.floor(v.gi / 3) < Math.floor((n - 1) / 3)) v.gi = n - 1; }
    else if (k === "Left") { if (v.gi % 3 === 0) v.zone = "side"; else v.gi--; } else if (k === "Right") { if (v.gi % 3 < 2 && v.gi + 1 < n) v.gi++; }
    else if (k === "Select") return open(t, t.tiles[v.gi]); else if (k === "Back") v.zone = "side";
    fixTop(v); return "";
  }
  if (v.v === "app") {
    if (k === "Back") { goHome(t); return "home"; }
    if (v.z === "hero") { if (k === "Down") v.z = "row"; else if (k === "Select") return play(t, v.app, titlesFor(v.app)[5]); }
    else { if (k === "Up") v.z = "hero"; else if (k === "Left") v.ri = Math.max(0, v.ri - 1); else if (k === "Right") v.ri = Math.min(4, v.ri + 1); else if (k === "Select") return play(t, v.app, titlesFor(v.app)[v.ri]); }
    return "";
  }
  if (v.v === "play") {
    v.ui = performance.now();
    if (k === "Back") { view(t, { v: "app", app: v.app, z: "row", ri: 0 }); return "stopped"; }
    if (k === "Play") { if (v.speed !== 1) { v.speed = 1; v.paused = false; } else v.paused = !v.paused; return v.paused ? "paused" : "playing"; }
    if (k === "Fwd") { v.paused = false; v.speed = v.speed < 2 ? 2 : v.speed === 2 ? 3 : 1; return v.speed === 1 ? "playing" : "fast-forward " + v.speed; }
    if (k === "Rev") { v.paused = false; v.speed = v.speed > -2 ? -2 : v.speed === -2 ? -3 : 1; return v.speed === 1 ? "playing" : "rewind " + -v.speed; }
    if (k === "InstantReplay") { v.pos = Math.max(0, v.pos - 7); return "back 7 s"; }
    if (k === "Left" || k === "Right") { v.pos = Math.max(0, Math.min(v.dur, v.pos + (k === "Right" ? 10 : -10))); return (k === "Right" ? "+" : "−") + "10 s"; }
    return "";
  }
  if (v.v === "search") {
    if (k === "Back") { goHome(t); return "home"; }
    const res = results(t);
    if (v.zone === "keys") {
      if (k === "Up") v.ki = Math.max(0, v.ki - 6); else if (k === "Down") v.ki = Math.min(KEYS.length - 1, v.ki + 6); else if (k === "Left") { if (v.ki % 6) v.ki--; } else if (k === "Right") { if (v.ki % 6 === 5 || v.ki === KEYS.length - 1) { if (res.length) { v.zone = "res"; v.ri = 0; } } else v.ki++; }
      else if (k === "Select") { const c = KEYS[v.ki]; t.q = c === "del" ? t.q.slice(0, -1) : (t.q + (c === "space" ? " " : c)).slice(0, 28); setKb(t.q); }
    } else {
      if (k === "Left") { if (v.ri % 3) v.ri--; else v.zone = "keys"; } else if (k === "Right") v.ri = Math.min(res.length - 1, v.ri + 1); else if (k === "Up") v.ri = Math.max(0, v.ri - 3); else if (k === "Down") v.ri = Math.min(res.length - 1, v.ri + 3); else if (k === "Select" && res[v.ri]) return open(t, res[v.ri]);
    }
    if (k === "Backspace") t.q = t.q.slice(0, -1); else if (k === "Enter" && res.length) { v.zone = "res"; v.ri = 0; }
    return "";
  }
  if (v.v === "tuner") { if (k === "Back") { goHome(t); return "home"; } if (k === "Up" || k === "ChannelUp") t.ch = (t.ch + 1) % TUNE.length; else if (k === "Down" || k === "ChannelDown") t.ch = (t.ch + TUNE.length - 1) % TUNE.length; else return ""; return "channel " + TUNE[t.ch]; }
  if (k === "Back") { goHome(t); return "home"; }
  return "";
}
function lit(ch) { // keyboard input only lands in a focused text field
  const t = cur(); if (!t.on) return null;
  if (t.v.v === "search") { t.q = (t.q + ch).slice(0, 28); return "typed"; }
  return "ignored: no text field has focus";
}

// ── the relay: the page asks, the relay checks the address and forwards to the TV ──
function send(k, opt) {
  const t = cur(); if (!t) return;
  const path = (opt && opt.verb ? "/" + opt.verb + "/" : "/keypress/") + k;
  if (t.real) { if (/^Power(On|Off)?$/.test(k)) powerReal(t, k); else ecp("POST", path).then(refresh); return; }
  if (!t.on) {
    if (!t.d.fast) { req("POST", k === "Power" ? "/keypress/PowerOn" : path, 0); if (!t.warned) { say(t.d.name + " is fully off, and its network went down with it. PowerOn needs Fast TV Start, which this TV doesn't have on. Tap the TV to press its physical power button."); t.warned = true; } return; }
    if (k === "PowerOn" || k === "Power") { req("POST", "/keypress/PowerOn", 200, "waking"); t.on = true; t.boot = performance.now(); goHome(t); draw(); return; }
    req("POST", path, 200, "standby: only PowerOn wakes it"); return;
  }
  if (k === "Power" || k === "PowerOff") { req("POST", "/keypress/PowerOff", 200, "standby"); t.on = false; t.warned = false; draw(); return; }
  if (t.boot) { req("POST", path, 200, "still booting"); return; }
  const note = key(k); req("POST", path, 200, note); draw();
}
function launch(id) {
  const t = cur(); if (!t) return;
  if (t.real) { ecp("POST", "/launch/" + id, (t.tiles.find((x) => x.id === id) || {}).n).then(refresh); return; } if (!t.on) { req("POST", "/launch/" + id, t.d.fast ? 200 : 0, t.d.fast ? "standby: only PowerOn wakes it" : ""); return; }
  const tile = t.tiles.find((x) => x.id === id); req("POST", "/launch/" + id, 200, open(t, tile)); draw();
}

// ── drawing the TV ──
const grad = (c) => "linear-gradient(135deg," + c + ", color-mix(in srgb," + c + " 55%, #000))";
const tileH = (a, f, extra) => '<div class="tile' + (f ? " f" : "") + '" style="background:' + grad(a.c) + '">' + esc(a.n) + (extra || "") + "</div>";
function draw() {
  const t = cur(), s = $("scr"); if (!t) return;
  if (t.real) {   // a real TV: what it told us, not a picture of its screen
    $("led").className = "led" + (t.on ? "" : " stby"); $("hops").textContent = "this phone → " + t.d.ip + ":8060";
    s.className = "scr real"; s.innerHTML = '<div class="rinfo"><b>' + esc(t.d.name) + "</b><span>" + esc([t.d.model, t.d.sw && "software " + t.d.sw].filter(Boolean).join(" · ")) + "</span><em>" + (t.on ? "on" : "standby or off") + "</em>"
      + '<div class="now"><small>on screen</small>' + esc(t.on ? t.active || "…" : "nothing: the TV is in standby") + "</div>"
      + (t.limited ? '<div class="warn"><b>Buttons blocked by the TV</b>On the TV: Settings › System › Advanced system settings › Control by mobile apps › <b>Enabled</b></div>'
        : !t.on ? '<div class="warn soft">Press ⏻ to wake it</div>' : "") + "</div>";
    return;
  }
  $("led").className = "led" + (t.on ? "" : " stby"); $("hops").textContent = "page → relay → " + t.d.ip + ":8060";
  document.querySelectorAll("#inputs button").forEach((b) => b.classList.toggle("on", t.on && ((t.v.v === "tuner" && b.dataset.k === "InputTuner") || (t.v.v === "input" && b.textContent === t.v.n))));
  if (!t.on) { s.className = "scr off"; s.innerHTML = ""; return; }
  s.className = "scr";
  if (t.boot) { s.innerHTML = '<div class="boot">demo·TV</div>'; return; }
  const v = t.v; let h = "";
  if (v.v === "home") {
    const side = ["Home", "Search", "Settings"].map((n, i) => '<div class="mi' + (v.zone === "side" && v.si === i ? " f" : "") + '">' + n + "</div>").join("");
    const vis = t.tiles.slice(v.top * 3, v.top * 3 + 9), more = t.tiles.length - (v.top * 3 + 9);
    h = '<div class="home"><div class="side"><div class="brand">demo<i>·TV</i></div>' + side + '<div class="clock">' + new Date().toTimeString().slice(0, 5) + '</div></div><div class="grid">' + vis.map((a, k) => tileH(a, v.zone === "grid" && v.gi === v.top * 3 + k)).join("") + (more > 0 ? '<div style="grid-column:1/-1;font-size:1.5cqw;color:#a79fd6">▼ ' + more + " more</div>" : "") + "</div></div>";
  } else if (v.v === "splash") h = '<div class="splash" style="background:' + grad(v.app.c) + '">' + esc(v.app.n) + "</div>";
  else if (v.app && v.v === "app") {
    const ts = titlesFor(v.app);
    h = '<div class="app"><div class="hd" style="color:' + v.app.c + ';filter:brightness(1.6)">' + esc(v.app.n) + '</div><div class="hero" style="background:' + grad(v.app.c) + ";" + (v.z === "hero" ? "outline:.35cqw solid #fff;outline-offset:.25cqw" : "") + '">' + esc(ts[5]) + '</div><div class="rowt">Continue watching</div><div class="row">' + ts.slice(0, 5).map((n, k) => tileH({ n, c: ["#334", "#433", "#343", "#344", "#434"][k] }, v.z === "row" && v.ri === k)).join("") + "</div></div>";
  } else if (v.v === "play") h = '<div class="play"><div class="v"></div>' + (t.cc ? '<div style="position:absolute;left:0;right:0;bottom:13cqw;text-align:center;font-size:2.2cqw"><span style="background:rgba(0,0,0,.75);padding:.3cqw 1cqw">[quiet synth music]</span></div>' : "") + '<div class="bar"><div class="st"><b>' + esc(v.title) + '</b><span class="sp"></span></div><div class="pr"><i></i></div><div class="st x"><span class="tm"></span><span>' + esc(v.app.n) + "</span></div></div></div>";
  else if (v.v === "search") {
    const res = results(t);
    h = '<div class="search"><div class="kbd"><div class="q' + (v.zone === "keys" ? " f" : "") + '">' + esc(t.q) + '<i></i></div><div class="keys">' + KEYS.map((c, i) => '<div class="key' + (v.zone === "keys" && v.ki === i ? " f" : "") + '">' + (c === "space" ? "␣" : c === "del" ? "⌫" : c) + "</div>").join("") + '</div></div><div class="res"><p>' + (t.q.trim() ? (res.length ? "Channels matching “" + esc(t.q.trim()) + "”" : "No channels match. A real TV searches every channel's catalogue too.") : "Popular") + "</p>" + res.map((a, i) => tileH(a, v.zone === "res" && v.ri === i)).join("") + "</div></div>";
  } else if (v.v === "settings") h = '<div class="settings"><h3>Settings · About</h3><dl><dt>Name</dt><dd>' + esc(t.d.name) + "</dd><dt>Model</dt><dd>" + esc(t.d.model) + "</dd><dt>Software</dt><dd>" + esc(t.d.sw) + "</dd><dt>IP address</dt><dd>" + esc(t.d.ip) + "</dd><dt>Fast TV Start</dt><dd>" + (t.d.fast ? "On: PowerOn works over the network" : "Off: once it's off, only its own button wakes it") + "</dd><dt>Control by mobile apps</dt><dd>Enabled (port 8060)</dd></dl></div>";
  else if (v.v === "input") h = '<div class="input"><div class="nosig">' + esc(v.n) + "<small>No signal</small></div></div>";
  else if (v.v === "tuner") h = '<div class="tuner"><b>Live TV · ' + TUNE[t.ch] + " · weak signal</b></div>";
  if (t.opts) h += '<div class="opts"><b>Options</b>' + t.opts.items.map((x, i) => '<span class="' + (i === t.opts.i ? "f" : "") + '">' + esc(x) + "</span>").join("") + "</div>";
  s.innerHTML = h; tick(performance.now(), true);
}
const fmt = (x) => { x = Math.max(0, Math.floor(x)); const m = Math.floor(x / 60), s = x % 60; return (m >= 60 ? Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
let lastT = performance.now();
function tick(now, once) {
  if (!once) requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - lastT) / 1000); if (!once) lastT = now;
  const t = cur(); if (!t || t.real) return;
  if (t.boot && now - t.boot > 1300) { t.boot = 0; draw(); return; }
  const osd = $("osd"), showOsd = t.on && !t.boot && now - t.osdAt < 1600;
  osd.hidden = !showOsd; if (showOsd) osd.innerHTML = (t.mute ? "🔇 Muted" : "🔉 " + t.vol) + '<span class="vb"><i style="width:' + (t.mute ? 0 : t.vol) + '%"></i></span>';
  if (!t.on || t.boot) return;
  const v = t.v;
  if (v.v === "play") {
    if (!once && !v.paused) v.pos = Math.max(0, Math.min(v.dur, v.pos + dt * SPD[v.speed]));
    const pv = document.querySelector(".play .v"); if (pv) pv.style.setProperty("--a", ((v.pos * 6) % 360) + "deg");
    const bar = document.querySelector(".play .bar"); if (bar) { bar.classList.toggle("hide", !v.paused && v.speed === 1 && now - v.ui > 3500); bar.querySelector(".pr i").style.width = (100 * v.pos) / v.dur + "%"; bar.querySelector(".tm").textContent = fmt(v.pos) + " / " + fmt(v.dur); bar.querySelector(".sp").textContent = v.paused ? "❚❚ paused" : v.speed > 1 ? "▶▶ " + v.speed : v.speed < 0 ? "◀◀ " + -v.speed : ""; }
  } else if (v.v === "input") { const n = document.querySelector(".nosig"); if (n) { n.style.left = 30 + 22 * Math.sin(now / 2300) + "%"; n.style.top = 38 + 22 * Math.sin(now / 1700 + 1) + "%"; } }
  else if (v.v === "home" && Math.floor(now / 1000) !== Math.floor((now - 16) / 1000)) { const c = document.querySelector(".clock"); if (c) c.textContent = new Date().toTimeString().slice(0, 5); }
}
requestAnimationFrame(tick);

// ── discovery and connecting ──
const xmlApps = (t) => "<apps>\n" + t.tiles.map((a) => '  <app id="' + a.id + '" type="' + (a.tvin ? "tvin" : "appl") + '" version="' + (a.tvin ? "1.0.0" : (hash(a.id) % 9) + "." + (hash(a.n) % 20) + ".0") + '">' + a.n + "</app>").join("\n") + "\n</apps>";
async function connectReal(t) {
  say("— " + t.d.name + " (" + t.d.ip + ") —", "x");
  const a = await ecp("GET", "/query/apps");
  if (a.status === 200) { t.tiles = [...String(a.body).matchAll(/<app id="([^"]+)"[^>]*type="([^"]*)"[^>]*>([^<]*)<\/app>/g)].map((x) => ({ id: x[1], n: x[3].replace(/&amp;/g, "&"), tvin: x[2] === "tvin", c: "#" + ((hash(x[1]) & 0x7f7f7f) | 0x202040).toString(16).padStart(6, "0") })); }
  $("apps").innerHTML = t.tiles.filter((x) => !x.tvin).map((x) => '<button data-app="' + esc(x.id) + '" style="background:' + grad(x.c) + '" title="POST /launch/' + esc(x.id) + '">' + esc(x.n) + "</button>").join("") || '<small class="x">No channels reported.</small>';
  if (t.on) { const c = await bridge("ecp", { ip: t.d.ip, method: "GET", path: "/query/media-player" });
    if (refused(c)) { t.limited = true; say(LIMITED(t)); } else if (c.status === 200) t.limited = false; }
  else if (!t.on) say(t.d.name + " is in standby. Press ⏻ to wake it.", "x");
  refresh(); draw();
}
function connect(to) {
  ip = to; store.set("rgm.tv", to); const t = cur(); $("dev").value = to; lastReq = null;
  if (t.real) return connectReal(t);
  say("— " + t.d.name + " (" + t.d.ip + ") —", "x");
  if (!t.on && !t.d.fast) { req("GET", "/query/device-info", 0); say(t.d.name + " doesn't answer: it's fully off. Tap the TV to switch it on at the set."); }
  else {
    req("GET", "/query/device-info", 200, "", "<device-info>\n  <friendly-device-name>" + t.d.name + "</friendly-device-name>\n  <model-name>" + t.d.model + "</model-name>\n  <is-tv>true</is-tv>\n  <software-version>" + t.d.sw + "</software-version>\n  <power-mode>" + (t.on ? "PowerOn" : "DisplayOff") + "</power-mode>\n  …\n</device-info>");
    req("GET", "/query/apps", 200, t.tiles.length + " entries", xmlApps(t));
    const act = t.v.v === "app" || t.v.v === "play" ? t.v.app : null; req("GET", "/query/active-app", 200, "", act ? '<active-app><app id="' + act.id + '">' + act.n + "</app></active-app>" : "<active-app><app>Home</app></active-app>");
  }
  $("apps").innerHTML = t.tiles.filter((a) => !a.tvin).map((a) => '<button data-app="' + a.id + '" style="background:' + grad(a.c) + '" title="POST /launch/' + a.id + '">' + esc(a.n) + "</button>").join("");
  draw();
}
function fillDevs() { const known = [...TV.values()]; $("dev").innerHTML = known.map((t) => '<option value="' + t.d.ip + '">' + esc(t.d.name) + " · " + t.d.ip + "</option>").join(""); if (ip) $("dev").value = ip; }
async function discoverReal(first) {
  lastReq = null; line('<span class="x">' + now() + '</span> <span class="m">SSDP</span> M-SEARCH * HTTP/1.1 → 239.255.255.250:1900 · looking for Rokus on this Wi-Fi…', "");
  const m = await bridge("discover");
  const found = (m.devices || []);
  found.forEach((x) => { realTV(x.ip, x.info); line('<span class="x">' + now() + '</span> <span class="ok">found</span> ' + esc(x.ip) + " · " + esc(tag(x.info, "user-device-name") || tag(x.info, "friendly-device-name") || "Roku")); });
  if (!found.length) { say(m.error ? "Discovery failed: " + m.error : "No Roku answered on this Wi-Fi. Check the phone is on the same network as the TV, and that Settings › System › Advanced system settings › Control by mobile apps is set to Enabled (or Permissive). You can also add a TV by its IP (Settings › Network › About shows it)."); }
  fillDevs();
  const saved = store.get("rgm.tv"), pick = TV.has(saved) && TV.get(saved).real ? saved : found.length ? found[0].ip : null;
  if (pick) connect(pick);
}
function discover(first) {
  if (REAL) return discoverReal(first);
  lastReq = null; line('<span class="x">' + now() + '</span> <span class="m">SSDP</span> M-SEARCH * HTTP/1.1 → 239.255.255.250:1900', ""); line(esc('MAN: "ssdp:discover"\nST: roku:ecp\nMX: 3'), "x");
  DEVS.forEach((d, k) => setTimeout(() => { line('<span class="x">' + now() + '</span> <span class="ok">HTTP/1.1 200 OK</span> from ' + d.ip); line(esc("ST: roku:ecp\nLOCATION: http://" + d.ip + ":8060/\nUSN: " + d.usn), "x"); lastReq = null;
    if (k === DEVS.length - 1) { fillDevs(); if (first) { const saved = store.get("rgm.tv"); connect(TV.has(saved) ? saved : DEVS[0].ip); } } }, 260 + k * 340));
}
$("disc").addEventListener("click", () => discover(false));
$("dev").addEventListener("change", (e) => connect(e.target.value));
$("addip").addEventListener("click", () => {
  const raw = $("ip").value.trim();
  if (!/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(raw)) { say("relay refused “" + raw + "”: not a plain IPv4 address. It won't reach for hostnames, ports or URLs.", "bad"); return; }
  if (TV.has(raw)) { connect(raw); return; }
  if (REAL) { bridge("info", { ip: raw }).then((m) => { if (m.status === 200) { realTV(raw, m.body); fillDevs(); connect(raw); store.set("rgm.extra", JSON.stringify([...new Set([raw].concat(JSON.parse(store.get("rgm.extra") || "[]")))])); } else { req("GET", "http://" + raw + ":8060/query/device-info", 0); say("Nothing at " + raw + " answered as a Roku. Check the address, and that Control by mobile apps is enabled on the TV."); } }); return; }
  lastReq = null; line('<span class="x">' + now() + '</span> <span class="m">GET</span> http://' + esc(raw) + ':8060/query/device-info <span class="bad">no answer after 3000 ms</span>'); say("Nothing at " + raw + " speaks ECP. (In this demo only the two simulated TVs answer; at home, this is how you add a TV that SSDP missed.)");
});
$("ip").addEventListener("keydown", (e) => { if (e.key === "Enter") $("addip").click(); });

// ── the remote ──
$("inputs").innerHTML = INPUTS.map((x) => '<button data-k="' + x[0] + '" title="POST /keypress/' + x[0] + '">' + x[1] + "</button>").join("");
$("inputs").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) send(b.dataset.k); });
$("apps").addEventListener("click", (e) => { const b = e.target.closest("[data-app]"); if (b) launch(b.dataset.app); });
const DPAD = new Set(["Up", "Down", "Left", "Right"]);
let hold = null;
function endHold() {
  if (!hold) return; clearTimeout(hold.t1); clearInterval(hold.t2); hold.b.classList.remove("on");
  if (hold.real) { if (hold.rep) ecp("POST", "/keyup/" + hold.k, "let go").then(refresh); else send(hold.k); hold = null; return; }   // the TV repeats it while held
  if (hold.rep) { req("POST", "/keyup/" + hold.k, 200, hold.rep + " repeats while held"); } else send(hold.k);
  hold = null;
}
const R = $("remote");
R.addEventListener("pointerdown", (e) => {
  const b = e.target.closest(".k[data-k]"); if (!b || e.button > 0) return;
  const k = b.dataset.k; b.classList.add("on");
  if (!DPAD.has(k)) { setTimeout(() => b.classList.remove("on"), 140); return; }
  e.preventDefault(); endHold();
  if (cur() && cur().real) { hold = { k, b, rep: 0, real: true, t1: setTimeout(() => { hold.rep = 1; ecp("POST", "/keydown/" + k, "held"); }, 380) }; return; }
  hold = { k, b, rep: 0, t1: setTimeout(() => { const t = cur(); if (!t || !t.on || t.boot) return; lastReq = null; req("POST", "/keydown/" + k, 200, "held"); hold.t2 = setInterval(() => { key(k); hold.rep++; draw(); }, 120); key(k); hold.rep = 1; draw(); }, 380) };
});
["pointerup", "pointercancel", "pointerleave"].forEach((ev) => R.addEventListener(ev, (e) => { if (hold && (ev !== "pointerleave" || e.target === hold.b)) endHold(); }, true));
R.addEventListener("click", (e) => { const b = e.target.closest(".k[data-k]"); if (!b) return; const k = b.dataset.k; if (DPAD.has(k) && e.detail > 0) return; send(k); });
$("tv").addEventListener("click", () => { const t = cur(); if (t && !t.real && !t.on) { say("Pressed the power button on the TV itself.", "x"); t.on = true; t.boot = performance.now(); goHome(t); draw(); } });

// the keyboard field: every character becomes Lit_<char>, deletions become Backspace
const kb = $("kb");
kb.addEventListener("input", () => {
  const nv = kb.value; let i = 0; while (i < kbPrev.length && i < nv.length && kbPrev[i] === nv[i]) i++;
  if (REAL && cur() && cur().real) { (async () => { for (let k = kbPrev.length; k > i; k--) await ecp("POST", "/keypress/Backspace"); for (const ch of nv.slice(i)) await ecp("POST", "/keypress/Lit_" + encodeURIComponent(ch)); })(); kbPrev = nv; return; }
  for (let k = kbPrev.length; k > i; k--) { const t = cur(); if (t && t.on && t.v.v === "search") t.q = t.q.slice(0, -1); req("POST", "/keypress/Backspace", t && t.on ? 200 : 0); }
  for (const ch of nv.slice(i)) { const r = lit(ch), t = cur(); req("POST", "/keypress/Lit_" + encodeURIComponent(ch), r === null && !t.d.fast ? 0 : 200, r === null ? (t.d.fast ? "standby" : "") : r); }
  kbPrev = nv; draw();
});
kb.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send("Enter"); } });
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, select, textarea")) return;
  const k = { ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Enter: "Select", Backspace: "Back", Escape: "Home" }[e.key]; if (!k) return;
  if (e.key === "Enter" && e.target.closest && e.target.closest("button")) return;
  e.preventDefault(); send(k);
});

if (REAL) {   // the app: real TVs only, and the ones added by hand come back
  TV.clear(); ip = null; document.querySelector(".top .pill").textContent = "live · your TVs"; document.querySelector(".top .pill").title = "Talking to the Rokus on this Wi-Fi, through the Eightysixty app.";
  try { JSON.parse(store.get("rgm.extra") || "[]").forEach((x) => bridge("info", { ip: x }).then((m) => { if (m.status === 200) { realTV(x, m.body); fillDevs(); } })); } catch (e) {}
}
discover(true);
window.RokuGodMode = { TV, send, launch, connect, cur: () => cur() };
})();
