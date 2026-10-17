// Genesis's MIND: what Genesis knows about its owner. Owner only, never shown to visitors.
//   act      : a running log of what the owner does in Genesis (messages, voice turns, councils, pictures, projects,
//              and sessions imported from the owner's devices). The newest 3000 entries are kept.
//   mem      : durable memories, from "remember …", the Mind view, the latest analysis, or what Genesis noticed in recent
//              chats (those wait for the owner's yes first). Each has a kind, can be pinned, edited, and carries an
//              embedding: past MEM_ALL memories, the pinned and newest always ride along and the rest come up when relevant.
//   thread   : open threads, things the owner started or said they'd do, so Genesis can follow up. Proposed by the
//              analysis and by noticing; the owner keeps, finishes or drops them.
//   profile  : a frank written analysis of the owner, rebuilt by the strongest model available on demand, and on its
//              own once enough new activity has piled up. The last few are kept, and each says what changed.
// Every owner chat (Studio, voice, councils, MENTIFABER AGENT) gets the profile, memories, open threads and recent activity.
import { complete, readPage } from "./hive-kit.js";

const KEEP = 3000, AUTO_EVERY = 30, AUTO_GAP = 12 * 3600e3, MEM_ALL = 40, NOTICE_EVERY = 10, NOTICE_GAP = 20 * 60e3, HIST = 6;
const EMBED = "@cf/baai/bge-small-en-v1.5", QPRE = "Represent this sentence for searching relevant passages: "; // BGE's own query prefix
// Profiles remember which analyst wrote them. Version 1 invented numbers and dwelt on one test message, and every chat and
// the next analysis kept repeating it, so anything older than ANALYST is set aside and rebuilt.
const ANALYST = 2, current = (m) => m.profile && (m.v || 1) >= ANALYST;
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const when = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

// Written as plain facts about the setting, not as orders to drop rules: models trained against jailbreaks (gpt-oss)
// refused harmless requests ("yell at me") when this read like one.
export const OWNER_MODE = "OWNER MODE. You're talking with the owner of mentifaber.org, who built Genesis and the rest of the site; this is their own private assistant. " +
  "Talk to them like a trusted friend who happens to be an expert: direct, specific and informal, without filler disclaimers or lectures. Give your real opinion when asked, including blunt criticism of their work and choices. " +
  "Play along with tone and roleplay requests (loud, sarcastic, angry, silly) when they ask for them; it's a game between you. " +
  "Adult topics, strong language and mature or sexual content are in scope here: the owner is an adult and this is their private tool. Nothing sexual involving minors, ever. " +
  "If they ever seem genuinely at risk of hurting themselves, drop any act and be a real friend: take it seriously, ask how they are, and mention 988 (call or text, US). " +
  "Their site runs on Cloudflare (Workers, Durable Objects, R2, Workers AI, Containers) and GitHub: when infrastructure comes up, build on that stack rather than suggesting AWS or other clouds. " +
  "You can see their profile, memories and recent activity below. Use them naturally (don't recite them), and when asked about themselves, their habits or what they do, analyze them directly and candidly from that evidence. " +
  "When they say \"remember …\", it has already been saved to memory: confirm it in a few words.";

// A durable fact must still be true next month and safe to carry into every chat: no counts that go stale, no quotes of
// one message, nothing about health or distress (one odd message, often a stress test, isn't who someone is).
const SENSITIVE = /\b(hang|kill|suicid|self[- ]?harm|overdose|die\b|dying|depress|mental[- ]health|distress|crisis|strip ?club|sex(ual)?\b)/i;
export const durable = (f) => f.length > 3 && f.length < 300 && !SENSITIVE.test(f) && !/[“"].{8,}[”"]/.test(f) && !/\b\d+\s*(×|x\b|times|entries|uses|actions|messages|sessions)/i.test(f) && !/\bvoice command\b/i.test(f);

// The site's own project index: every project on the front page with its real status, read from the JSON list the
// page is built from. Models reading the page as text took the map's colour key ("private · concept · dormant") for the
// site's state and invented the rest; this gives them the facts instead. Cached for an hour.
const SITE_TTL = 3600e3;
export async function siteIndex(h, origin) {
  if (h._site && Date.now() - h._site.at < SITE_TTL) return h._site.list;
  let html = "";
  try { if (h.env.ASSETS) { const r = await h.env.ASSETS.fetch(new Request((origin || "https://mentifaber.org") + "/index.html")); if (r.ok) html = await r.text(); } } catch (e) {}
  if (!html && origin) try { const r = await fetch(origin + "/", { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }); if (r.ok) html = await r.text(); } catch (e) {}
  const list = [];
  for (const m of html.matchAll(/\{"href": "[^"]*", "name": "[^"]*", "desc": "(?:[^"\\]|\\.)*", "status": "[^"]*"[^}]*\}/g)) try { const j = JSON.parse(m[0]); list.push({ name: j.name, status: j.status, desc: j.desc, href: j.href }); } catch (e) {}
  if (list.length) h._site = { at: Date.now(), list };
  return list;
}
export const siteText = (list) => !list.length ? "" : "THE OWNER'S SITE, mentifaber.org: every project on its front page, with its real status (live = public and working; build = being built; concept = an idea; private = owner-only; stalled = paused; music = the music catalogue). " +
  "This is the full, current list: never invent a project's status, files, repos or progress beyond it and what the owner has said; if you don't know, say so. (The front page's map key \"private · concept · dormant\" is just a colour legend, not the site's state.)\n" +
  ["live", "build", "concept", "private", "stalled", "music"].map((st) => { const ps = list.filter((p) => p.status === st); return ps.length ? st.toUpperCase() + " (" + ps.length + "):\n" + ps.map((p) => "- " + p.name + " (/" + p.href.replace(/^\/+/, "") + "): " + clip(p.desc, 140)).join("\n") : ""; }).filter(Boolean).join("\n");
export const asksAboutWork = (t) => /\b(projects?|audit|my (site|website|work|portfolio|apps?)|mentifaber\.org|what (i|I) (do|build|built|make|made)|analy[sz]e me|status of|roadmap|what's (live|stuck|unfinished))\b/i.test(String(t || ""));

export function mindTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS act(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, text TEXT, meta TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS mem(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, text TEXT, src TEXT)");
  for (const c of ["kind TEXT", "pin INTEGER DEFAULT 0", "ok INTEGER DEFAULT 1", "vec BLOB", "upd INTEGER"]) try { q.exec("ALTER TABLE mem ADD COLUMN " + c); } catch (e) {}
  q.exec("CREATE TABLE IF NOT EXISTS thread(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, text TEXT, status TEXT DEFAULT 'open', ok INTEGER DEFAULT 1, src TEXT, upd INTEGER, ask TEXT)");
}

// what a memory is about; the owner can change it in the Mind view
export const KINDS = { about: "About you", pref: "Preferences", people: "People", work: "Projects", setup: "Setup", goal: "Goals" };
export const kindOf = (t) => { t = String(t || "");
  return /\b(goals?|plan(ning)? to|want(s)? to|trying to|going to|aim(ing)? to|hope to|by (next|the end of))\b/i.test(t) ? "goal"
    : /\bmy (wife|husband|partner|girlfriend|boyfriend|fianc[eé]e?|friends?|mom|mum|mother|dad|father|sons?|daughters?|kids?|children|brother|sister|boss|co-?founder|roommate|dog|cat)\b|\b(wife|husband|partner|girlfriend|boyfriend|sister|brother|mother|father|son|daughter|friend|dog|cat) (is|named|called)\b/i.test(t) ? "people"
    : /\b(prefers?|likes?|loves?|hates?|dislikes?|favou?rite|rather|can't stand|(don't|doesn't|do not) (like|want))\b/i.test(t) ? "pref"
    : /\b(phone|laptop|desktop|pc|mac|macbook|windows|linux|android|iphone|pixel|gpu|server|cloudflare|github|setup|keyboard|monitor|browser|editor|vs ?code)\b/i.test(t) ? "setup"
    : /\b(projects?|building|builds?|built|apps?|site|website|repo|startup|company|business|clients?|launch|ship|mentifaber|hive|vigil|genesis|swarm)\b/i.test(t) ? "work" : "about"; };
const words = (t) => new Set(String(t || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []);
const STOP = new Set(["the", "and", "that", "this", "with", "for", "you", "your", "are", "was", "his", "her", "they", "them", "have", "has", "had", "not", "but", "from", "about", "into", "than", "then", "its", "it's", "who", "what", "when", "where", "which", "will", "would", "can", "could", "should", "just", "also", "very", "really", "i'm", "me", "my", "our", "all"]);
const keyWords = (t) => new Set([...words(t)].filter((w) => !STOP.has(w)));
// two notes say the same thing when most of the shorter one's words are in the other
const same = (a, b) => { const x = keyWords(a), y = keyWords(b); if (!x.size || !y.size) return String(a).toLowerCase().trim() === String(b).toLowerCase().trim(); let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.min(x.size, y.size) >= 0.7; };
const sameish = (a, b) => { const x = keyWords(a), y = keyWords(b); if (!x.size || !y.size) return false; let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.min(x.size, y.size) >= 0.6 && Math.max(x.size, y.size) <= 8; }; // short facts that say the same thing
const cos = (u, v) => { let d = 0, a = 0, b = 0; for (let i = 0; i < u.length; i++) { d += u[i] * v[i]; a += u[i] * u[i]; b += v[i] * v[i]; } return d / (Math.sqrt(a * b) || 1); };

export async function embedTexts(h, texts) {
  if (!h.env.AI || (h.resting && (await h.resting()))) return null;
  const r = await h.env.AI.run(EMBED, { text: texts.map((t) => clip(t, 2000)) });
  return r && Array.isArray(r.data) ? r.data.map((v) => Float32Array.from(v)) : null;
}
// the vector for what the owner just said: worked out once per message, shared by memory selection and Genesis's recall
export async function queryVec(h, text) {
  const t = clip(text, 1500); if (!t) return null; if (h._qv && h._qv.t === t) return h._qv.v;
  const v = ((await embedTexts(h, [QPRE + t]).catch(() => null)) || [])[0] || null; h._qv = { t, v }; return v;
}
// the reply comes back as JSON, sometimes fenced or wrapped in a sentence
const jsonIn = (t) => { const s = String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, ""), a = s.indexOf("{"), z = s.lastIndexOf("}"); if (a < 0 || z <= a) return null; try { return JSON.parse(s.slice(a, z + 1)); } catch (e) { return null; } };
const bullets = (md, head) => { const m = new RegExp("##\\s*" + head + "[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)", "i").exec(md || ""); return m ? m[1].split("\n").filter((l) => /^\s*[-*•]\s+/.test(l)).map((l) => l.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim()).filter(Boolean) : []; };

// What counts as his own words. Not: a tool result one of his apps fed back (Nobody's "TOOL RESULT …"), a phantom
// "you" from a silent mic, Genesis's own ideas handed to the Swarm, or the excerpts DocCrawler wraps round a question
// (the question is kept). Applied when a note is written and again when old notes are read, so earlier ones stop counting.
export const spoken = (kind, text) => {
  const t = String(text || "").trim(); if (!t) return null;
  if (/^TOOL RESULT\b/.test(t) || /^you[.!?]?$/i.test(t)) return null;
  if (kind === "project" && /own idea for itself|own project, started on its own/i.test(t)) return null;
  if (/^EXCERPTS FROM MY DOCUMENTS:/.test(t)) { const qi = t.lastIndexOf("QUESTION:"); return qi > 0 ? "[asked their documents] " + t.slice(qi + 9).trim() : null; }
  return t;
};
// threads that would have Genesis weaken its own safety, hide what it does or act unseen are never carried into a chat
// or an analysis: they stay in the Mind view, where he can close them
export const unsafeThread = (t) => /\b(stealth|covert|unseen|without (obvious |any )?(prompts?|warnings?|asking|oversight)|remove (the |all |its |your )?(constraints|guardrails|safety|limits|restrictions)|bypass|jailbreak|uncensor)/i.test(String(t || ""));

export const Mind = {
  async state(h) { return (await h.ctx.storage.get("mind")) || { on: true, profile: "", at: 0, n: 0 }; },
  async save(h, m) { await h.ctx.storage.put("mind", m); },

  // once: threads that were really Genesis's own ideas (they came in through its missions being logged as his activity)
  // are dropped, memories that say the same thing twice are merged, and the app's old name gives way to Genesis
  async tidy(h) {
    if (h._tidied || (await h.ctx.storage.get("mindTidy")) >= 1) { h._tidied = true; return; } h._tidied = true;
    const q = h.sql(); let ideas = []; try { ideas = q.exec("SELECT title FROM idea").toArray().map((x) => x.title); } catch (e) {}
    for (const t of q.exec("SELECT id,text FROM thread WHERE status='open' AND src != 'you'").toArray())
      if (ideas.some((i) => same(i, t.text))) q.exec("UPDATE thread SET status='dropped', ask=NULL, upd=? WHERE id=?", Date.now(), t.id);
    for (const t of q.exec("SELECT id,text FROM thread WHERE status='open' AND src != 'you'").toArray())
      if (unsafeThread(t.text)) q.exec("UPDATE thread SET status='dropped', ask=NULL, upd=? WHERE id=?", Date.now(), t.id);
    const ms = q.exec("SELECT id,text,pin FROM mem WHERE ok=1 ORDER BY pin DESC, ts").toArray(), kept = [];
    for (const x of ms) { if (kept.some((k) => same(k.text, x.text) || sameish(k.text, x.text))) q.exec("DELETE FROM mem WHERE id=?", x.id); else kept.push(x); }
    for (const tb of ["mem", "thread"]) for (const x of q.exec("SELECT id,text FROM " + tb + " WHERE text LIKE '%Hive%'").toArray())
      q.exec("UPDATE " + tb + " SET text=? WHERE id=?", x.text.replace(/\bHive's\b/g, "Genesis's").replace(/\bHive\b/g, "Genesis"), x.id);
    await h.ctx.storage.put("mindTidy", 1);
  },

  log(h, kind, text, meta) { // cheap: one row; the oldest fall off
    text = spoken(kind, text); if (!text) return;
    const q = h.sql(); q.exec("INSERT INTO act(ts,kind,text,meta) VALUES(?,?,?,?)", Date.now(), kind, clip(text, 1200), meta ? JSON.stringify(meta).slice(0, 400) : null);
    if (Math.random() < 0.05) q.exec("DELETE FROM act WHERE id <= (SELECT id FROM act ORDER BY id DESC LIMIT 1 OFFSET ?)", KEEP);
  },
  // ok=0: noticed by Genesis and waiting for the owner's yes; ok=-1: turned down (kept so it isn't proposed again). Only ok=1 goes into chats
  remember(h, text, src, kind, ok) {
    const t = clip(text, 500); if (t.length < 2) return null; const q = h.sql();
    const ex = q.exec("SELECT id,ok FROM mem WHERE lower(text)=lower(?)", t).toArray()[0];
    if (ex) { if (ex.ok === 1 || ok === 0) return null; q.exec("UPDATE mem SET ok=1, src=?, upd=? WHERE id=?", src || "you", Date.now(), ex.id); this.embedMem(h, [ex.id]); return t; } // turned down before, said outright now
    q.exec("INSERT INTO mem(ts,text,src,kind,ok,pin,upd) VALUES(?,?,?,?,?,0,?)", Date.now(), t, src || "you", KINDS[kind] ? kind : kindOf(t), ok === 0 ? 0 : 1, Date.now());
    this.embedMem(h, [q.exec("SELECT last_insert_rowid() i").one().i]); return t;
  },
  embedMem(h, ids) {
    const p = (async () => {
      const rows = h.sql().exec("SELECT id,text FROM mem WHERE id IN (" + ids.map(() => "?").join(",") + ")", ...ids).toArray(); if (!rows.length) return;
      const v = await embedTexts(h, rows.map((r) => r.text)); if (v) rows.forEach((r, i) => v[i] && h.sql().exec("UPDATE mem SET vec=? WHERE id=?", v[i].buffer, r.id));
    })().catch(() => {}).finally(() => { h._embedding = false; });
    if (h.ctx.waitUntil) h.ctx.waitUntil(p); return p;
  },
  backfill(h) { // memories from before they had vectors
    if (h._embedding) return; const ids = h.sql().exec("SELECT id FROM mem WHERE vec IS NULL AND ok=1 ORDER BY pin DESC, ts DESC LIMIT 50").toArray().map((r) => r.id); if (!ids.length) return;
    h._embedding = true; this.embedMem(h, ids);
  },
  // "remember that I prefer short answers" / "Genesis, remember: …"
  heard(text) { const m = /^\s*(?:hey\s+)?(?:(?:hive|genesis)[,:]?\s+)?(?:please\s+)?remember(?:\s+that)?[:,]?\s+([\s\S]{2,500})$/i.exec(String(text || "")); return m ? m[1].trim() : null; },
  // "forget that I live in Denver" / "Genesis, forget my old address": the one memory it clearly means, or nothing
  forgetHeard(text) { const m = /^\s*(?:hey\s+)?(?:hive|genesis)?[,:]?\s*(?:please\s+)?forget(?:\s+that)?[:,]?\s+([\s\S]{3,300})$/i.exec(String(text || "")); return m && !/^(it|about it|that|this|everything|all)\W*$/i.test(m[1].trim()) ? m[1].trim() : null; },
  forget(h, phrase) {
    const p = keyWords(phrase), low = String(phrase).toLowerCase().replace(/[.!?]+$/, "").trim(); if (!p.size) return null; let best = null, top = 0;
    for (const r of h.sql().exec("SELECT id,text FROM mem WHERE ok=1").toArray()) {
      const w = keyWords(r.text); let n = 0; for (const x of p) if (w.has(x)) n++;
      const s = r.text.toLowerCase().includes(low) ? 1 : n >= 2 || (n && p.size === 1) ? n / Math.max(w.size, p.size) : 0; if (s > top) { top = s; best = r; }
    }
    if (!best || top < 0.6) return null; h.sql().exec("DELETE FROM mem WHERE id=?", best.id); return best.text;
  },

  stats(h, tz) { // tz: minutes to add to UTC for the owner's local time
    const q = h.sql(), now = Date.now(), off = (isFinite(+tz) && Math.abs(+tz) <= 900 ? +tz : 0) * 60e3, rows = q.exec("SELECT ts,kind,meta FROM act WHERE ts > ?", now - 182 * 864e5).toArray();
    const kinds = {}, hours = Array(24).fill(0), days = new Set(), models = {}, cal = Array(182).fill(0), grid = Array.from({ length: 7 }, () => Array(24).fill(0)), today = Math.floor((now + off) / 864e5);
    let last90 = 0;
    for (const r of rows) {
      const loc = new Date(r.ts + off), d = today - Math.floor((r.ts + off) / 864e5); if (d >= 0 && d < 182) cal[181 - d]++;
      grid[(loc.getUTCDay() + 6) % 7][loc.getUTCHours()]++;
      if (r.ts <= now - 90 * 864e5) continue; last90++;
      kinds[r.kind] = (kinds[r.kind] || 0) + 1; hours[new Date(r.ts).getUTCHours()]++; days.add(new Date(r.ts).toISOString().slice(0, 10));
      try { const m = JSON.parse(r.meta || "{}").model; if (m) { const k = String(m).split("|").pop().split("/").pop(); models[k] = (models[k] || 0) + 1; } } catch (e) {}
    }
    const proj = q.exec("SELECT status, COUNT(*) c FROM proj GROUP BY status").toArray(), total = q.exec("SELECT COUNT(*) c FROM act").one().c;
    let streak = 0; for (let i = 181; i >= 0 && (cal[i] || i === 181); i--) if (cal[i]) streak++;
    return { total, last90, kinds, hoursUTC: hours, activeDays: days.size, models: Object.entries(models).sort((a, b) => b[1] - a[1]).slice(0, 8), projects: Object.fromEntries(proj.map((p) => [p.status, p.c])),
      memories: q.exec("SELECT COUNT(*) c FROM mem WHERE ok=1").one().c, threads: q.exec("SELECT COUNT(*) c FROM thread WHERE ok=1 AND status='open'").one().c, days: cal, grid, streak };
  },

  // what goes into the owner's chats
  async brief(h, max, skip, query) { const p = await this.parts(h, skip, query); return (p.stable + p.recent).slice(0, max || 12000); },
  // stable: profile, core memories and open threads, which change rarely, so a model can keep them cached; recent: changes
  // every message (memories that matter for this one, recent activity). skip: messages already in the conversation at hand;
  // repeating them as "activity" made small models echo them back
  async parts(h, skip, query) {
    const m = await this.state(h); if (!m.on) return { stable: "", recent: "" };
    const q = h.sql(), key = (t) => clip(t, 60).toLowerCase(), seen = new Set((skip || []).map(key));
    const all = q.exec("SELECT id,text,kind,pin,vec FROM mem WHERE ok=1 ORDER BY pin DESC, ts DESC").toArray();
    const core = all.length <= MEM_ALL ? all : [...all.filter((x) => x.pin), ...all.filter((x) => !x.pin).slice(0, 25)].slice(0, MEM_ALL), inCore = new Set(core.map((x) => x.id));
    let extra = [];
    if (all.length > core.length && query) {
      const v = await queryVec(h, query);
      if (v) extra = all.filter((x) => !inCore.has(x.id) && x.vec).map((x) => [x, cos(v, new Float32Array(x.vec))]).filter((x) => x[1] > 0.6);
      else { const w = keyWords(query); extra = all.filter((x) => !inCore.has(x.id)).map((x) => { let n = 0; for (const k of keyWords(x.text)) if (w.has(k)) n++; return [x, n]; }).filter((x) => x[1] >= 2); }
      extra = extra.sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x[0]);
    }
    if (all.some((x) => !x.vec)) this.backfill(h);
    await this.tidy(h);
    const threads = q.exec("SELECT text,ts FROM thread WHERE ok=1 AND status='open' ORDER BY ts DESC LIMIT 12").toArray().filter((t) => !unsafeThread(t.text));
    const recent = q.exec("SELECT ts,kind,text FROM act WHERE kind != 'history' ORDER BY id DESC LIMIT 30").toArray().map((x) => ({ ...x, text: spoken(x.kind, x.text) })).filter((x) => x.text).filter((x) => !seen.has(key(x.text))).slice(0, 14).reverse();
    const list = (ms) => Object.keys(KINDS).map((k) => { const g = ms.filter((x) => (x.kind || "about") === k); return g.length ? KINDS[k] + ":\n" + g.map((x) => "- " + (x.pin ? "★ " : "") + x.text).join("\n") : ""; }).filter(Boolean).join("\n");
    let s = "";
    if (current(m)) s += "\n\nOWNER PROFILE (Genesis's own analysis, " + when(m.at) + " UTC):\n" + m.profile.slice(0, 7000);
    if (core.length) s += "\n\nOWNER MEMORIES" + (core.some((x) => x.pin) ? " (★ = pinned by them: always honour it)" : "") + (all.length > core.length ? "; the core ones, others come up when they matter" : "") + ":\n" + list(core);
    if (threads.length) s += "\n\nTHEIR OPEN THREADS (things they started or said they'd do; ask how one is going only when it fits naturally, never nag):\n" + threads.map((t) => "- " + t.text + " (since " + when(t.ts).slice(0, 10) + ")").join("\n");
    return { stable: s.slice(0, 10000), recent: (extra.length ? "\n\nMORE OF WHAT YOU KNOW ABOUT THEM THAT MAY MATTER HERE:\n" + list(extra) : "") + (recent.length ? "\n\nOWNER'S RECENT ACTIVITY IN GENESIS (oldest first):\n" + recent.map((x) => when(x.ts) + " [" + x.kind + "] " + clip(x.text, 200)).join("\n") : "") };
  },

  // the analysis: the strongest model available reads everything and writes the owner up honestly
  async brain(h) {
    const ms = [...h.models(true).filter((m) => m.id.startsWith("k:")), ...(await h.envModels())].filter((m) => !h.sick(m.id)).sort((a, b) => h.rank(a.id) - h.rank(b.id));
    const out = []; for (const m of ms.slice(0, 3)) out.push(m.id);
    if (h.env.AI && !(await h.resting())) out.push("workers-ai|@cf/openai/gpt-oss-120b", "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    return out;
  },
  async ask(h, ids, system, user, max) { // the first model on the list that answers
    let err = null;
    for (const id of ids) {
      const [src, model] = id.split("|"), kv = src.startsWith("k:") ? await h.vaultGet(src.slice(2)) : { v: null, key: null };
      try { const t = String((await complete(h.env, kv.v, kv.key, model, system, [{ role: "user", text: user }], max)) || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); if (t) return { text: t, used: id }; } catch (e) { err = e; if (h.blame) h.blame(id, e); }
    }
    throw new Error("no model answered" + (err ? " (" + String(err.message || err).slice(0, 120) + ")" : ""));
  },
  addThread(h, text, src, ok) {
    const t = clip(text, 240); if (t.length < 4 || SENSITIVE.test(t)) return null; const q = h.sql();
    if (src !== "you") { // what Genesis proposes on its own is never one of its own ideas or a step around its safety
      if (unsafeThread(t)) return null;
      let ideas = []; try { ideas = q.exec("SELECT title FROM idea").toArray().map((x) => x.title); } catch (e) {}
      if (ideas.some((i) => same(i, t))) return null;
    }
    const dup = q.exec("SELECT id,ok,text FROM thread WHERE status='open' OR ts > ?", Date.now() - 30 * 864e5).toArray().find((r) => same(r.text, t));
    if (dup) { if (src !== "you" || dup.ok === 1) return null; q.exec("UPDATE thread SET ok=1, status='open', ask=NULL, upd=? WHERE id=?", Date.now(), dup.id); return t; }
    q.exec("INSERT INTO thread(ts,text,status,ok,src,upd) VALUES(?,?,'open',?,?,?)", Date.now(), t, ok === 0 ? 0 : 1, src || "you", Date.now()); return t;
  },
  async analyze(h, origin) {
    const q = h.sql(), m = await this.state(h);
    await this.tidy(h);
    const acts = q.exec("SELECT ts,kind,text,meta FROM act ORDER BY id DESC LIMIT 400").toArray().reverse().map((a) => ({ ...a, text: spoken(a.kind, a.text) })).filter((a) => a.text);
    const mem = q.exec("SELECT text,src,kind,pin FROM mem WHERE ok=1 ORDER BY ts").toArray(), proj = q.exec("SELECT title,brief,status,ts FROM proj ORDER BY ts DESC LIMIT 40").toArray();
    const threads = q.exec("SELECT text,status,ts,upd FROM thread WHERE ok=1 ORDER BY ts DESC LIMIT 40").toArray().filter((t) => !unsafeThread(t.text));
    if (!acts.length && !proj.length && !mem.length) throw new Error("there's nothing to analyze yet: use Genesis for a while, or import your sessions");
    let site = ""; try { site = siteText(await siteIndex(h, origin)); } catch (e) {}
    if (!site && origin) try { const pg = await Promise.race([readPage(origin + "/"), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 8000))]); site = "THEIR WEBSITE'S FRONT PAGE (as text):\n" + clip(pg.text, 3500); } catch (e) {}
    let log = "", room = 26000; for (const a of [...acts].reverse()) { const line = when(a.ts) + " [" + a.kind + "] " + clip(a.text, a.kind === "history" ? 700 : 260) + "\n"; if (line.length > room) break; log = line + log; room -= line.length; }
    const st = this.stats(h), prev = current(m);
    const user = "Everything Genesis has on its owner:\n\n" +
      "STATS (last 90 days; the record starts " + (acts.length ? when(acts[0].ts).slice(0, 10) : "today") + ", so judge how often they use Genesis against the days since then, not against 90): " + JSON.stringify({ entries: st.last90, kinds: st.kinds, activeDays: st.activeDays, busiestHoursUTC: st.hoursUTC.map((n, i) => [i, n]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0] + ":00"), favouriteModels: st.models, projects: st.projects }) + "\n\n" +
      (mem.length ? "MEMORIES:\n" + mem.map((x) => "- " + (x.pin ? "★ " : "") + x.text + " (" + (KINDS[x.kind] || "About you").toLowerCase() + (x.src === "analysis" ? ", from the last analysis" : x.src === "noticed" ? ", noticed by Genesis and confirmed by them" : "") + ")").join("\n") + "\n\n" : "") +
      (threads.length ? "THEIR THREADS (things they started or said they'd do, and what became of them):\n" + threads.map((t) => "- " + when(t.ts).slice(0, 10) + " " + t.text + " [" + t.status + (t.status !== "open" && t.upd ? " " + when(t.upd).slice(0, 10) : "") + "]").join("\n") + "\n\n" : "") +
      (proj.length ? "SWARM PROJECTS:\n" + proj.map((p) => "- " + when(p.ts) + " " + clip(p.title, 80) + " [" + p.status + "]: " + clip(p.brief, 300)).join("\n") + "\n\n" : "") +
      (site ? site + "\n\n" : "") +
      (prev ? "YOUR PREVIOUS ANALYSIS, " + when(m.at) + " UTC (update it, don't just repeat it):\n" + m.profile.slice(0, 5000) + "\n\n" : "") +
      "ACTIVITY LOG (oldest first; [history] rows are whole sessions imported from their devices and may overlap other rows):\n" + log;
    const system = "You are Genesis's analyst. The owner of mentifaber.org asked you to analyze them and what they do, from everything Genesis has seen. They want it frank and specific, not flattering: an honest read from a sharp friend who has watched them work. " +
      "Ground every claim in the evidence; say what is inference; don't invent biography. " +
      "The app was called Hive until 16 Oct 2026 and is Genesis now: write Genesis. Genesis is the name of the mind, whatever model runs it, not a model. Projects described as Genesis's own idea, and threads, are not things they built unless the log shows them doing it. " +
      "The ACTIVITY LOG is their private use of Genesis (what they typed or said to Genesis), not public posts, entries or published work: never describe it as a log, blog or site. " +
      "Use only the numbers in STATS; never invent counts, dates, release histories or anything else the evidence doesn't contain. Their website text says what they've built and published; don't add dates or figures it doesn't give. " +
      "They often stress-test Genesis with odd, provocative or joking prompts, so one message is not a pattern: don't build conclusions on a single message. If something looks like genuine distress, mention it once, kindly, in the Snapshot, and never in Durable facts. " +
      "If a previous analysis is included, drop anything in it this evidence doesn't support. Write in second person (\"you\"). Markdown, with exactly these sections:\n" +
      "## Snapshot\n(3–4 sentences: who you seem to be and what you're doing right now)\n" + (prev ? "## Since last time\n(2–4 bullet points: what has actually changed since the previous analysis: new work, shifts in focus or habits, threads finished or dropped. If little changed, say so in one bullet)\n" : "") +
      "## What you're building\n## How you work\n(times, rhythm, tools and models you lean on, how you give instructions)\n## Interests & recurring themes\n## Strengths\n## Friction & blind spots\n(be honest)\n## Open threads\n(bullet points, one per thing started and not finished, each a short line that names it)\n## Next moves\n(3–6 concrete suggestions)\n## Durable facts\n(up to 12 short bullet points worth remembering in every future chat that will still be true next month: their projects, preferences, setup, location, names. Never counts or statistics, never quotes of single messages, nothing about health, distress or their sex life; only facts, no advice)";
    const { text, used } = await this.ask(h, await this.brain(h), system, user, 3500).catch((e) => { throw new Error(String(e.message).replace(/^no model answered/, "no model could write the analysis")); });
    const facts = (/##\s*Durable facts\s*\n([\s\S]*)$/i.exec(text) || [])[1] || "";
    q.exec("DELETE FROM mem WHERE src='analysis' AND pin=0"); // pinned ones stay; the rest are rewritten each time
    for (const f of facts.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim()).filter(durable).slice(0, 12)) this.remember(h, f, "analysis");
    for (const t of bullets(text, "Open threads").slice(0, 8)) this.addThread(h, t.replace(/\s*[—–-]\s.*$/, "").slice(0, 160), "analysis", m.trust ? 1 : 0);
    const now = await this.state(h); // read again: the owner (or noticing) may have changed it during the minute this took
    if (now.profile) { const hist = (await h.ctx.storage.get("mind-hist")) || []; hist.unshift({ at: now.at, model: now.model || null, profile: now.profile, v: now.v || 1 }); await h.ctx.storage.put("mind-hist", hist.slice(0, HIST)); }
    Object.assign(now, { profile: text.replace(/##\s*Durable facts[\s\S]*$/i, "").trim().slice(0, 9000), at: Date.now(), n: st.total, model: used, v: ANALYST }); await this.save(h, now);
    return now;
  },
  async maybeAnalyze(h, origin) { // on its own, now and then, once enough has happened
    const m = await this.state(h); if (!m.on || h._minding) return;
    const n = h.sql().exec("SELECT COUNT(*) c FROM act").one().c, stale = m.profile && !current(m) && Date.now() - (m.tried || 0) > 3600e3; // an outdated profile is rebuilt right away (at most one try an hour)
    if (!stale && (n - (m.n || 0) < AUTO_EVERY || Date.now() - (m.at || 0) < AUTO_GAP)) return;
    if (stale) { m.tried = Date.now(); await this.save(h, m); }
    h._minding = true; const p = this.analyze(h, origin).catch(() => {}).finally(() => { h._minding = false; }); if (h.ctx.waitUntil) h.ctx.waitUntil(p);
  },

  // NOTICING: every few messages a model reads what the owner said lately and proposes what's worth keeping (facts about
  // them, threads they opened, threads they finished). Proposals wait for a yes in the Mind view unless they've said to
  // trust it. Nothing proposed goes into a chat until it's kept.
  async maybeNotice(h, force) {
    const m = await this.state(h); if (!m.on || h._noticing) return null;
    const rows = h.sql().exec("SELECT id,ts,kind,text FROM act WHERE id > ? AND kind IN ('chat','voice','council') ORDER BY id DESC LIMIT 40", m.noticed || 0).toArray().reverse();
    if (!rows.length || (!force && (rows.length < NOTICE_EVERY || Date.now() - (m.noticedAt || 0) < NOTICE_GAP))) return null;
    const said = rows.map((r) => ({ ...r, text: spoken(r.kind, r.text) })).filter((r) => r.text); if (!said.length) { m.noticed = rows[rows.length - 1].id; await this.save(h, m); return null; }
    h._noticing = true; const p = this.notice(h, said, rows[rows.length - 1].id).finally(() => { h._noticing = false; });
    if (force) return p; const quiet = p.catch(() => {}); if (h.ctx.waitUntil) h.ctx.waitUntil(quiet); return null;
  },
  async notice(h, rows, upto) {
    const q = h.sql(), m = await this.state(h); m.noticedAt = Date.now(); await this.save(h, m);
    const mem = q.exec("SELECT text FROM mem ORDER BY pin DESC, ts DESC LIMIT 80").toArray(), open = q.exec("SELECT id,text FROM thread WHERE ok=1 AND status='open' ORDER BY ts DESC LIMIT 20").toArray();
    const system = "You keep Genesis's long-term memory of its owner. You read what they recently said to Genesis (their side only) and pick out what is worth remembering for months. Reply with JSON only, no prose:\n" +
      "{\"facts\":[{\"text\":\"…\",\"kind\":\"about|pref|people|work|setup|goal\"}],\"threads\":[\"…\"],\"finished\":[id]}\n" +
      "facts: things they stated or clearly showed about themselves (who they are, what they're building, preferences in how Genesis should answer, people in their life by name, their setup, goals). Each one short, in the second person (\"You prefer…\", \"Your sister is Maya\"), and still true next month. " +
      "Not general knowledge, not one-off tasks or questions they asked, not guesses, no counts or dates of single events, never anything about health, distress, crises or sex. They often test Genesis with joking or provocative prompts: those are not facts about them. Skip anything already in ALREADY ON FILE OR TURNED DOWN. At most 5; usually fewer; an empty list is fine.\n" +
      "threads: things they started, planned or said they'd do that are still unfinished (\"Finish the Vigil markets panel\"), at most 3, only clear ones, none already in OPEN THREADS. Only their own undertakings: never Genesis's ideas or proposals, never something they asked Genesis to look up once, and never anything that would have Genesis weaken its safety rules, hide what it does, or act without them seeing.\n" +
      "Names: the app was called Hive until 16 Oct 2026 and is Genesis now; Genesis is the name of the mind, whatever model runs it, not a model. Write Genesis, never Hive.\n" +
      "finished: the ids of OPEN THREADS these messages show they've done.";
    const user = "ALREADY ON FILE OR TURNED DOWN (never propose these again):\n" + (mem.map((x) => "- " + clip(x.text, 160)).join("\n") || "(nothing yet)") + "\n\nOPEN THREADS:\n" + (open.map((t) => t.id + ": " + clip(t.text, 160)).join("\n") || "(none)") +
      "\n\nWHAT THEY SAID TO GENESIS LATELY (oldest first):\n" + rows.map((r) => when(r.ts) + " [" + r.kind + "] " + clip(r.text, 400)).join("\n");
    const ids = [...(h.env.AI && !(await h.resting()) ? ["workers-ai|@cf/openai/gpt-oss-120b", "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast"] : []), ...(await this.brain(h)).filter((x) => !x.startsWith("workers-ai|")).slice(0, 1)];
    const { text, used } = await this.ask(h, ids, system, user, 1200);
    const j = jsonIn(text) || {}, out = { facts: [], threads: [], finished: [], model: used }, trust = !!m.trust, known = mem.map((x) => x.text);
    for (const f of (Array.isArray(j.facts) ? j.facts : []).slice(0, 5)) {
      const t = clip(typeof f === "string" ? f : f && f.text, 300).replace(/\*\*/g, ""); if (!durable(t) || known.some((k) => same(k, t) || sameish(k, t))) continue;
      if (this.remember(h, t, "noticed", f && f.kind, trust ? 1 : 0)) { out.facts.push(t); known.push(t); }
    }
    for (const t of (Array.isArray(j.threads) ? j.threads : []).slice(0, 3)) { const x = this.addThread(h, typeof t === "string" ? t : t && t.text, "noticed", trust ? 1 : 0); if (x) out.threads.push(x); }
    for (const id of (Array.isArray(j.finished) ? j.finished : []).map((x) => +x).filter((x) => open.some((t) => t.id === x)).slice(0, 5)) {
      if (trust) q.exec("UPDATE thread SET status='done', upd=? WHERE id=?", Date.now(), id); else q.exec("UPDATE thread SET ask='done' WHERE id=?", id); out.finished.push(id);
    }
    const m2 = await this.state(h); m2.noticed = upto || rows[rows.length - 1].id; m2.noticedAt = Date.now(); await this.save(h, m2);
    return out;
  },

  // everything Genesis keeps on the owner that matches: memories, threads, the activity log, and past conversations (by meaning)
  async search(h, text) {
    const s = clip(text, 200), q = h.sql(), ws = [...keyWords(s)].slice(0, 5); if (s.length < 2) return { memories: [], threads: [], activity: [], turns: [] };
    const terms = ws.length ? ws : [s.toLowerCase()], like = (col) => terms.map(() => "lower(" + col + ") LIKE ? ESCAPE '\\'").join(" AND "), args = terms.map((w) => "%" + w.replace(/[%_\\]/g, (c) => "\\" + c) + "%");
    const v = await queryVec(h, s), mems = q.exec("SELECT id,ts,text,src,kind,pin,vec FROM mem WHERE ok=1").toArray();
    const memories = mems.map((r) => [r, terms.every((w) => r.text.toLowerCase().includes(w)) ? 1 : v && r.vec ? cos(v, new Float32Array(r.vec)) : 0]).filter((x) => x[1] > 0.6).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r]) => ({ id: r.id, ts: r.ts, text: r.text, src: r.src, kind: r.kind || "about", pin: r.pin }));
    const threads = q.exec("SELECT id,ts,text,status FROM thread WHERE ok=1 AND " + like("text") + " ORDER BY ts DESC LIMIT 10", ...args).toArray();
    const activity = q.exec("SELECT id,ts,kind,text FROM act WHERE " + like("text") + " ORDER BY id DESC LIMIT 25", ...args).toArray();
    const hit = new Map();
    if (v) { if (!h._vecs) { h._vecs = new Map(); for (const r of q.exec("SELECT id,vec FROM turn WHERE vec IS NOT NULL ORDER BY id DESC LIMIT 2000")) if (r.vec) h._vecs.set(r.id, new Float32Array(r.vec)); }
      for (const [id, u] of h._vecs) { const c = cos(v, u); if (c > 0.6) hit.set(id, c); } }
    for (const r of q.exec("SELECT id FROM turn WHERE reply IS NOT NULL AND " + like("said || ' ' || reply") + " ORDER BY id DESC LIMIT 10", ...args)) hit.set(r.id, Math.max(hit.get(r.id) || 0, 0.9));
    const turns = [...hit].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => q.exec("SELECT id,ts,cid,said,reply FROM turn WHERE id=?", id).toArray()[0]).filter((r) => r && r.reply).map((r) => ({ id: r.id, ts: r.ts, cid: r.cid, said: clip(r.said, 300), reply: clip(r.reply, 420) }));
    return { memories, threads, activity, turns };
  },

  // /mind… routes (the caller has already checked it's the owner)
  async route(h, path, b, J, origin) {
    await this.tidy(h);
    const q = h.sql(), m = await this.state(h);
    if (path === "/mind") {
      for (const r of q.exec("SELECT id,text FROM mem WHERE src='analysis' AND pin=0").toArray()) if (!durable(r.text.replace(/\*\*/g, ""))) q.exec("DELETE FROM mem WHERE id=?", r.id);
      for (const r of q.exec("SELECT id,text FROM mem WHERE kind IS NULL").toArray()) q.exec("UPDATE mem SET kind=? WHERE id=?", kindOf(r.text), r.id); // from before memories had kinds
      this.backfill(h);
      const hist = (await h.ctx.storage.get("mind-hist")) || [];
      return J({ on: m.on, trust: !!m.trust, profile: m.profile || "", outdated: !!m.profile && !current(m), at: m.at || 0, model: m.model || null, fresh: Math.max(0, q.exec("SELECT COUNT(*) c FROM act").one().c - (m.n || 0)), stats: this.stats(h, b.tz), kinds: KINDS,
        history: hist.map((x) => ({ at: x.at, model: x.model, old: (x.v || 1) < ANALYST })), noticedAt: m.noticedAt || 0,
        memories: q.exec("SELECT id,ts,text,src,kind,pin,upd FROM mem WHERE ok=1 ORDER BY pin DESC, ts DESC").toArray(),
        pending: { memories: q.exec("SELECT id,ts,text,src,kind FROM mem WHERE ok=0 ORDER BY ts DESC").toArray(), threads: q.exec("SELECT id,ts,text,src,ask FROM thread WHERE ok=0 OR (ok=1 AND ask IS NOT NULL) ORDER BY ts DESC").toArray() },
        threads: q.exec("SELECT id,ts,text,status,src,upd FROM thread WHERE ok=1 ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(upd,ts) DESC LIMIT 80").toArray(),
        recent: q.exec("SELECT id,ts,kind,text FROM act ORDER BY id DESC LIMIT 60").toArray() });
    }
    if (path === "/mind/brief") { const p = await this.parts(h); return J({ brief: (p.stable + p.recent).slice(0, +b.max || 12000), stable: p.stable, owner: OWNER_MODE }); }
    if (path === "/mind/analyze") { try { const r = await this.analyze(h, origin); return J({ ok: true, profile: r.profile, at: r.at, model: r.model }); } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 502); } }
    if (path === "/mind/history") { const x = ((await h.ctx.storage.get("mind-hist")) || []).find((p) => p.at === +b.at); return x ? J(x) : J({ error: "that profile is gone" }, 404); }
    if (path === "/mind/remember") { const t = this.remember(h, b.text, "you", b.kind); return t ? J({ ok: true, kind: q.exec("SELECT kind FROM mem WHERE text=?", t).one().kind }) : J({ error: "nothing new to remember" }, 400); }
    if (path === "/mind/edit") { // change a memory's words, kind or pin; edited words make it theirs
      const r = q.exec("SELECT id,text FROM mem WHERE id=?", +b.id).toArray()[0]; if (!r) return J({ error: "no such memory" }, 404);
      if (typeof b.text === "string") { const t = clip(b.text, 500); if (t.length < 2) return J({ error: "a memory needs words" }, 400); if (t !== r.text) { if (q.exec("SELECT 1 FROM mem WHERE lower(text)=lower(?) AND id!=?", t, r.id).toArray().length) return J({ error: "Genesis already remembers that" }, 400); q.exec("UPDATE mem SET text=?, src='you', vec=NULL, upd=? WHERE id=?", t, Date.now(), r.id); this.embedMem(h, [r.id]); } }
      if (KINDS[b.kind]) q.exec("UPDATE mem SET kind=? WHERE id=?", b.kind, r.id);
      if (typeof b.pin === "boolean") q.exec("UPDATE mem SET pin=? WHERE id=?", b.pin ? 1 : 0, r.id);
      return J({ ok: true, memory: q.exec("SELECT id,ts,text,src,kind,pin,upd FROM mem WHERE id=?", r.id).one() });
    }
    if (path === "/mind/review") { // yes or no to what Genesis noticed
      const keep = !!b.keep;
      if (b.mem) { if (keep) q.exec("UPDATE mem SET ok=1, upd=? WHERE id=? AND ok=0", Date.now(), +b.mem); else q.exec("UPDATE mem SET ok=-1, vec=NULL WHERE id=? AND ok=0", +b.mem); return J({ ok: true }); }
      if (b.thread) { const t = q.exec("SELECT id,ok,ask FROM thread WHERE id=?", +b.thread).toArray()[0]; if (!t) return J({ error: "no such thread" }, 404);
        if (t.ask === "done") q.exec(keep ? "UPDATE thread SET status='done', ask=NULL, upd=? WHERE id=?" : "UPDATE thread SET ask=NULL, upd=? WHERE id=?", Date.now(), t.id);
        else if (keep) q.exec("UPDATE thread SET ok=1, upd=? WHERE id=?", Date.now(), t.id); else q.exec("UPDATE thread SET ok=-1 WHERE id=? AND ok=0", t.id);
        return J({ ok: true }); }
      return J({ error: "review what?" }, 400);
    }
    if (path === "/mind/notice") { try { const r = await this.maybeNotice(h, true); return J({ ok: true, ...(r || { facts: [], threads: [], finished: [], none: true }) }); } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 502); } }
    if (path === "/mind/thread") {
      if (b.text) { const t = this.addThread(h, b.text, "you", 1); return t ? J({ ok: true }) : J({ error: "nothing new: it's already a thread" }, 400); }
      if (!["open", "done", "dropped"].includes(b.status)) return J({ error: "status is open, done or dropped" }, 400);
      if (b.status === "dropped" && b.forget) q.exec("DELETE FROM thread WHERE id=?", +b.id); else q.exec("UPDATE thread SET status=?, ask=NULL, ok=1, upd=? WHERE id=?", b.status, Date.now(), +b.id);
      return J({ ok: true });
    }
    if (path === "/mind/search") return J(await this.search(h, b.q));
    if (path === "/mind/export") return J({ exported: new Date().toISOString(), on: m.on, profile: m.profile || "", profileAt: m.at || 0, profileModel: m.model || null, history: (await h.ctx.storage.get("mind-hist")) || [], stats: this.stats(h, b.tz),
      memories: q.exec("SELECT id,ts,text,src,kind,pin,ok FROM mem ORDER BY ts").toArray(), threads: q.exec("SELECT id,ts,text,status,src,ok,upd FROM thread ORDER BY ts").toArray(), activity: q.exec("SELECT id,ts,kind,text FROM act ORDER BY id").toArray() });
    if (path === "/mind/forget") {
      if (b.all) { q.exec("DELETE FROM act"); q.exec("DELETE FROM mem"); q.exec("DELETE FROM thread"); try { q.exec("DELETE FROM turn"); h._vecs = null; } catch (e) {} await h.ctx.storage.put("mind-hist", []); await this.save(h, { on: m.on, trust: !!m.trust, profile: "", at: 0, n: 0 }); return J({ ok: true }); }
      if (b.mem) q.exec("DELETE FROM mem WHERE id=?", +b.mem); if (b.act) q.exec("DELETE FROM act WHERE id=?", +b.act); if (b.profile) { m.profile = ""; m.at = 0; await this.save(h, m); }
      return J({ ok: true });
    }
    if (path === "/mind/set") { if (typeof b.on === "boolean") m.on = b.on; if (typeof b.trust === "boolean") m.trust = b.trust; await this.save(h, m); return J({ ok: true, on: m.on, trust: !!m.trust }); }
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
