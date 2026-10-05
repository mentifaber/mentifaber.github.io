// Barycenter · the live line and voice calls.
// The live line is a WebSocket that stays open while the app is on screen. The server only relays: every frame is sealed in the
// browser with the space key first (touch, typing, call setup), so it sees sizes and timing and nothing else. When there is
// no socket, nothing breaks: the app falls back to polling, and the message path is exactly the same either way.
(() => {
"use strict";
const L = (B.Live = { state: "off", rtt: 0, present: false, sent: 0, got: 0, h: {}, on(t, f) { (L.h[t] = L.h[t] || []).push(f); } });
let ws = null, retry = 0, pingT = 0, pingAt = 0, hideT = 0, wantOn = false, fails = 0;
const emit = (t, a, b) => (L.h[t] || []).forEach((f) => { try { f(a, b); } catch (e) { console.error(e); } });
function open() {
  if (!wantOn || ws || !B.KEY) return;
  let s; try { s = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/us/live"); } catch (e) { return later(); }
  ws = s; s.onopen = () => { fails = 0; retry = 0; L.state = "live"; clearInterval(pingT); pingT = setInterval(() => { if (s.readyState === 1) { pingAt = performance.now(); s.send("ping"); } }, 20000); pingAt = performance.now(); s.send("ping"); emit("state"); };
  s.onmessage = async (e) => {
    L.got++; if (e.data === "pong") { L.rtt = Math.round(performance.now() - pingAt); emit("state"); return; }
    let j; try { j = JSON.parse(e.data); } catch (x) { return; }
    if (j.t === "hi") { L.present = !!j.pres; emit("pres", L.present); emit("state"); } else if (j.t === "pres") { L.present = !!j.on; emit("pres", L.present); emit("state"); } else if (j.t === "poke") emit("poke");
    else if (j.s && j.i) { let o; try { o = JSON.parse(B.dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: B.unb64(j.i) }, B.KEY, B.unb64(j.s)))); } catch (x) { return; } if (o && o.t) emit(o.t, o); }
  };
  s.onclose = () => { if (ws === s) ws = null; clearInterval(pingT); L.state = wantOn ? (fails > 3 ? "poll" : "off") : "off"; L.present = false; emit("pres", false); emit("state"); if (wantOn) { fails++; later(); } };
  s.onerror = () => { try { s.close(); } catch (e) {} };
}
function later() { clearTimeout(L.rt); L.rt = setTimeout(open, Math.min(30000, 800 * 2 ** Math.min(retry++, 6)) + Math.random() * 400); }
L.start = () => { wantOn = true; open(); };
L.stop = () => { wantOn = false; clearTimeout(L.rt); if (ws) try { ws.close(); } catch (e) {} ws = null; L.state = "off"; };
L.send = async (o) => { if (!ws || ws.readyState !== 1 || !B.KEY) return false; const sl = await B.seal(o); if (!ws || ws.readyState !== 1) return false; ws.send(JSON.stringify({ s: sl.ct, i: sl.iv })); L.sent++; return true; };
// the socket only lives while the app is on screen: your presence is honest, and the battery thanks you
document.addEventListener("visibilitychange", () => { clearTimeout(hideT); if (document.visibilityState === "visible") { if (wantOn && !ws) { retry = 0; open(); } } else hideT = setTimeout(() => { if (ws) try { ws.close(); } catch (e) {} }, 25000); });

// ── touch, typing ───────────────────────────────────────────────────────────────────────────
let lastT = 0, keep = 0;
L.touch = (x, y, down) => { const now = performance.now(); if (down === 2 && now - lastT < 50) return; lastT = now; L.send({ t: "tc", x: +x.toFixed(3), y: +y.toFixed(3), d: down ? 1 : 0 }); clearInterval(keep); if (down) keep = setInterval(() => L.send({ t: "tc", x: +B.vs.local.x.toFixed(3), y: +B.vs.local.y.toFixed(3), d: 1 }), 700); };
L.on("tc", (o) => B.Void.remote(o.x, o.y, o.d));
L.on("ty", (o) => { B.vs.typing = performance.now(); B.vs.typingText = o.x || ""; L.typing && L.typing(o); });

// ── voice calls over WebRTC. The media goes phone to phone; the live line only carries the sealed setup ──
const C = (B.Call = { state: "idle", muted: false, t0: 0, onState: null });
let pc = null, local = null, pendingOffer = null, ice = [], ringT = 0, ctxA = null, anaT = 0;
const set = (s, info) => { C.state = s; C.onState && C.onState(s, info); };
function mk() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  pc.onicecandidate = (e) => { if (e.candidate) L.send({ t: "sig", k: "ice", c: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => { if (pc && pc.connectionState === "connected") { C.t0 = Date.now(); clearTimeout(ringT); set("connected"); } else if (pc && (pc.connectionState === "failed" || pc.connectionState === "closed")) C.end(true); };
  pc.ontrack = (e) => { let a = B.$("callaudio"); a.srcObject = e.streams[0]; a.play().catch(() => {}); level(e.streams[0]); };
  local.getTracks().forEach((t) => pc.addTrack(t, local));
}
function level(stream) { try { ctxA = ctxA || new (window.AudioContext || window.webkitAudioContext)(); const an = ctxA.createAnalyser(); an.fftSize = 256; ctxA.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.frequencyBinCount); clearInterval(anaT); anaT = setInterval(() => { an.getByteFrequencyData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]; B.Void.voice(Math.min(1, s / buf.length / 90)); }, 60); } catch (e) {} }
const mic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
C.start = async () => {
  if (C.state !== "idle") return; if (!L.present) return set("idle", { absent: true });
  try { local = await mic(); } catch (e) { return set("idle", { nomic: true }); }
  mk(); set("calling"); const o = await pc.createOffer(); await pc.setLocalDescription(o); L.send({ t: "sig", k: "offer", sdp: o.sdp }); ringT = setTimeout(() => { if (C.state === "calling") C.end(false, true); }, 45000);
};
C.accept = async () => {
  if (C.state !== "incoming" || !pendingOffer) return;
  try { local = await mic(); } catch (e) { L.send({ t: "sig", k: "bye" }); pendingOffer = null; return set("idle", { nomic: true }); }
  mk(); await pc.setRemoteDescription({ type: "offer", sdp: pendingOffer }); pendingOffer = null; for (const c of ice.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  const a = await pc.createAnswer(); await pc.setLocalDescription(a); L.send({ t: "sig", k: "answer", sdp: a.sdp }); set("connecting");
};
C.mute = () => { C.muted = !C.muted; if (local) local.getAudioTracks().forEach((t) => (t.enabled = !C.muted)); return C.muted; };
C.end = (remote, timeout) => { const was = C.state; if (!remote && was !== "idle") L.send({ t: "sig", k: "bye" }); clearTimeout(ringT); clearInterval(anaT); if (pc) { try { pc.close(); } catch (e) {} pc = null; } if (local) { local.getTracks().forEach((t) => t.stop()); local = null; } pendingOffer = null; ice = []; const a = B.$("callaudio"); if (a) a.srcObject = null; const dur = C.t0 ? Date.now() - C.t0 : 0; C.t0 = 0; C.muted = false; set("idle", { ended: was !== "idle", dur, timeout, missed: remote && was === "incoming" }); };
L.on("sig", async (o) => {
  if (o.k === "offer") { if (C.state !== "idle") return L.send({ t: "sig", k: "bye" }); pendingOffer = o.sdp; ice = []; set("incoming"); clearTimeout(ringT); ringT = setTimeout(() => { if (C.state === "incoming") C.end(true); }, 45000); }
  else if (o.k === "answer" && pc) { await pc.setRemoteDescription({ type: "answer", sdp: o.sdp }).catch(() => {}); for (const c of ice.splice(0)) await pc.addIceCandidate(c).catch(() => {}); }
  else if (o.k === "ice") { if (pc && pc.remoteDescription) await pc.addIceCandidate(o.c).catch(() => {}); else ice.push(o.c); }
  else if (o.k === "bye") C.end(true);
});
L.on("pres", (on) => { if (!on && C.state !== "idle" && C.state !== "connected") C.end(true); });
})();
