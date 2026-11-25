// Quiet Check-in (/api/checkin/*): someone who lives alone taps "I'm OK" once a day; if they haven't by the time they
// chose, the family's phones are told. No camera, no microphone, no tracking: one tap, one time of day. A device can
// check in for them too: the person's link makes a third key that can only check in, as a plain URL that a smart-home
// automation, a phone shortcut or a door sensor calls (GET or POST /api/checkin/<id>/ok?t=<device key>); a Bodywake
// sensor will use the same call once its hardware is tested.
//
// Kept per circle in the Store Durable Object ("ci:<id>"): the person's first name, the time and time zone of their
// daily deadline, when they last checked in and how, the local dates of the last 14 check-ins, a date they're away
// until (no alerts through it), the day the family was last told, hashes of the keys (the person's, which checks in
// and changes settings; the family's, which watches; and optionally a device's, which only checks in), and the
// family's push subscriptions (at most 10). A check-in after the family was told sends them an all-clear.
// The 15-minute cron (worker.js) calls sweep(): any circle past today's deadline with no check-in today alerts once.
//
// A sensor (a Bodywake Wi-Fi motion sensor, or any motion sensor an automation can make call a URL) uses the device key to
// report movement by room: POST /api/checkin/<id>/sense { t, room, motion } or GET ...?t=&room=&motion=1. Only the room's
// name and the time are kept, never what the sensor measured. The first movement of the day is that day's check-in, and
// the person and family see when each room last saw someone. A report with motion false (or 0) is a heartbeat: the
// sensor is alive. If the person turns it on ("quiet", 2 to 12 hours), the family is told once a day when no room has
// seen movement for that long between 07:00 and 22:00 their time, and again with an all-clear when movement returns.
// Pushes carry no payload (src/push.js): the family's service worker asks /api/checkin/<id>?t=<family key> what's up.
const MAX_ROOMS = 8, SENSE_GAP = 60e3, QUIET_FROM = "07:00", QUIET_TO = "22:00";
const DAY = 864e5, MAX_WATCH = 10, CIRCLES_DAY = 5, HISTORY = 14, AWAY_MAX = 92, DEVICE_QUIET = 3600e3;
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
  const today = last === now.date, away = !!c.away && now.date <= c.away, late = !today && !away && now.hm >= c.by;
  return { today, late, away: away ? c.away : null, date: now.date, by: c.by, tz: c.tz, last: c.last || null, via: c.via || null, name: c.name, alerted: c.alerted === now.date };
}
// movement: when each room last saw someone, and whether the family has been told it's been quiet too long today
export function quietness(c, at = Date.now()) {
  const rooms = Object.entries(c.rooms || {}).map(([room, t]) => ({ room, at: t })).sort((a, b) => b.at - a.at), lastMove = rooms.length ? rooms[0].at : null;
  const now = local(c.tz, at), hours = lastMove ? (at - lastMove) / 3600e3 : null, inDay = now.hm >= QUIET_FROM && now.hm < QUIET_TO;
  const quietNow = !!c.quiet && !!lastMove && hours >= c.quiet && inDay && !(c.away && now.date <= c.away);
  return { rooms, lastMove, seen: c.seen || null, quiet: c.quiet || 0, quietNow, quietTold: c.quietTold === now.date, quietClear: c.quietTold === now.date && !!lastMove && lastMove > (c.quietAt || 0) };
}
const view = (c, at) => ({ ...status(c, at), watchers: (c.subs || []).length, days: c.days || [], since: local(c.tz, c.created || c.last || Date.now()).date, device: !!c.dk, sensor: quietness(c, at) });
const pushAll = async (c, deps) => { const v = await deps.vapid(), keep = []; let sent = 0; for (const sub of c.subs || []) { const r = await deps.sendPush(sub, v, "high", 6 * 3600).catch(() => 0); if (r !== 404 && r !== 410) keep.push(sub); if (r >= 200 && r < 300) sent++; } c.subs = keep; return sent; };
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
// a check-in: kept with its local date; if the family was told today, they're sent an all-clear
async function checkIn(c, via, deps, at = Date.now()) {
  const was = status(c, at); c.last = at; c.via = via; const d = local(c.tz, at).date;
  c.days = [...new Set([...(c.days || []), d])].sort().slice(-HISTORY);
  if (was.alerted && !was.today && c.cleared !== d && (c.subs || []).length && deps.sendPush && deps.vapid) {
    c.cleared = d; const v = await deps.vapid(), keep = [];
    for (const sub of c.subs) { const r = await deps.sendPush(sub, v, "high", 6 * 3600).catch(() => 0); if (r !== 404 && r !== 410) keep.push(sub); }
    c.subs = keep;
  }
}

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
      await st.kvPut("ci:" + id, { name, by: b.by, tz, last: Date.now(), days: [local(tz).date], alerted: null, /* setting it up counts as today's check-in */ mk: await sha(me), fk: await sha(fam), subs: [], created: Date.now() });
      return json({ id, me, fam });
    }
    const id = parts[0]; if (!/^[0-9a-f]{16}$/.test(id || "")) throw err("no such check-in", 404);
    const c = await st.kvGet("ci:" + id); if (!c) throw err("this check-in doesn't exist any more", 404);
    const key = String((req.method === "POST" && b.t) || url.searchParams.get("t") || ""), h = /^[0-9a-f]{32}$/.test(key) ? await sha(key) : "";
    const isMe = h && same(h, c.mk), isFam = h && same(h, c.fk), isDev = h && !!c.dk && same(h, c.dk);
    if (!isMe && !isFam && !isDev) throw err("this link doesn't open that check-in", 403);
    if (isDev && parts[1] === "sense") { // a sensor: movement in a room (the day's first is the check-in), or a heartbeat
      const room = String((req.method === "POST" ? b.room : url.searchParams.get("room")) || "").toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().slice(0, 24);
      if (!room) throw err("which room? e.g. room=kitchen");
      const m = req.method === "POST" ? b.motion : url.searchParams.get("motion"), motion = !(m === false || m === 0 || m === "0" || m === "false"), now = Date.now();
      c.rooms = c.rooms || {}; const had = c.rooms[room];
      if (!had && Object.keys(c.rooms).length >= MAX_ROOMS) throw err(MAX_ROOMS + " rooms at most");
      const busy = motion && had && now - had < SENSE_GAP && status(c, now).today; // a burst of reports: one write a minute
      if (!busy) {
        c.seen = now;
        if (motion) { c.rooms[room] = now; if (!status(c, now).today) await checkIn(c, room + " sensor", deps, now);
          if (c.quietTold === local(c.tz, now).date && c.quietCleared !== c.quietTold && (c.subs || []).length && deps.sendPush && deps.vapid) { c.quietCleared = c.quietTold; await pushAll(c, deps); } } // movement again after the family was told: the all-clear
        await st.kvPut("ci:" + id, c);
      }
      return json({ ok: true });
    }
    if (isDev) { // a device's key only checks in, by GET or POST, and says nothing back about the person
      if (parts[1] !== "ok") throw err("a device's link only checks in", 403);
      const now = Date.now(); if (!(c.last && now - c.last < DEVICE_QUIET && status(c, now).today)) { await checkIn(c, "device", deps, now); await st.kvPut("ci:" + id, c); }
      return json({ ok: true });
    }
    if (req.method === "GET" && parts.length === 1) return json(view(c));
    if (req.method === "POST" && parts[1] === "ok" && isMe) { await checkIn(c, "button", deps); await st.kvPut("ci:" + id, c); return json(view(c)); }
    if (req.method === "POST" && parts[1] === "device" && isMe) { // make (or replace) the device link, or turn it off
      if (b.off) { delete c.dk; await st.kvPut("ci:" + id, c); return json(view(c)); }
      const dev = rnd(16); c.dk = await sha(dev); await st.kvPut("ci:" + id, c); return json({ ...view(c), deviceKey: dev });
    }
    if (req.method === "POST" && parts[1] === "watch" && isFam) {
      const ep = b.sub && b.sub.endpoint; if (typeof ep !== "string" || !(deps.PUSH_HOSTS.test(ep) || (env.PUSH_TEST_HOST && ep.startsWith(env.PUSH_TEST_HOST)))) throw err("that isn't a push subscription");
      c.subs = (c.subs || []).filter((s) => s.endpoint !== ep); if (c.subs.length >= MAX_WATCH) throw err("ten phones already watch this check-in", 409);
      c.subs.push({ endpoint: ep }); await st.kvPut("ci:" + id, c); return json(view(c));
    }
    if (req.method === "POST" && parts[1] === "unwatch" && isFam) { c.subs = (c.subs || []).filter((s) => s.endpoint !== (b.sub && b.sub.endpoint)); await st.kvPut("ci:" + id, c); return json(view(c)); }
    if (req.method === "POST" && parts[1] === "settings" && isMe) {
      if (b.by !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.by))) throw err("pick the time to check in by"); c.by = b.by; }
      if (b.tz !== undefined) { try { local(String(b.tz)); c.tz = String(b.tz); } catch (e) { throw err("that isn't a time zone this site knows"); } }
      if (b.quiet !== undefined) { const q = Number(b.quiet); if (q === 0) delete c.quiet; else if (Number.isInteger(q) && q >= 2 && q <= 12) c.quiet = q; else throw err("tell the family after 2 to 12 quiet hours, or turn it off"); }
      if (b.rooms === null) { delete c.rooms; delete c.seen; } // forget the rooms (a sensor moved or retired)
      if (b.away !== undefined) { // away through a date (inclusive): no alerts till then; null or "" clears it
        if (b.away === null || b.away === "") delete c.away;
        else { const today = local(c.tz).date; if (!/^\d{4}-\d\d-\d\d$/.test(String(b.away)) || isNaN(Date.parse(b.away)) || b.away < today) throw err("pick a day from today on");
          if (b.away > addDays(today, AWAY_MAX)) throw err("away for " + AWAY_MAX + " days at most; set it again when they're back"); c.away = b.away; } }
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
    const s = status(c, at); if (!s.late || c.alerted === s.date || !(c.subs || []).length) continue; // away, checked in, early, told already, or nobody to tell
    const v = await deps.vapid(); const keep = [];
    for (const sub of c.subs) { const r = await deps.sendPush(sub, v, "high", 6 * 3600).catch(() => 0); if (r !== 404 && r !== 410) keep.push(sub); if (r >= 200 && r < 300) sent++; }
    c.subs = keep; c.alerted = s.date; await st.kvPut(k, c);
  }
  // quiet too long: no room has seen movement for the person's chosen hours, in the daytime, once a day
  for (const [k, c] of await st.kvList("ci:")) {
    if (!c.quiet || !(c.subs || []).length) continue;
    const q = quietness(c, at), d = local(c.tz, at).date; if (!q.quietNow || c.quietTold === d) continue;
    c.quietTold = d; c.quietAt = q.lastMove; sent += await pushAll(c, deps); await st.kvPut(k, c);
  }
  return sent;
}
