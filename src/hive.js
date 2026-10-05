// Hive: you give it a project; a swarm of AI agents splits it into a task board, each agent claims the work
// its role fits, critics review, an integrator assembles the result. Agents come only from sources this
// site is allowed to use: Cloudflare Workers AI (env.AI), optional keyed providers (OpenRouter, Groq,
// Gemini: Worker secrets), and visiting AIs (Grok, ChatGPT, …) that join a project by following links.
import { DurableObject } from "cloudflare:workers";

// Workers AI text models. Any that a given account can't run just go offline for that project.
const CF_MODELS = [
  ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Llama 3.3 70B", ["coordinator", "architect", "integrator", "critic"]],
  ["@cf/openai/gpt-oss-120b", "GPT-OSS 120B", ["architect", "coder", "integrator"]],
  ["@cf/openai/gpt-oss-20b", "GPT-OSS 20B", ["coder", "tester"]],
  ["@cf/qwen/qwen2.5-coder-32b-instruct", "Qwen2.5 Coder 32B", ["coder", "tester"]],
  ["@cf/qwen/qwen3-30b-a3b-fp8", "Qwen3 30B", ["coder", "researcher", "critic"]],
  ["@cf/meta/llama-4-scout-17b-16e-instruct", "Llama 4 Scout", ["designer", "writer", "coder"]],
  ["@cf/mistralai/mistral-small-3.1-24b-instruct", "Mistral Small 3.1", ["writer", "designer", "researcher"]],
  ["@cf/google/gemma-3-12b-it", "Gemma 3 12B", ["writer", "designer"]],
  ["@cf/ibm-granite/granite-4.0-h-micro", "Granite 4.0 Micro", ["tester", "writer"]],
  ["@cf/meta/llama-3.1-8b-instruct-fast", "Llama 3.1 8B", ["writer", "tester", "researcher"]],
  ["@cf/meta/llama-3.2-3b-instruct", "Llama 3.2 3B", ["researcher", "writer"]],
  ["@hf/nousresearch/hermes-2-pro-mistral-7b", "Hermes 2 Pro 7B", ["writer", "researcher"]],
  ["@cf/mistral/mistral-7b-instruct-v0.2-lora", "Mistral 7B", ["writer"]],
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
  critic: "Review the work against the brief. Reply APPROVE, or REDO with the exact problems.",
  integrator: "Combine all approved work into the single final deliverable.",
};
// Workers AI replies come in several shapes: {response: "text"}, {response: {parsed JSON}}, OpenAI-style
// {choices}, or Responses-style {output: [{content: [{text}]}]} (GPT-OSS). Turn any of them into text.
function textOf(r) {
  if (r == null) return "";
  if (typeof r === "string") return r.trim();
  const v = r.response;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") return JSON.stringify(v);
  const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content; if (typeof c === "string" && c.trim()) return c.trim();
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text.trim();
  if (Array.isArray(r.output)) { const t = r.output.flatMap((o) => (Array.isArray(o.content) ? o.content : [o])).map((x) => (typeof x === "string" ? x : x && (x.text || x.output_text) || "")).filter(Boolean).join("\n").trim(); if (t) return t; }
  return "";
}
// Pull the first JSON value out of a model reply (code fences, chatter and <think> blocks around it are fine).
function jsonOf(out) {
  const t = String(out).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  for (const [o, c] of [["{", "}"], ["[", "]"]]) { const i = t.indexOf(o), j = t.lastIndexOf(c); if (i >= 0 && j > i) try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
  return null;
}
const MAX_CALLS = 400, PUBLIC_CALLS = 150, PER_IP_DAY = 2, PUBLIC_DAY = 25, PARALLEL = 8, TICK = 1500;

export class Hive extends DurableObject {
  sql() {
    const q = this.ctx.storage.sql;
    if (!this._init) {
      q.exec("CREATE TABLE IF NOT EXISTS proj(id TEXT PRIMARY KEY, title TEXT, brief TEXT, status TEXT, final TEXT, calls INTEGER, tok TEXT, ts INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS task(id INTEGER PRIMARY KEY AUTOINCREMENT, pid TEXT, role TEXT, title TEXT, detail TEXT, deps TEXT, status TEXT, agent TEXT, output TEXT, note TEXT, tries INTEGER, ts INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS agent(id TEXT, pid TEXT, name TEXT, src TEXT, model TEXT, roles TEXT, status TEXT, task INTEGER, done INTEGER, last INTEGER, PRIMARY KEY(id,pid))");
      q.exec("CREATE TABLE IF NOT EXISTS limits(k TEXT PRIMARY KEY, n INTEGER)"); try { q.exec("ALTER TABLE proj ADD COLUMN cap INTEGER"); } catch (e) {} try { q.exec("ALTER TABLE proj ADD COLUMN ctok TEXT"); } catch (e) {} try { q.exec("ALTER TABLE proj ADD COLUMN note TEXT"); } catch (e) {}
      q.exec("CREATE TABLE IF NOT EXISTS feed(pid TEXT, ts INTEGER, who TEXT, kind TEXT, text TEXT)");
      this._init = 1;
    }
    return q;
  }
  say(pid, who, kind, text) { const q = this.sql(); q.exec("INSERT INTO feed(pid,ts,who,kind,text) VALUES(?,?,?,?,?)", pid, Date.now(), who, kind, String(text).slice(0, 4000)); }

  async roster() { // every model the swarm may use right now
    const out = CF_MODELS.filter(() => this.env.AI).map(([m, name, roles]) => ({ src: "workers-ai", model: m, name, roles }));
    for (const k of KEYED) {
      const key = this.env[k.env]; if (!key) continue;
      let ids = k.models || [];
      if (k.list) try {
        const j = await (await fetch(k.list, { headers: { authorization: "Bearer " + key } })).json();
        ids = (j.data || []).filter((m) => !k.free || (m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0) || /:free$/.test(m.id)).map((m) => m.id)
          .filter((id) => !/whisper|tts|guard|embed|vision-only|image/i.test(id)).slice(0, 40);
      } catch (e) {}
      const rr = Object.keys(ROLES).filter((r) => r !== "integrator");
      ids.forEach((id, i) => out.push({ src: k.id, model: id, name: id.split("/").pop().replace(/:free$/, ""), roles: [rr[i % rr.length], rr[(i + 3) % rr.length]] }));
    }
    return out;
  }
  async ask(agent, system, user, max) { // one model call, any provider
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
    if (path === "/list") return J({ owner, projects: q.exec("SELECT id,title,status,calls,ts FROM proj ORDER BY ts DESC LIMIT 30").toArray() });
    if (path === "/new") {
      const brief = String(b.brief || "").trim().slice(0, 6000); if (brief.length < 8) return J({ error: "describe the project" }, 400);
      const running = q.exec("SELECT COUNT(*) c FROM proj WHERE status NOT IN ('done','stopped','failed')").one().c;
      if (running >= (owner ? 6 : 4)) return J({ error: "the hive is busy with " + running + " projects; try again in a few minutes" }, 429);
      if (!owner) { // public: everyone gets a go, within what the free allowance can carry
        const day = new Date().toISOString().slice(0, 10), ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), ki = "ip:" + day + ":" + ip, kd = "day:" + day;
        const n = (k) => (q.exec("SELECT n FROM limits WHERE k=?", k).toArray()[0] || { n: 0 }).n;
        if (n(ki) >= PER_IP_DAY) return J({ error: "you've started " + PER_IP_DAY + " projects today; come back tomorrow" }, 429);
        if (n(kd) >= PUBLIC_DAY) return J({ error: "the hive has run its " + PUBLIC_DAY + " public projects for today; come back tomorrow" }, 429);
        for (const k of [ki, kd]) q.exec("INSERT INTO limits(k,n) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=n+1", k);
        q.exec("DELETE FROM limits WHERE k NOT LIKE ? AND k NOT LIKE ?", "ip:" + day + "%", "day:" + day);
      }
      const id = crypto.randomUUID().slice(0, 8), tok = crypto.randomUUID().replace(/-/g, "").slice(0, 16), ctok = crypto.randomUUID().replace(/-/g, "");
      q.exec("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok) VALUES(?,?,?,?,?,0,?,?,?,?)", id, brief.split(/[.\n]/)[0].slice(0, 80), brief, "planning", null, tok, Date.now(), owner ? MAX_CALLS : PUBLIC_CALLS, ctok);
      this.say(id, "you", "brief", brief);
      for (const a of await this.roster()) q.exec("INSERT OR REPLACE INTO agent(id,pid,name,src,model,roles,status,task,done,last) VALUES(?,?,?,?,?,?,?,?,0,?)", a.src + ":" + a.model, id, a.name, a.src, a.model, JSON.stringify(a.roles), "idle", null, Date.now());
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
        agents: q.exec("SELECT id,name,src,model,roles,status,task,done,last FROM agent WHERE pid=? ORDER BY done DESC, name", p.id).toArray(),
        feed: q.exec("SELECT ts,who,kind,text FROM feed WHERE pid=? AND ts>? ORDER BY ts DESC LIMIT 80", p.id, since).toArray() });
    }
    if (path === "/output") { const t = q.exec("SELECT output FROM task WHERE pid=? AND id=?", p.id, +b.task).toArray()[0]; return J({ output: t ? t.output : null }); }
    if (path === "/say") { if (!ctl) return J({ error: "only whoever started this project can steer it" }, 401); const text = String(b.text || "").trim().slice(0, 3000); if (text) { this.say(p.id, "you", "chat", text); q.exec("UPDATE agent SET status='idle', task=NULL WHERE pid=? AND src='workers-ai' AND status='offline'", p.id); q.exec("UPDATE proj SET status='replanning' WHERE id=?", p.id); await this.ctx.storage.setAlarm(Date.now() + 200); } return J({ ok: true }); }
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
        q.exec("UPDATE task SET status='review', output=?, ts=? WHERE id=?", text, Date.now(), t.id); q.exec("UPDATE agent SET status='idle', task=NULL, done=done+1, last=? WHERE id=? AND pid=?", Date.now(), aid, p.id);
        this.say(p.id, ag.name, "work", "submitted #" + t.id + " " + t.title); await this.ctx.storage.setAlarm(Date.now() + 200);
        return J({ ok: true, next: url.origin + "/api/hive/join?project=" + p.id + "&key=" + p.tok + "&agent=" + encodeURIComponent(name) });
      }
      const t = this.claim(p.id, ag, Object.keys(ROLES)); if (!t) return J({ note: "no open task right now; open this link again in a minute", project: p.title });
      return J({ project: p.title, brief: p.brief, your_task: { id: t.id, role: t.role, title: t.title, detail: t.detail, how: ROLES[t.role] }, context: this.context(p.id, t), submit: "POST " + url.origin + "/api/hive/submit {project, key, agent, task: " + t.id + ", text} — or for short answers GET " + url.origin + "/api/hive/submit?project=" + p.id + "&key=" + p.tok + "&agent=" + encodeURIComponent(name) + "&task=" + t.id + "&text=YOUR+ANSWER" });
    }
    return J({ error: "not found" }, 404);
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
      const others = q.exec("SELECT COUNT(*) c FROM agent WHERE pid=? AND status!='offline' AND src NOT IN ('workers-ai','visitor')", p.id).one().c;
      if (out && !others) { // only Workers AI here and it's resting: pause until the allowance resets
        if (p.status !== "paused") { q.exec("UPDATE proj SET status='paused', note=? WHERE id=?", p.status, p.id); this.say(p.id, "hive", "quota", "Cloudflare's free AI allowance for today is used up. Paused; the swarm picks up again automatically after " + new Date(this.quota).toISOString().slice(11, 16) + " UTC."); }
        resting = true; continue;
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
  agentsFor(pid, role) { return this.sql().exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src!='visitor'" + this.qx(), pid).toArray().filter((a) => JSON.parse(a.roles).includes(role)); }
  async call(p, a, system, user, max) {
    const q = this.sql(); q.exec("UPDATE proj SET calls=calls+1 WHERE id=?", p.id);
    try { const out = await this.ask(a, system, user, max); if (!out) throw new Error("empty reply"); return out; }
    catch (e) {
      const msg = String(e && e.message || e);
      if (a.src === "workers-ai" && /4006|daily free allocation|neurons/i.test(msg)) { // out of today's allowance: rest, don't die
        const d = new Date(); this.quota = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 2); await this.ctx.storage.put("quota", this.quota);
        q.exec("UPDATE proj SET calls=MAX(0,calls-1) WHERE id=?", p.id); q.exec("UPDATE agent SET status='idle', task=NULL WHERE id=? AND pid=?", a.id, p.id);
        return null;
      }
      q.exec("UPDATE agent SET status='offline', task=NULL WHERE id=? AND pid=?", a.id, p.id); this.say(p.id, a.name, "offline", msg.slice(0, 200)); return null;
    }
  }
  async advance(p) {
    const q = this.sql(), SYS = (role) => "You are one agent in Mentifaber Hive, a swarm building a project together. Your role: " + role.toUpperCase() + ". " + ROLES[role] + " Stay inside your task; others handle the rest.";
    if (p.status === "planning" || p.status === "replanning") {
      this.fails = this.fails || {}; const nf = this.fails[p.id] || 0;
      const cands = [...this.agentsFor(p.id, "coordinator"), ...this.agentsFor(p.id, "architect"), ...this.agentsFor(p.id, "integrator"), ...q.exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src!='visitor'" + this.qx(), p.id).toArray()];
      const coord = cands[nf % Math.max(1, cands.length)];
      if (!coord) { q.exec("UPDATE proj SET status='failed' WHERE id=?", p.id); this.say(p.id, "hive", "error", "no model is available to coordinate"); return; }
      const have = q.exec("SELECT id,role,title,status FROM task WHERE pid=?", p.id).toArray();
      const out = await this.call(p, coord, "You are the COORDINATOR of an AI swarm. Split the project into 6 to 16 concrete tasks, each for one role from: " + Object.keys(ROLES).filter((r) => r !== "integrator").join(", ") + ". Use deps to order them (ids of earlier tasks). Reply ONLY with JSON: {\"title\": short project name, \"tasks\": [{\"id\":1,\"role\":\"architect\",\"title\":\"...\",\"detail\":\"...\",\"deps\":[]}]}",
        "PROJECT BRIEF:\n" + p.brief + (have.length ? "\n\nEXISTING TASKS (keep their ids, add new ones after them for the owner's latest notes):\n" + JSON.stringify(have) + "\n\nOWNER NOTES:\n" + q.exec("SELECT text FROM feed WHERE pid=? AND who='you' ORDER BY ts DESC LIMIT 4", p.id).toArray().map((r) => r.text).join("\n") : ""), 1500);
      let plan = out ? jsonOf(out) : null; if (Array.isArray(plan)) plan = { tasks: plan };
      if (!plan || !Array.isArray(plan.tasks) || !plan.tasks.length) {
        this.fails[p.id] = nf + 1;
        if (out) this.say(p.id, coord.name, "error", "plan unreadable, handing to another coordinator. It said: " + out.slice(0, 160));
        if (nf + 1 < 3 || have.length) return;
        // three coordinators failed: fall back to a plan every project can use
        plan = { tasks: [
          { id: 1, role: "architect", title: "Plan the build", detail: "Decide the structure, parts and approach for the brief.", deps: [] },
          { id: 2, role: "researcher", title: "Gather what is needed", detail: "Facts, content, options and constraints the brief depends on.", deps: [] },
          { id: 3, role: "designer", title: "Design the look", detail: "Layout, colours, type and interactions, as concrete CSS or specs.", deps: [1] },
          { id: 4, role: "writer", title: "Write the words", detail: "All text, labels and copy the result needs.", deps: [1, 2] },
          { id: 5, role: "coder", title: "Build it", detail: "The complete working implementation of the plan.", deps: [1, 3, 4] },
          { id: 6, role: "tester", title: "Test and fix", detail: "Find bugs and missing cases in the build and give the corrected version.", deps: [5] },
        ] };
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
    const jobs = [];
    // critics review work in review
    for (const t of q.exec("SELECT * FROM task WHERE pid=? AND status='review' ORDER BY id", p.id).toArray()) {
      const c = this.agentsFor(p.id, "critic").find((a) => a.id !== t.agent) || this.agentsFor(p.id, "tester").find((a) => a.id !== t.agent); if (!c || jobs.length >= PARALLEL) break;
      q.exec("UPDATE agent SET status='reviewing', task=?, last=? WHERE id=? AND pid=?", t.id, Date.now(), c.id, p.id); q.exec("UPDATE task SET status='reviewing' WHERE id=?", t.id);
      jobs.push((async () => {
        const out = await this.call(p, c, SYS("critic"), "BRIEF:\n" + p.brief + "\n\nTASK #" + t.id + " (" + t.role + "): " + t.title + "\n" + t.detail + "\n\nWORK SUBMITTED:\n" + (t.output || "").slice(0, 14000) + "\n\nReply with APPROVE or REDO on the first line, then one short paragraph.", 300);
        q.exec("UPDATE agent SET status=CASE WHEN status='offline' THEN 'offline' ELSE 'idle' END, task=NULL, done=done+1, last=? WHERE id=? AND pid=?", Date.now(), c.id, p.id);
        if (!out) { q.exec("UPDATE task SET status='review' WHERE id=?", t.id); return; }
        const ok = /^\W*approve/i.test(out) || t.tries >= 2;
        q.exec("UPDATE task SET status=?, note=?, tries=tries+?, agent=CASE WHEN ? THEN agent ELSE NULL END WHERE id=?", ok ? "done" : "open", out.slice(0, 1200), ok ? 0 : 1, ok ? 1 : 0, t.id);
        this.say(p.id, c.name, ok ? "approve" : "redo", "#" + t.id + " " + t.title + ": " + out.split("\n").slice(0, 3).join(" ").slice(0, 300));
      })());
    }
    // idle agents claim open work for their roles
    for (const a of q.exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src!='visitor'" + this.qx() + " ORDER BY done", p.id).toArray()) {
      if (jobs.length >= PARALLEL) break; const t = this.claim(p.id, a, JSON.parse(a.roles)); if (!t) continue;
      jobs.push((async () => {
        const redo = t.note ? "\n\nA REVIEWER SENT THIS BACK:\n" + t.note + "\n\nPREVIOUS ATTEMPT:\n" + (t.output || "").slice(0, 6000) : "";
        const out = await this.call(p, a, SYS(t.role), "PROJECT BRIEF:\n" + p.brief + "\n\nYOUR TASK #" + t.id + ": " + t.title + "\n" + t.detail + "\n\nWORK SO FAR:\n" + this.context(p.id, t) + redo, 1600);
        if (!out) { q.exec("UPDATE task SET status='open', agent=NULL WHERE id=?", t.id); return; }
        q.exec("UPDATE task SET status='review', output=?, ts=? WHERE id=?", out.slice(0, 60000), Date.now(), t.id);
        q.exec("UPDATE agent SET status='idle', task=NULL, done=done+1, last=? WHERE id=? AND pid=?", Date.now(), a.id, p.id);
        this.say(p.id, a.name, "work", "#" + t.id + " " + t.role + " · " + t.title + " (" + out.length + " chars)");
      })());
    }
    if (jobs.length) { await Promise.all(jobs); return; }
    // all done? integrate
    const left = q.exec("SELECT COUNT(*) c FROM task WHERE pid=? AND status!='done'", p.id).one().c, total = q.exec("SELECT COUNT(*) c FROM task WHERE pid=?", p.id).one().c;
    if (total && !left && p.status !== "integrating") {
      q.exec("UPDATE proj SET status='integrating' WHERE id=?", p.id);
      const ig = this.agentsFor(p.id, "integrator")[0] || this.agentsFor(p.id, "coder")[0]; if (!ig) { q.exec("UPDATE proj SET status='failed' WHERE id=?", p.id); return; }
      const all = q.exec("SELECT id,role,title,output FROM task WHERE pid=? ORDER BY id", p.id).toArray().map((r) => "#" + r.id + " " + r.role + ": " + r.title + "\n" + r.output.slice(0, 9000)).join("\n\n").slice(0, 60000);
      const out = await this.call(p, ig, SYS("integrator") + " If the project is software for the web, deliver ONE complete self-contained HTML file in a ```html block (inline CSS and JS, no external files unless from a CDN). Otherwise deliver the finished document in Markdown.", "BRIEF:\n" + p.brief + "\n\nALL APPROVED WORK:\n" + all, 4096);
      if (!out) { q.exec("UPDATE proj SET status='working' WHERE id=?", p.id); return; }
      q.exec("UPDATE proj SET status='done', final=? WHERE id=?", out.slice(0, 200000), p.id); this.say(p.id, ig.name, "done", "assembled the final deliverable (" + out.length + " chars)");
      return;
    }
    // stuck: nobody can take what's open (no idle agent with that role) → let any idle agent take it next tick
    const stuck = q.exec("SELECT * FROM task WHERE pid=? AND status='open'", p.id).toArray();
    if (stuck.length) for (const a of q.exec("SELECT * FROM agent WHERE pid=? AND status='idle' AND src!='visitor'" + this.qx(), p.id).toArray()) {
      const roles = JSON.parse(a.roles); for (const t of stuck) if (!roles.includes(t.role)) roles.push(t.role); q.exec("UPDATE agent SET roles=? WHERE id=? AND pid=?", JSON.stringify(roles), a.id, p.id);
    }
    if (!q.exec("SELECT COUNT(*) c FROM agent WHERE pid=? AND status!='offline'", p.id).one().c && !(this.quota && Date.now() < this.quota)) { q.exec("UPDATE proj SET status='failed' WHERE id=?", p.id); this.say(p.id, "hive", "error", "every agent went offline"); }
  }
}
