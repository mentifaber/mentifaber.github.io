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
  "14b": { label: "Qwen3 14B · Q4_K_M", url: "https://huggingface.co/Qwen/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf", size: 9001752960, key: "agent/qwen3-14b-q4_k_m.gguf", ctx: 6144 },
  "8b": { label: "Qwen3 8B · Q4_K_M", url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf", size: 5027783488, key: "agent/qwen3-8b-q4_k_m.gguf", ctx: 8192 },
};
const IDLE = 20 * 60e3, READY_WAIT = 240e3, PUBLIC_DAY = 40;
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    return { name: AGENT.name, model: st.meta || null, public: this.env.AGENT_PUBLIC !== "0", container: !!this.box,
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
      this.box.start({ enableInternet: true, env: { MODEL_URL: st.origin + "/api/agent/weights?t=" + (await this.token()), MODEL_SIZE: String(st.meta.size), CTX: String(st.meta.ctx || 8192), THREADS: "4", ALIAS: AGENT.alias } });
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
  touch() { this.last = Date.now(); this.ctx.storage.getAlarm().then((a) => { if (!a) this.ctx.storage.setAlarm(Date.now() + 60e3); }); }

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
    if (body.max_tokens) body.max_tokens = Math.min(4096, +body.max_tokens);
    this.touch();
    const r = await this.port().fetch(new Request("http://agent/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    this.touch();
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
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
      const name = o.url.split("?")[0].split("/").pop(); m = { label: String(o.label || name.replace(/\.gguf$/i, "")).slice(0, 60), url: o.url, size: total, key: "agent/" + name.toLowerCase().replace(/[^\w.-]+/g, "-"), ctx: total > 7e9 ? 6144 : 8192 };
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
        const old = st.meta; st.meta = { label: s.label, key: s.key, size: s.size, ctx: s.ctx, at: Date.now() }; s.done = true; await this.save(st);
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
    if (this.box && this.box.running && this.last && Date.now() - this.last > IDLE) await this.stop(); // asleep after 20 idle minutes
    if (this.box && this.box.running && !this.last) this.last = Date.now(); // woke up after an eviction: start the idle clock
    if (more) await this.ctx.storage.setAlarm(Date.now() + 500);
    else if (this.box && this.box.running) await this.ctx.storage.setAlarm(Date.now() + 60e3);
  }
}
