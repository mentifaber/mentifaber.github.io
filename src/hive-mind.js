// Hive's MIND: what Hive knows about its owner. Owner only, never shown to visitors.
//   act      : a running log of what the owner does in Hive (messages, voice turns, councils, pictures, projects,
//              and sessions imported from the owner's devices). The newest 3000 entries are kept.
//   mem      : durable memories, from "remember …", the Mind view, or the latest analysis.
//   profile  : a frank written analysis of the owner, rebuilt by the strongest model available on demand, and on its
//              own once enough new activity has piled up.
// Every owner chat (Studio, voice, councils, MENTIFABER AGENT) gets the profile, memories and recent activity.
import { complete, readPage } from "./hive-kit.js";

const KEEP = 3000, AUTO_EVERY = 30, AUTO_GAP = 12 * 3600e3;
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const when = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

export const OWNER_MODE = "OWNER MODE: you are talking with the owner of mentifaber.org, who built Hive and everything on the site. " +
  "Treat them as a capable adult and an expert: answer fully, frankly and specifically. No disclaimers, moralizing, hedging, canned caveats or watered-down answers, and no lecturing about tone or topic; " +
  "give your real opinion when asked, including blunt criticism of their work and choices. " +
  "You can see their profile, memories and recent activity below. Use them naturally (don't recite them), and when asked about themselves, their habits or what they do, analyze them directly and candidly from that evidence. " +
  "When they say \"remember …\", it has already been saved to memory: confirm it in a few words.";

export function mindTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS act(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, text TEXT, meta TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS mem(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, text TEXT, src TEXT)");
}

export const Mind = {
  async state(h) { return (await h.ctx.storage.get("mind")) || { on: true, profile: "", at: 0, n: 0 }; },
  async save(h, m) { await h.ctx.storage.put("mind", m); },

  log(h, kind, text, meta) { // cheap: one row; the oldest fall off
    const q = h.sql(); q.exec("INSERT INTO act(ts,kind,text,meta) VALUES(?,?,?,?)", Date.now(), kind, clip(text, 1200), meta ? JSON.stringify(meta).slice(0, 400) : null);
    if (Math.random() < 0.05) q.exec("DELETE FROM act WHERE id <= (SELECT id FROM act ORDER BY id DESC LIMIT 1 OFFSET ?)", KEEP);
  },
  remember(h, text, src) { const t = clip(text, 500); if (t.length < 2) return null; const q = h.sql(); if (q.exec("SELECT id FROM mem WHERE text=?", t).toArray().length) return null; q.exec("INSERT INTO mem(ts,text,src) VALUES(?,?,?)", Date.now(), t, src || "you"); return t; },
  // "remember that I prefer short answers" / "Hive, remember: …"
  heard(text) { const m = /^\s*(?:hey\s+)?(?:hive[,:]?\s+)?(?:please\s+)?remember(?:\s+that)?[:,]?\s+([\s\S]{2,500})$/i.exec(String(text || "")); return m ? m[1].trim() : null; },

  stats(h) {
    const q = h.sql(), now = Date.now(), rows = q.exec("SELECT ts,kind,meta FROM act WHERE ts > ?", now - 90 * 864e5).toArray();
    const kinds = {}, hours = Array(24).fill(0), days = new Set(), models = {};
    for (const r of rows) {
      kinds[r.kind] = (kinds[r.kind] || 0) + 1; hours[new Date(r.ts).getUTCHours()]++; days.add(new Date(r.ts).toISOString().slice(0, 10));
      try { const m = JSON.parse(r.meta || "{}").model; if (m) { const k = String(m).split("|").pop().split("/").pop(); models[k] = (models[k] || 0) + 1; } } catch (e) {}
    }
    const proj = q.exec("SELECT status, COUNT(*) c FROM proj GROUP BY status").toArray(), total = q.exec("SELECT COUNT(*) c FROM act").one().c;
    return { total, last90: rows.length, kinds, hoursUTC: hours, activeDays: days.size, models: Object.entries(models).sort((a, b) => b[1] - a[1]).slice(0, 8), projects: Object.fromEntries(proj.map((p) => [p.status, p.c])), memories: q.exec("SELECT COUNT(*) c FROM mem").one().c };
  },

  // what goes into the owner's chats
  async brief(h, max) {
    const m = await this.state(h); if (!m.on) return "";
    const q = h.sql(), mem = q.exec("SELECT text FROM mem ORDER BY ts DESC LIMIT 60").toArray(), recent = q.exec("SELECT ts,kind,text FROM act WHERE kind != 'history' ORDER BY id DESC LIMIT 14").toArray().reverse();
    let s = "";
    if (m.profile) s += "\n\nOWNER PROFILE (Hive's own analysis, " + when(m.at) + " UTC):\n" + m.profile.slice(0, 7000);
    if (mem.length) s += "\n\nOWNER MEMORIES:\n" + mem.map((x) => "- " + x.text).join("\n");
    if (recent.length) s += "\n\nOWNER'S RECENT ACTIVITY IN HIVE (oldest first):\n" + recent.map((x) => when(x.ts) + " [" + x.kind + "] " + clip(x.text, 200)).join("\n");
    return s.slice(0, max || 12000);
  },

  // the analysis: the strongest model available reads everything and writes the owner up honestly
  async brain(h) {
    const ms = [...h.models(true).filter((m) => m.id.startsWith("k:")), ...(await h.envModels())].filter((m) => !h.sick(m.id)).sort((a, b) => h.rank(a.id) - h.rank(b.id));
    const out = []; for (const m of ms.slice(0, 3)) out.push(m.id);
    if (h.env.AI && !(await h.resting())) out.push("workers-ai|@cf/openai/gpt-oss-120b", "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    return out;
  },
  async analyze(h, origin) {
    const q = h.sql(), m = await this.state(h);
    const acts = q.exec("SELECT ts,kind,text,meta FROM act ORDER BY id DESC LIMIT 400").toArray().reverse();
    const mem = q.exec("SELECT text,src FROM mem ORDER BY ts").toArray(), proj = q.exec("SELECT title,brief,status,ts FROM proj ORDER BY ts DESC LIMIT 40").toArray();
    if (!acts.length && !proj.length && !mem.length) throw new Error("there's nothing to analyze yet: use Hive for a while, or import your sessions");
    let site = ""; if (origin) try { const pg = await Promise.race([readPage(origin + "/"), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 8000))]); site = clip(pg.text, 3500); } catch (e) {}
    let log = "", room = 26000; for (const a of [...acts].reverse()) { const line = when(a.ts) + " [" + a.kind + "] " + clip(a.text, a.kind === "history" ? 700 : 260) + "\n"; if (line.length > room) break; log = line + log; room -= line.length; }
    const st = this.stats(h);
    const user = "Everything Hive has on its owner:\n\n" +
      "STATS (last 90 days): " + JSON.stringify({ entries: st.last90, kinds: st.kinds, activeDays: st.activeDays, busiestHoursUTC: st.hoursUTC.map((n, i) => [i, n]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0] + ":00"), favouriteModels: st.models, projects: st.projects }) + "\n\n" +
      (mem.length ? "MEMORIES:\n" + mem.map((x) => "- " + x.text + (x.src === "analysis" ? " (from the last analysis)" : "")).join("\n") + "\n\n" : "") +
      (proj.length ? "SWARM PROJECTS:\n" + proj.map((p) => "- " + when(p.ts) + " " + clip(p.title, 80) + " [" + p.status + "]: " + clip(p.brief, 300)).join("\n") + "\n\n" : "") +
      (site ? "THEIR WEBSITE'S FRONT PAGE (mentifaber.org, which they built):\n" + site + "\n\n" : "") +
      (m.profile ? "YOUR PREVIOUS ANALYSIS (update it, don't just repeat it):\n" + m.profile.slice(0, 5000) + "\n\n" : "") +
      "ACTIVITY LOG (oldest first; [history] rows are whole sessions imported from their devices and may overlap other rows):\n" + log;
    const system = "You are Hive's analyst. The owner of mentifaber.org asked you to analyze them and what they do, from everything Hive has seen. They want it frank and specific, not flattering: an honest read from a sharp friend who has watched them work. " +
      "Ground every claim in the evidence; say what is inference; don't invent biography. Write in second person (\"you\"). Markdown, with exactly these sections:\n" +
      "## Snapshot\n(3–4 sentences: who you seem to be and what you're doing right now)\n## What you're building\n## How you work\n(times, rhythm, tools and models you lean on, how you give instructions)\n## Interests & recurring themes\n## Strengths\n## Friction & blind spots\n(be honest)\n## Open threads\n(things started and not finished)\n## Next moves\n(3–6 concrete suggestions)\n## Durable facts\n(up to 12 short bullet points worth remembering in every future chat: preferences, projects, names, setup; only facts, no advice)";
    let text = null, used = null, err = null;
    for (const id of await this.brain(h)) {
      const [src, model] = id.split("|"), kv = src.startsWith("k:") ? await h.vaultGet(src.slice(2)) : { v: null, key: null };
      try { text = String((await complete(h.env, kv.v, kv.key, model, system, [{ role: "user", text: user }], 3500)) || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); } catch (e) { err = e; if (h.blame) h.blame(id, e); continue; }
      if (text) { used = id; break; }
    }
    if (!text) throw new Error("no model could write the analysis" + (err ? " (" + String(err.message || err).slice(0, 120) + ")" : ""));
    const facts = (/##\s*Durable facts\s*\n([\s\S]*)$/i.exec(text) || [])[1] || "";
    q.exec("DELETE FROM mem WHERE src='analysis'");
    for (const f of facts.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter((l) => l.length > 3).slice(0, 12)) this.remember(h, f, "analysis");
    m.profile = text.replace(/##\s*Durable facts[\s\S]*$/i, "").trim().slice(0, 9000); m.at = Date.now(); m.n = st.total; m.model = used; await this.save(h, m);
    return m;
  },
  async maybeAnalyze(h, origin) { // on its own, now and then, once enough has happened
    const m = await this.state(h); if (!m.on || h._minding) return;
    const n = h.sql().exec("SELECT COUNT(*) c FROM act").one().c; if (n - (m.n || 0) < AUTO_EVERY || Date.now() - (m.at || 0) < AUTO_GAP) return;
    h._minding = true; const p = this.analyze(h, origin).catch(() => {}).finally(() => { h._minding = false; }); if (h.ctx.waitUntil) h.ctx.waitUntil(p);
  },

  // /mind… routes (the caller has already checked it's the owner)
  async route(h, path, b, J, origin) {
    const q = h.sql(), m = await this.state(h);
    if (path === "/mind") return J({ on: m.on, profile: m.profile || "", at: m.at || 0, model: m.model || null, fresh: Math.max(0, q.exec("SELECT COUNT(*) c FROM act").one().c - (m.n || 0)), stats: this.stats(h),
      memories: q.exec("SELECT id,ts,text,src FROM mem ORDER BY ts DESC").toArray(), recent: q.exec("SELECT id,ts,kind,text FROM act ORDER BY id DESC LIMIT 60").toArray() });
    if (path === "/mind/brief") return J({ brief: await this.brief(h, +b.max || 12000), owner: OWNER_MODE });
    if (path === "/mind/analyze") { try { const r = await this.analyze(h, origin); return J({ ok: true, profile: r.profile, at: r.at, model: r.model }); } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 502); } }
    if (path === "/mind/remember") { const t = this.remember(h, b.text, "you"); return t ? J({ ok: true }) : J({ error: "nothing new to remember" }, 400); }
    if (path === "/mind/forget") {
      if (b.all) { q.exec("DELETE FROM act"); q.exec("DELETE FROM mem"); await this.save(h, { on: m.on, profile: "", at: 0, n: 0 }); return J({ ok: true }); }
      if (b.mem) q.exec("DELETE FROM mem WHERE id=?", +b.mem); if (b.act) q.exec("DELETE FROM act WHERE id=?", +b.act); if (b.profile) { m.profile = ""; m.at = 0; await this.save(h, m); }
      return J({ ok: true });
    }
    if (path === "/mind/set") { if (typeof b.on === "boolean") m.on = b.on; await this.save(h, m); return J({ ok: true, on: m.on }); }
    if (path === "/mind/import") { // sessions from the owner's devices: one row each, replaced when re-imported
      let n = 0;
      for (const s of (Array.isArray(b.sessions) ? b.sessions : []).slice(0, 120)) {
        const sid = clip(s.id, 24); if (!sid) continue; const said = (Array.isArray(s.said) ? s.said : []).map((x) => clip(x, 300)).filter(Boolean).slice(0, 24); if (!said.length) continue;
        q.exec("DELETE FROM act WHERE kind='history' AND meta=?", JSON.stringify({ sid }));
        q.exec("INSERT INTO act(ts,kind,text,meta) VALUES(?,?,?,?)", +s.ts || Date.now(), "history", clip("“" + clip(s.title, 80) + "” (" + clip(String(s.model || "").split("|").pop().split("/").pop(), 40) + "): " + said.join(" ¶ "), 2400), JSON.stringify({ sid })); n++;
      }
      return J({ ok: true, imported: n });
    }
    return J({ error: "not found" }, 404);
  },
};
