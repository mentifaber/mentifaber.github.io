// MENTIFABER AGENT 1.0: an open model kept in this site's own R2 bucket and run in a Cloudflare Container on this
// domain. Nothing here touches Workers AI or any outside API at run time.
//   seed   : the model file is copied from Hugging Face into R2 in 64 MiB pieces (an R2 multipart upload driven by
//            this Durable Object's alarm, so it survives restarts and needs no keys or laptop).
//   wake   : the container starts, pulls the file from R2 through /api/agent/weights (a one-time token proves it's
//            ours), loads it into llama.cpp and serves an OpenAI-style API on port 8080.
//   use    : Hive and any app call /api/agent/v1/chat/completions; requests are proxied into the container.
//   sleep  : after 20 idle minutes the container is stopped, so it only costs while it's being used.
import { DurableObject } from "cloudflare:workers";

export const AGENT = { name: "MENTIFABER AGENT 1.0", alias: "mentifaber-agent-1.0" };
export const AGENT_MODELS = { // the largest that fits a standard-4 container (4 vCPU, 12 GiB) first
  "14b": { label: "Qwen3 14B · Q4_K_M", url: "https://huggingface.co/Qwen/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf", size: 9001752960, key: "agent/qwen3-14b-q4_k_m.gguf" },
  "8b": { label: "Qwen3 8B · Q4_K_M", url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf", size: 5027783488, key: "agent/qwen3-8b-q4_k_m.gguf" },
};
const IDLE = 20 * 60e3, READY_WAIT = 240e3, PUBLIC_DAY = 40, REPLY_MIN = 1024;
// How much conversation the model can hold: whatever the 12 GiB container has left after the weights. The memory per
// token is halved by keeping it 8-bit (q8_0), so Qwen3 14B gets 16K tokens and 8B the full 32K.
export const ctxFor = (size) => Math.max(4096, Math.min(32768, Math.floor((10.6e9 - size) / 87e3 / 2048) * 2048));
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const len = (m) => (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content || "").length);

export class Agent extends DurableObject {
  part() { return +(this.env.AGENT_PART || 64 * 1024 * 1024); }
  async st() { return (await this.ctx.storage.get("st")) || {}; }
  async save(st) { await this.ctx.storage.put("st", st); }
  async token() { let t = await this.ctx.storage.get("tok"); if (!t) { t = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""); await this.ctx.storage.put("tok", t); } return t; }
  get box() { return this.ctx.container; }
  port() { return this.box.getTcpPort(8080); }

  async status() {
    const st = await this.st(), s = st.seed, run = !!(this.box && this.box.running);
    if (run && !this.ready) try { const r = await this.port().fetch("http://agent/health"); this.ready = r.ok; } catch (e) {}
    return { name: AGENT.name, model: st.meta ? { ...st.meta, ctx: this.nctx || ctxFor(st.meta.size) } : null, public: this.env.AGENT_PUBLIC !== "0", container: !!this.box,
      state: !st.meta ? "empty" : !run ? "asleep" : this.ready ? "online" : "waking", idleMin: this.last ? Math.round((Date.now() - this.last) / 60e3) : null, error: this.err || null,
      seed: s && !s.done ? { label: s.label, done: Math.min(s.size, s.next * this.part()), size: s.size, error: s.error || null } : null };
  }

  async fetch(req) {
    const url = new URL(req.url), p = url.pathname, owner = req.headers.get("x-agent-owner") === "1";
    if (req.headers.get("x-origin")) { const st = await this.st(); if (st.origin !== req.headers.get("x-origin")) { st.origin = req.headers.get("x-origin"); await this.save(st); } }
    if (p === "/check") { const st = await this.st(); return J({ ok: url.searchParams.get("t") === (await this.token()), key: st.meta && st.meta.key }); }
    if (p === "/status") return J(await this.status());
    if (p === "/seed") { if (!owner) return J({ error: "only the owner can load a model" }, 401); return this.seedStart(await req.json().catch(() => ({}))); }
    if (p === "/wake") { if (!owner) return J({ error: "only the owner can wake the agent" }, 401); try { await this.boot(); } catch (e) { return J({ error: e.message }, 400); } return J(await this.status()); }
    if (p === "/sleep") { if (!owner) return J({ error: "only the owner can put the agent to sleep" }, 401); await this.stop(); return J(await this.status()); }
    if (p === "/v1/models") { const st = await this.st(); return J({ object: "list", data: st.meta ? [{ id: AGENT.alias, object: "model", owned_by: "mentifaber", description: AGENT.name + " · " + st.meta.label }] : [] }); }
    if (p === "/v1/chat/completions") return this.chat(req, owner);
    return J({ error: "not found" }, 404);
  }

  // ── run: start the container, wait for the model to load, proxy requests in ──
  async boot() {
    const st = await this.st(); if (!st.meta) throw new Error("no model in R2 yet: load one first");
    if (!this.box) throw new Error("containers aren't enabled on this deployment");
    if (!st.origin) throw new Error("the agent doesn't know the site's address yet");
    if (!this.box.running) {
      this.ready = false; this.err = null;
      this.nctx = 0; // asked from the server once it's up (it may hold less than requested)
      this.box.start({ enableInternet: true, env: { MODEL_URL: st.origin + "/api/agent/weights?t=" + (await this.token()), MODEL_SIZE: String(st.meta.size), CTX: String(ctxFor(st.meta.size)), THREADS: "4", ALIAS: AGENT.alias } });
      this.box.monitor().then(() => { this.ready = false; }).catch((e) => { this.ready = false; this.err = String(e && e.message || e).slice(0, 200); });
    }
    this.touch();
  }
  async waitReady(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (!this.box.running) return false; try { const r = await this.port().fetch("http://agent/health"); if (r.ok) { this.ready = true; return true; } } catch (e) {} await sleep(2000); }
    return false;
  }
  async stop() { if (this.box && this.box.running) await this.box.destroy().catch(() => {}); this.ready = false; }
  touch() { this.last = Date.now(); if (this._touched && Date.now() - this._touched < 30e3) return; this._touched = Date.now(); this.ctx.storage.getAlarm().then((a) => { if (!a) this.ctx.storage.setAlarm(Date.now() + 60e3); }); }

  async chat(req, owner) {
    if (!owner && this.env.AGENT_PUBLIC === "0") return J({ error: AGENT.name + " is private" }, 401);
    if (!owner) { // visitors get a daily allowance; the owner (and Hive, which meters its own visitors) has none
      const k = "m:" + new Date().toISOString().slice(0, 10) + ":" + (req.headers.get("cf-connecting-ip") || "x"), n = (await this.ctx.storage.get(k)) || 0;
      if (n >= PUBLIC_DAY) return J({ error: "that's today's " + PUBLIC_DAY + " messages to " + AGENT.name + "; come back tomorrow" }, 429);
      await this.ctx.storage.put(k, n + 1);
    }
    let body; try { body = await req.json(); } catch (e) { return J({ error: "send JSON" }, 400); }
    try { await this.boot(); } catch (e) { return J({ error: e.message }, 503); }
    if (!this.ready && !(await this.waitReady(READY_WAIT))) return J({ error: AGENT.name + " is still waking up (loading its model from R2); try again in a minute", waking: true }, 503);
    body.model = AGENT.alias; if (!body.chat_template_kwargs) body.chat_template_kwargs = { enable_thinking: false }; // straight to the answer: faster on CPU
    body.cache_prompt = true; delete body.mind; // the conversation so far stays loaded: only the new message is read
    try { await this.fit(body); } catch (e) {}
    this.touch(); this.busy = (this.busy || 0) + 1;
    const done = () => { this.busy = Math.max(0, this.busy - 1); this.touch(); };
    const ask = () => this.port().fetch(new Request("http://agent/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    if (!body.stream) {
      try { const r = await ask(), t = await r.arrayBuffer(); return new Response(t, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } }); }
      catch (e) { return J({ error: AGENT.name + " couldn't answer: " + String(e.message || e).slice(0, 200) }, 502); } finally { done(); }
    }
    // streaming: the reply starts at once; while the model is still reading a long prompt (minutes, on CPU) a comment
    // line every 15 s keeps every hop between here and the reader from giving up on the silence; then the bytes pass through
    const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder(); let lastW = 0;
    const beat = () => { if (Date.now() - lastW > 14e3) { lastW = Date.now(); w.write(enc.encode(": " + AGENT.alias + " is reading\n\n")).catch(() => {}); } };
    beat(); const ping = setInterval(beat, 5000);
    (async () => {
      try {
        const r = await ask();
        if (!r.ok || !r.body) { const t = await r.text(); let m = t.slice(0, 300); try { const j = JSON.parse(t); m = (j.error && (j.error.message || j.error)) || m; } catch (e) {} await w.write(enc.encode("data: " + JSON.stringify({ error: { message: String(m), status: r.status } }) + "\n\n")); return; }
        const rd = r.body.getReader(); for (;;) { const { value, done: end } = await rd.read(); if (end) break; lastW = Date.now(); this.touch(); await w.write(value); }
      } catch (e) { await w.write(enc.encode("data: " + JSON.stringify({ error: { message: AGENT.name + " couldn't answer: " + String(e.message || e).slice(0, 200) } }) + "\n\n")).catch(() => {}); }
      finally { clearInterval(ping); done(); w.close().catch(() => {}); }
    })();
    return new Response(readable, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  }

  // ── room to answer: the prompt and the reply have to share the model's memory (n_ctx). The reply always gets at least
  // REPLY_MIN tokens (or what was asked for, up to half); older turns go first, then the middle of an oversized message.
  async nCtx() {
    if (!this.nctx) try { const p = await (await this.port().fetch("http://agent/props")).json(); this.nctx = (p.default_generation_settings && p.default_generation_settings.n_ctx) || p.n_ctx || 0; } catch (e) {}
    if (!this.nctx) { const st = await this.st(); this.nctx = st.meta ? ctxFor(st.meta.size) : 8192; }
    return this.nctx;
  }
  async count(messages) { // exact, from the model's own template and tokenizer; a safe estimate if that isn't available
    try {
      const t = await (await this.port().fetch(new Request("http://agent/apply-template", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, chat_template_kwargs: { enable_thinking: false } }) }))).json();
      const k = await (await this.port().fetch(new Request("http://agent/tokenize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: t.prompt }) }))).json();
      if (Array.isArray(k.tokens)) return k.tokens.length;
    } catch (e) {}
    return Math.ceil(messages.reduce((a, m) => a + len(m), 0) / 3) + 8 * messages.length;
  }
  async fit(body) {
    const msgs = body.messages; if (!Array.isArray(msgs) || !msgs.length) return;
    const n = await this.nCtx(), want = +body.max_tokens || 0, room = Math.max(REPLY_MIN, Math.min(want || 4096, Math.floor(n / 2)));
    let P = await this.count(msgs);
    for (let round = 0; round < 3 && P > n - room - 32; round++) {
      const per = P / Math.max(1, msgs.reduce((a, m) => a + len(m), 0)); let over = P - (n - room - 32);
      const first = () => (msgs[0] && msgs[0].role === "system" ? 1 : 0);
      while (over > 0 && msgs.length - first() > 1) { const x = msgs.splice(first(), 1)[0]; over -= Math.ceil(len(x) * per) + 8; while (msgs.length - first() > 1 && msgs[first()].role !== "user") over -= Math.ceil(len(msgs.splice(first(), 1)[0]) * per) + 8; this.cut = (this.cut || 0) + 1; }
      if (over > 0) { // one message is bigger than memory on its own: keep its beginning and end
        const m = msgs.filter((x) => typeof x.content === "string").sort((a, b) => b.content.length - a.content.length)[0];
        if (m) { const drop = Math.min(m.content.length - 400, Math.ceil((over / per) * 1.15) + 400); if (drop > 0) { const keep = m.content.length - drop, h = Math.floor(keep * 0.45); m.content = m.content.slice(0, h) + "\n\n[… " + drop + " characters cut here so the reply has room …]\n\n" + m.content.slice(m.content.length - (keep - h)); } }
      }
      P = await this.count(msgs);
    }
    body.max_tokens = Math.max(256, Math.min(want || Infinity, n - P - 16)); // every token left over is the reply's
  }

  // ── seed: copy a GGUF model file from Hugging Face (or any https URL that allows ranged downloads) into R2 ──
  async seedStart(o) {
    if (!this.env.MODELS) return J({ error: "no R2 bucket is bound (MODELS)" }, 400);
    const st = await this.st(); if (st.seed && !st.seed.done && !st.seed.error) return J({ error: "a model is already being loaded" }, 409);
    let m = AGENT_MODELS[o.model];
    if (!m && o.url) { // your own model: any GGUF link; its size comes from the server
      if (!/^https:\/\/[^\s]+\.gguf(\?.*)?$/i.test(o.url)) return J({ error: "give an https link to a .gguf file" }, 400);
      const r = await fetch(o.url, { headers: { range: "bytes=0-0" } }); const total = +(/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]; if (r.body) await r.body.cancel();
      if (!total) return J({ error: "that server doesn't allow ranged downloads, or the link is wrong (" + r.status + ")" }, 400);
      if (total > 11 * 1024 ** 3) return J({ error: "that model is " + (total / 1024 ** 3).toFixed(1) + " GB; a container has 12 GiB of memory, so 11 GB is the most that can run" }, 400);
      const name = o.url.split("?")[0].split("/").pop(); m = { label: String(o.label || name.replace(/\.gguf$/i, "")).slice(0, 60), url: o.url, size: total, key: "agent/" + name.toLowerCase().replace(/[^\w.-]+/g, "-") };
    }
    if (!m) return J({ error: "pick a model" }, 400);
    const up = await this.env.MODELS.createMultipartUpload(m.key, { httpMetadata: { contentType: "application/octet-stream" } });
    st.seed = { ...m, uploadId: up.uploadId, parts: [], next: 0, tries: 0, t0: Date.now() }; await this.save(st);
    await this.ctx.storage.setAlarm(Date.now() + 100);
    return J(await this.status());
  }
  async seedStep() {
    const st = await this.st(), s = st.seed; if (!s || s.done || s.error) return false;
    const PART = this.part(), up = this.env.MODELS.resumeMultipartUpload(s.key, s.uploadId), t0 = Date.now();
    try {
      while (Date.now() - t0 < 25000 && s.next * PART < s.size) {
        const start = s.next * PART, end = Math.min(s.size, start + PART) - 1, len = end - start + 1;
        const r = await fetch(s.url, { headers: { range: "bytes=" + start + "-" + end } });
        if (r.status !== 206) { if (r.body) await r.body.cancel(); throw new Error("the model server answered " + r.status + " to a ranged download"); }
        const { readable, writable } = new FixedLengthStream(len), pipe = r.body.pipeTo(writable);
        const part = await up.uploadPart(s.next + 1, readable); await pipe;
        s.parts.push({ partNumber: part.partNumber, etag: part.etag }); s.next++; s.tries = 0; await this.save(st);
      }
      if (s.next * PART >= s.size) {
        await up.complete(s.parts);
        const old = st.meta; st.meta = { label: s.label, key: s.key, size: s.size, at: Date.now() }; s.done = true; await this.save(st);
        if (old && old.key !== s.key) await this.stop(); // the next wake loads the new model
        return false;
      }
      return true;
    } catch (e) {
      s.tries = (s.tries || 0) + 1; if (s.tries >= 6) { s.error = String(e.message || e).slice(0, 200); await up.abort().catch(() => {}); }
      await this.save(st); return !s.error;
    }
  }
  async alarm() {
    const more = await this.seedStep();
    if (this.box && this.box.running && this.last && Date.now() - this.last > IDLE && !this.busy) await this.stop(); // asleep after 20 idle minutes (never mid-reply)
    if (this.box && this.box.running && !this.last) this.last = Date.now(); // woke up after an eviction: start the idle clock
    if (more) await this.ctx.storage.setAlarm(Date.now() + 500);
    else if (this.box && this.box.running) await this.ctx.storage.setAlarm(Date.now() + 60e3);
  }
}
