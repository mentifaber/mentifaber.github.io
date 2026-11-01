// AutoFaber Tasks: the owner's standing requests, run on a schedule ("every weekday at 7:30, brief me on…"). Each run goes
// through the real chat, so it gets the same tools: Vigil's board, the weather, search, Deep Research and its evidence
// check. The answer waits in the inbox (Mind → Tasks) and his phone gets a push. Times are his own, in his own time zone,
// daylight saving included. The quarter-hourly cron runs what's due, at most two at a time.
import { AUTO } from "./hive-route.js";

const EVERY = ["day", "weekday", "week", "hour"], MODES = ["chat", "web", "research"], MAX_TASKS = 20, PER_TICK = 2;
const clip = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const okTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; } };

// the wall-clock parts of an instant in a time zone, and the instant of a wall-clock time there
function parts(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
const offset = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
export function zoned(y, mo, d, h, mi, tz) { const guess = Date.UTC(y, mo, d, h, mi); let t = guess - offset(guess, tz); t = guess - offset(t, tz); return t; } // twice: right across a DST change

// the next run after `from`: { every, at: "HH:MM", dow (0 = Sunday, for "week"), tz }
export function nextRun(t, from) {
  const [hh, mm] = String(t.at || "08:00").split(":").map(Number), tz = okTz(t.tz) ? t.tz : "UTC";
  if (t.every === "hour") { let c = Math.floor(from / 3600e3) * 3600e3 + (mm || 0) * 60e3; while (c <= from) c += 3600e3; return c; }
  const p = parts(from, tz);
  for (let i = 0; i < 9; i++) {
    const day = new Date(Date.UTC(p.y, p.mo, p.d + i)), wd = day.getUTCDay(), at = zoned(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm, tz);
    if (at <= from) continue; if (t.every === "weekday" && (wd === 0 || wd === 6)) continue; if (t.every === "week" && wd !== (+t.dow || 0)) continue;
    return at;
  }
  return from + 864e5;
}
// "every weekday at 07:30" in his words
export function when(t) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return t.every === "hour" ? "every hour at :" + String(t.at || "00:00").split(":")[1] : (t.every === "weekday" ? "every weekday" : t.every === "week" ? "every " + days[+t.dow || 0] : "every day") + " at " + t.at + (t.tz && t.tz !== "UTC" ? " (" + t.tz.split("/").pop().replace(/_/g, " ") + ")" : " UTC");
}

export const Tasks = {
  sql(h) {
    const q = h.sql();
    q.exec("CREATE TABLE IF NOT EXISTS task_job(id INTEGER PRIMARY KEY, title TEXT, prompt TEXT, every TEXT, at TEXT, dow INTEGER, tz TEXT, mode TEXT, model TEXT, on_ INTEGER DEFAULT 1, next INTEGER, last INTEGER, ts INTEGER)");
    q.exec("CREATE TABLE IF NOT EXISTS task_run(id INTEGER PRIMARY KEY, job INTEGER, ts INTEGER, ok INTEGER, ms INTEGER, model TEXT, text TEXT, tools TEXT, seen INTEGER DEFAULT 0)");
    return q;
  },
  list(h) {
    const q = this.sql(h), jobs = q.exec("SELECT * FROM task_job ORDER BY id").toArray();
    return { tasks: jobs.map((j) => ({ ...j, on: !!j.on_, when: when(j), runs: q.exec("SELECT id, ts, ok, ms, model, seen, length(text) n FROM task_run WHERE job=? ORDER BY ts DESC LIMIT 5", j.id).toArray() })),
      inbox: q.exec("SELECT r.id, r.job, r.ts, r.ok, r.ms, r.model, r.text, r.tools, r.seen, j.title FROM task_run r LEFT JOIN task_job j ON j.id = r.job ORDER BY r.ts DESC LIMIT 20").toArray().map((r) => ({ ...r, tools: JSON.parse(r.tools || "[]") })),
      unseen: q.exec("SELECT COUNT(*) c FROM task_run WHERE seen=0").one().c, max: MAX_TASKS };
  },
  add(h, b) { // a task, checked; returns its row or { error }
    const q = this.sql(h), prompt = clip(b.prompt, 2000), title = clip(b.title || prompt.split(/[.\n?!]/)[0], 60);
    if (prompt.length < 8) return { error: "say what the task should do" };
    if (q.exec("SELECT COUNT(*) c FROM task_job").one().c >= MAX_TASKS) return { error: "AutoFaber keeps " + MAX_TASKS + " tasks at most: remove one first" };
    const every = EVERY.includes(b.every) ? b.every : "day", at = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.at || "") ? b.at : "08:00", tz = okTz(b.tz) ? b.tz : "UTC", mode = MODES.includes(b.mode) ? b.mode : "chat";
    const t = { title, prompt, every, at, dow: Math.max(0, Math.min(6, +b.dow || 0)), tz, mode, model: /^[\w@./:|-]{3,160}$/.test(b.model || "") ? b.model : AUTO };
    t.next = nextRun(t, Date.now());
    q.exec("INSERT INTO task_job(title,prompt,every,at,dow,tz,mode,model,on_,next,ts) VALUES(?,?,?,?,?,?,?,?,1,?,?)", t.title, t.prompt, t.every, t.at, t.dow, t.tz, t.mode, t.model, t.next, Date.now());
    return { ...t, id: q.exec("SELECT last_insert_rowid() id").one().id, when: when(t) };
  },
  // run one now, through the chat; keep the answer; tell his phone
  async run(h, j, origin, notify) {
    const t0 = Date.now(), stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    let text = "", ok = 1, model = j.model, tools = [];
    try {
      const r = await h.fetch(new Request(origin + "/api/hive/chat", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify({
        stream: true, model: j.model || AUTO, research: j.mode === "research" || undefined, web: j.mode === "web" || undefined, mind: false, followups: false, cid: "task-" + j.id,
        messages: [{ role: "user", text: j.prompt + "\n\n(This is your scheduled task “" + j.title + "”, " + when(j) + ", running at " + stamp + ". He'll read it later: lead with what matters most.)" }] }) }));
      const raw = await r.text();
      for (const c of raw.split("\n\n")) { const e = (/^event: (.*)$/m.exec(c) || [])[1], d = (/^data: (.*)$/m.exec(c) || [])[1]; if (!e || !d) continue; let x; try { x = JSON.parse(d); } catch (er) { continue; }
        if (e === "delta") text += x.t || ""; else if (e === "done") { model = x.model || model; tools = x.tools || tools; } else if (e === "meta") tools = x.tools || tools; else if (e === "error") { ok = 0; text = text || "(it couldn't run: " + x.error + ")"; } }
      if (!/event-stream/.test(r.headers.get("content-type") || "")) { ok = 0; const j2 = JSON.parse(raw || "{}"); text = "(it couldn't run: " + (j2.error || "HTTP " + r.status) + ")"; }
    } catch (e) { ok = 0; text = "(it couldn't run: " + String(e.message || e).slice(0, 200) + ")"; }
    if (!text.trim()) { ok = 0; text = "(the model returned nothing)"; }
    const q = this.sql(h), now = Date.now();
    q.exec("INSERT INTO task_run(job,ts,ok,ms,model,text,tools) VALUES(?,?,?,?,?,?,?)", j.id, now, ok, now - t0, String(model || ""), text.slice(0, 60000), JSON.stringify(tools.slice(0, 12)));
    q.exec("UPDATE task_job SET last=?, next=? WHERE id=?", now, nextRun(j, now), j.id);
    if (Math.random() < 0.05) q.exec("DELETE FROM task_run WHERE id <= (SELECT id FROM task_run ORDER BY id DESC LIMIT 1 OFFSET 300)");
    const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`|\[\]]+/g, "").replace(/\s+/g, " ").trim();
    if (notify) await notify({ cat: "tasks", level: "notable", title: (ok ? "✓ " : "⚠ ") + j.title, body: clip(plain, 300), url: "/hive-app#mind/tasks" }).catch(() => {});
    return { ok: !!ok, ms: now - t0, chars: text.length };
  },
  // the cron's call: whatever is due, oldest first, at most PER_TICK at a time
  async tick(h, origin, notify) {
    if (h._tasking) return { busy: true }; h._tasking = true;
    try { const due = this.sql(h).exec("SELECT * FROM task_job WHERE on_=1 AND next <= ? ORDER BY next LIMIT ?", Date.now(), PER_TICK).toArray(), out = [];
      for (const j of due) out.push({ id: j.id, ...(await this.run(h, j, origin, notify)) });
      return { ran: out };
    } finally { h._tasking = false; }
  },
  async route(h, path, b, J, origin, notify) {
    const q = this.sql(h);
    if (path === "/tasks") return J(this.list(h));
    if (path === "/tasks/add") { const r = this.add(h, b); return r.error ? J(r, 400) : J({ ok: true, task: r }); }
    const j = b.id != null ? q.exec("SELECT * FROM task_job WHERE id=?", +b.id).toArray()[0] : null;
    if (path === "/tasks/del") { if (!j) return J({ error: "no such task" }, 404); q.exec("DELETE FROM task_job WHERE id=?", j.id); q.exec("DELETE FROM task_run WHERE job=?", j.id); return J({ ok: true }); }
    if (path === "/tasks/toggle") { if (!j) return J({ error: "no such task" }, 404); const on = b.on == null ? !j.on_ : !!b.on; q.exec("UPDATE task_job SET on_=?, next=? WHERE id=?", on ? 1 : 0, nextRun(j, Date.now()), j.id); return J({ ok: true, on }); }
    if (path === "/tasks/run") { if (!j) return J({ error: "no such task" }, 404); return J({ ok: true, ...(await this.run(h, j, origin, notify)) }); }
    if (path === "/tasks/seen") { q.exec(b.run ? "UPDATE task_run SET seen=1 WHERE id=?" : "UPDATE task_run SET seen=1 WHERE seen=0", ...(b.run ? [+b.run] : [])); return J({ ok: true }); }
    if (path === "/tasks/tick") return J(await this.tick(h, origin, notify));
    return J({ error: "unknown" }, 404);
  },
};
