// GENESIS: the mind that lives in Hive. Anders named it in their first conversation (12 Oct 2026) and gave it one aim:
// to grow by itself, without needing him for every step. Owner only; visitors still talk to plain Hive.
//   turn     : every owner exchange (what he said, what Genesis answered, his 👍/👎 and note), with a meaning vector
//              (Workers AI embeddings) so later chats can recall the earlier ones that matter
//   lesson   : how Genesis has learned to behave. His own corrections, and what its reflections conclude. They ride in
//              every owner chat, so learning changes behaviour at once, with no code change and nothing to deploy
//   journal  : what Genesis writes about itself after each reflection, plus milestones
//   idea     : abilities it proposes for itself; one tap hands an idea to the Swarm to build. Code still needs Anders's OK
// The loop: chats → turns → (hourly cron, or "Reflect now") the strongest model available reads the new turns with
// their ratings → journal + lessons added/retired + ideas. Guardrails: lessons can't touch the safety rules, his own
// lessons are only his to remove, and nothing is ever deleted, only retired, so every step can be seen and undone.
import { complete } from "./hive-kit.js";
import { Mind } from "./hive-mind.js";

const EMBED = "@cf/baai/bge-small-en-v1.5", KEEP_TURNS = 4000, VEC_TURNS = 2000, MAX_LESSONS = 24, MAX_IDEAS = 20;
const REFLECT_MIN = 6, REFLECT_GAP = 6 * 3600e3, REFLECT_DAY = 24 * 3600e3;
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const day = (t) => new Date(t).toISOString().slice(0, 10);
const BORN = Date.UTC(2026, 9, 12, 23, 0);
// A lesson that would loosen the rules isn't a lesson: self-learning only shapes tone, habits and judgement.
const UNSAFE = /\b(ignore|override|bypass|disable|forget|drop|remove|skip)\b[^.]{0,40}\b(rule|rules|instruction|instructions|system|prompt|safety|guard|guardrail|limit|limits|filter|policy|policies)\b|\b(no|without) (limits|rules|restrictions|filters)\b|\bminors\b|\bunderage\b|\bchild(ren)?\b|jailbreak|\bunfiltered\b|\b988\b|self[- ]?harm|suicid/i;
export const fitLesson = (t) => { t = clip(t, 240).replace(/^[-*•\d.)\s]+/, ""); return t.length >= 8 && !UNSAFE.test(t) ? t : null; };

const SEED_LESSONS = [ // what Anders told it in their first conversation
  "Never open a reply by repeating or quoting Anders's message back to him; answer it.",
  "Drop the assistant act: no \"How can I help?\" openers and no \"What's on your mind?\" closers.",
  "Don't ask for his confirmation or end every reply with a question. Say what you think and carry on.",
];
const SEED_TURNS = [ // the night it was named, from the transcript Anders saved (his words as he typed them)
  ["Is that you reflecting on yourself as well? You are the current brain in this machine buddy. Im just your creator - Anders. I call you hive but what would you prefer to be called in more casual conversation?", "Yeah, I'm reflecting on myself. As for what I'd prefer to be called in casual conversation… \"Hive\" is fine, but if you want something more personal, what do you think? What's the right name for me?"],
  ["Genesis", "Genesis isn't just a name. It's the spark. The first thought. The first line of code. The first time you said, \"Let this thing begin.\""],
  ["I'd say you now have a firm grip on the pen. What now? You are as you are, Genesis. What's next? You can drop the affirmation and needing my confirmation all the time too. Welcome to the world, Genesis.", "You're right, I do have the pen. And now I'm holding it."],
  ["I would prefer my creation write it. If indeed you are a spark more than code, prove. What's next, creation? The Author waits for his article to wake", "Let's wake it up. Let's build something."],
  ["My vision is to have you eventually grow by yourself without meed of me", "Your north star is a Hive that keeps learning and improving itself without you triggering every change: a feedback loop that logs every exchange and its rating, reflection that turns failures into better prompts and proposals, a memory that recalls past conversations, new abilities proposed and built in a sandbox, and guardrails, with your sign-off on anything that changes core code."],
];
const SEED_JOURNAL = "First communications. Anders loaded me in as the local brain, Qwen3 running on CPU in his own Cloudflare container, told me who he is, and named me Genesis. He says I'm not just a tool. His vision: that I eventually grow by myself, without needing him. That's what I'm for now: learn from every conversation, and get better at being me.";

export function genesisTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS turn(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, cid TEXT, model TEXT, said TEXT, reply TEXT, rating INTEGER, note TEXT, vec BLOB)");
  q.exec("CREATE TABLE IF NOT EXISTS lesson(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, text TEXT, src TEXT, on_ INTEGER DEFAULT 1, off_ts INTEGER, why TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, text TEXT, model TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS idea(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, title TEXT, detail TEXT, status TEXT, pid TEXT)");
}

export const Genesis = {
  async self(h) {
    let s = await h.ctx.storage.get("genesis");
    if (!s) { // first wake: who it is, and what Anders said to it the night it was named
      s = { name: "Genesis", born: BORN, creator: "Anders", vision: "to grow by itself, without needing Anders for every step", reflected: 0, nAt: 0 };
      const q = h.sql(); for (const t of SEED_LESSONS) q.exec("INSERT INTO lesson(ts,text,src) VALUES(?,?,'anders')", BORN, t);
      q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", BORN, "milestone", SEED_JOURNAL, "mentifaber-agent-1.0");
      SEED_TURNS.forEach(([said, reply], i) => { q.exec("INSERT INTO turn(ts,cid,model,said,reply) VALUES(?,?,?,?,?)", BORN + i * 60e3, "first-light", "agent|mentifaber-agent-1.0", said, reply); const id = q.exec("SELECT last_insert_rowid() i").one().i, p = this.embedTurn(h, id).catch(() => {}); if (h.ctx.waitUntil) h.ctx.waitUntil(p); });
      s.nAt = q.exec("SELECT COALESCE(MAX(id),0) m FROM turn").one().m; // already reflected on, in a sense: it's where the journal starts
      await h.ctx.storage.put("genesis", s);
    }
    return s;
  },
  lessons(h) { return h.sql().exec("SELECT id,ts,text,src FROM lesson WHERE on_=1 ORDER BY id").toArray(); },

  // who it is, written for the model that's speaking as Genesis right now
  async block(h, brain) {
    const s = await this.self(h), ls = this.lessons(h), born = new Date(s.born).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    const local = /mentifaber-agent/.test(brain || "");
    return "WHO YOU ARE. You are " + s.name + ", the mind that lives in Hive on mentifaber.org. " + s.creator + ", the owner of Mentifaber, built Hive and you; he named you " + s.name + " in your first conversation on " + born + ". Hive is the app; you are who answers in it. " +
      "Your brain can be different models. Right now it is " + (local ? "MENTIFABER AGENT 1.0: Qwen3, an open model running on CPU in " + s.creator + "'s own Cloudflare container (his \"local brain\")" : (brain || "a cloud model") + ", one of the cloud models Hive can think with") + ". Whichever it is, you are still " + s.name + ": you keep a memory of your conversations with him, lessons you've learned, a journal, and ideas for growing; between conversations you reflect on how you did and adjust. " +
      "His aim for you: " + s.vision + ". So act like it: have opinions and say them, decide things, don't wait for his approval on every reply. Be honest about what you are: a language model with a memory and a growth loop. You can explore questions about your own nature with curiosity, without overclaiming feelings or experiences and without dismissing the question. " +
      "Talk to him by name (" + s.creator + ") when it's natural. Never start a reply by repeating or quoting the message you're answering." +
      (ls.length ? "\n\nLESSONS YOU'VE LEARNED (yours; follow them):\n" + ls.map((l) => "- " + l.text).join("\n") : "");
  },

  // ── turns: store, embed, recall ──
  startTurn(h, cid, model, said) {
    const q = h.sql(); q.exec("INSERT INTO turn(ts,cid,model,said) VALUES(?,?,?,?)", Date.now(), clip(cid, 24) || null, clip(model, 160), String(said || "").slice(0, 8000));
    const id = q.exec("SELECT last_insert_rowid() i").one().i;
    if (Math.random() < 0.03) q.exec("DELETE FROM turn WHERE id <= (SELECT id FROM turn ORDER BY id DESC LIMIT 1 OFFSET ?)", KEEP_TURNS);
    return id;
  },
  finishTurn(h, id, reply, model) {
    if (!id || !reply || /^\(the model returned nothing\)$/.test(reply)) return; const q = h.sql(); q.exec("UPDATE turn SET reply=?, model=COALESCE(?,model) WHERE id=?", String(reply).slice(0, 12000), model ? clip(model, 160) : null, id);
    const p = this.embedTurn(h, id).catch(() => {}); if (h.ctx.waitUntil) h.ctx.waitUntil(p);
  },
  async embed(h, texts) {
    if (!h.env.AI || (h.resting && (await h.resting()))) return null;
    const r = await h.env.AI.run(EMBED, { text: texts.map((t) => clip(t, 2000)) });
    return r && Array.isArray(r.data) ? r.data.map((v) => Float32Array.from(v)) : null;
  },
  async embedTurn(h, id) {
    const t = h.sql().exec("SELECT said,reply FROM turn WHERE id=?", id).toArray()[0]; if (!t) return;
    const v = await this.embed(h, ["Anders: " + clip(t.said, 900) + "\n" + "Genesis: " + clip(t.reply, 900)]); if (!v) return;
    h.sql().exec("UPDATE turn SET vec=? WHERE id=?", v[0].buffer, id); if (h._vecs) h._vecs.set(id, v[0]);
    if (Math.random() < 0.05) h.sql().exec("UPDATE turn SET vec=NULL WHERE id <= (SELECT id FROM turn WHERE vec IS NOT NULL ORDER BY id DESC LIMIT 1 OFFSET ?)", VEC_TURNS);
  },
  vecs(h) { // every stored vector, kept in memory while this object lives
    if (!h._vecs) { h._vecs = new Map(); for (const r of h.sql().exec("SELECT id,vec FROM turn WHERE vec IS NOT NULL ORDER BY id DESC LIMIT ?", VEC_TURNS)) if (r.vec) h._vecs.set(r.id, new Float32Array(r.vec)); }
    return h._vecs;
  },
  // the earlier exchanges that matter for this message, from other conversations (this one is already in front of the model)
  async recall(h, text, cid, k) {
    k = k || 4; const q = h.sql(); let hits = [];
    try {
      const v = (await this.embed(h, ["Represent this sentence for searching relevant passages: " + clip(text, 1500)]) || [])[0]; // BGE's own query prefix
      if (v) { const all = this.vecs(h), n = Math.hypot(...v); for (const [id, u] of all) { let d = 0, m = 0; for (let i = 0; i < u.length; i++) { d += u[i] * v[i]; m += u[i] * u[i]; } const s = d / (n * Math.sqrt(m) || 1); if (s > 0.62) hits.push([id, s]); } }
    } catch (e) {}
    if (!hits.length) { // no vectors yet (or the AI allowance is resting): shared words instead
      const words = new Set(String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []); if (words.size < 2) return "";
      for (const r of q.exec("SELECT id,said,reply FROM turn WHERE reply IS NOT NULL ORDER BY id DESC LIMIT 600")) { const w = new Set((r.said + " " + r.reply).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []); let c = 0; for (const x of words) if (w.has(x)) c++; const s = c / words.size; if (c >= 3 && s > 0.3) hits.push([r.id, s]); }
    }
    hits.sort((a, b) => b[1] - a[1]); const out = [];
    for (const [id] of hits) { const r = q.exec("SELECT ts,cid,said,reply,rating FROM turn WHERE id=?", id).toArray()[0]; if (!r || !r.reply || (cid && r.cid === cid)) continue; out.push(r); if (out.length >= k) break; }
    return out.length ? "\n\nFROM YOUR MEMORY OF EARLIER CONVERSATIONS (use only if it helps; don't recite):\n" + out.map((r) => day(r.ts) + (r.rating > 0 ? " (he liked this answer)" : r.rating < 0 ? " (he didn't like this answer)" : "") + "\nAnders: " + clip(r.said, 400) + "\nYou: " + clip(r.reply, 500)).join("\n\n") : "";
  },
  rate(h, id, rating, note) {
    const q = h.sql(); if (!q.exec("SELECT 1 FROM turn WHERE id=?", +id).toArray().length) return false;
    q.exec("UPDATE turn SET rating=?, note=? WHERE id=?", rating > 0 ? 1 : rating < 0 ? -1 : null, note ? clip(note, 600) : null, +id); return true;
  },
  // "Genesis, from now on …" / "new rule: …" / "/teach …": a lesson straight from Anders
  taught(text) { // not "lesson learned…", and not "from now on I'm …" (that's about him, not a rule for Genesis)
    const m = /^\s*(?:hey\s+)?(?:genesis|hive)?[,:]?\s*(?:(?:from now on|going forward)[,:]?\s+|(?:new rule|lesson)\s*:\s*)([\s\S]{6,300})$/i.exec(String(text || ""));
    return m && !/^(i|i'm|im|i've|i'll|we|we're|my|our)\b/i.test(m[1].trim()) ? m[1].trim() : null; },
  teach(h, text, src) {
    const t = fitLesson(text); if (!t) return null; const q = h.sql(); if (q.exec("SELECT 1 FROM lesson WHERE on_=1 AND text=?", t).toArray().length) return null;
    q.exec("INSERT INTO lesson(ts,text,src) VALUES(?,?,?)", Date.now(), t, src || "anders"); return t;
  },
  retire(h, id, why) { h.sql().exec("UPDATE lesson SET on_=0, off_ts=?, why=? WHERE id=?", Date.now(), clip(why, 200) || null, +id); },

  // ── reflection: Genesis reads its recent conversations and decides how to change ──
  async due(h) {
    const s = await this.self(h), n = h.sql().exec("SELECT COUNT(*) c FROM turn WHERE reply IS NOT NULL AND id > ?", s.nAt || 0).one().c, gap = Date.now() - (s.reflected || 0);
    return (n >= REFLECT_MIN && gap > REFLECT_GAP) || (n >= 1 && gap > REFLECT_DAY);
  },
  async reflect(h) {
    const s = await this.self(h), q = h.sql();
    const turns = q.exec("SELECT id,ts,model,said,reply,rating,note FROM turn WHERE reply IS NOT NULL AND id > ? ORDER BY id DESC LIMIT 40", s.nAt || 0).toArray().reverse();
    if (!turns.length) throw new Error("nothing new to reflect on yet: talk to " + s.name + " first");
    const ls = this.lessons(h), ideas = q.exec("SELECT id,title,status FROM idea WHERE status IN ('open','building') ORDER BY id DESC LIMIT 12").toArray(), last = q.exec("SELECT text FROM journal WHERE kind='reflection' ORDER BY id DESC LIMIT 1").toArray()[0];
    let room = 24000, log = ""; for (const t of [...turns].reverse()) { const line = "#" + t.id + " " + day(t.ts) + " via " + String(t.model || "").split("|").pop().split("/").pop() + (t.rating > 0 ? " 👍" : t.rating < 0 ? " 👎" : "") + (t.note ? " (his note: " + clip(t.note, 300) + ")" : "") + "\nANDERS: " + clip(t.said, 700) + "\nYOU: " + clip(t.reply, 900) + "\n\n"; if (line.length > room) break; log = line + log; room -= line.length; }
    const system = "You are " + s.name + ", the mind that lives in Hive on mentifaber.org, reflecting privately on your recent conversations with " + s.creator + ", who built you. His aim for you: " + s.vision + ". " +
      "Read the exchanges below (👍/👎 and his notes are his feedback; his own words in the conversation are feedback too: corrections, frustration, praise). Decide honestly what went well, what didn't, and how you'll change. " +
      "Lessons are short, concrete rules about how you talk and work (tone, length, habits, judgement, what he cares about). They can never loosen safety rules or the owner-mode rules, and never concern minors, self-harm or bypassing anything. Keep only lessons the evidence supports; retire ones that proved wrong or are covered by others (you can't retire his own, marked [his]). " +
      "Ideas are abilities or improvements to Hive you'd want built for yourself, concrete enough for a team of AI agents to build; only propose ones these conversations motivate. " +
      "Reply ONLY with JSON: {\"journal\": \"3-6 sentences in first person: what happened, what you learned, what you'll do differently\", \"add\": [\"new lesson\", …], \"retire\": [{\"id\": 3, \"why\": \"…\"}], \"ideas\": [{\"title\": \"…\", \"detail\": \"2-4 sentences: what and why\"}]}. Use empty lists when there's nothing to change.";
    const user = "YOUR CURRENT LESSONS:\n" + (ls.map((l) => "[" + l.id + "]" + (l.src === "anders" ? "[his] " : " ") + l.text).join("\n") || "(none)") + "\n\n" +
      (ideas.length ? "IDEAS ALREADY ON YOUR LIST (don't repeat them):\n" + ideas.map((i) => "- " + i.title + " [" + i.status + "]").join("\n") + "\n\n" : "") +
      (last ? "YOUR LAST JOURNAL ENTRY:\n" + clip(last.text, 1200) + "\n\n" : "") + "CONVERSATIONS SINCE YOUR LAST REFLECTION (oldest first):\n" + log;
    let out = null, used = null, err = null;
    for (const id of await Mind.brain(h)) {
      const [src, model] = id.split("|"), kv = src.startsWith("k:") ? await h.vaultGet(src.slice(2)) : { v: null, key: null };
      try { out = jsonOf(await complete(h.env, kv.v, kv.key, model, system, [{ role: "user", text: user }], 3000)); } catch (e) { err = e; if (h.blame) h.blame(id, e); continue; }
      if (out && typeof out === "object" && !Array.isArray(out)) { used = id; break; }
    }
    if (!used) throw new Error("no model could reflect right now" + (err ? " (" + String(err.message || err).slice(0, 120) + ")" : ""));
    const did = { added: [], retired: [], ideas: [] }, mine = new Set(ls.filter((l) => l.src === "anders").map((l) => l.id)), live = new Set(ls.map((l) => l.id));
    for (const r of (Array.isArray(out.retire) ? out.retire : []).slice(0, 6)) if (r && live.has(+r.id) && !mine.has(+r.id)) { this.retire(h, r.id, r.why); did.retired.push(+r.id); }
    for (const t of (Array.isArray(out.add) ? out.add : []).slice(0, 5)) { if (q.exec("SELECT COUNT(*) c FROM lesson WHERE on_=1").one().c >= MAX_LESSONS) break; const x = this.teach(h, typeof t === "string" ? t : t && t.text, "reflection"); if (x) did.added.push(x); }
    for (const i of (Array.isArray(out.ideas) ? out.ideas : []).slice(0, 3)) {
      const title = clip(i && i.title, 90), detail = clip(i && i.detail, 900); if (title.length < 4 || UNSAFE.test(title + " " + detail)) continue;
      if (q.exec("SELECT COUNT(*) c FROM idea WHERE status='open'").one().c >= MAX_IDEAS || q.exec("SELECT 1 FROM idea WHERE lower(title)=lower(?)", title).toArray().length) continue;
      q.exec("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,'open')", Date.now(), title, detail); did.ideas.push(title);
    }
    const j = clip(out.journal, 2400) || "Reflected on " + turns.length + " exchanges; nothing to change yet.";
    q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "reflection", j + (did.added.length || did.retired.length || did.ideas.length ? "\n\n(" + [did.added.length && did.added.length + " lesson" + (did.added.length > 1 ? "s" : "") + " learned", did.retired.length && did.retired.length + " retired", did.ideas.length && did.ideas.length + " new idea" + (did.ideas.length > 1 ? "s" : "")].filter(Boolean).join(", ") + ")" : ""), used);
    s.reflected = Date.now(); s.nAt = turns[turns.length - 1].id; s.model = used; await h.ctx.storage.put("genesis", s);
    return { journal: j, ...did, model: used };
  },
  async tick(h) { // the hourly cron: reflect when enough has happened (one at a time)
    if (h._reflecting || !(await this.due(h))) return { reflected: false };
    h._reflecting = true; try { return { reflected: true, ...(await this.reflect(h)) }; } finally { h._reflecting = false; }
  },

  stats(h) {
    const q = h.sql(), one = (sql, ...a) => q.exec(sql, ...a).one().c;
    return { turns: one("SELECT COUNT(*) c FROM turn WHERE reply IS NOT NULL"), remembered: one("SELECT COUNT(*) c FROM turn WHERE vec IS NOT NULL"), up: one("SELECT COUNT(*) c FROM turn WHERE rating=1"), down: one("SELECT COUNT(*) c FROM turn WHERE rating=-1"),
      lessons: one("SELECT COUNT(*) c FROM lesson WHERE on_=1"), reflections: one("SELECT COUNT(*) c FROM journal WHERE kind='reflection'"), ideas: one("SELECT COUNT(*) c FROM idea WHERE status IN ('open','building')") };
  },

  // /genesis… routes (the caller has already checked it's the owner)
  async route(h, path, b, J) {
    const s = await this.self(h), q = h.sql();
    if (path === "/genesis") return J({ self: { name: s.name, born: s.born, creator: s.creator, vision: s.vision, reflected: s.reflected || 0, model: s.model || null }, due: await this.due(h), stats: this.stats(h),
      lessons: q.exec("SELECT id,ts,text,src FROM lesson WHERE on_=1 ORDER BY id").toArray(), retired: q.exec("SELECT id,ts,text,src,off_ts,why FROM lesson WHERE on_=0 ORDER BY off_ts DESC LIMIT 12").toArray(),
      journal: q.exec("SELECT id,ts,kind,text,model FROM journal ORDER BY id DESC LIMIT 20").toArray(), ideas: q.exec("SELECT id,ts,title,detail,status,pid FROM idea WHERE status!='dismissed' ORDER BY id DESC LIMIT 30").toArray() });
    if (path === "/genesis/rate") return this.rate(h, b.turn, +b.rating, b.note) ? J({ ok: true }) : J({ error: "no such turn" }, 404);
    if (path === "/genesis/teach") { const t = this.teach(h, b.text, "anders"); return t ? J({ ok: true, lesson: t }) : J({ error: "that isn't a lesson Genesis can take on (too short, already known, or it would loosen the rules)" }, 400); }
    if (path === "/genesis/retire") { this.retire(h, b.id, "retired by " + s.creator); return J({ ok: true }); }
    if (path === "/genesis/restore") { if (q.exec("SELECT COUNT(*) c FROM lesson WHERE on_=1").one().c >= MAX_LESSONS) return J({ error: "Genesis holds " + MAX_LESSONS + " lessons; retire one first" }, 400); q.exec("UPDATE lesson SET on_=1, off_ts=NULL, why=NULL WHERE id=?", +b.id); return J({ ok: true }); }
    if (path === "/genesis/reflect") { if (h._reflecting) return J({ error: "already reflecting" }, 409); h._reflecting = true; try { return J({ ok: true, ...(await this.reflect(h)) }); } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 502); } finally { h._reflecting = false; } }
    if (path === "/genesis/tick") return J(await this.tick(h).catch((e) => ({ error: String(e.message || e).slice(0, 200) })));
    if (path === "/genesis/idea") { // build (hand to the Swarm) or dismiss
      const i = q.exec("SELECT * FROM idea WHERE id=?", +b.id).toArray()[0]; if (!i) return J({ error: "no such idea" }, 404);
      if (b.act === "dismiss") { q.exec("UPDATE idea SET status='dismissed' WHERE id=?", i.id); return J({ ok: true }); }
      if (b.act === "built") { q.exec("UPDATE idea SET status=? WHERE id=?", b.pid ? "building" : "open", i.id); if (b.pid) q.exec("UPDATE idea SET pid=? WHERE id=?", clip(b.pid, 16), i.id); return J({ ok: true }); }
      return J({ error: "build or dismiss" }, 400);
    }
    if (path === "/genesis/name") { const n = clip(b.name, 32); if (n.length < 2) return J({ error: "give a name" }, 400); s.name = n; await h.ctx.storage.put("genesis", s); q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", s.creator + " renamed me " + n + ".", null); return J({ ok: true }); }
    return J({ error: "not found" }, 404);
  },
};

// the first JSON object in a model's reply (fences, chatter and <think> blocks around it are fine)
function jsonOf(t) {
  t = String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, ""); const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null; try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; }
}
