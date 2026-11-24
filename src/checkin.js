// Quiet Check-in (/api/checkin/*): someone who lives alone taps "I'm OK" once a day; if they haven't by the time they
// chose, the family's phones are told. No camera, no microphone, no tracking: one tap, one time of day. (A Bodywake
// sensor will be able to check in for them, through the same "ok" call, once its hardware is tested.)
//
// Kept per circle in the Store Durable Object ("ci:<id>"): the person's first name, the time and time zone of their
// daily deadline, when they last checked in, the day the family was last told, hashes of the two keys (the person's,
// which checks in, and the family's, which watches), and the family's push subscriptions (at most 10).
// The 15-minute cron (worker.js) calls sweep(): any circle past today's deadline with no check-in today alerts once.
// Pushes carry no payload (src/push.js): the family's service worker asks /api/checkin/<id>?t=<family key> what's up.
const DAY = 864e5, MAX_WATCH = 10, CIRCLES_DAY = 5;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const hexOf = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const rnd = (n) => hexOf(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// the person's local date and time, in their own time zone
export function local(tz, at = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { date: p.year + "-" + p.month + "-" + p.day, hm: p.hour + ":" + p.minute };
}
// where a circle stands right now: checked in today, still has time, or missed today's time
export function status(c, at = Date.now()) {
  const now = local(c.tz, at), last = c.last ? local(c.tz, c.last).date : null;
  const today = last === now.date, late = !today && now.hm >= c.by;
  return { today, late, date: now.date, by: c.by, tz: c.tz, last: c.last || null, name: c.name, alerted: c.alerted === now.date };
}
const view = (c) => ({ ...status(c), watchers: (c.subs || []).length });

export async function checkin(req, env, json, deps) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/checkin\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main"));
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    if (!parts.length && req.method === "POST") { // start a circle
      const name = String(b.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40); if (!name) throw err("whose check-in is it? A first name is enough");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.by || ""))) throw err("pick the time to check in by");
      const tz = String(b.tz || ""); try { local(tz); } catch (e) { throw err("that isn't a time zone this site knows"); }
      if (!(await st.hit("checkin:" + (req.headers.get("cf-connecting-ip") || "anon"), CIRCLES_DAY, DAY))) throw err("that's today's " + CIRCLES_DAY + " new check-ins from this connection", 429);
      const id = rnd(8), me = rnd(16), fam = rnd(16);
      await st.kvPut("ci:" + id, { name, by: b.by, tz, last: Date.now(), alerted: null, mk: await sha(me), fk: await sha(fam), subs: [], created: Date.now() });
      return json({ id, me, fam });
    }
    const id = parts[0]; if (!/^[0-9a-f]{16}$/.test(id || "")) throw err("no such check-in", 404);
    const c = await st.kvGet("ci:" + id); if (!c) throw err("this check-in doesn't exist any more", 404);
    const key = String(req.method === "POST" ? b.t || "" : url.searchParams.get("t") || ""), h = /^[0-9a-f]{32}$/.test(key) ? await sha(key) : "";
    const isMe = h && same(h, c.mk), isFam = h && same(h, c.fk);
    if (!isMe && !isFam) throw err("this link doesn't open that check-in", 403);
    if (req.method === "GET" && parts.length === 1) return json(view(c));
    if (req.method === "POST" && parts[1] === "ok" && isMe) { c.last = Date.now(); await st.kvPut("ci:" + id, c); return json(view(c)); }
    if (req.method === "POST" && parts[1] === "watch" && isFam) {
      const ep = b.sub && b.sub.endpoint; if (typeof ep !== "string" || !(deps.PUSH_HOSTS.test(ep) || (env.PUSH_TEST_HOST && ep.startsWith(env.PUSH_TEST_HOST)))) throw err("that isn't a push subscription");
      c.subs = (c.subs || []).filter((s) => s.endpoint !== ep); if (c.subs.length >= MAX_WATCH) throw err("ten phones already watch this check-in", 409);
      c.subs.push({ endpoint: ep }); await st.kvPut("ci:" + id, c); return json(view(c));
    }
    if (req.method === "POST" && parts[1] === "unwatch" && isFam) { c.subs = (c.subs || []).filter((s) => s.endpoint !== (b.sub && b.sub.endpoint)); await st.kvPut("ci:" + id, c); return json(view(c)); }
    if (req.method === "POST" && parts[1] === "settings" && isMe) {
      if (b.by !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.by))) throw err("pick the time to check in by"); c.by = b.by; }
      if (b.tz !== undefined) { try { local(String(b.tz)); c.tz = String(b.tz); } catch (e) { throw err("that isn't a time zone this site knows"); } }
      await st.kvPut("ci:" + id, c); return json(view(c));
    }
    if (req.method === "POST" && parts[1] === "delete" && isMe) { await st.kvDel("ci:" + id); return json({ ok: true }); }
    throw err("that link can't do that", 403);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}

// every 15 minutes: tell each circle's family once, the first sweep after a missed deadline
export async function sweep(env, deps, at = Date.now()) {
  const st = env.STORE.get(env.STORE.idFromName("main")); let sent = 0;
  for (const [k, c] of await st.kvList("ci:")) {
    const s = status(c, at); if (!s.late || c.alerted === s.date || !(c.subs || []).length) continue;
    const v = await deps.vapid(); const keep = [];
    for (const sub of c.subs) { const r = await deps.sendPush(sub, v, "high", 6 * 3600).catch(() => 0); if (r !== 404 && r !== 410) keep.push(sub); if (r >= 200 && r < 300) sent++; }
    c.subs = keep; c.alerted = s.date; await st.kvPut(k, c);
  }
  return sent;
}
