/* Pi · in the browser. The phone build runs in Termux with 22 device tools; this one talks through Hive's free models and
   keeps the same character: no persona, only capability. Listening is the device's own speech recognition where there is
   one (Hive's Whisper otherwise); speaking degrades instead of going silent: Hive's neural voice, then the browser's
   voices, then text. The orb rides the real output amplitude. Tools that touch the outside world sit behind a
   confirmation gate keyed to a token, so a stray "no" in a later sentence can't be misread as an answer. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PERSONA = "You are Pi, a voice assistant running in the user's browser. Answer. Be brief: one to three short sentences, spoken aloud, so no lists or markdown. Don't apologize. Don't ask what they meant. Don't offer more help. Use a tool for device data instead of guessing.\n" +
  "TOOLS: to use one, reply with ONLY a line like TOOL: name {json args}. Available: time {} · battery {} · location {} · clipboard_read {} · clipboard_write {\"text\":...} · vibrate {\"ms\":...} · look {} (takes a camera photo and shows it to you) · timer {\"seconds\":...,\"label\":...} · open {\"url\":...} · share {\"text\":...}. " +
  "After a TOOL line you'll get a TOOL RESULT and then answer in plain words. Weather questions need no tool: just answer them.";
const TOOLS = ["time", "battery", "location", "clipboard", "vibrate", "look", "timer", "open", "share"];
const S = { msgs: [], model: null, busy: false, voice: true, tier: 0, gate: null };

let meter = null; // set while audio plays: returns the current output level

// ── the orb (the phone build's shader; brightness rides the real output amplitude) ──
const Orb = (() => {
  const cv = $("orb"), gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false }); let target = 0, amp = 0, hover = 0;
  if (!gl) { cv.style.background = "radial-gradient(circle,#d94030 0%,#000 68%)"; cv.style.borderRadius = "50%"; return { pulse() {} }; }
  const vs = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
  const fs = `precision highp float;varying vec2 v;uniform float u_t,u_a,u_h;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
  float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
  void main(){vec2 uv=(v-.5)*2.;float r=length(uv);if(r>1.03)discard;float t=u_t*.13;
    vec2 q=vec2(fbm(uv*2.1+t),fbm(uv*2.1+vec2(5.2,1.3)-t));vec2 w=vec2(fbm(uv*2.1+q*(1.4+u_a*1.7)+t*.7),fbm(uv*2.1+q*1.5+vec2(8.3,2.8)-t*.5));
    float f=fbm(uv*2.1+w*(1.1+u_a*1.3));vec3 cold=vec3(.78,.66,.43),hot=vec3(.69,.16,.10);vec3 c=mix(cold,hot,clamp(f*.55+u_a*.95,0.,1.));
    c*=.40+f*1.3+u_a*.4+u_h*.18;float e=1.-smoothstep(.70,1.,r);c*=e;c+=hot*exp(-r*r*2.4)*u_a*.6;gl_FragColor=vec4(c*e,e*.93);}`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const L = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(L); gl.vertexAttribPointer(L, 2, gl.FLOAT, false, 0, 0); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const uT = gl.getUniformLocation(pr, "u_t"), uA = gl.getUniformLocation(pr, "u_a"), uH = gl.getUniformLocation(pr, "u_h"), t0 = performance.now(), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("stage").addEventListener("pointerenter", () => (hover = 1)); $("stage").addEventListener("pointerleave", () => (hover = 0));
  (function loop() { const t = (performance.now() - t0) / 1000; if (meter) target = Math.max(target, meter()); target *= 0.9; amp += ((target + (reduce ? 0.05 : 0.05 + Math.sin(t * 0.85) * 0.035)) - amp) * 0.17;
    gl.uniform1f(uT, reduce ? 0 : t); gl.uniform1f(uA, amp); gl.uniform1f(uH, hover); gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3); requestAnimationFrame(loop); })();
  return { pulse: (v) => (target = Math.min(1.15, target + v)) };
})();

// ── chrome ──
function say(cls, html) { const d = document.createElement("div"); d.className = "m " + cls; d.innerHTML = html; $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight; return d; }
function state(t, cls) { $("state").textContent = t; $("stage").className = "stage " + (cls || ""); }
function tier(n) { S.tier = n; const el = $("tier"); el.className = "tier t" + n; el.textContent = "voice: " + ["text only", "neural", "device", "text only"][n]; }
$("tools").innerHTML = TOOLS.map((t) => '<span data-t="' + t + '">' + t + "</span>").join("");
const used = (t) => { const el = document.querySelector('#tools [data-t="' + t.replace(/_.*/, "") + '"]'); if (el) el.classList.add("used"); };

// ── speaking: neural (Hive) → device voices → text ──
let audioCtx = null;
async function speak(text) {
  if (!S.voice || !text) return tier(3);
  try {
    const r = await fetch("/api/hive/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 600) }) }).then((x) => x.json());
    if (!r.audio) throw new Error(r.error || "no audio");
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = await audioCtx.decodeAudioData(Uint8Array.from(atob(r.audio.split(",")[1]), (c) => c.charCodeAt(0)).buffer);
    const src = audioCtx.createBufferSource(), an = audioCtx.createAnalyser(); an.fftSize = 512; src.buffer = buf; src.connect(an); an.connect(audioCtx.destination);
    const data = new Uint8Array(an.fftSize); meter = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) s += ((v - 128) / 128) ** 2; return Math.min(1, Math.sqrt(s / data.length) * 4); };
    tier(1); state("speaking", "hot"); await new Promise((ok) => { src.onended = ok; src.start(); S.stop = () => { try { src.stop(); } catch (e) {} ok(); }; });
    meter = null; return;
  } catch (e) {}
  if ("speechSynthesis" in window) { // tier 2: the device's own voices (no amplitude to read, so the orb pulses on word boundaries)
    tier(2); state("speaking", "hot");
    await new Promise((ok) => { const u = new SpeechSynthesisUtterance(text); u.rate = 1.04; u.onboundary = () => Orb.pulse(0.35); u.onend = ok; u.onerror = ok; speechSynthesis.speak(u); S.stop = () => { speechSynthesis.cancel(); ok(); }; });
    return;
  }
  tier(3);
}

// ── listening: the device's recognizer, or Hive's Whisper ──
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, mediaRec = null;
async function listen() {
  if (S.stop) { S.stop(); S.stop = null; } // tap to interrupt
  if (rec || mediaRec) return stopListening();
  $("mic").classList.add("on"); state("listening", "listen");
  if (SR) {
    rec = new SR(); rec.lang = navigator.language || "en-US"; rec.interimResults = true; let final = "";
    rec.onresult = (e) => { let t = ""; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) final = t; } $("txt").value = t; Orb.pulse(0.08); };
    rec.onend = () => { rec = null; $("mic").classList.remove("on"); const t = (final || $("txt").value).trim(); if (t) { $("txt").value = ""; ask(t); } else state("tap the orb, then talk"); };
    rec.onerror = () => {}; rec.start(); return;
  }
  try { // record, then transcribe on the server
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks = []; mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = (e) => chunks.push(e.data);
    mediaRec.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); mediaRec = null; $("mic").classList.remove("on"); state("transcribing", "think");
      const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(new Blob(chunks, { type: chunks[0] && chunks[0].type || "audio/webm" })); });
      const r = await fetch("/api/hive/stt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audio: b64 }) }).then((x) => x.json()).catch(() => ({}));
      if (r.text) ask(r.text.trim()); else { say("sys", "Didn't catch that" + (r.error ? ": " + esc(r.error) : "") + "."); state("tap the orb, then talk"); } };
    mediaRec.start(); setTimeout(() => mediaRec && mediaRec.state === "recording" && mediaRec.stop(), 12000);
  } catch (e) { $("mic").classList.remove("on"); say("sys", "No microphone here. Type instead."); state("tap the orb, then talk"); }
}
function stopListening() { if (rec) rec.stop(); if (mediaRec && mediaRec.state === "recording") mediaRec.stop(); }

// ── device tools ──
async function snap() {
  const v = $("cam"), s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 960 } }); v.srcObject = s; await v.play(); await new Promise((r) => setTimeout(r, 400));
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); s.getTracks().forEach((t) => t.stop()); return c.toDataURL("image/jpeg", 0.8);
}
const OUTSIDE = new Set(["open", "share", "clipboard_write", "clipboard_read"]); // they touch something beyond this page: ask first
function gate(name, args) {
  const token = Math.random().toString(36).slice(2, 8); S.gate = token;
  $("gate").hidden = false; $("gate").innerHTML = "<span>Pi wants to <b>" + esc(name.replace("_", " ")) + "</b>" + (args.url ? " " + esc(args.url) : args.text ? ": “" + esc(String(args.text).slice(0, 60)) + "”" : "") + '</span><button class="yes" data-tok="' + token + '">Allow</button><button data-tok="' + token + '" data-no>Don\'t</button>';
  return new Promise((ok) => { $("gate").onclick = (e) => { const b = e.target.closest("button"); if (!b || b.dataset.tok !== S.gate) return; S.gate = null; $("gate").hidden = true; ok(!b.hasAttribute("data-no")); }; });
}
async function tool(name, args) {
  used(name);
  if (OUTSIDE.has(name) && !(await gate(name, args))) return "The user declined.";
  switch (name) {
    case "time": { const d = new Date(); return d.toLocaleString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " (" + Intl.DateTimeFormat().resolvedOptions().timeZone + ")"; }
    case "battery": { if (!navigator.getBattery) return "This browser doesn't report the battery."; const b = await navigator.getBattery(); return Math.round(b.level * 100) + "%" + (b.charging ? ", charging" : ", not charging"); }
    case "location": return await new Promise((ok) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => ok("lat " + p.coords.latitude.toFixed(4) + ", lon " + p.coords.longitude.toFixed(4) + " (±" + Math.round(p.coords.accuracy) + " m)"), (e) => ok("Location unavailable: " + e.message), { timeout: 10000 }) : ok("No location in this browser."));
    case "clipboard_read": try { return "Clipboard: " + (await navigator.clipboard.readText()).slice(0, 2000); } catch (e) { return "Couldn't read the clipboard."; }
    case "clipboard_write": try { await navigator.clipboard.writeText(String(args.text || "")); return "Copied."; } catch (e) { return "Couldn't write to the clipboard."; }
    case "vibrate": return navigator.vibrate && navigator.vibrate(Math.min(3000, +args.ms || 300)) ? "Vibrated." : "This device can't vibrate from the browser.";
    case "timer": { const s = Math.max(1, Math.min(86400, +args.seconds || 60)), label = String(args.label || "Timer"); setTimeout(() => { say("sys", "⏰ " + esc(label) + " is done."); navigator.vibrate && navigator.vibrate([300, 120, 300]); speak(label + " is done."); }, s * 1000); return "Timer set for " + s + " seconds."; }
    case "open": { const u = String(args.url || ""); if (!/^https?:\/\//.test(u)) return "That isn't a web address."; window.open(u, "_blank", "noopener"); return "Opened."; }
    case "share": try { await navigator.share({ text: String(args.text || "") }); return "Shared."; } catch (e) { return "Sharing isn't available or was cancelled."; }
    default: return "No such tool.";
  }
}

// ── one turn ──
async function model() {
  if (S.model) return S.model;
  const r = await fetch("/api/hive/models").then((x) => x.json()); const ms = r.models || [];
  S.model = (ms.find((m) => /llama-3\.3-70b|gpt-oss-120b/.test(m.id) && /^workers-ai/.test(m.id)) || ms.find((m) => /^workers-ai/.test(m.id)) || ms[0] || {}).id;
  if (!S.model) throw new Error("no model is available right now");
  return S.model;
}
async function chat(extraImage) {
  const msgs = S.msgs.slice(-12).map((m) => ({ role: m.role, text: m.text, images: m.images || [] }));
  if (extraImage) msgs[msgs.length - 1].images = [extraImage];
  const r = await fetch("/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: await model(), messages: msgs, system: PERSONA, voice: true }) }).then((x) => x.json());
  if (r.error) throw new Error(r.error); return String(r.text || "").trim();
}
async function ask(text) {
  if (S.busy || !text) return; S.busy = true; say("me", esc(text)); S.msgs.push({ role: "user", text }); state("thinking", "think");
  try {
    let reply = await chat(), image = null;
    for (let i = 0; i < 2; i++) { // up to two tool calls in a turn
      const m = reply.match(/^\s*TOOL:\s*([a-z_]+)\s*(\{[\s\S]*\})?\s*$/i); if (!m) break;
      let args = {}; try { args = m[2] ? JSON.parse(m[2]) : {}; } catch (e) {}
      const name = m[1].toLowerCase(); let result;
      if (name === "look") { try { image = await snap(); used("look"); say("sys", "📷 looked<img src=\"" + image + "\" alt=\"\">"); result = "Here is the photo."; } catch (e) { result = "No camera available."; } }
      else result = await tool(name, args);
      S.msgs.push({ role: "assistant", text: reply }, { role: "user", text: "TOOL RESULT (" + name + "): " + result + "\nNow answer the original request in plain words." });
      reply = await chat(name === "look" ? image : null);
    }
    reply = reply.replace(/^\s*TOOL:.*$/gim, "").trim() || "Done.";
    S.msgs.push({ role: "assistant", text: reply }); say("pi", esc(reply)); await speak(reply);
  } catch (e) { say("sys", esc(String(e.message || e))); }
  S.busy = false; S.stop = null; state("tap the orb, then talk");
}

$("stage").addEventListener("click", listen); $("mic").addEventListener("click", listen);
$("say").addEventListener("submit", (e) => { e.preventDefault(); const t = $("txt").value.trim(); $("txt").value = ""; ask(t); });
$("mute").addEventListener("click", () => { S.voice = !S.voice; $("mute").textContent = S.voice ? "🔊" : "🔇"; if (!S.voice && S.stop) S.stop(); });
tier(0); $("tier").textContent = "voice: ready";
say("sys", "Pi answers short, uses real device tools when it needs them, and asks before touching anything outside this page.");
window.Pi = { ask, tool, S };
})();
