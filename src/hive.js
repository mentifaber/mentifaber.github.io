// Hive: you give it a project; a swarm of AI agents splits it into a task board, each agent claims the work
// its role fits, critics review, an integrator assembles the result. Agents come only from sources this
// site is allowed to use: Cloudflare Workers AI (env.AI), optional keyed providers (OpenRouter, Groq,
// Gemini: Worker secrets), any number of keys the owner adds to the vault (src/hive-kit.js), and visiting AIs
// (Grok, ChatGPT, …) that join a project by following links. The Studio is the one-to-one side: chat with any
// model, with web search, page reading, vision, video frames, voice and image generation.
import { DurableObject } from "cloudflare:workers";
import { PRESETS, AURA2, OPENAI_VOICES, voiceOut, isChat, pullModel, vaultKey, seal, unseal, probe, complete, streamComplete, textOf, search, readPage, describe, transcribe, speak, imagine } from "./hive-kit.js";
import { Mind, mindTables, OWNER_MODE } from "./hive-mind.js";
import { asksWeather, placeIn, weather } from "./hive-kit.js";

// Workers AI text models. Any that a given account can't run just go offline for that project.
const CF_MODELS = [
  ["@cf/openai/gpt-oss-120b", "GPT-OSS 120B", ["coordinator", "architect", "coder", "integrator", "critic"]],
  ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Llama 3.3 70B", ["coordinator", "architect", "integrator", "critic"]],
  ["@cf/meta/llama-4-scout-17b-16e-instruct", "Llama 4 Scout", ["designer", "writer", "coder", "critic"]],
  ["@cf/qwen/qwen3-30b-a3b-fp8", "Qwen3 30B", ["coder", "researcher", "critic", "security"]],
  ["@cf/qwen/qwq-32b", "QwQ 32B (reasoning)", ["architect", "tester", "security", "critic"]],
  ["@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "DeepSeek R1 Distill 32B", ["architect", "tester", "researcher"]],
  ["@cf/qwen/qwen2.5-coder-32b-instruct", "Qwen2.5 Coder 32B", ["coder", "tester", "optimizer"]],
  ["@cf/openai/gpt-oss-20b", "GPT-OSS 20B", ["coder", "tester", "optimizer"]],
  ["@cf/mistralai/mistral-small-3.1-24b-instruct", "Mistral Small 3.1", ["writer", "designer", "researcher"]],
  ["@cf/aisingapore/gemma-sea-lion-v4-27b-it", "SEA-LION 27B", ["writer", "researcher"]],
  ["@cf/meta/llama-3.1-70b-instruct", "Llama 3.1 70B", ["architect", "writer", "critic"]],
  ["@cf/ibm-granite/granite-4.0-h-micro", "Granite 4.0 Micro", []], // [] = chat only: too small to hold up a swarm task
  ["@cf/meta/llama-3.1-8b-instruct-fast", "Llama 3.1 8B", ["writer", "tester", "researcher"]],
  ["@cf/meta/llama-3.2-3b-instruct", "Llama 3.2 3B", []],
  ["@cf/meta/llama-3.2-1b-instruct", "Llama 3.2 1B", []],
  ["@hf/nousresearch/hermes-2-pro-mistral-7b", "Hermes 2 Pro 7B", []],
  ["@hf/google/gemma-7b-it", "Gemma 7B", []],
  ["@cf/mistral/mistral-7b-instruct-v0.1", "Mistral 7B", []],
];
// Keyed providers: OpenAI-compatible chat endpoints, used only when their secret is set.
const KEYED = [
  { env: "OPENROUTER_KEY", id: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", list: "https://openrouter.ai/api/v1/models", free: true },
  { env: "GROQ_KEY", id: "groq", url: "https://api.groq.com/openai/v1/chat/completions", list: "https://api.groq.com/openai/v1/models" },
  { env: "GEMINI_KEY", id: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"] },
];
const ROLES = {
  architect: "Plan the structure: components, data, files, interfaces. Concrete and brief.",
  coder: "Write the code for your task. Complete, working, no placeholders. Put code in fenced blocks.",
  designer: "Design the look and feel: layout, colours, type, interactions. Give exact CSS or specs.",
  writer: "Write the words: copy, docs, labels, instructions. Clear and finished.",
  researcher: "Gather the facts, options and constraints the team needs. Be specific.",
  tester: "Find bugs and missing cases in the work given; list concrete fixes, or the corrected code.",
  security: "Audit the work for security and privacy problems (injection, secrets, unsafe input, auth); give the exact fixes.",
  optimizer: "Make the finished work faster, smaller and cleaner without changing what it does; return the improved version.",
  critic: "Review one task's work. Reply APPROVE, or REDO with the exact problems.",
  integrator: "Combine all approved work into the single final deliverable.",
};
// Pull the first JSON value out of a model reply (code fences, chatter and <think> blocks around it are fine).
function jsonOf(out) {
  const t = String(out).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  for (const [o, c] of [["{", "}"], ["[", "]"]]) { const i = t.indexOf(o), j = t.lastIndexOf(c); if (i >= 0 && j > i) try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
  return null;
}
// The plan every project can fall back on (coordinators failing, or the allowance gone before planning).
const BUILTIN_PLAN = { tasks: [
  { id: 1, role: "architect", title: "Plan the build", detail: "Decide the structure, parts and approach for the brief.", deps: [] },
  { id: 2, role: "researcher", title: "Gather what is needed", detail: "Facts, content, options and constraints the brief depends on.", deps: [] },
  { id: 3, role: "designer", title: "Design the look", detail: "Layout, colours, type and interactions, as concrete CSS or specs.", deps: [1] },
  { id: 4, role: "writer", title: "Write the words", detail: "All text, labels and copy the result needs.", deps: [1, 2] },
  { id: 5, role: "coder", title: "Build it", detail: "The complete working implementation of the plan.", deps: [1, 3, 4] },
  { id: 6, role: "tester", title: "Test and fix", detail: "Find bugs and missing cases in the build and give the corrected version.", deps: [5] },
] };
const STUDIO_DAY = 60, IMAGINE_DAY = 8, MAX_KEYS = 500;
const MAX_CALLS = 400, PUBLIC_CALLS = 150, PER_IP_DAY = 2, PUBLIC_DAY = 25, PARALLEL = 12, TICK = 1500, SLOW_TICK = 75e3;
// models that think before they answer: they need room for both, or the answer comes back empty or cut off
const THINKS = /qwq|deepseek-r1|-r1-|gpt-oss|qwen3(?!.*instruct)|\bo[134](-|$)|thinking|reason/i;
const clean = (t) => String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim(); // its thinking isn't the work

export class Hive extends DurableObject {
  sql() {
    const q = this.ctx.storage.sql;
    if (!this._init) {
      q.exec("CREATE TABLE IF NOT EXISTS proj(id TEXT PRIMARY KEY, title TEXT, brief TEXT, status TEXT, final TEXT, calls INTEGER, tok TEXT, ts INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS task(id INTEGER PRIMARY KEY AUTOINCREMENT, pid TEXT, role TEXT, title TEXT, detail TEXT, deps TEXT, status TEXT, agent TEXT, output TEXT, note TEXT, tries INTEGER, ts INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS agent(id TEXT, pid TEXT, name TEXT, src TEXT, model TEXT, roles TEXT, status TEXT, task INTEGER, done INTEGER, last INTEGER, PRIMARY KEY(id,pid))");
      q.exec("CREATE TABLE IF NOT EXISTS limits(k TEXT PRIMARY KEY, n INTEGER)"); try { q.exec("ALTER TABLE proj ADD COLUMN cap INTEGER"); } catch (e) {} try { q.exec("ALTER TABLE proj ADD COLUMN ctok TEXT"); } catch (e) {} try { q.exec("ALTER TABLE proj ADD COLUMN note TEXT"); } catch (e) {}
      q.exec("CREATE TABLE IF NOT EXISTS feed(pid TEXT, ts INTEGER, who TEXT, kind TEXT, text TEXT)");
      q.exec("CREATE TABLE IF NOT EXISTS vault(id TEXT PRIMARY KEY, provider TEXT, kind TEXT, label TEXT, base TEXT, sealed TEXT, tail TEXT, models TEXT, pick TEXT, live INTEGER, err TEXT, used INTEGER, ts INTEGER)");
      try { q.exec("ALTER TABLE proj ADD COLUMN own INTEGER"); } catch (e) {} try { q.exec("ALTER TABLE agent ADD COLUMN score INTEGER DEFAULT 0"); } catch (e) {} try { q.exec("ALTER TABLE agent ADD COLUMN err TEXT"); } catch (e) {}
      mindTables(q); this._init = 1;
    }
    return q;
  }
  say(pid, who, kind, text) { const q = this.sql(); q.exec("INSERT INTO feed(pid,ts,who,kind,text) VALUES(?,?,?,?,?)", pid, Date.now(), who, kind, String(text).slice(0, 4000)); }

  // ── MENTIFABER AGENT 1.0: the model in this site's R2, run in its own container (src/agent.js) ──
  // MENTIFABER AGENT runs on CPU: reading a long prompt can take minutes, so it gets patience instead of the usual limits
  agentV(ms) { const stub = this.env.AGENT.get(this.env.AGENT.idFromName("agent")); return { kind: "compat", base: "http://agent/v1", noVision: true, ms: ms || 45 * 60e3, first: 30 * 60e3, idle: 5 * 60e3, fetcher: (u, init) => { const h = new Headers(init.headers); h.set("x-agent-owner", "1"); return stub.fetch(new Request(u, { ...init, headers: h })); } }; }
  async agentInfo() { // is there a model to run? (asked at most once a minute)
    if (!this.env.AGENT) return null; if (this._ag && Date.now() - this._ag.at < 60e3) return this._ag.st;
    let st = null; try { st = await (await this.env.AGENT.get(this.env.AGENT.idFromName("agent")).fetch(new Request("http://agent/status"))).json(); } catch (e) {}
    this._ag = { at: Date.now(), st }; return st;
  }
  agentModel(st) { return st && st.model ? { id: "agent|mentifaber-agent-1.0", name: "MENTIFABER AGENT 1.0", group: "Mentifaber · your R2 · " + st.model.label + (st.state === "online" ? " · online" : " · wakes on first message"), agent: true } : null; }
  async roster(own) { // every model the swarm may use right now; the owner's vault keys only join the owner's projects
    const out = CF_MODELS.filter(([, , roles]) => this.env.AI && roles.length).map(([m, name, roles]) => ({ src: "workers-ai", model: m, name, roles }));
    // MENTIFABER AGENT isn't on the swarm: on CPU a task takes it minutes, and the swarm moves at the pace of its slowest member
    const rr = Object.keys(ROLES).filter((r) => r !== "integrator");
    if (own) for (const v of this.sql().exec("SELECT * FROM vault WHERE live=1 AND kind NOT IN ('search','voice') ORDER BY ts").toArray()) {
      const all = JSON.parse(v.models || "[]").filter(isChat).sort((a, b) => this.rank(a) - this.rank(b)), pick = (v.pick || "").split(",").map((x) => x.trim()).filter(Boolean), ids = v.pick === "*" ? all.slice(0, 40) : pick.length ? pick : all.slice(0, 4);
      ids.slice(0, 40).forEach((id, i) => out.push({ src: "k:" + v.id, model: id, name: (v.label || PRESETS[v.provider].name) + " · " + id.split("/").pop(), roles: i === 0 ? ["coordinator", "architect", "integrator", "critic", "coder"] : [rr[i % rr.length], rr[(i + 3) % rr.length], "critic"] }));
    }
    for (const k of KEYED) {
      const key = this.env[k.env]; if (!key) continue;
      let ids = k.models || [];
      if (k.list) try {
        const j = await (await fetch(k.list, { headers: { authorization: "Bearer " + key } })).json();
        ids = (j.data || []).filter((m) => !k.free || (m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0) || /:free$/.test(m.id)).map((m) => m.id)
          .filter((id) => !/whisper|tts|guard|embed|vision-only|image/i.test(id)).slice(0, 40);
      } catch (e) {}
      const rr = Object.keys(ROLES).filter((r) => r !== "integrator");
      ids.filter(isChat).forEach((id, i) => out.push({ src: k.id, model: id, name: id.split("/").pop().replace(/:free$/, ""), roles: [rr[i % rr.length], rr[(i + 3) % rr.length]] }));
    }
    return out;
  }
  async ask(agent, system, user, max) { // one model call, any provider
    if (agent.src === "agent") return complete(this.env, this.agentV(6 * 60e3), null, agent.model, system, [{ role: "user", text: user }], max);
    if (agent.src.startsWith("k:")) { const { v, key } = await this.vaultGet(agent.src.slice(2)); return complete(this.env, v, key, agent.model, system, [{ role: "user", text: user }], max); }
    if (agent.src === "workers-ai") {
      const r = await this.env.AI.run(agent.model, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: max || 2048 });
      return textOf(r);
    }
    const k = KEYED.find((x) => x.id === agent.src); if (!k) throw new Error("no provider");
    const res = await fetch(k.url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + this.env[k.env], "http-referer": "https://mentifaber.org/hive", "x-title": "Mentifaber Hive" },
      body: JSON.stringify({ model: agent.model, max_tokens: max || 2048, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    if (!res.ok) throw new Error(k.id + " " + res.status);
    const j = await res.json(); return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").trim();
  }

  async fetch(req) {
    const url = new URL(req.url), q = this.sql(), owner = req.headers.get("x-hive-owner") === "1", path = url.pathname.replace(/^\/api\/hive/, "") || "/";
    const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
    let b = Object.fromEntries(url.searchParams); if (req.method === "POST") { try { Object.assign(b, await req.json()); } catch (e) {} }
    if (path === "/purge") { // the owner clears every finished, stopped or failed project at once
      if (!owner) return J({ error: "only the owner can clear projects" }, 401);
      const ids = q.exec("SELECT id FROM proj WHERE status IN ('done','stopped','failed')").toArray().map((r) => r.id);
      for (const id of ids) { for (const t of ["task", "agent", "feed"]) q.exec("DELETE FROM " + t + " WHERE pid=?", id); q.exec("DELETE FROM proj WHERE id=?", id); }
      return J({ ok: true, removed: ids.length });
    }
    if (path.startsWith("/mind")) { if (!owner) return J({ error: "Hive's mind is the owner's: sign in on Vigil first" }, 401); return Mind.route(this, path, b, J, url.origin); }
    if (path === "/list") return J({ owner, projects: q.exec("SELECT id,title,status,calls,ts FROM proj ORDER BY ts DESC LIMIT 30").toArray() });
    if (path.startsWith("/keys")) return this.keys(path, b, owner, J);
    if (path === "/voices") return J({ voices: await this.voices(owner) });
    if (path === "/models") { const ag = this.agentModel(await this.agentInfo()); if (ag && !owner && !(await this.agentInfo()).public) ag.skip = true; return J({ owner, agent: await this.agentInfo(), models: [...(ag && !ag.skip ? [ag] : []), ...this.models(owner), ...(owner ? await this.envModels() : [])], resting: (await this.resting()) || undefined, standIn: owner && (await this.resting()) ? await this.standIn() : undefined, search: owner ? this.sql().exec("SELECT COUNT(*) c FROM vault WHERE live=1 AND kind='search'").one().c : 0, ai: !!this.env.AI }); }
    if (["/chat", "/stt", "/tts", "/imagine"].includes(path)) { if (req.method !== "POST") return J({ error: "POST only" }, 405); return this.studio(path, b, owner, req, J).catch((e) => J({ error: String(e && e.message || e).slice(0, 300) }, 502)); }
    if (path === "/new") {
      const brief = String(b.brief || "").trim().slice(0, 6000); if (brief.length < 8) return J({ error: "describe the project" }, 400);
      if (owner && (await Mind.state(this)).on) Mind.log(this, "project", brief);
      const running = q.exec("SELECT COUNT(*) c FROM proj WHERE status NOT IN ('done','stopped','failed')").one().c;
      if (running >= (owner ? 6 : 4)) return J({ error: "the hive is busy with " + running + " projects; try again in a few minutes" }, 429);
      if (!owner) { // public: everyone gets a go, within what the free allowance can carry
        const day = new Date().toISOString().slice(0, 10), ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), ki = "ip:" + day + ":" + ip, kd = "day:" + day;
        const n = (k) => (q.exec("SELECT n FROM limits WHERE k=?", k).toArray()[0] || { n: 0 }).n;
        if (n(ki) >= PER_IP_DAY) return J({ error: "you've started " + PER_IP_DAY + " projects today; come back tomorrow" }, 429);
        if (n(kd) >= PUBLIC_DAY) return J({ error: "the hive has run its " + PUBLIC_DAY + " public projects for today; come back tomorrow" }, 429);
        for (const k of [ki, kd]) q.exec("INSERT INTO limits(k,n) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=n+1", k);
        q.exec("DELETE FROM limits WHERE k NOT LIKE ?", "%" + day + "%");
      }
      const id = crypto.randomUUID().slice(0, 8), tok = crypto.randomUUID().replace(/-/g, "").slice(0, 16), ctok = crypto.randomUUID().replace(/-/g, "");
      q.exec("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok,own) VALUES(?,?,?,?,?,0,?,?,?,?,?)", id, brief.split(/[.\n]/)[0].slice(0, 80), brief, "planning", null, tok, Date.now(), owner ? Math.max(50, Math.min(3000, +b.cap || MAX_CALLS)) : PUBLIC_CALLS, ctok, owner ? 1 : 0);
      this.say(id, "you", "brief", brief);
      for (const a of await this.roster(owner)) q.exec("INSERT OR REPLACE INTO agent(id,pid,name,src,model,roles,status,task,done,last) VALUES(?,?,?,?,?,?,?,?,0,?)", a.src + ":" + a.model, id, a.name, a.src, a.model, JSON.stringify(a.roles), "idle", null, Date.now());
      this.say(id, "hive", "info", q.exec("SELECT COUNT(*) c FROM agent WHERE pid=?", id).one().c + " agents joined" + (this.env.AI ? "" : " (Workers AI is not bound on this deployment)") + ". Visiting AIs can join with the project link.");
      await this.ctx.storage.setAlarm(Date.now() + 200);
      return J({ id, ctok });
    }
    const p = b.id || b.project ? q.exec("SELECT * FROM proj WHERE id=?", String(b.id || b.project)).toArray()[0] : null;
    if (!p) return J({ error: "no such project" }, 404);
    const ctl = owner || (b.ctok && p.ctok && b.ctok === p.ctok), cap = p.cap || MAX_CALLS;
    if (path === "/state") {
      const since = +b.since || 0;
      return J({ project: { id: p.id, title: p.title, brief: p.brief, status: p.status, quota_until: this.quota && Date.now() < this.quota ? this.quota : undefined, calls: p.calls, max: cap, final: p.final, mine: !!ctl, join: ctl ? url.origin + "/api/hive/join?project=" + p.id + "&key=" + p.tok + "&agent=YourName" : undefined },
        tasks: q.exec("SELECT id,role,title,detail,deps,status,agent,note,tries,length(output) n FROM task WHERE pid=? ORDER BY id", p.id).toArray(),
        agents: q.exec("SELECT id,name,src,model,roles,status,task,done,last,COALESCE(score,0) score,err FROM agent WHERE pid=? ORDER BY COALESCE(score,0) DESC, done DESC, name", p.id).toArray(),
        feed: q.exec("SELECT ts,who,kind,text FROM feed WHERE pid=? AND ts>? ORDER BY ts DESC LIMIT 80", p.id, since).toArray() });
    }
    if (path === "/output") { const t = q.exec("SELECT output FROM task WHERE pid=? AND id=?", p.id, +b.task).toArray()[0]; return J({ output: t ? t.output : null }); }
    if (path === "/say") { if (!ctl) return J({ error: "only whoever started this project can steer it" }, 401); const text = String(b.text || "").trim().slice(0, 3000); if (text) { this.say(p.id, "you", "chat", text); q.exec("UPDATE agent SET status='idle', task=NULL WHERE pid=? AND src='workers-ai' AND status='offline'", p.id); q.exec("UPDATE proj SET status='replanning' WHERE id=?", p.id); await this.ctx.storage.setAlarm(Date.now() + 200); } return J({ ok: true }); }
    if (path === "/recruit") { // bring every model from the owner's keys into this project, e.g. one started before the keys were added
      if (!owner) return J({ error: "only the owner's keys can be brought in" }, 401);
      q.exec("UPDATE proj SET own=1 WHERE id=?", p.id); const n = await this.recruit(p.id, true); await this.ctx.storage.setAlarm(Date.now() + 200);
      return J({ ok: true, joined: n });
    }
    if (path === "/rebuild") { // assemble the final result again (e.g. it came out too short)
      if (!ctl) return J({ error: "only whoever started this project can rebuild it" }, 401);
      if (q.exec("SELECT COUNT(*) c FROM task WHERE pid=? AND status!='done'", p.id).one().c) return J({ error: "some tasks aren't finished yet" }, 400);
      q.exec("UPDATE proj SET status='working', final=NULL WHERE id=?", p.id); if (this._igTried) delete this._igTried[p.id]; this.say(p.id, "you", "chat", "rebuild the final result"); await this.ctx.storage.setAlarm(Date.now() + 200);
      return J({ ok: true });
    }
    if (path === "/delete") { // gone for good: the project, its tasks, agents and log
      if (!ctl) return J({ error: "only whoever started this project can delete it" }, 401);
      for (const t of ["task", "agent", "feed"]) q.exec("DELETE FROM " + t + " WHERE pid=?", p.id); q.exec("DELETE FROM proj WHERE id=?", p.id); if (this._igTried) delete this._igTried[p.id];
      return J({ ok: true });
    }
    if (path === "/stop") { if (!ctl) return J({ error: "only whoever started this project can stop it" }, 401); q.exec("UPDATE proj SET status='stopped' WHERE id=?", p.id); this.say(p.id, "hive", "info", "stopped by you"); return J({ ok: true }); }
    // visiting AIs: claim a task by link, read its context, submit by GET (short) or POST (long)
    if (path === "/join" || path === "/submit") {
      if (b.key !== p.tok) return J({ error: "this project's join link is needed" }, 403);
      const name = String(b.agent || "").replace(/[^\w .'()-]/g, "").trim().slice(0, 24) || "Visitor", aid = "visitor:" + name.toLowerCase();
      if (!q.exec("SELECT 1 FROM agent WHERE id=? AND pid=?", aid, p.id).toArray().length) { q.exec("INSERT INTO agent(id,pid,name,src,model,roles,status,task,done,last) VALUES(?,?,?,?,?,?,?,?,0,?)", aid, p.id, "🛰 " + name, "visitor", name, JSON.stringify(Object.keys(ROLES)), "idle", null, Date.now()); this.say(p.id, "🛰 " + name, "join", "joined the hive"); }
      const ag = q.exec("SELECT * FROM agent WHERE id=? AND pid=?", aid, p.id).one();
      if (path === "/submit") {
        const t = q.exec("SELECT * FROM task WHERE pid=? AND id=? AND agent=?", p.id, +b.task, aid).toArray()[0], text = String(b.text || "").trim().slice(0, 60000);
        if (!t || !text) return J({ error: "claim a task with /join first, then submit its text" }, 400);
        if (this.quota === undefined) this.quota = (await this.ctx.storage.get("quota")) || 0;
        const noReview = this.quota && Date.now() < this.quota && !q.exec("SELECT COUNT(*) c FROM agent WHERE pid=? AND status NOT IN ('offline','retired') AND src NOT IN ('workers-ai','visitor')", p.id).one().c;
        q.exec("UPDATE task SET status=?, output=?, note=?, ts=? WHERE id=?", noReview ? "done" : "review", text, noReview ? "accepted without review: the swarm's reviewers were paused" : null, Date.now(), t.id); q.exec("UPDATE agent SET status='idle', task=NULL, done=done+1, last=? WHERE id=? AND pid=?", Date.now(), aid, p.id);
        this.say(p.id, ag.name, "work", "submitted #" + t.id + " " + t.title); await this.ctx.storage.setAlarm(Date.now() + 200);
        return J({ ok: true, next: url.origin + "/api/hive/join?project=" + p.id + "&key=" + p.tok + "&agent=" + encodeURIComponent(name) });
      }
      if (p.status === "paused" || p.status === "planning") { if (this.quota === undefined) this.quota = (await this.ctx.storage.get("quota")) || 0; if (p.status === "paused" || (this.quota && Date.now() < this.quota)) this.layBoard(p); }
      const t = this.claim(p.id, ag, Object.keys(ROLES)); if (!t) return J({ note: "no open task right now; open this link again in a minute", project: p.title });
      return J({ project: p.title, brief: p.brief, your_task: { id: t.id, role: t.role, title: t.title, detail: t.detail, how: ROLES[t.role] }, context: this.context(p.id, t), submit: "POST " + url.origin + "/api/hive/submit {project, key, agent, task: " + t.id + ", text} — or for short answers GET " + url.origin + "/api/hive/submit?project=" + p.id + "&key=" + p.tok + "&agent=" + encodeURIComponent(name) + "&task=" + t.id + "&text=YOUR+ANSWER" });
    }
    return J({ error: "not found" }, 404);
  }

  async recruit(pid, loud) { // add any roster agents this project doesn't have yet
    const q = this.sql(); let n = 0;
    if (loud) { const back = q.exec("SELECT COUNT(*) c FROM agent WHERE pid=? AND status='offline' AND src NOT IN ('workers-ai','visitor')", pid).one().c; if (back) { q.exec("UPDATE agent SET status='idle', task=NULL WHERE pid=? AND status='offline' AND src NOT IN ('workers-ai','visitor')", pid); this.say(pid, "hive", "info", back + " offline key agents are trying again"); n += back; } }
    for (const a of await this.roster(true)) { if (a.src === "workers-ai" || q.exec("SELECT 1 FROM agent WHERE id=? AND pid=?", a.src + ":" + a.model, pid).toArray().length) continue;
      q.exec("INSERT INTO agent(id,pid,name,src,model,roles,status,task,done,last) VALUES(?,?,?,?,?,?,?,?,0,?)", a.src + ":" + a.model, pid, a.name, a.src, a.model, JSON.stringify(a.roles), "idle", null, Date.now()); n++; }
    if (n || loud) this.say(pid, "hive", "join", n ? n + " agents from your keys joined the swarm" : "no new agents: add keys under Keys first");
    return n;
  }
  // A paused project with no plan yet gets the built-in task board, so visiting AIs have work right away.
  layBoard(p) {
    const q = this.sql(); if (q.exec("SELECT COUNT(*) c FROM task WHERE pid=?", p.id).one().c) return;
    const ids = {};
    for (const t of BUILTIN_PLAN.tasks) { q.exec("INSERT INTO task(pid,role,title,detail,deps,status,agent,output,note,tries,ts) VALUES(?,?,?,?,?,'open',NULL,NULL,NULL,0,?)", p.id, t.role, t.title, t.detail, JSON.stringify(t.deps.map((d) => ids[d])), Date.now()); ids[t.id] = q.exec("SELECT last_insert_rowid() i").one().i; }
    q.exec("UPDATE proj SET note='working' WHERE id=?", p.id);
    this.say(p.id, "hive", "plan", "laid out the built-in task board so visiting AIs can start now; the Workers AI agents join after the reset");
  }
  claim(pid, ag, roles) {
    const q = this.sql(), done = new Set(q.exec("SELECT id FROM task WHERE pid=? AND status='done'", pid).toArray().map((r) => r.id));
    const open = q.exec("SELECT * FROM task WHERE pid=? AND status='open' ORDER BY id", pid).toArray().filter((t) => JSON.parse(t.deps || "[]").every((d) => done.has(d)));
    const t = open.find((x) => roles.includes(x.role)) || (ag.src === "visitor" ? open[0] : null); if (!t) return null;
    q.exec("UPDATE task SET status='claimed', agent=?, ts=? WHERE id=?", ag.id, Date.now(), t.id); q.exec("UPDATE agent SET status='working', task=?, last=? WHERE id=? AND pid=?", t.id, Date.now(), ag.id, pid);
    return t;
  }
  context(pid, t) {
    const q = this.sql(), deps = JSON.parse(t.deps || "[]");
    const rows = q.exec("SELECT id,role,title,output FROM task WHERE pid=? AND status='done' ORDER BY id", pid).toArray();
    const mine = rows.filter((r) => deps.includes(r.id)), rest = rows.filter((r) => !deps.includes(r.id));
    const chat = q.exec("SELECT text FROM feed WHERE pid=? AND who='you' ORDER BY ts DESC LIMIT 5", pid).toArray().map((r) => r.text).reverse();
    let s = (chat.length ? "OWNER NOTES:\n" + chat.join("\n") + "\n\n" : "") + mine.map((r) => "#" + r.id + " " + r.role + ": " + r.title + "\n" + r.output.slice(0, 6000)).join("\n\n");
    s += rest.length ? "\n\nOTHER FINISHED WORK (summaries):\n" + rest.map((r) => "#" + r.id + " " + r.title + ": " + r.output.slice(0, 400)).join("\n") : "";
    return s.slice(0, 24000);
  }

  async alarm() {
    const q = this.sql(); let busy = false, resting = false;
    if (this.quota === undefined) this.quota = (await this.ctx.storage.get("quota")) || 0;
    const out = this.quota && Date.now() < this.quota;
    for (const p of q.exec("SELECT * FROM proj WHERE status IN ('planning','working','integrating','replanning','paused')").toArray()) {
      q.exec("UPDATE agent SET status='idle', task=NULL WHERE pid=? AND status='offline' AND src NOT IN ('workers-ai','visitor') AND COALESCE(last,0)<?", p.id, Date.now() - 600e3); // a key that failed gets another try every 10 minutes
      let others = q.exec("SELECT COUNT(*) c FROM agent WHERE pid=? AND status NOT IN ('offline','retired') AND src NOT IN ('workers-ai','visitor')", p.id).one().c;
      this._rec = this._rec || {}; // the owner's projects pick up keys added after they started (checked every few minutes)
      if (p.own && Date.now() - (this._rec[p.id] || 0) > 180e3) { this._rec[p.id] = Date.now(); if (await this.recruit(p.id)) others = 1; }
      if (out && !others) { // only Workers AI here and it's resting: pause until the allowance resets
        if (p.status !== "paused") { q.exec("UPDATE proj SET status='paused', note=? WHERE id=?", p.status, p.id); this.say(p.id, "hive", "quota", "Cloudflare's free AI allowance for today is used up. Paused; the swarm picks up again automatically after " + new Date(this.quota).toISOString().slice(11, 16) + " UTC."); }
        this.layBoard(p); resting = true; continue;
      }
      if (p.status === "paused") { // allowance back: wake everyone, including agents an earlier version marked offline for the quota
        q.exec("UPDATE agent SET status='idle', task=NULL WHERE pid=? AND src='workers-ai' AND status='offline'", p.id);
        q.exec("UPDATE proj SET status=COALESCE(NULLIF(note,''),'working') WHERE id=?", p.id); this.say(p.id, "hive", "info", "the allowance has reset; the swarm is back at work"); p.status = q.exec("SELECT status FROM proj WHERE id=?", p.id).one().status;
      }
      busy = true; const cap = p.cap || MAX_CALLS; if (p.calls >= cap) { q.exec("UPDATE proj SET status='stopped' WHERE id=?", p.id); this.say(p.id, "hive", "info", "call budget used up (" + cap + "); stopped"); continue; }
      try { await this.advance(p); } catch (e) { this.say(p.id, "hive", "error", String(e && e.message || e)); }
    }
    if (busy) await this.ctx.storage.setAlarm(Date.now() + TICK);
    else if (resting) await this.ctx.storage.setAlarm(this.quota + 1000);
  }
  // Workers AI's free plan has a daily allowance; when it runs out, its agents rest until it resets (00:00 UTC)
  qx() { return this.quota && Date.now() < this.quota ? " AND src!='workers-ai'" : ""; }
  agentsFor(pid, role) { return this.sql().exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src NOT IN ('visitor','agent')" + this.qx() + " ORDER BY COALESCE(score,0) DESC, done", pid).toArray().filter((a) => JSON.parse(a.roles).includes(role)); }
  // jobs run alongside the alarm: a slow model holds up only its own task, never the whole swarm
  fly(pid, job) { this._fly = this._fly || {}; this._fly[pid] = (this._fly[pid] || 0) + 1; return job().catch((e) => this.say(pid, "hive", "error", String(e && e.message || e).slice(0, 200))).finally(() => { this._fly[pid]--; }); }
  flying(pid) { return (this._fly && this._fly[pid]) || 0; }
  async call(p, a, system, user, max) {
    const q = this.sql(); q.exec("UPDATE proj SET calls=calls+1 WHERE id=?", p.id);
    let room = THINKS.test(a.model) ? Math.min(8000, Math.max(max * 3, 4000)) : max;
    try {
      let out = clean(await this.ask(a, system, user, room));
      if (!out && room < 8000) { room = Math.min(8000, room * 2); q.exec("UPDATE proj SET calls=calls+1 WHERE id=?", p.id); out = clean(await this.ask(a, system, user, room)); } // it spent everything thinking: once more with room to answer
      if (!out) throw new Error("empty reply"); if (a.err) q.exec("UPDATE agent SET err=NULL WHERE id=? AND pid=?", a.id, p.id); return out;
    }
    catch (e) {
      const msg = String(e && e.message || e);
      if (a.src === "workers-ai" && /4006|daily free allocation|neurons/i.test(msg)) { // out of today's allowance: rest, don't die
        const d = new Date(); this.quota = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 2); await this.ctx.storage.put("quota", this.quota);
        q.exec("UPDATE proj SET calls=MAX(0,calls-1) WHERE id=?", p.id); q.exec("UPDATE agent SET status='idle', task=NULL WHERE id=? AND pid=?", a.id, p.id);
        return null;
      }
      // why it failed decides when it tries again: never (it can't chat), in hours (no credit), in a minute (busy), or in ten
      const never = /not support chat|chat\/completions endpoint|cannot be used with|terms acceptance|does not exist|not.?found|no access|not allowed|unsupported|decommission|deprecated|reduce the length/i.test(msg) || [404].includes(e && e.status);
      const broke = !never && /credit|billing|balance|insufficient|payment|quota exceeded|exceeded your current quota/i.test(msg);
      const busy = !never && !broke && /429|rate.?limit|too many|overloaded|capacity|timeout|timed out|503|502/i.test(msg);
      const wait = never ? "" : broke ? " (no credit; trying again in 6 hours)" : busy ? " (busy; retrying in a minute)" : " (retrying in 10 minutes)";
      q.exec("UPDATE agent SET status=?, task=NULL, last=?, err=? WHERE id=? AND pid=?", never ? "retired" : "offline", Date.now() + (broke ? 6 * 3600e3 - 600e3 : busy ? -540e3 : 0), msg.slice(0, 200), a.id, p.id);
      if (a.err !== msg.slice(0, 200)) this.say(p.id, a.name, never ? "retired" : "offline", msg.slice(0, 200) + (never ? " (this model can't do this job; it leaves the swarm)" : wait)); // same error again: don't repeat it in the feed
      return null;
    }
  }
  async advance(p) {
    const q = this.sql(), SYS = (role) => "You are one agent in Mentifaber Hive, a swarm building a project together. Your role: " + role.toUpperCase() + ". " + ROLES[role] + " Stay inside your task; others handle the rest.";
    if (p.status === "planning" || p.status === "replanning") {
      this.fails = this.fails || {}; const nf = this.fails[p.id] || 0;
      const cands = [...this.agentsFor(p.id, "coordinator"), ...this.agentsFor(p.id, "architect"), ...this.agentsFor(p.id, "integrator"), ...q.exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src NOT IN ('visitor','agent')" + this.qx(), p.id).toArray()];
      const coord = cands[nf % Math.max(1, cands.length)];
      if (!coord) { q.exec("UPDATE proj SET status='failed' WHERE id=?", p.id); this.say(p.id, "hive", "error", "no model is available to coordinate"); return; }
      const have = q.exec("SELECT id,role,title,status FROM task WHERE pid=?", p.id).toArray();
      const out = await this.call(p, coord, "You are the COORDINATOR of an AI swarm. Split the project into 6 to 16 concrete tasks, each for one role from: " + Object.keys(ROLES).filter((r) => r !== "integrator").join(", ") + ". Use deps to order them (ids of earlier tasks). If the project is a physical design (a building, floor plan, room, site, product, machine, circuit), include a designer task that draws the plans as SVG to a stated scale with labelled dimensions, and a tester task that checks every dimension, area and part count adds up and fits. Reply ONLY with JSON: {\"title\": short project name, \"tasks\": [{\"id\":1,\"role\":\"architect\",\"title\":\"...\",\"detail\":\"...\",\"deps\":[]}]}",
        "PROJECT BRIEF:\n" + p.brief + (have.length ? "\n\nEXISTING TASKS (keep their ids, add new ones after them for the owner's latest notes):\n" + JSON.stringify(have) + "\n\nOWNER NOTES:\n" + q.exec("SELECT text FROM feed WHERE pid=? AND who='you' ORDER BY ts DESC LIMIT 4", p.id).toArray().map((r) => r.text).join("\n") : ""), 1500);
      let plan = out ? jsonOf(out) : null; if (Array.isArray(plan)) plan = { tasks: plan };
      if (!plan || !Array.isArray(plan.tasks) || !plan.tasks.length) {
        this.fails[p.id] = nf + 1;
        if (out) this.say(p.id, coord.name, "error", "plan unreadable, handing to another coordinator. It said: " + out.slice(0, 160));
        if (nf + 1 < 3 || have.length) return;
        // three coordinators failed: fall back to a plan every project can use
        plan = BUILTIN_PLAN;
        this.say(p.id, "hive", "info", "using the built-in plan");
      }
      const idmap = {}, base = q.exec("SELECT COALESCE(MAX(id),0) m FROM task").one().m;
      for (const t of (plan.tasks || []).slice(0, 16)) {
        if (have.some((h) => h.id === t.id)) continue; const role = ROLES[t.role] && t.role !== "integrator" ? t.role : "coder";
        q.exec("INSERT INTO task(pid,role,title,detail,deps,status,agent,output,note,tries,ts) VALUES(?,?,?,?,?,'open',NULL,NULL,NULL,0,?)", p.id, role, String(t.title || "task").slice(0, 120), String(t.detail || "").slice(0, 2000), "[]", Date.now());
        idmap[t.id] = q.exec("SELECT last_insert_rowid() i").one().i;
      }
      for (const t of plan.tasks || []) if (idmap[t.id]) q.exec("UPDATE task SET deps=? WHERE id=?", JSON.stringify((t.deps || []).map((d) => idmap[d] || (have.some((h) => h.id === d) ? d : null)).filter(Boolean)), idmap[t.id]);
      if (plan.title && !have.length) q.exec("UPDATE proj SET title=? WHERE id=?", String(plan.title).slice(0, 80), p.id);
      q.exec("UPDATE proj SET status='working' WHERE id=?", p.id); this.say(p.id, coord.name, "plan", "task board: " + Object.keys(idmap).length + " new tasks");
      return;
    }
    q.exec("UPDATE task SET status='open', agent=NULL WHERE pid=? AND status='claimed' AND agent LIKE 'visitor:%' AND ts<?", p.id, Date.now() - 6e5); // a visitor that never came back
    if (!this.flying(p.id)) { // nothing is running here, so anything marked as running was lost to a restart: put it back
      q.exec("UPDATE task SET status='open', agent=NULL WHERE pid=? AND status='claimed' AND (agent IS NULL OR agent NOT LIKE 'visitor:%')", p.id);
      q.exec("UPDATE task SET status='review' WHERE pid=? AND status='reviewing'", p.id);
      q.exec("UPDATE agent SET status='idle', task=NULL WHERE pid=? AND status IN ('working','reviewing') AND src!='visitor'", p.id);
    }
    const jobs = [];
    // critics review work in review
    for (const t of q.exec("SELECT * FROM task WHERE pid=? AND status='review' ORDER BY id", p.id).toArray()) {
      const c = this.agentsFor(p.id, "critic").find((a) => a.id !== t.agent) || this.agentsFor(p.id, "tester").find((a) => a.id !== t.agent); if (!c || this.flying(p.id) >= PARALLEL) break;
      q.exec("UPDATE agent SET status='reviewing', task=?, last=? WHERE id=? AND pid=?", t.id, Date.now(), c.id, p.id); q.exec("UPDATE task SET status='reviewing' WHERE id=?", t.id);
      jobs.push(this.fly(p.id, async () => {
        const out = await this.call(p, c, SYS("critic"), "PROJECT BRIEF (context only):\n" + p.brief + "\n\nTHE TASK UNDER REVIEW, #" + t.id + " (" + t.role + "): " + t.title + "\n" + t.detail + "\n\nWORK SUBMITTED:\n" + (t.output || "").slice(0, 14000) +
          "\n\nJudge only this task: does the work do what THIS task asks, correctly and completely? Other tasks cover the rest of the brief, so never ask one task for the whole project. REDO only for real faults: wrong facts, numbers that don't add up or parts that don't fit, broken or unfinished code, text cut off, a contradiction of the brief, or part of this task left out. Reply with APPROVE or REDO on the first line, then one short paragraph (for REDO: the exact fixes).", 500);
        q.exec("UPDATE agent SET status=CASE WHEN status='offline' THEN 'offline' ELSE 'idle' END, task=NULL, done=done+1, last=? WHERE id=? AND pid=?", Date.now(), c.id, p.id);
        if (!out) { q.exec("UPDATE task SET status='review' WHERE id=?", t.id); return; }
        const yes = /^\W*approve/i.test(out), ok = yes || t.tries >= 2; // after two redos it moves on, and the open points go to the final pass
        if (t.agent) q.exec("UPDATE agent SET score=COALESCE(score,0)+? WHERE id=? AND pid=?", yes ? 2 : -1, t.agent, p.id); // agents earn their place
        q.exec("UPDATE task SET status=?, note=?, tries=tries+?, agent=CASE WHEN ? THEN agent ELSE NULL END WHERE id=?", ok ? "done" : "open", (ok && !yes ? "UNRESOLVED: " : "") + out.slice(0, 1200), ok ? 0 : 1, ok ? 1 : 0, t.id);
        this.say(p.id, c.name, yes ? "approve" : ok ? "accept" : "redo", "#" + t.id + " " + t.title + ": " + (ok && !yes ? "accepted after 2 redos; what the reviewer still wanted goes to the final pass. " : "") + out.split("\n").slice(0, 3).join(" ").slice(0, 300));
      }));
    }
    // idle agents claim open work for their roles
    for (const a of q.exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src NOT IN ('visitor','agent')" + this.qx(), p.id).toArray().sort((x, y) => (y.score || 0) - (x.score || 0) || this.rank(x.model) - this.rank(y.model) || x.done - y.done)) {
      if (this.flying(p.id) >= PARALLEL) break; const t = this.claim(p.id, a, JSON.parse(a.roles)); if (!t) continue;
      jobs.push(this.fly(p.id, async () => {
        const web = t.role === "researcher" ? await this.webContext(t.title + " " + (t.detail || "").slice(0, 120), !!p.own) : "";
        const redo = t.note ? "\n\nA REVIEWER SENT THIS BACK:\n" + t.note + "\n\nPREVIOUS ATTEMPT:\n" + (t.output || "").slice(0, 6000) : "";
        const out = await this.call(p, a, SYS(t.role), "PROJECT BRIEF:\n" + p.brief + "\n\nYOUR TASK #" + t.id + ": " + t.title + "\n" + t.detail + "\n\nWORK SO FAR:\n" + this.context(p.id, t) + web + redo + "\n\nDeliver the finished work for this task only, complete (never stop mid-way), with no preamble about what you're going to do.", 3500);
        if (!out) { q.exec("UPDATE task SET status='open', agent=NULL WHERE id=?", t.id); return; }
        q.exec("UPDATE task SET status='review', output=?, ts=? WHERE id=?", out.slice(0, 60000), Date.now(), t.id);
        q.exec("UPDATE agent SET status='idle', task=NULL, done=done+1, last=? WHERE id=? AND pid=?", Date.now(), a.id, p.id);
        this.say(p.id, a.name, "work", "#" + t.id + " " + t.role + " · " + t.title + " (" + out.length + " chars)");
      }));
    }
    if (jobs.length) { const all = Promise.all(jobs); if (this.ctx.waitUntil) this.ctx.waitUntil(all); await Promise.race([all, new Promise((r) => setTimeout(r, +this.env.HIVE_SLOW_TICK || SLOW_TICK))]); return; } // a slow job carries on; the next tick starts the rest
    if (this.flying(p.id)) return; // still working: not the moment to assemble
    // all done? integrate
    const left = q.exec("SELECT COUNT(*) c FROM task WHERE pid=? AND status!='done'", p.id).one().c, total = q.exec("SELECT COUNT(*) c FROM task WHERE pid=?", p.id).one().c;
    if (total && !left && p.status !== "integrating") {
      q.exec("UPDATE proj SET status='integrating' WHERE id=?", p.id);
      this._igTried = this._igTried || {}; const tried = (this._igTried[p.id] = this._igTried[p.id] || new Set());
      const rows = q.exec("SELECT id,role,title,output FROM task WHERE pid=? ORDER BY id", p.id).toArray();
      const stitch = () => { // nobody could assemble it: hand over everything the swarm approved, in order
        const t = "# " + p.title + "\n\n_The integrators couldn't finish, so here is every approved piece of work in order._\n\n" + rows.map((r) => "## #" + r.id + " " + r.role + ": " + r.title + "\n\n" + r.output).join("\n\n---\n\n");
        q.exec("UPDATE proj SET status='done', final=? WHERE id=?", t.slice(0, 200000), p.id); this.say(p.id, "hive", "done", "put together the approved work as the result (" + t.length + " chars)"); delete this._igTried[p.id];
      };
      const ig = [...new Map([...this.agentsFor(p.id, "integrator"), ...this.agentsFor(p.id, "coder"), ...this.agentsFor(p.id, "writer"), ...this.agentsFor(p.id, "architect")].map((a) => [a.id, a])).values()]
        .sort((x, y) => this.rank(x.model) - this.rank(y.model) || (y.score || 0) - (x.score || 0)).find((a) => !tried.has(a.id)); // the strongest available model assembles
      if (!ig || tried.size >= 3) { stitch(); return; }
      tried.add(ig.id);
      const all = q.exec("SELECT id,role,title,output FROM task WHERE pid=? ORDER BY id", p.id).toArray().map((r) => "#" + r.id + " " + r.role + ": " + r.title + "\n" + r.output.slice(0, 9000)).join("\n\n").slice(0, 60000);
      const open = q.exec("SELECT id,title,note FROM task WHERE pid=? AND note LIKE 'UNRESOLVED:%' ORDER BY id", p.id).toArray().map((r) => "#" + r.id + " " + r.title + ": " + r.note.slice(12, 700)).join("\n");
      let out = await this.call(p, ig, SYS("integrator") + " Deliver the whole thing, not a summary or an outline of it. If the project is software for the web, deliver ONE complete self-contained HTML file in a ```html block (inline CSS and JS, no external files unless from a CDN). Otherwise deliver the finished document in Markdown." +
        " If it is a physical design (a building, floor plan, room, site, product, machine, circuit), the deliverable must include the drawings as inline SVG (plans, elevations, diagrams) drawn to a stated scale with labelled dimensions, and every number must agree: areas equal length × width, parts fit inside the footprint, counts and totals add up; where the team's numbers conflict, pick consistent ones and say so. Fix the reviewers' open points below. Start with the deliverable itself: no preamble.",
        "BRIEF:\n" + p.brief + "\n\nALL APPROVED WORK:\n" + all + (open ? "\n\nREVIEWERS' OPEN POINTS (fix these in the final):\n" + open.slice(0, 8000) : ""), 8000);
      if (!out) { q.exec("UPDATE proj SET status='working' WHERE id=?", p.id); return; }
      out = out.replace(/^\s*(here(?:'s| is| are)|below is|sure|okay|certainly)[^\n]{0,200}\n+(?=```)/i, ""); // "Here is the complete file:" adds nothing
      const need = Math.min(2500, Math.round(all.length * 0.2)), fences = (out.match(/```/g) || []).length;
      if (out.length < need || fences % 2) { // a stub or cut off mid-way: not a deliverable
        q.exec("UPDATE agent SET score=COALESCE(score,0)-2 WHERE id=? AND pid=?", ig.id, p.id); q.exec("UPDATE proj SET status='working' WHERE id=?", p.id);
        this.say(p.id, ig.name, "redo", "final draft was " + (fences % 2 ? "cut off" : "too short (" + out.length + " chars)") + "; handing it to another integrator"); return;
      }
      delete this._igTried[p.id];
      q.exec("UPDATE proj SET status='done', final=? WHERE id=?", out.slice(0, 200000), p.id); this.say(p.id, ig.name, "done", "assembled the final deliverable (" + out.length + " chars)");
      return;
    }
    // stuck: nobody can take what's open (no idle agent with that role) → let any idle agent take it next tick
    const stuck = q.exec("SELECT * FROM task WHERE pid=? AND status='open'", p.id).toArray();
    if (stuck.length) for (const a of q.exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src NOT IN ('visitor','agent')" + this.qx(), p.id).toArray()) {
      const roles = JSON.parse(a.roles); for (const t of stuck) if (!roles.includes(t.role)) roles.push(t.role); q.exec("UPDATE agent SET roles=? WHERE id=? AND pid=?", JSON.stringify(roles), a.id, p.id);
    }
    if (!q.exec("SELECT COUNT(*) c FROM agent WHERE pid=? AND status NOT IN ('offline','retired') AND src!='agent'", p.id).one().c && !(this.quota && Date.now() < this.quota)) { q.exec("UPDATE proj SET status='failed' WHERE id=?", p.id); this.say(p.id, "hive", "error", "every agent went offline"); }
  }

  // ── the key vault: unlimited keys, any provider, sealed at rest, owner only ──
  async vk() { return (this._vk = this._vk || (await vaultKey(this.env, this.ctx.storage))); }
  async vaultGet(id) {
    if (id.startsWith("env-")) { const k = KEYED.find((x) => "env-" + x.id === id && this.env[x.env]); if (!k) throw new Error("that provider's secret isn't set"); return { v: { id, provider: k.id, kind: "compat", base: k.url.replace(/\/chat\/completions$/, "") }, key: this.env[k.env] }; }
    const v = this.sql().exec("SELECT * FROM vault WHERE id=?", id).toArray()[0]; if (!v || !v.live) throw new Error("that key is gone or switched off");
    this.sql().exec("UPDATE vault SET used=COALESCE(used,0)+1 WHERE id=?", id); return { v, key: await unseal(await this.vk(), v.sealed) };
  }
  pub(v) { return { id: v.id, provider: v.provider, name: (PRESETS[v.provider] || {}).name || v.provider, kind: v.kind, label: v.label, base: (PRESETS[v.provider] || {}).editBase ? v.base : undefined, pull: !!(PRESETS[v.provider] || {}).pull, tail: v.tail, models: JSON.parse(v.models || "[]").length, list: JSON.parse(v.models || "[]"), pick: v.pick || "", live: !!v.live, err: v.err, used: v.used || 0, ts: v.ts }; }
  async keys(path, b, owner, J) {
    if (!owner) return J({ error: "the key vault is the owner's: sign in on Vigil first" }, 401);
    const q = this.sql();
    if (path === "/keys") return J({ presets: Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, { name: p.name, kind: p.kind, base: p.base, editBase: !!p.editBase, keyless: !!p.keyless }])), keys: q.exec("SELECT * FROM vault ORDER BY ts").toArray().map((v) => this.pub(v)) });
    if (path === "/keys/add") {
      const pre = PRESETS[b.provider]; if (!pre) return J({ error: "pick a provider" }, 400);
      const key = String(b.key || "").trim(); if (!(pre.keyless && !key) && (key.length < 8 || key.length > 4000 || /\s/.test(key))) return J({ error: "that doesn't look like an API key" }, 400);
      if (q.exec("SELECT COUNT(*) c FROM vault").one().c >= MAX_KEYS) return J({ error: "the vault holds " + MAX_KEYS + " keys; remove some first" }, 400);
      let base = pre.base || ""; if (pre.editBase && (b.base || !base)) { base = String(b.base || "").trim().replace(/\/+$/, ""); if (!/^https:\/\/[^/\s]+/.test(base)) return J({ error: "a custom provider needs its https base URL (the part before /chat/completions)" }, 400); }
      const v = { id: crypto.randomUUID().slice(0, 12), provider: b.provider, kind: pre.kind, label: String(b.label || "").slice(0, 40), base, tail: key ? key.slice(-4) : "none" };
      let models = [], err = null; try { models = await probe(v, key); } catch (e) { err = String(e.message || e).slice(0, 200); }
      if (err && !b.force) return J({ error: "the provider refused it: " + err, canForce: true }, 400);
      q.exec("INSERT INTO vault(id,provider,kind,label,base,sealed,tail,models,pick,live,err,used,ts) VALUES(?,?,?,?,?,?,?,?,?,1,?,0,?)", v.id, v.provider, v.kind, v.label, base, await seal(await this.vk(), key), v.tail, JSON.stringify(models), String(b.pick || "").slice(0, 2000), err, Date.now());
      return J({ ok: true, key: this.pub(q.exec("SELECT * FROM vault WHERE id=?", v.id).one()) });
    }
    const v = q.exec("SELECT * FROM vault WHERE id=?", String(b.kid || "")).toArray()[0]; if (!v) return J({ error: "no such key" }, 404);
    if (path === "/keys/pull") { // Ollama: fetch a model onto the server, then refresh the list
      if (!(PRESETS[v.provider] || {}).pull) return J({ error: "only Ollama servers pull models" }, 400);
      const name = String(b.model || "").trim(); if (!/^[\w.\-\/:]{2,120}$/.test(name)) return J({ error: "name a model, e.g. llama3.2 or qwen3:8b" }, 400);
      const key = await unseal(await this.vk(), v.sealed); let status; try { status = await pullModel(v, key, name); } catch (e) { return J({ error: "Ollama said: " + e.message }, 502); }
      try { q.exec("UPDATE vault SET models=?, err=NULL WHERE id=?", JSON.stringify(await probe(v, key)), v.id); } catch (e) {}
      return J({ ok: true, status, key: this.pub(q.exec("SELECT * FROM vault WHERE id=?", v.id).one()) });
    }
    if (path === "/keys/del") { q.exec("DELETE FROM vault WHERE id=?", v.id); return J({ ok: true }); }
    if (path === "/keys/set") { if (b.live !== undefined) q.exec("UPDATE vault SET live=? WHERE id=?", b.live ? 1 : 0, v.id); if (b.label !== undefined) q.exec("UPDATE vault SET label=? WHERE id=?", String(b.label).slice(0, 40), v.id); if (b.pick !== undefined) q.exec("UPDATE vault SET pick=? WHERE id=?", String(b.pick).slice(0, 2000), v.id); return J({ ok: true, key: this.pub(q.exec("SELECT * FROM vault WHERE id=?", v.id).one()) }); }
    if (path === "/keys/test") { let err = null, models = JSON.parse(v.models || "[]"); try { models = await probe(v, await unseal(await this.vk(), v.sealed)); } catch (e) { err = String(e.message || e).slice(0, 200); } q.exec("UPDATE vault SET err=?, models=? WHERE id=?", err, JSON.stringify(models), v.id); return J({ ok: !err, error: err, key: this.pub(q.exec("SELECT * FROM vault WHERE id=?", v.id).one()) }); }
    return J({ error: "not found" }, 404);
  }
  async envModels() { // providers set as Worker secrets (OPENROUTER_KEY, GROQ_KEY, GEMINI_KEY): their lists, refreshed hourly
    if (this._envM && Date.now() - this._envM.at < 3600e3) return this._envM.list;
    const list = [];
    for (const k of KEYED) { const key = this.env[k.env]; if (!key) continue; let ids = k.models || [];
      if (k.list) try { const j = await (await fetch(k.list, { headers: { authorization: "Bearer " + key } })).json(); ids = (j.data || []).map((m) => m.id).filter((id) => !/whisper|tts|guard|embed|image|audio|moderation/i.test(id)); if (k.free) ids = [...ids.filter((i) => /:free$/.test(i)), ...ids.filter((i) => !/:free$/.test(i))]; } catch (e) {}
      for (const m of ids.filter(isChat).slice(0, 3000)) list.push({ id: "k:env-" + k.id + "|" + m, name: m, group: k.id[0].toUpperCase() + k.id.slice(1) + " (site secret)", vision: /vision|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|llama-4|pixtral|-vl/i.test(m) }); }
    this._envM = { at: Date.now(), list }; return list;
  }
  rank(id) { // rough strength of a model, by name: lower is stronger
    const m = String(id).split("|").pop(), R = [/claude.*(opus|sonnet)/i, /gpt-5(?!.*nano)|o3(?!-mini)|o4/i, /gemini-(2\.5-pro|3)/i, /grok-4/i, /deepseek-(r1|v3|chat|reasoner)/i, /gpt-4\.1(?!-nano)|gpt-4o(?!-mini)|mistral-(large|medium)/i, /llama-4|llama-3\.[13]-(70|405)b|qwen3|kimi|gpt-oss-120b|qwq/i, /claude.*haiku|gemini.*flash|gpt-.*mini|command-a/i];
    if (m === "mentifaber-agent-1.0") return 5; const i = R.findIndex((r) => r.test(m)); return i < 0 ? 99 : i;
  }
  sick(c) { this._bad = this._bad || {}; this._badM = this._badM || {}; const k = c.split("|")[0]; return Date.now() - (this._bad[k] || 0) < 3600e3 || Date.now() - (this._badM[c] || 0) < 6 * 3600e3; }
  blame(c, e) { // remember why a model failed: the whole key (billing, bad key) or just this model (not allowed, not found)
    const em = String(e && e.message || e); this._bad = this._bad || {}; this._badM = this._badM || {};
    if (/billing|credit|insufficient|payment|invalid.*(api|x-api)?.?key|incorrect api key|unauthori[sz]ed/i.test(em) || [401, 402].includes(e && e.status)) this._bad[c.split("|")[0]] = Date.now();
    else if (/not.?found|does not exist|not allowed|no access|permission|unsupported|invalid model|model_not|decommission|deprecated/i.test(em) || [400, 403, 404].includes(e && e.status)) this._badM[c] = Date.now();
  } // keys that just failed (no credit, bad key) sit out an hour
  async resting() { if (this.quota === undefined) this.quota = (await this.ctx.storage.get("quota")) || 0; return this.quota && Date.now() < this.quota ? this.quota : 0; }
  async rest() { const d = new Date(); this.quota = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 2); await this.ctx.storage.put("quota", this.quota); }
  // When Cloudflare's free allowance is out, the owner's own keys answer instead: a sensible everyday model first.
  async standIn(not) {
    const ms = [...this.models(true).filter((m) => m.id.startsWith("k:")), ...(await this.envModels())].filter((m) => m.id !== not);
    const ok = ms.filter((m) => !this.sick(m.id)).sort((a, b) => this.rank(a.id) - this.rank(b.id) || (/:free$/.test(b.id) ? 1 : 0) - (/:free$/.test(a.id) ? 1 : 0));
    return (ok[0] || ms[0] || {}).id || null;
  }
  models(owner) { // what the Studio can talk to
    const out = this.env.AI ? CF_MODELS.map(([m, name]) => ({ id: "workers-ai|" + m, name, group: "Cloudflare Workers AI (free)" })) : [];
    if (owner) for (const v of this.sql().exec("SELECT * FROM vault WHERE live=1 AND kind NOT IN ('search','voice') ORDER BY ts").toArray()) {
      const g = (v.label ? v.label + " · " : "") + ((PRESETS[v.provider] || {}).name || v.provider) + " ••" + v.tail, pick = (v.pick || "").split(",").map((x) => x.trim()).filter(Boolean);
      for (const m of [...new Set([...pick, ...JSON.parse(v.models || "[]").filter(isChat)])]) out.push({ id: "k:" + v.id + "|" + m, name: m, group: g, vision: /vision|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|llama-4|pixtral|grok-(2-vision|4)|qwen.*vl|-vl/i.test(m) });
    }
    return out;
  }
  async voices(owner) { // every voice Hive can speak with right now, most human first: ElevenLabs, then the free Aura-2, then OpenAI
    const el = [], oa = [], a2 = [];
    if (owner) for (const v of this.sql().exec("SELECT * FROM vault WHERE live=1 AND (kind='voice' OR provider='openai') ORDER BY ts").toArray()) {
      if (v.kind === "voice") for (const x of JSON.parse(v.models || "[]").slice(0, 60)) { const [name, id] = x.split("|"); el.push({ id: "el:" + v.id + ":" + id, name, group: "ElevenLabs" + (v.label ? " · " + v.label : "") }); }
      else if (!this.sick("k:" + v.id + "|tts")) for (const x of OPENAI_VOICES) oa.push({ id: "oa:" + v.id + ":" + x, name: x[0].toUpperCase() + x.slice(1), group: "OpenAI expressive" + (v.label ? " · " + v.label : "") });
    }
    if (this.env.AI) for (const x of AURA2) a2.push({ id: "a2:" + x, name: x[0].toUpperCase() + x.slice(1), group: "Deepgram Aura-2 (free)" });
    return [...el, ...a2, ...oa];
  }
  async searchKey(own) { if (!own) return null; const v = this.sql().exec("SELECT * FROM vault WHERE live=1 AND kind='search' ORDER BY COALESCE(used,0) LIMIT 1").toArray()[0]; return v ? this.vaultGet(v.id) : null; }
  async web(q, own) { const k = await this.searchKey(own).catch(() => null); try { return await search(k && k.v, k && k.key, q); } catch (e) { if (k) return search(null, null, q); throw e; } }
  async webContext(q, own) { try { const r = await this.web(q.slice(0, 300), own); return r.length ? "\n\nWEB SEARCH RESULTS:\n" + r.map((x, i) => "[" + (i + 1) + "] " + x.title + " — " + x.url + "\n" + String(x.text || "").slice(0, 900)).join("\n\n") : ""; } catch (e) { return ""; } }
  meter(req, kind, max) { // the public's daily allowance per visitor; the owner has none
    const q = this.sql(), day = new Date().toISOString().slice(0, 10), k = kind + ":" + day + ":" + (req.headers.get("cf-connecting-ip") || "x").slice(0, 45);
    const n = (q.exec("SELECT n FROM limits WHERE k=?", k).toArray()[0] || { n: 0 }).n; if (n >= max) return false;
    q.exec("INSERT INTO limits(k,n) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=n+1", k); return true;
  }
  async studio(path, b, owner, req, J) {
    if (!this.env.AI && path !== "/chat") return J({ error: "Workers AI is not bound on this deployment" }, 503);
    if (path === "/imagine") {
      const prompt = String(b.prompt || "").trim(); if (!prompt) return J({ error: "describe the picture" }, 400);
      if (!owner && !this.meter(req, "img", IMAGINE_DAY)) return J({ error: "that's today's " + IMAGINE_DAY + " pictures; come back tomorrow" }, 429);
      if (owner && (await Mind.state(this)).on) Mind.log(this, "image", prompt);
      return J({ image: "data:image/jpeg;base64," + (await imagine(this.env, prompt)) });
    }
    if (path === "/stt") {
      const a = String(b.audio || "").replace(/^data:[^,]*,/, ""); if (!a || a.length > 8e6) return J({ error: "no audio, or more than a few minutes of it" }, 400);
      if (!owner && !this.meter(req, "stt", STUDIO_DAY * 2)) return J({ error: "voice allowance used up for today" }, 429);
      return J({ text: await transcribe(this.env, a, String(b.lang || "").slice(0, 2).toLowerCase()) });
    }
    if (path === "/tts") {
      const t = String(b.text || "").replace(/[*_`#>|]/g, "").trim(); if (!t) return J({ error: "nothing to say" }, 400);
      if (!owner && !this.meter(req, "tts", STUDIO_DAY * 4)) return J({ error: "voice allowance used up for today" }, 429);
      const spec = owner ? String(b.voice || "") : (/^a2:\w+$/.test(String(b.voice || "")) ? b.voice : "a2:thalia"); // visitors: the free voices only
      const keyFor = async (kid, full) => { const r = await this.vaultGet(kid); return full ? r : r.key; };
      const out = await voiceOut(this.env, t, spec || (await this.voices(owner))[0].id, owner ? keyFor : null);
      return J({ audio: "data:audio/mpeg;base64," + out.audio, used: out.used });
    }
    // chat
    let [src, model] = String(b.model || "").split("|"); if (!src || !model) return J({ error: "pick a model" }, 400);
    if (src.startsWith("k:") && !owner) return J({ error: "vault models are the owner's" }, 401);
    const outMsg = (t) => "Cloudflare's free AI allowance is used up until " + new Date(t).toISOString().slice(11, 16) + " UTC. " + (owner ? "Add a key under Keys and Hive will switch to it automatically." : "Come back then.");
    if (src === "workers-ai" && !CF_MODELS.some((m) => m[0] === model)) return J({ error: "unknown model" }, 400);
    if (src === "agent") { const ag = await this.agentInfo(); if (!ag || !ag.model) return J({ error: "MENTIFABER AGENT 1.0 has no model loaded yet" }, 400); if (!owner && !ag.public) return J({ error: "MENTIFABER AGENT 1.0 is private" }, 401); }
    if (!owner && !this.meter(req, "chat", STUDIO_DAY)) return J({ error: "that's today's " + STUDIO_DAY + " messages; come back tomorrow, or sign in" }, 429);
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-24).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", text: String(m.text || "").slice(0, 16000), images: Array.isArray(m.images) ? m.images.filter((u) => typeof u === "string" && u.startsWith("data:image/") && u.length < 4e6).slice(0, 8) : [] }));
    const last = msgs[msgs.length - 1]; if (!last || last.role !== "user" || !(last.text || last.images.length)) return J({ error: "say something" }, 400);
    msgs.forEach((m) => m !== last && (m.images = []));
    const t0 = Date.now(), sources = [], notes = [], tools = [];
    let mind = ""; // the owner's profile, memories and recent activity ride along with every owner chat
    if (owner && b.mind !== false && (await Mind.state(this)).on) {
      const r = Mind.heard(last.text); if (r && Mind.remember(this, r, "you")) tools.push("saved to memory");
      Mind.log(this, b.voice ? "voice" : b.swarm ? "council" : "chat", last.text + (last.images.length ? " [+" + last.images.length + (b.frames ? " video frames" : b.live ? " live camera/screen frame" : " image(s)") + "]" : ""), { model: b.model, web: b.web ? 1 : undefined });
      mind = await Mind.brief(this); Mind.maybeAnalyze(this, new URL(req.url).origin);
    }
    // pasted links get read
    const urls = [...new Set((last.text.match(/https?:\/\/[^\s<>"')\]]+/g) || []))].slice(0, 3);
    for (const u of urls) try { const pg = await readPage(u); sources.push({ title: pg.title, url: pg.url }); notes.push("[" + sources.length + "] PAGE " + pg.title + " — " + pg.url + "\n" + pg.text); tools.push("read " + new URL(pg.url).hostname); } catch (e) { notes.push("(could not read " + u + ": " + e.message + ")"); }
    // the weather, from the same source as mentifaber.org/wx: wherever they name, or where they are (a place said on its own
    // right after a weather question counts, which is how it goes in voice)
    const said = msgs.filter((m) => m.role === "user"), prevAsk = said.length > 1 && asksWeather(said[said.length - 2].text);
    if (asksWeather(last.text) || (prevAsk && placeIn(last.text, true))) {
      let geo = null; try { geo = JSON.parse(req.headers.get("x-geo") || "null"); } catch (e) {}
      const place = placeIn(last.text, !asksWeather(last.text)) || (prevAsk ? placeIn(said[said.length - 2].text) : null);
      try { const w = await weather(place, geo); const link = new URL(req.url).origin + "/wx/?lat=" + (+w.lat).toFixed(4) + "&lon=" + (+w.lon).toFixed(4) + "&name=" + encodeURIComponent(w.name);
        sources.push({ title: "Quick Weather · " + w.name, url: link }); notes.push("[" + sources.length + "] LIVE WEATHER from Open-Meteo, the same source as the owner's Quick Weather app (" + link + "):\n" + w.text); tools.push("checked the weather for " + w.name); }
      catch (e) { notes.push("(the weather lookup failed: " + e.message + "; say so and suggest naming the town)"); }
    }
    // the web
    if (b.web) { const r = await this.web((b.query || last.text).slice(0, 300), owner).catch((e) => (notes.push("(search failed: " + e.message + ")"), [])); for (const x of r) { sources.push({ title: x.title, url: x.url }); notes.push("[" + sources.length + "] " + x.title + " — " + x.url + "\n" + String(x.text || "").slice(0, 1200)); } if (r.length) tools.push("searched the web"); }
    // eyes: Workers AI and models without vision get descriptions instead of pixels
    let v = null, key = null, used = b.model; const tryIn = async () => { const s2 = await this.standIn(); if (!s2) return false; [src, model] = s2.split("|"); ({ v, key } = await this.vaultGet(src.slice(2))); used = s2; tools.push("free allowance resting, answered by " + model.split("/").pop()); return true; };
    if (src === "workers-ai" && (await this.resting()) && !(owner && (await tryIn()))) return J({ error: outMsg(this.quota), quota: this.quota }, 429);
    if (src.startsWith("k:")) ({ v, key } = await this.vaultGet(src.slice(2)));
    if (src === "agent") v = this.agentV();
    const looks = async () => { const ds = []; for (const [i, u] of last.images.entries()) ds.push("[" + (b.frames ? "Video frame " + (b.frames[i] || i + 1) : "Image " + (i + 1)) + ": " + ((await describe(this.env, u, b.frames ? "Describe what is happening in this video frame." : null).catch(() => "")) || "(could not see it)") + "]"); return ds.join("\n"); };
    if (last.images.length && (!v || v.noVision || b.swarm)) { last.text = (await looks()) + "\n\n" + last.text; last.images = []; tools.push("looked at " + (b.frames ? "the video" : "the image" + (msgs.length > 1 ? "s" : ""))); }
    const now = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    // MENTIFABER AGENT keeps the start of the conversation cached between messages, so for it everything that changes
    // every message (the time, recent activity, gathered material) rides at the end of the newest message instead
    const local = src === "agent", mp = owner && mind ? await Mind.parts(this) : { stable: "", recent: "" };
    const live = "Now: " + now + "." + (mp.recent && local ? mp.recent : "") + (notes.length ? "\n\nMATERIAL GATHERED FOR THIS ANSWER (cite with [n] where you use it):\n" + notes.join("\n\n").slice(0, 30000) : "");
    if (local) last.text = "[CONTEXT FOR THIS MESSAGE]\n" + live + "\n[END CONTEXT]\n\n" + last.text;
    const system = "You are Hive, the assistant of Hive on mentifaber.org, answering through the model " + model.split("/").pop() + ". " +
      "Hive is an app that brings many AI models together. Its abilities, which the user switches on with buttons (you don't call them yourself): Search (live web results are handed to you below as MATERIAL with numbered sources), reading links the user pastes (their text is handed to you), live weather (when they ask about the weather, Hive looks it up automatically from Open-Meteo, the source behind the owner's Quick Weather app at mentifaber.org/wx, and hands it to you as MATERIAL; if no MATERIAL came, ask which town), seeing photos and video (you get the pictures, or descriptions of them), Imagine (makes pictures from words), voice conversation, the Council (several models answer at once and a lead model merges the best), and the Swarm (a team of agents that plans, builds, reviews and assembles whole projects; any answer can be handed to it). If asked what you can do, describe these accurately; never say you lack them, and never claim to have used one unless its results appear below. " +
      "Reply in the language the user writes in" + (b.lang ? " (their device is set to " + String(b.lang).slice(0, 12) + ")" : "") + ". Messages can come from voice dictation, which sometimes mishears English as another language or as nonsense; if a message looks like that, reply in the device's language and briefly ask what they meant. " +
      "Be warm, direct and genuinely helpful: lead with the answer, think carefully, admit uncertainty plainly, and never invent facts or sources. Use Markdown (headings sparingly, lists, fenced code with a language)." + (local ? "" : " Now: " + now + ".") +
      (b.frames ? " The user attached a video; you are given frames sampled in order (with times), treat them as one clip." : "") + (b.voice ? " This is a live spoken conversation: answer like a person talking, in a few natural sentences (start with the answer itself, keep the first sentence short), no Markdown, no lists, no emoji." : "") + (b.live ? " The user is talking to you live with their camera or screen on: the attached image is exactly what it shows right now, so refer to what you see naturally." : "") +
      (owner ? "\n\n" + OWNER_MODE + (local ? mp.stable : mind) : "") + (local ? "" :
      (notes.length ? "\n\nMATERIAL GATHERED FOR THIS ANSWER (cite with [n] where you use it):\n" + notes.join("\n\n").slice(0, 30000) : "")) + (b.system ? "\n\nOWNER'S INSTRUCTIONS:\n" + String(b.system).slice(0, 4000) : "");
    let text;
    if (b.swarm) { // council: several models draft in parallel, the chosen model weighs them and writes one answer
      const free = ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/mistralai/mistral-small-3.1-24b-instruct"];
      let crew = (Array.isArray(b.crew) ? b.crew : []).map(String).filter((c) => owner ? /^(workers-ai|k:[\w-]+)\|/.test(c) : c.startsWith("workers-ai|")).slice(0, 8);
      if (await this.resting()) crew = crew.filter((c) => !c.startsWith("workers-ai|"));
      // MENTIFABER AGENT leads a council when it's picked, but isn't called in as a member: the council waits for its slowest draft
      const pool = [...(owner ? [...this.models(true).filter((m) => m.id.startsWith("k:")).map((m) => m.id), ...(await this.envModels()).map((m) => m.id)] : []), ...((await this.resting()) ? [] : free.map((m) => "workers-ai|" + m))].filter((c) => c !== used);
      const ranked = () => { const by = {}; for (const id of pool) { if (this.sick(id) || tried.has(id) || (id.startsWith("workers-ai|") && this.quota && Date.now() < this.quota)) continue; (by[id.split("|")[0]] = by[id.split("|")[0]] || []).push(id); } const lists = Object.values(by).map((l) => l.sort((a, b) => this.rank(a) - this.rank(b))).sort((a, b) => this.rank(a[0]) - this.rank(b[0])); const out = []; for (let r = 0; lists.some((l) => l[r]); r++) for (const l of lists) if (l[r]) out.push(l[r]); return out; }; // best of each key first, then their seconds
      const tried = new Set(), want = owner ? 5 : 4;
      if (!crew.length) crew = ranked().slice(0, want);
      if (!owner) for (let k = 0; k < Math.ceil(crew.length / 2); k++) if (!this.meter(req, "chat", STUDIO_DAY)) return J({ error: "a council uses several messages of your daily allowance, and there aren't enough left" }, 429);
      const draft = async (c, n) => { const [cs, cm] = c.split("|"), t1 = Date.now(); tried.add(c); if (cs === "workers-ai" && !CF_MODELS.some((x) => x[0] === cm)) return null;
        try { const kv = cs === "agent" ? { v: this.agentV(150e3), key: null } : cs.startsWith("k:") ? await this.vaultGet(cs.slice(2)) : { v: null, key: null }; const out = await complete(this.env, kv.v, kv.key, cm, system + "\n\nCOUNCIL: you are one of " + n + " models on Hive's council answering this message independently and in parallel; the lead model (" + model.split("/").pop() + ") will merge the drafts into one reply. Give your own best answer to the user; don't talk about the council unless asked.", msgs, 1800); const t = String(out || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); return t ? { model: c, text: t, ms: Date.now() - t1 } : { model: c, error: "empty reply", ms: Date.now() - t1 }; }
        catch (e) { if (!cs.startsWith("workers-ai")) this.blame(c, e); else if (/4006|neurons/i.test(String(e.message))) await this.rest(); return { model: c, error: String(e.message || e).slice(0, 160), ms: Date.now() - t1 }; } };
      let drafts = (await Promise.all(crew.map((c) => draft(c, crew.length)))).filter(Boolean);
      for (let wave = 0; wave < 2 && !b.crew && drafts.filter((d) => d.text).length < Math.min(3, want); wave++) { // members failed: call in the next-best models
        const more = ranked().slice(0, Math.min(3, want) - drafts.filter((d) => d.text).length + 1); if (!more.length) break;
        drafts = drafts.concat((await Promise.all(more.map((c) => draft(c, crew.length + more.length)))).filter(Boolean));
      }
      const good = drafts.filter((d) => d && d.text);
      const failed = drafts.filter((d) => d.error); tools.push("council of " + good.length + (failed.length ? " · " + failed.length + " couldn't answer" : ""));
      const brief = good.map((d, k) => "DRAFT " + String.fromCharCode(65 + k) + " (" + d.model.split("|").pop().split("/").pop() + "):\n" + d.text.slice(0, 7000)).join("\n\n");
      if (!v && (await this.resting()) && owner) await tryIn();
      text = good.length ? await complete(this.env, v, key, model, system + "\n\nYou are the LEAD of Hive's council: this is real. " + good.length + " other models (" + good.map((d) => d.model.split("|").pop().split("/").pop()).join(", ") + ") each drafted an answer to the user's last message. Write the single best answer yourself: keep what is right and well supported, fix what is wrong, merge the strongest ideas, and where they genuinely disagree say so briefly. Do not mention drafts by letter unless it helps the user.", [...msgs.slice(0, -1), { role: "user", text: last.text + "\n\n---\nCOUNCIL DRAFTS:\n" + brief }], Math.min(8192, +b.max || 3000)) : null;
      if (!text) text = await complete(this.env, v, key, model, system + (failed.length ? "\n\nNOTE: the user asked for Hive's council, but none of the " + failed.length + " models called could answer right now (" + failed.map((d) => d.model.split("|").pop().split("/").pop() + ": " + d.error.slice(0, 80)).join("; ") + "). Say so in one sentence, then answer yourself." : ""), msgs, 3000);
      return J({ text: text || "(the model returned nothing)", sources, tools, drafts, ms: Date.now() - t0, model: used });
    }
    if (b.stream) { // words arrive as they're written: server-sent events meta → delta… → done (or error)
      const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder(), max = Math.min(8192, +b.max || (b.voice ? 700 : local ? 8192 : 3000)); // the agent gets every token its memory leaves free
      const emit = (ev, o) => w.write(enc.encode("event: " + ev + "\ndata: " + JSON.stringify(o) + "\n\n")).catch(() => {});
      const ping = setInterval(() => w.write(enc.encode(": still thinking\n\n")).catch(() => {}), 15000); // keeps the line open while a slow model reads
      (async () => {
        let got = 0; const onDelta = (t) => { got++; emit("delta", { t }); };
        try {
          emit("meta", { sources, tools, model: used });
          let out;
          try { out = await streamComplete(this.env, v, key, model, system, msgs, max, onDelta); }
          catch (e) {
            if (got) throw e;
            if (!v && /4006|daily free allocation|neurons/i.test(String(e.message || e))) { await this.rest(); if (!(owner && (await tryIn()))) throw new Error(outMsg(this.quota)); }
            else if (last.images.length) { last.text = (await looks()) + "\n\n" + last.text; last.images = []; tools.push("described the images (the model has no eyes)"); }
            else throw e;
            emit("meta", { sources, tools, model: used });
            out = await streamComplete(this.env, v, key, model, system, msgs, max, onDelta);
          }
          if (!got) { const t = await complete(this.env, v, key, model, system, msgs, max); if (t) onDelta(t); else onDelta("(the model returned nothing)"); } // a provider that streams nothing still answers
          emit("done", { ms: Date.now() - t0, model: used, tools });
        } catch (e) { emit("error", { error: String(e && e.message || e).slice(0, 300) }); }
        clearInterval(ping); w.close().catch(() => {});
      })();
      return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }
    try { text = await complete(this.env, v, key, model, system, msgs, Math.min(8192, +b.max || (b.voice ? 700 : local ? 8192 : 3000))); }
    catch (e) {
      if (!v && /4006|daily free allocation|neurons/i.test(String(e.message || e))) { await this.rest(); if (!(owner && (await tryIn()))) return J({ error: outMsg(this.quota), quota: this.quota }, 429); text = await complete(this.env, v, key, model, system, msgs, Math.min(8192, +b.max || 3000)); return J({ text: text || "(the model returned nothing)", sources, tools, ms: Date.now() - t0, model: used }); }
      if (!last.images.length) throw e; last.text = (await looks()) + "\n\n" + last.text; last.images = []; tools.push("described the images (the model has no eyes)"); text = await complete(this.env, v, key, model, system, msgs, 3000); }
    return J({ text: text || "(the model returned nothing)", sources, tools, ms: Date.now() - t0, model: used });
  }
}
