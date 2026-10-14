// Hive · ears: how the voice link hears.
// The microphone becomes 16 kHz speech in 20 ms frames. A detector that learns the room decides when someone is really
// talking: hum, hiss, clicks and the tail of Hive's own voice never start a turn, so a recognizer is never handed silence
// to "hear" a phantom "you" in. One turn of speech then becomes words by either
//   flux     Deepgram Flux over a WebSocket (/api/hive/listen): words appear while you talk, and it ends the turn when
//            you've finished the thought, not merely paused
//   whisper  the trimmed clip to /api/hive/stt, sent early when you pause so the words are often ready when the pause ends
// Flux falls back to Whisper by itself when its socket can't be had.
(() => {
"use strict";
const RATE = 16000, FRAME = 320, FMS = 20, PRE = 20, ABS = 4e-6; // 16 kHz, 20 ms frames, 400 ms kept from before speech, quietest "speech" (≈ −54 dBFS)
const TAP = "class T extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(512);this.n=0}process(i){const c=i[0]&&i[0][0];if(c)for(let k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===512){this.port.postMessage(this.b.slice(0));this.n=0}}return true}}registerProcessor('hive-tap',T)";

// the context's rate (44.1/48 kHz) → 16 kHz: a box filter as the anti-alias, then linear interpolation; state carries over
function resampler(from) {
  if (from === RATE) return (x) => x;
  const step = from / RATE, L = Math.max(1, Math.round(step)); let tail = new Float32Array(0), t = L;
  return (x) => {
    const buf = new Float32Array(tail.length + x.length); buf.set(tail); buf.set(x, tail.length);
    const avg = (i) => { let s = 0; for (let k = 0; k < L; k++) s += buf[i - k]; return s / L; }, out = [];
    while (t + 1 < buf.length) { const i = Math.floor(t), f = t - i; out.push((1 - f) * avg(i) + f * avg(i + 1)); t += step; }
    const keep = Math.max(0, Math.floor(t) - L); tail = buf.slice(keep); t -= keep; return Float32Array.from(out);
  };
}
// 16-bit PCM WAV, base64 data URL (what /stt takes)
function wav(frames) {
  const n = frames.reduce((a, f) => a + f.length, 0), dv = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, s) => [...s].forEach((c, k) => dv.setUint8(o + k, c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * 2, true);
  let o = 44; for (const f of frames) for (let k = 0; k < f.length; k++, o += 2) dv.setInt16(o, Math.max(-1, Math.min(1, f[k])) * 0x7fff, true);
  const u8 = new Uint8Array(dv.buffer); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return "data:audio/wav;base64," + btoa(s);
}
const pcm16 = (frames) => { const n = frames.reduce((a, f) => a + f.length, 0), out = new Int16Array(n); let o = 0; for (const f of frames) for (let k = 0; k < f.length; k++) out[o++] = Math.max(-1, Math.min(1, f[k])) * 0x7fff; return out.buffer; };
// what Whisper says when there's nothing to hear (the classic ones), and words a thought rarely ends on
const PHANTOM = /^(you|thank you|thanks for watching|thank you for watching|bye|bye bye|subtitles by.*|amara\.org.*|\.+|♪+)[.!?]*$/i;
const DANGLING = /(,|\b(and|but|so|or|because|the|a|an|to|of|with|um|uh|like|if|then|that|which|my|your|is|are|was|for|about))[.…]?$/i;
const unsure = (c) => c.length > 0 && (c.reduce((a, b) => a + b, 0) / c.length < 0.8 || Math.min(...c) < 0.4); // Flux's per-word confidence
const phantom = (t, voicedMs, engine) => { t = String(t || "").trim(); if (!/[\p{L}\p{N}]/u.test(t)) return true; if (/^you[.!?]*$/i.test(t)) return true; return engine !== "flux" && PHANTOM.test(t) && voicedMs < 450; }; // Flux doesn't invent words for silence; Whisper does

class Ear {
  static async open(ac, stream) { const e = new Ear(ac, stream); await e.wire(); return e; }
  constructor(ac, stream) {
    Object.assign(this, { ac, stream, rs: resampler(ac.sampleRate), acc: new Float32Array(FRAME), an: 0, ring: [], lo: [], n: 0, floor: 0, cal: [], hp: 0, px: 0, hist: [], level: 0, loud: 0, inSpeech: false, onset: -1, lastOn: -99, cur: null, fluxOff: 0 });
  }
  async wire() {
    this.src = this.ac.createMediaStreamSource(this.stream); this.mute = this.ac.createGain(); this.mute.gain.value = 0; this.mute.connect(this.ac.destination); // nodes only run when they lead somewhere
    try { if (!this.ac.audioWorklet || !window.AudioWorkletNode) throw new Error("no worklet"); const u = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" })); await this.ac.audioWorklet.addModule(u); URL.revokeObjectURL(u);
      this.node = new AudioWorkletNode(this.ac, "hive-tap"); this.node.port.onmessage = (e) => this.feed(e.data); }
    catch (x) { this.node = this.ac.createScriptProcessor(1024, 1, 1); this.node.onaudioprocess = (e) => this.feed(e.inputBuffer.getChannelData(0).slice(0)); }
    this.src.connect(this.node); this.node.connect(this.mute);
  }
  feed(x) { const y = this.rs(x); for (let i = 0; i < y.length; i++) { this.acc[this.an++] = y[i]; if (this.an === FRAME) { const f = this.acc; this.acc = new Float32Array(FRAME); this.an = 0; this.frame(f); } } }
  frame(f) {
    let e = 0, z = 0, prev = 0; // energy after a hum/DC blocker, and how often the wave crosses zero (hiss and clicks cross constantly; voices don't)
    for (let i = 0; i < f.length; i++) { const y = f[i] - this.px + 0.97 * this.hp; this.px = f[i]; this.hp = y; e += y * y; if (i && (y >= 0) !== (prev >= 0)) z++; prev = y; }
    e /= f.length; const zcr = z / f.length; this.n++;
    if (this.n <= 10) { this.cal.push(e); this.floor = this.cal.slice().sort((a, b) => a - b)[this.cal.length >> 1]; } // the first 200 ms: the room
    const fl = Math.max(this.floor, 1e-10), on = this.inSpeech ? e > Math.max(fl * 4, ABS / 2) : e > Math.max(fl * 8, ABS), voiced = on && zcr < 0.25;
    if (!this.inSpeech && this.n > 10) this.floor = e < fl ? fl * 0.85 + e * 0.15 : fl * 0.997 + e * 0.003; // falls fast, rises slowly
    this.lo.push(e); if (this.lo.length > 150) this.lo.shift(); // and never sits below the quietest moment of the last 3 s: speech always has gaps,
    if (this.lo.length === 150 && this.n % 5 === 0) { const m = Math.min(...this.lo) * 0.8; if (m > this.floor) this.floor = m; } // a fan or hum that starts mid-talk doesn't, so it becomes the floor
    this.hist.push(on ? (voiced ? 2 : 1) : 0); if (this.hist.length > 10) this.hist.shift();
    if (on) this.lastOn = this.n;
    if (!this.inSpeech && this.hist.filter(Boolean).length >= 6 && this.hist.filter((h) => h === 2).length >= 3) { this.inSpeech = true; this.onset = this.n - this.hist.length + this.hist.findIndex(Boolean) + 1; } // 120 ms of the last 200, some of it voiced
    if (this.inSpeech && this.n - this.lastOn > 15) this.inSpeech = false;
    const db = 10 * Math.log10(e / fl); this.level += (Math.max(0, Math.min(1, (db - 3) / 30)) - this.level) * 0.4; this.loud = this.inSpeech && e > fl * 30 ? this.loud + FMS : 0;
    this.ring.push({ f, on, n: this.n }); if (this.ring.length > 60) this.ring.shift(); // 1.2 s
    if (this.cur) this.cur.frame({ f, on, n: this.n });
  }
  turn(o) { if (this.cur) this.cur.cancel(); return new Promise((done) => { this.cur = new Turn(this, o || {}, (r) => { this.cur = null; done(r); }); }); }
  stop() { if (this.cur) this.cur.stop(); }   // push-to-talk released
  cancel() { if (this.cur) this.cur.cancel(); } // paused or ended: the turn resolves with nothing
  close() { this.cancel(); try { this.src.disconnect(); this.node.disconnect(); this.mute.disconnect(); } catch (e) {} if (this.node.port) this.node.port.onmessage = null; }
}

class Turn {
  constructor(ear, o, done) {
    Object.assign(this, { ear, o, done, frames: [], phase: "wait", t0: ear.n, guard: Math.round((o.guard || 0) / FMS), voiced: 0, last: ear.n, partial: "", pieces: [], confs: [], words: [], eotAt: 0, since: 0, gen: 0, spec: null, specN: 0, extra: 0, extended: false, sock: null, sent: 0, dead: false });
    this.engine = o.engine === "whisper" || !window.WebSocket ? "whisper" : "flux";
    if (o.ptt) this.begin([]);
  }
  frame(x) {
    if (this.phase === "wait") { // hands-free: wait for real speech, but not while Hive's own voice may still be ringing in the room
      const e = this.ear; // speech that began inside the guard still counts once it has gone on too long to be an echo's tail
      if (x.n - this.t0 > this.guard && e.inSpeech && (e.onset > this.t0 + this.guard || x.n - e.onset > 30)) this.begin(e.ring.filter((r) => r.n >= e.onset - PRE));
      return;
    }
    if (this.phase !== "speech") return;
    this.frames.push(x); if (x.on) { this.voiced++; this.last = x.n; this.resumed(); if (this.eotAt && ++this.since >= 4) this.eotAt = 0; } // 80 ms of voice after Flux's end of turn: he's carrying on
    if (this.sock && this.sock.readyState === 1) this.flush();
    if (this.frames.length * FMS > 60000) return this.end();
    this.tick((x.n - this.last) * FMS);
  }
  begin(pre) {
    this.phase = "speech"; this.frames = pre.slice(); this.voiced = pre.filter((r) => r.on).length; this.last = pre.length ? pre[pre.length - 1].n : this.ear.n;
    if (this.o.onStart) this.o.onStart();
    this.dead = this.engine !== "flux" || Date.now() < this.ear.fluxOff; // Flux failed to open a moment ago: Whisper for a while
    if (!this.dead) this.connect();
  }
  // ── flux: stream from the first syllable (and 400 ms before it); the server says when the thought is finished ──
  connect() {
    const sil = this.o.silence || 900, q = new URLSearchParams({ rate: String(RATE), eot: Math.max(0.6, Math.min(0.9, 0.7 + (sil - 800) / 6000)).toFixed(2), wait: String(Math.max(3000, Math.min(8000, sil * 4))) }); // "pause before answering" makes Flux surer, and more patient
    if (this.o.keyterm) q.set("kt", this.o.keyterm);
    let s; try { s = this.sock = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/hive/listen?" + q); } catch (e) { return this.fail("no socket: " + e.message); }
    s.binaryType = "arraybuffer"; const t0 = performance.now();
    s.onopen = () => { this.openMs = performance.now() - t0; this.flush(); };
    s.onmessage = (e) => { if (typeof e.data !== "string" || this.sock !== s) return; let j; try { j = JSON.parse(e.data); } catch (x) { return; } if (j && j.response && typeof j.response === "object") j = j.response;
      const ev = j.event || j.type; if (ev === "Error" || j.error) return this.fail(String(j.error || j.description || j.message || "recognizer error"));
      if (typeof j.transcript === "string" && j.transcript.trim()) { this.partial = j.transcript.trim(); this.words = (j.words || []).map((w) => +w.confidence).filter(isFinite); if (this.o.onPartial) this.o.onPartial(this.heard()); }
      if (ev === "StartOfTurn" && this.eotAt) this.eotAt = 0;
      // Flux's end of turn is necessary but not enough: "Good morning, Genesis." is a complete sentence, and he may be about to ask
      // the question. The turn ends when Flux thinks the thought is done AND the pause has lasted his "patience" (tick).
      if (ev === "EndOfTurn") { const t = String(j.transcript || this.partial || "").trim(), c = (j.words || []).map((w) => +w.confidence).filter(isFinite); this.partial = ""; this.words = [];
        if (t) { this.pieces.push(t); this.confs.push(...c); this.eotAt = this.ear.n; this.since = 0; if (this.o.onPartial) this.o.onPartial(this.heard());
          if (unsure(c) && !this.spec) { this.spec = this.transcribe(true); this.specN = this.frames.length; } } // Flux wasn't sure of some words: Whisper checks the clip while the pause runs
        else if (!this.pieces.length) this.finish("", "flux"); }
    };
    s.onerror = () => { if (this.sock === s) this.fail("socket error"); };
    s.onclose = (e) => { if (this.sock === s && this.phase === "speech") this.fail("socket closed" + (e.code ? " (" + e.code + (e.reason ? " " + e.reason : "") + ")" : "")); };
  }
  flush() { // 80 ms packets, as Flux likes them
    const s = this.sock; if (!s || s.readyState !== 1) return;
    while (this.frames.length - this.sent >= 4 || (this.flushAll && this.sent < this.frames.length)) { const part = this.frames.slice(this.sent, this.sent + 4); this.sent += part.length; try { s.send(pcm16(part.map((r) => r.f))); } catch (e) { return this.fail("send failed"); } }
  }
  fail(why) { // no Flux this turn (and for a while, if it never opened): Whisper takes the clip instead
    if (this.dead) return; this.dead = true; this.why = why; if (!this.openMs) this.ear.fluxOff = Date.now() + 5 * 60e3;
    this.drop(); if (this.phase === "speech" && this.o.ptt && this.stopped) this.decide();
  }
  heard() { return [...this.pieces, this.partial].filter(Boolean).join(" ").trim(); }
  async final() { // Flux's words, unless it wasn't sure of them and Whisper has the clip in hand (or nearly: up to 2.5 s)
    if (this.deciding || this.phase !== "speech") return; this.deciding = true; const g = this.gen, text = this.heard();
    if (unsure([...this.confs, ...this.words]) && this.voiced >= 12) {
      const fresh = !this.spec || this.frames.slice(this.specN).some((r) => r.on), p = fresh ? this.transcribe(true) : this.spec;
      const r = await Promise.race([p.catch(() => null), new Promise((ok) => setTimeout(() => ok(null), 2500))]);
      if (g !== this.gen || this.phase !== "speech") return; // he started talking again: the turn goes on
      if (r && r.text && !phantom(r.text, this.voiced * FMS, "whisper")) return this.finish(r.text, "flux+whisper", r);
    }
    this.finish(text, "flux");
  }
  drop() { const s = this.sock; this.sock = null; if (s) { s.onclose = s.onerror = s.onmessage = null; try { s.close(1000, "done"); } catch (e) {} } }
  tick(sil) {
    if (this.engine === "flux" && !this.dead) {
      if (this.eotAt && (this.stopped || sil >= Math.max(500, this.o.silence || 900))) return this.final();
      // a socket that has gone quiet: what it heard so far, else Whisper
      if (this.stopped && performance.now() - this.stopped > 1800) return this.heard() ? this.finish(this.heard(), "flux") : this.fail("no words after release");
      if (sil > Math.max(4500, (this.o.silence || 900) * 4)) return this.heard() ? this.finish(this.heard(), "flux") : this.voiced < 12 ? this.reset() : this.fail("no end of turn");
      return;
    }
    if (this.o.ptt && !this.stopped) return; // push-to-talk: the button ends it
    const hang = (this.o.silence || 900) * (this.voiced * FMS < 1200 ? 1.35 : 1) + this.extra;
    if (!this.spec && !this.deciding && !this.o.ptt && sil >= 450 && this.voiced >= 12) { this.spec = this.transcribe(); this.specN = this.frames.length; } // early: often ready when the pause is over
    if (sil >= hang || this.stopped) this.decide();
  }
  resumed() { if (this.deciding || this.spec) { this.gen++; this.deciding = false; this.spec = null; } this.extra = 0; this.extended = false; } // speech came back: whatever was being decided is stale
  async decide() {
    if (this.deciding || this.phase !== "speech") return; this.deciding = true; const g = ++this.gen;
    if (this.voiced < 12) return this.o.ptt ? this.end() : this.reset(); // under 240 ms of speech: a cough, a door, a word from the TV
    const voicedSince = this.frames.slice(this.specN).some((r) => r.on), p = this.spec && !voicedSince ? this.spec : this.transcribe(); this.spec = null;
    let r; try { r = await p; } catch (e) { r = { error: e.message }; }
    if (g !== this.gen || this.phase !== "speech") return;
    this.deciding = false;
    if (r.error) { if (this.o.onError) this.o.onError(r.error); return this.o.ptt ? this.end() : this.reset(); }
    if (!this.o.ptt && !this.extended && DANGLING.test(String(r.text || "").trim())) { this.extended = true; this.extra = 1500; this.spec = Promise.resolve(r); this.specN = this.frames.length; return; } // "so I was thinking that…": give it a moment more
    this.finish(r.text, "whisper", r);
  }
  transcribe(quiet) {
    const fr = this.frames, first = fr.findIndex((r) => r.on), lastI = fr.length - 1 - [...fr].reverse().findIndex((r) => r.on);
    const clip = first < 0 ? [] : fr.slice(Math.max(0, first - 15), Math.min(fr.length, lastI + 13)).map((r) => r.f), t0 = performance.now(); // 300 ms before the first sound, 260 ms after the last
    if (this.o.onSend && !quiet) this.o.onSend();
    return fetch("/api/hive/stt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audio: wav(clip), lang: this.o.lang || "", ms: this.voiced * FMS, kt: this.o.keyterm || "" }) })
      .then((r) => r.json().catch(() => ({ error: "the server said " + r.status }))).then((j) => (j.error ? { error: j.error } : { text: String(j.text || "").trim(), ms: performance.now() - t0, dropped: j.dropped }));
  }
  finish(text, engine, r) {
    if (this.phase !== "speech") return; text = String(text || "").trim();
    if (phantom(text, this.voiced * FMS, engine)) { if (this.o.onNoise) this.o.onNoise(text); return this.o.ptt ? this.end() : this.reset(); }
    this.phase = "done"; this.drop(); this.done({ text, engine, voicedMs: this.voiced * FMS, sttMs: r && r.ms, openMs: this.openMs, why: this.why });
  }
  reset() { // it was noise: keep waiting for real speech (no guard this time; Hive isn't talking)
    this.drop(); Object.assign(this, { phase: "wait", frames: [], voiced: 0, partial: "", pieces: [], confs: [], words: [], eotAt: 0, since: 0, spec: null, specN: 0, extra: 0, extended: false, sent: 0, dead: false, deciding: false, flushAll: false, t0: this.ear.n, guard: 0 }); this.gen++;
    if (this.o.onWait) this.o.onWait();
  }
  stop() { // push-to-talk released: Flux gets half a second of quiet to close the turn on, Whisper gets the clip
    if (this.phase !== "speech" || this.stopped) return; this.stopped = performance.now();
    if (this.engine === "flux" && !this.dead) { for (let k = 0; k < 25; k++) this.frames.push({ f: new Float32Array(FRAME), on: false, n: this.ear.n }); this.flushAll = true; this.flush(); }
    else this.decide();
  }
  end() { if (this.phase === "done") return; this.phase = "done"; this.drop(); this.done(null); }
  cancel() { this.gen++; this.end(); }
}

window.HiveEars = { open: (ac, stream) => Ear.open(ac, stream), phantom, _test: { resampler, wav, pcm16, Ear, Turn, DANGLING } };
})();
