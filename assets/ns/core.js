// NULLSPACE · core: utilities, this device's operator identity, frequencies and their keys, sealing, settings and themes, local
// storage, and the synthesized sound. Everything else hangs off one global, NS.
(() => {
"use strict";
const NS = (window.NS = {});
const enc = new TextEncoder(), dec = new TextDecoder();
NS.enc = enc; NS.dec = dec;
NS.$ = (id) => document.getElementById(id);
NS.esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
NS.b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
NS.unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
NS.b64u = (u8) => NS.b64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
NS.unb64u = (s) => NS.unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
NS.hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
NS.rid = (n = 8) => NS.hex(crypto.getRandomValues(new Uint8Array(n)));
NS.sha = async (u8) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof u8 === "string" ? enc.encode(u8) : u8));
NS.pad2 = (n) => String(n).padStart(2, "0");
NS.clock = (ts) => { const d = new Date(ts); return NS.pad2(d.getHours()) + ":" + NS.pad2(d.getMinutes()) + ":" + NS.pad2(d.getSeconds()); };
NS.ago = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 45 ? "now" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };

// ── profiles: one browser can hold several operators (?profile=name), which is also how two tabs become two radios ──
NS.profile = (new URLSearchParams(location.search).get("profile") || "main").replace(/[^a-z0-9_-]/gi, "").slice(0, 16) || "main";
const P = "ns:" + NS.profile + ":";
NS.store = { get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { v == null ? localStorage.removeItem(P + k) : localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} } };

// ── settings ─────────────────────────────────────────────────────────────────────────────────
const DEF = { theme: "noir", fx: "med", sound: 70, keys: true, route: "auto", bridge: false, burn: 0, boot: true, haptics: true, rfMax: 80 };
NS.cfg = { ...DEF, ...NS.store.get("cfg", {}) };
const subs = new Set(); NS.onCfg = (f) => subs.add(f);
NS.set = (k, v) => { NS.cfg[k] = v; NS.store.set("cfg", NS.cfg); NS.apply(); subs.forEach((f) => f(k)); };
NS.THEMES = {
  noir:    { name: "NEON NOIR", a: "#00f0ff", b: "#ff2bd6", c: "#f5ff3b" },
  arasaka: { name: "ARASAKA",   a: "#ff1f3d", b: "#f2f2f2", c: "#ff8a00" },
  acid:    { name: "ACID",      a: "#a6ff00", b: "#00ffa2", c: "#ffe600" },
  synth:   { name: "SYNTHWAVE", a: "#ff7a18", b: "#b14cff", c: "#2de2e6" },
  ice:     { name: "ICE",       a: "#9ff4ff", b: "#ffffff", c: "#5a8dff" },
  amber:   { name: "AMBER CRT", a: "#ffb000", b: "#ffd480", c: "#ff6a00" },
};
NS.apply = () => { const r = document.documentElement, t = NS.THEMES[NS.cfg.theme] || NS.THEMES.noir; r.dataset.theme = NS.cfg.theme; r.dataset.fx = NS.cfg.fx; r.style.setProperty("--a", t.a); r.style.setProperty("--b", t.b); r.style.setProperty("--c", t.c); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = "#05040a"; };

// ── the operator: who this device is. A random node id, a handle, a colour, and a sigil drawn from the id ──
NS.me = NS.store.get("me", null);
NS.saveMe = () => NS.store.set("me", NS.me);
NS.newMe = (handle) => { NS.me = { node: NS.rid(8), handle: NS.cleanHandle(handle) || "ghost", color: NS.THEMES[NS.cfg.theme].a, at: Date.now() }; NS.saveMe(); return NS.me; };
NS.cleanHandle = (h) => String(h || "").replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 16);
NS.dev = NS.store.get("dev", null) || (() => { const d = NS.rid(8); NS.store.set("dev", d); return d; })();
// a 5x5 mirrored glyph, the same everywhere for the same node id: a face you can recognise across devices and radios
NS.sigil = (node, color, size = 20) => { let h = 0; for (const ch of String(node)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const cells = []; for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { h = (h * 1103515245 + 12345) >>> 0; if ((h >>> 16) & 1) { cells.push([x, y]); if (x < 2) cells.push([4 - x, y]); } } const px = size / 5; return '<svg class="sig" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" aria-hidden="true">' + cells.map(([x, y]) => '<rect x="' + (x * px).toFixed(1) + '" y="' + (y * px).toFixed(1) + '" width="' + px.toFixed(1) + '" height="' + px.toFixed(1) + '" fill="' + color + '"/>').join("") + "</svg>"; };

// ── frequencies: a name, a 256-bit key, and the tag the relay knows it by. Shared as a tune code or link ──
NS.freqs = NS.store.get("freqs", []);
NS.saveFreqs = () => NS.store.set("freqs", NS.freqs);
NS.tagOf = async (key) => NS.hex((await NS.sha("nullspace-frequency:" + key)).subarray(0, 16));
NS.mhz = (tag) => { const n = parseInt(tag.slice(0, 6), 16); return (100 + (n % 8000) / 100).toFixed(3); }; // a made-up dial position, just so frequencies have numbers
NS.addFreq = async (key, name) => { const tag = await NS.tagOf(key); let f = NS.freqs.find((x) => x.tag === tag); if (!f) { f = { tag, key, name: String(name || "FREQ").slice(0, 24), rf: -1, at: Date.now() }; NS.freqs.push(f); NS.saveFreqs(); } return f; };
NS.newKey = () => NS.b64u(crypto.getRandomValues(new Uint8Array(32)));
NS.tuneLink = (f) => location.origin + "/nullspace#tune=" + f.key + "." + NS.b64u(enc.encode(f.name));
NS.parseTune = (t) => { t = String(t || "").trim(); let m = t.match(/tune=([A-Za-z0-9_-]{43})(?:\.([A-Za-z0-9_-]*))?/) || t.match(/^NS-([A-Za-z0-9_-]{43})(?:\.([A-Za-z0-9_-]*))?$/); if (!m) return null; let name = "FREQ"; try { if (m[2]) name = dec.decode(NS.unb64u(m[2])); } catch (e) {} return { key: m[1], name }; };
const keys = new Map();
const keyOf = async (f) => { let k = keys.get(f.tag); if (!k) { k = await crypto.subtle.importKey("raw", NS.unb64u(f.key), "AES-GCM", false, ["encrypt", "decrypt"]); keys.set(f.tag, k); } return k; };
NS.seal = async (f, obj) => { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(f), enc.encode(JSON.stringify(obj)))); return { ct: NS.b64(ct), iv: NS.b64(iv), raw: { iv, ct } }; };
NS.open = async (f, ct, iv) => { try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: typeof iv === "string" ? NS.unb64(iv) : iv }, await keyOf(f), typeof ct === "string" ? NS.unb64(ct) : ct))); } catch (e) { return null; } };
NS.sealBytes = async (f, u8) => { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(f), u8)), out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; };
NS.openBytes = async (f, buf) => { const u = new Uint8Array(buf); return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, await keyOf(f), u.subarray(12))); };
NS.fingerprint = async (f) => { const h = await NS.sha(NS.unb64u(f.key)); return NS.hex(h.subarray(0, 6)).toUpperCase().match(/../g).join(":"); };

// ── over the radio a message has to be tiny: "NS1" + a 6-character frequency tag + sealed binary, all as text so any mesh carries it ──
// Inside: kind(1) id(8) node(4) time(4) handle-length(1) handle text. With the 28 bytes of IV and GCM tag that is ~50 bytes plus the words.
NS.RF_PREFIX = "NS1";
NS.unhex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
NS.rfTag = (f) => NS.b64u(NS.unhex(f.tag.slice(0, 8)));
NS.RF_KINDS = ["msg", "loc", "ping"];
NS.rfBytes = (o) => { const h = enc.encode(String(o.h || "").slice(0, 16)), t = enc.encode(o.t || ""), b = new Uint8Array(18 + h.length + t.length), dv = new DataView(b.buffer); b[0] = Math.max(0, NS.RF_KINDS.indexOf(o.k || "msg")); b.set(NS.unhex(o.id), 1); b.set(NS.unhex((o.n || "00000000").slice(0, 8)), 9); dv.setUint32(13, Math.floor((o.at || Date.now()) / 1000)); b[17] = h.length; b.set(h, 18); b.set(t, 18 + h.length); return b; };
NS.rfObj = (b) => { const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), hl = b[17]; return { k: NS.RF_KINDS[b[0]] || "msg", id: NS.hex(b.subarray(1, 9)), n: NS.hex(b.subarray(9, 13)), at: dv.getUint32(13) * 1000, h: dec.decode(b.subarray(18, 18 + hl)), t: dec.decode(b.subarray(18 + hl)) }; };
NS.rfPack = async (f, o) => { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(f), NS.rfBytes(o))), body = new Uint8Array(12 + ct.length); body.set(iv); body.set(ct, 12); return NS.RF_PREFIX + NS.rfTag(f) + NS.b64u(body); };
NS.rfUnpack = async (text) => { const i = String(text).indexOf(NS.RF_PREFIX); if (i < 0) return null; text = text.slice(i); const tag = text.slice(3, 9), f = NS.freqs.find((x) => NS.rfTag(x) === tag); if (!f) return { unknown: true }; try { const u = NS.unb64u(text.slice(9).trim()), pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, await keyOf(f), u.subarray(12))); return { f, o: NS.rfObj(pt) }; } catch (e) { return { bad: true }; } };
// how many bytes of words fit, for a radio whose text field holds `chars` characters
NS.rfRoom = (chars, handle) => Math.max(0, Math.floor((chars - 9) * 3 / 4) - 28 - 18 - enc.encode(handle || "").length);

// ── local history: every transmission this device has seen, in IndexedDB (the deck opens and reads with no signal at all) ──
NS.db = (() => {
  let db = null; const name = "nullspace-" + NS.profile;
  const open = () => new Promise((res) => { try { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => { r.result.createObjectStore("tx", { keyPath: "k" }); }; r.onsuccess = () => { db = r.result; res(db); }; r.onerror = r.onblocked = () => res(null); } catch (e) { res(null); } });
  const tx = async (mode, f) => { const d = db || (await open()); if (!d) return null; return new Promise((res) => { try { const t = d.transaction("tx", mode), out = f(t.objectStore("tx")); t.oncomplete = () => res(out && "result" in out ? out.result : true); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } }); };
  return { all: (tag) => tx("readonly", (s) => s.getAll(IDBKeyRange.bound(tag + "|", tag + "|￿"))), put: (rs) => tx("readwrite", (s) => { rs.forEach((r) => s.put(r)); }), del: (ks) => tx("readwrite", (s) => { ks.forEach((k) => s.delete(k)); }), wipe: () => new Promise((res) => { try { if (db) db.close(); db = null; const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } }) };
})();

// ── sound: synthesized blips, nothing downloaded ─────────────────────────────────────────────
let ac = null, master = null;
const actx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.connect(ac.destination); } catch (e) { return null; } } if (ac.state === "suspended") ac.resume().catch(() => {}); master.gain.value = (NS.cfg.sound / 100) * .35; return ac; };
function tone(f, t0, dur, type, vol, f2) { const a = ac, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, a.currentTime + t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, a.currentTime + t0 + dur); g.gain.setValueAtTime(0, a.currentTime + t0); g.gain.linearRampToValueAtTime(vol, a.currentTime + t0 + .005); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t0 + dur); o.connect(g); g.connect(master); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + .03); }
const SND = {
  key: () => tone(1800 + Math.random() * 400, 0, .018, "square", .05),
  send: () => { tone(880, 0, .06, "square", .18); tone(1320, .05, .08, "square", .15); tone(1760, .1, .1, "sawtooth", .08, 3520); },
  net: () => { tone(1320, 0, .05, "square", .16); tone(990, .06, .09, "square", .14); },
  rf: () => { for (let i = 0; i < 4; i++) tone(600 + i * 220, i * .04, .05, "sawtooth", .12); tone(2400, .18, .12, "sine", .1, 1200); },
  err: () => { tone(160, 0, .18, "sawtooth", .25); tone(120, .1, .2, "square", .2); },
  boot: () => { for (let i = 0; i < 6; i++) tone(220 * Math.pow(1.26, i), i * .07, .09, "square", .1); tone(1760, .5, .4, "sine", .12, 880); },
  ping: () => tone(2200, 0, .12, "sine", .2, 3300),
  link: () => { tone(440, 0, .08, "square", .15); tone(660, .08, .08, "square", .15); tone(990, .16, .2, "square", .15); },
};
NS.snd = (n) => { if (!NS.cfg.sound || (n === "key" && !NS.cfg.keys)) return; if (!actx()) return; try { SND[n] && SND[n](); } catch (e) {} };
NS.hap = (p) => { if (!NS.cfg.haptics) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
})();
