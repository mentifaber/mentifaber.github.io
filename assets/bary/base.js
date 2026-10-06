// Barycenter · base: utilities, settings, themes and fonts, sound, haptics, crypto, and the server wire.
// Everything lives on one global, B, shared by void.js (the renderer), live.js (the live line + calls) and app.js.
(() => {
"use strict";
const B = (window.B = {});
const enc = new TextEncoder(), dec = new TextDecoder();
B.$ = (id) => document.getElementById(id);
B.esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
B.store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
B.b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
B.unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
B.b64u = (u8) => B.b64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
B.unb64u = (s) => B.unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
B.hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
B.unhex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
B.sha = async (u8) => new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
B.sha256hex = async (u8) => B.hex(await B.sha(u8));
B.slug = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
B.enc = enc; B.dec = dec;

// ── settings: one object, saved on this device only ─────────────────────────────────────────
const DEF = { theme: "space", font: "signal", size: 100, density: "cozy", layout: "bubbles", quality: "auto", saver: "auto", vol: 60, pack: "soft", haptics: true, ambient: false, tilt: true, collapse: "sight", live: "typing", fps: false, stage: false, qh: false, qs: 22, qe: 7, cme: "", cher: "", motion: "full", lock: "", lockMin: 1 };
B.cfg = (() => { let o = {}; try { o = JSON.parse(B.store.get("us-set") || "{}"); } catch (e) {} return { ...DEF, ...o }; })();
const subs = new Set(); B.onCfg = (f) => subs.add(f);
B.set = (k, v) => { B.cfg[k] = v; B.store.set("us-set", JSON.stringify(B.cfg)); B.apply(k); subs.forEach((f) => f(k)); };

// ── themes: a palette each. a/b are the two stars; light themes flip how the void blends ─────
B.THEMES = {
  space:    { name: "Deep space", a: "#7fd8ff", b: "#ffc66b", mode: "dark",  neb: ["#2a2f8f", "#5a2a7a", "#0f3a5a"] },
  aurora:   { name: "Aurora",     a: "#6dffc0", b: "#c58bff", mode: "dark",  neb: ["#0f6b5a", "#4a2a8f", "#0a3a4a"] },
  solar:    { name: "Solar",      a: "#ffb347", b: "#ff6b8a", mode: "dark",  neb: ["#8f3a0f", "#7a1f3a", "#4a2a0a"] },
  hologram: { name: "Hologram",   a: "#3df5ff", b: "#ff4fd8", mode: "dark",  neb: ["#0a5a7a", "#7a0a6a", "#101a5a"] },
  terminal: { name: "Terminal",   a: "#7dff9a", b: "#ffd24a", mode: "dark",  neb: ["#0a3a1a", "#1a3a0a", "#0a2a2a"] },
  glass:    { name: "Daylight glass", a: "#1f6fff", b: "#e0457b", mode: "light", neb: ["#bcd2ff", "#ffd0e4", "#d0f0ff"] },
  oled:     { name: "True black", a: "#8ab4ff", b: "#ffb86b", mode: "dark",  neb: ["#0b1030", "#1a0b30", "#04141f"] },
  paper:    { name: "Paper",      a: "#2f6f5e", b: "#b5532e", mode: "light", neb: ["#efe3c8", "#f3d9c4", "#e4ead6"] },
  sakura:   { name: "Sakura",     a: "#e0457b", b: "#8a5cff", mode: "light", neb: ["#ffd6e6", "#e6dcff", "#ffe9d6"] },
};
// ── fonts: the feel of the words. Only the one you pick is ever downloaded ──────────────────
B.FONTS = {
  signal:   { name: "Signal",   body: '"Space Grotesk",system-ui,sans-serif', head: '"Space Grotesk",system-ui,sans-serif', css: "Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;600" },
  atelier:  { name: "Atelier",  body: '"EB Garamond",Georgia,serif', head: '"Mentifaber Display",Georgia,serif', css: "EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;600" },
  terminal: { name: "Terminal", body: '"JetBrains Mono",ui-monospace,monospace', head: '"JetBrains Mono",ui-monospace,monospace', css: "JetBrains+Mono:wght@400;600;800" },
  rounded:  { name: "Rounded",  body: '"Nunito",system-ui,sans-serif', head: '"Nunito",system-ui,sans-serif', css: "Nunito:wght@400;600;800&family=JetBrains+Mono:wght@400;600" },
  plain:    { name: "Plain",    body: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', head: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', css: "" },
};
const loaded = new Set();
function loadFont(css) { if (!css || loaded.has(css)) return; loaded.add(css); const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + css + "&display=swap"; document.head.appendChild(l); }
B.who = { first: true };
B.palette = () => { const t = B.THEMES[B.cfg.theme] || B.THEMES.space, ok = (c) => /^#[0-9a-f]{6}$/i.test(c || ""); return { me: ok(B.cfg.cme) ? B.cfg.cme : B.who.first ? t.a : t.b, her: ok(B.cfg.cher) ? B.cfg.cher : B.who.first ? t.b : t.a, t }; };
B.apply = () => {
  const r = document.documentElement, f = B.FONTS[B.cfg.font] || B.FONTS.signal, p = B.palette();
  r.dataset.theme = B.cfg.theme; r.dataset.density = B.cfg.density; r.dataset.layout = B.cfg.layout; r.dataset.mode = p.t.mode; r.dataset.motion = B.cfg.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
  r.style.setProperty("--me", p.me); r.style.setProperty("--her", p.her); r.style.setProperty("--f-body", f.body); r.style.setProperty("--f-head", f.head);
  r.style.setProperty("--fs", (B.cfg.size / 100) * 17 + "px"); r.style.colorScheme = p.t.mode;
  loadFont(f.css); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(r).getPropertyValue("--bg").trim() || "#05060f";
  if (B.Void) B.Void.restyle();
};

// ── sound: everything is synthesized, nothing is downloaded ─────────────────────────────────
let ac = null, master = null, amb = null;
const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.connect(ac.destination); } catch (e) { return null; } } if (ac.state === "suspended") ac.resume().catch(() => {}); master.gain.value = (B.cfg.vol / 100) * .5; return ac; };
function tone(f, t0, dur, type, vol, f2) { const a = ac, o = a.createOscillator(), g = a.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, a.currentTime + t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, a.currentTime + t0 + dur); g.gain.setValueAtTime(0, a.currentTime + t0); g.gain.linearRampToValueAtTime(vol, a.currentTime + t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t0 + dur); o.connect(g); g.connect(master); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + .05); }
// three sound packs: soft (sines), crystal (bell-like partials), retro (square chiptune). Every event exists in each.
const PACKS = {
  soft: { send: () => tone(520, 0, .16, "sine", .5, 880), arrive: () => { tone(660, 0, .5, "sine", .5); tone(990, .09, .6, "sine", .35); }, pulse: () => { tone(330, 0, .7, "triangle", .5); tone(495, .12, .7, "sine", .3); }, touch: () => tone(220, 0, .35, "sine", .4, 330), contact: () => { tone(262, 0, 1.2, "sine", .5); tone(392, 0, 1.2, "sine", .4); tone(523, .05, 1.3, "sine", .3); }, ring: () => { tone(740, 0, .25, "sine", .5); tone(988, .3, .25, "sine", .5); }, open: () => tone(400, 0, .5, "sine", .35, 1200), tick: () => tone(1200, 0, .03, "sine", .15), pop: () => tone(300, 0, .12, "sine", .5, 900), fx: () => { tone(523, 0, .3, "sine", .4); tone(659, .08, .3, "sine", .4); tone(784, .16, .5, "sine", .4); } },
  crystal: { send: () => { tone(1568, 0, .5, "sine", .3); tone(2349, 0, .4, "sine", .15); }, arrive: () => { for (const [i, f] of [1319, 1760, 2093].entries()) { tone(f, i * .07, .8, "sine", .28); tone(f * 2.76, i * .07, .3, "sine", .08); } }, pulse: () => { tone(988, 0, .9, "sine", .3); tone(1480, .1, .9, "sine", .22); }, touch: () => tone(880, 0, .4, "sine", .25, 1320), contact: () => { for (const [i, f] of [523, 784, 1047, 1568].entries()) tone(f, i * .09, 1.3, "sine", .26); }, ring: () => { tone(1760, 0, .4, "sine", .3); tone(2349, .35, .4, "sine", .3); }, open: () => tone(800, 0, .6, "sine", .25, 2400), tick: () => tone(2400, 0, .04, "sine", .1), pop: () => tone(1200, 0, .15, "sine", .3, 2000), fx: () => { for (const [i, f] of [1047, 1319, 1568, 2093].entries()) tone(f, i * .07, .6, "sine", .25); } },
  retro: { send: () => { tone(440, 0, .07, "square", .18); tone(880, .07, .09, "square", .18); }, arrive: () => { tone(659, 0, .08, "square", .2); tone(784, .09, .08, "square", .2); tone(1047, .18, .14, "square", .2); }, pulse: () => { tone(392, 0, .1, "square", .2); tone(523, .1, .1, "square", .2); tone(659, .2, .16, "square", .2); }, touch: () => tone(330, 0, .08, "square", .18, 660), contact: () => { for (const [i, f] of [262, 330, 392, 523, 659].entries()) tone(f, i * .08, .12, "square", .2); }, ring: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 880 : 660, i * .1, .09, "square", .2); }, open: () => tone(300, 0, .25, "square", .15, 1200), tick: () => tone(1800, 0, .02, "square", .1), pop: () => tone(200, 0, .08, "square", .25, 800), fx: () => { for (let i = 0; i < 6; i++) tone(400 + i * 120, i * .05, .08, "square", .18); } },
};
const SOS_SND = () => { for (let i = 0; i < 3; i++) { tone(880, i * .3, .22, "square", .35); tone(660, i * .3 + .15, .15, "square", .3); } };
// quiet hours silence tones and buzzes (not SOS): set in Feel
B.quiet = () => { if (!B.cfg.qh) return false; const h = new Date().getHours(), s = +B.cfg.qs, e = +B.cfg.qe; return s > e ? h >= s || h < e : h >= s && h < e; };
B.snd = (n) => { if (!B.cfg.vol || (n !== "sos" && B.quiet())) return; if (!ctx()) return; try { if (n === "sos") SOS_SND(); else { const P = PACKS[B.cfg.pack] || PACKS.soft; P[n] && P[n](); } } catch (e) {} };
B.ambient = (on) => { if (!on) { if (amb) { try { amb.g.gain.linearRampToValueAtTime(0, ac.currentTime + 1); const x = amb; setTimeout(() => { x.o.forEach((o) => { try { o.stop(); } catch (e) {} }); }, 1200); } catch (e) {} amb = null; } return; } if (amb || !ctx()) return; const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(.06, ac.currentTime + 3); g.connect(master); const o = [55, 82.4, 110.3].map((f, i) => { const x = ac.createOscillator(); x.type = "sine"; x.frequency.value = f; const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = .05 + i * .03; lg.gain.value = .6; l.connect(lg); lg.connect(x.frequency); l.start(); x.connect(g); x.start(); return x; }); amb = { g, o }; };
// ── haptics ─────────────────────────────────────────────────────────────────────────────────
B.hap = (p, force) => { if (!B.cfg.haptics || (B.quiet() && !force)) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

// ── crypto: one space key, wrapped under each person's password ─────────────────────────────
const ITER = 600000;
async function pbk(secret, salt) { const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
B.wrapKey = async (raw, secret) => { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), k = await pbk(secret, salt), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, raw)), out = new Uint8Array(28 + ct.length); out.set(salt); out.set(iv, 16); out.set(ct, 28); return B.b64(out); };
B.unwrapKey = async (w, secret) => { const u = B.unb64(w), k = await pbk(secret, u.subarray(0, 16)); return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(16, 28) }, k, u.subarray(28))); };
B.importKey = (raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
B.loginProof = (user, pass) => MFSeal.proof("us", user + "\0" + pass);
B.verifierOf = async (user, pass) => B.sha256hex(B.unhex(await B.loginProof(user, pass)));
B.KEY = null; B.RAW = null; B.locked = false;
B.setKey = async (raw) => { B.RAW = raw; B.KEY = await B.importKey(raw); };
B.seal = async (obj) => { const iv = crypto.getRandomValues(new Uint8Array(12)); return { ct: B.b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, B.KEY, enc.encode(JSON.stringify(obj))))), iv: B.b64(iv) }; };
B.open = async (m) => { try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: B.unb64(m.iv) }, B.KEY, B.unb64(m.ct)))); } catch (e) { return { k: "lost" }; } };
B.sealBytes = async (u8) => { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, B.KEY, u8)), out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; };
B.openBytes = async (buf) => { const u = new Uint8Array(buf); return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, B.KEY, u.subarray(12))); };
// a fingerprint of the key both of you hold: twelve points that make a constellation, and four words to read aloud
B.fingerprint = async () => { const h = await B.sha(B.RAW), pts = []; for (let i = 0; i < 12; i++) pts.push([h[i * 2] / 255, h[i * 2 + 1] / 255]); const W = ["amber", "birch", "cedar", "delta", "ember", "fjord", "grove", "harbor", "iris", "juniper", "kelp", "lumen", "meadow", "nova", "onyx", "pearl", "quartz", "river", "sable", "tundra", "umber", "velvet", "willow", "xenon", "yarrow", "zephyr", "aurora", "basalt", "coral", "dune", "echo", "flint"]; return { pts, words: [h[24], h[25], h[26], h[27]].map((x) => W[x % 32]).join(" · "), short: B.hex(h.subarray(0, 4)) }; };

// ── the wire ────────────────────────────────────────────────────────────────────────────────
B.api = async (path, o) => {
  let r; try { r = await fetch("/api/us/" + path, { credentials: "same-origin", cache: "no-store", ...(o || {}) }); } catch (e) { throw { offline: true }; }
  if (r.status === 401) throw { auth: true };
  const j = await r.json().catch(() => ({})); if (!r.ok) throw { err: j.error || "something went wrong (" + r.status + ")", status: r.status };
  return j;
};
B.post = (path, body) => B.api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });

// ── a little time ───────────────────────────────────────────────────────────────────────────
B.dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
B.ago = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 45 ? "just now" : s < 3600 ? Math.round(s / 60) + "m ago" : s < 86400 ? Math.round(s / 3600) + "h ago" : Math.round(s / 86400) + "d ago"; };
B.hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
B.dayLabel = (ts) => { const d = new Date(ts), t = new Date(); if (B.dayKey(d) === B.dayKey(t)) return "Today"; if (B.dayKey(d) === B.dayKey(new Date(t.getTime() - 864e5))) return "Yesterday"; return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" }); };
B.when = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
B.toast = (t) => { const el = B.$("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(B.toast.t); B.toast.t = setTimeout(() => el.classList.remove("on"), 2600); };

// ── tilt: the phone is a window. Gyro where there is one, the pointer where there isn't ─────
B.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
B.startTilt = async () => {
  if (B.tilt.on) return; B.tilt.on = true;
  const upd = (x, y) => { B.tilt.tx = Math.max(-1, Math.min(1, x)); B.tilt.ty = Math.max(-1, Math.min(1, y)); };
  addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") upd((e.clientX / innerWidth - .5) * 2, (e.clientY / innerHeight - .5) * 2); }, { passive: true });
  const go = () => addEventListener("deviceorientation", (e) => { if (e.gamma != null) upd(e.gamma / 30, (e.beta - 45) / 30); }, { passive: true });
  try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) addEventListener("pointerdown", async function f() { removeEventListener("pointerdown", f); try { if ((await DeviceOrientationEvent.requestPermission()) === "granted") go(); } catch (e) {} }, { once: true }); else go(); } catch (e) {}
};

// ── local first: this device keeps every record it has seen (still sealed) in IndexedDB, so the app opens and reads offline ──
B.db = (() => {
  let db = null;
  const open = () => new Promise((res) => { try { const r = indexedDB.open("barycenter", 1); r.onupgradeneeded = () => { r.result.createObjectStore("m", { keyPath: "id" }); r.result.createObjectStore("k"); }; r.onsuccess = () => { db = r.result; res(db); }; r.onerror = r.onblocked = () => res(null); } catch (e) { res(null); } });
  const tx = async (st, mode, f) => { const d = db || (await open()); if (!d) return null; return new Promise((res) => { try { const t = d.transaction(st, mode), out = f(t.objectStore(st)); t.oncomplete = () => res(out && "result" in out ? out.result : true); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } }); };
  return { all: () => tx("m", "readonly", (s) => s.getAll()), put: (rs) => tx("m", "readwrite", (s) => { rs.forEach((r) => s.put(r)); }), del: (ids) => tx("m", "readwrite", (s) => { ids.forEach((i) => s.delete(i)); }), get: (k) => tx("k", "readonly", (s) => s.get(k)), set: (k, v) => tx("k", "readwrite", (s) => { s.put(v, k); }), wipe: () => new Promise((res) => { try { if (db) db.close(); db = null; const r = indexedDB.deleteDatabase("barycenter"); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } }) };
})();

// ── words: *bold* _italic_ ~strike~ `code`, links, and big emoji. Always escaped first. ──────
const URLRE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g;
B.fmt = (t) => String(t == null ? "" : t).split(URLRE).map((part, i) => i % 2 ? '<a href="' + B.esc(part) + '" target="_blank" rel="noopener noreferrer">' + B.esc(part) + "</a>" : B.esc(part).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?])/g, "$1<b>$2</b>").replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, "$1<i>$2</i>").replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?])/g, "$1<s>$2</s>")).join("");
B.jumbo = (t) => { const s = String(t || "").trim(); if (!s || s.length > 24) return false; const em = s.match(/\p{Extended_Pictographic}/gu); return !!em && em.length <= 3 && s.replace(/\p{Extended_Pictographic}|‍|️|\s/gu, "") === ""; };
// ── where she is: great-circle distance and compass bearing ─────────────────────────────────
B.geo = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r, h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2, d = 2 * R * Math.asin(Math.sqrt(h)), y = Math.sin(dLon) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dLon); return { d, brg: (Math.atan2(y, x) / r + 360) % 360 }; };
B.dist = (m) => m < 950 ? Math.round(m / 10) * 10 + " m" : m < 20000 ? (m / 1000).toFixed(1) + " km" : Math.round(m / 1000) + " km";
B.dir = (b) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(b / 45) % 8];
B.mm = (ms) => { const s = Math.max(0, Math.floor(ms / 1e3)); return s >= 86400 ? Math.floor(s / 86400) + "d " + Math.floor(s % 86400 / 3600) + "h" : s >= 3600 ? Math.floor(s / 3600) + "h " + Math.floor(s % 3600 / 60) + "m" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
})();
