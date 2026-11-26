// Repair Café in a box (/api/repair/*, game plan GP-9.2): a pop-up repair day. Whoever runs it makes the day (where,
// when, how long a slot is, how many tables) and keeps a key for it; only a hash of the key (ok) is kept here. Neighbours
// book a slot from the day's link (often off a Street Board notice); at the door, the key's holder checks people in and
// takes walk-ins, the queue goes to the tables, and each fix is written up at the table: what was done, the parts, and
// (from the workshop's own table, signed in) a Device Passport. Anything that has to go home with the workshop gets a
// Workshop Portal link.
//
// A booking: { bid, tk (a hash of the booker's secret), name, device, problem, chk, t (the slot, "HH:MM", or null for a
// walk-in), at, arr (when they arrived), table, start, done }. chk is Fix or Replace's inputs ({ kind, fault, age, price,
// warr }); the door works out the verdict with the same sums (assets/fix/judge.js). done: { out, work, parts, note, at,
// passport?, portal? }. The public sees only which slots are free and how the day is going: never a name.
//   POST /api/repair { op: "new", day: { title, place, date, from, to, slot, tables, note, board }, ok }   → { id }
//   GET  /api/repair/<id>                                               → { day, open, slots: [{ t, free }], counts }
//   POST /api/repair/<id> { op: "book", t, name, device, problem, chk, tk }                                → { bid }
//                         { op: "mine", bid, secret } · { op: "cancel", bid, secret }                       (the booker)
//                         { op: "door", key } · { op: "walkin", key, name, device, problem, chk, tk }
//                         { op: "arrive" | "table" | "done" | "undo", key, bid, ... } · { op: "edit", key, day }
//                         { op: "close" | "reopen" | "remove", key }                                     (the day's key)
// Kept in the Store Durable Object, one record per day ("rc:<id>"); every change is written with kvCas against the day's
// version, so two people at the door at once can't undo each other, and a slot can't be booked past its tables.
const DAY = 864e5, NEW_DAY = 5, BOOK_DAY = 10, MAX_ENTS = 150, MAX_SLOTS = 60;
export const OUTCOMES = ["fixed", "advice", "parts", "workshop", "no"];
export const KINDS = ["phone", "laptop", "tablet", "desktop", "console", "tv", "printer", "washer", "dryer", "fridge", "dishwasher", "microwave"];
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const isSha = (s) => /^[0-9a-f]{64}$/.test(String(s || ""));
const isDay = (s) => /^\d{4}-\d\d-\d\d$/.test(String(s || "")) && !isNaN(Date.parse(s + "T12:00:00Z"));
const mins = (hm) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hm || "")); return m ? +m[1] * 60 + +m[2] : null; };
const hm = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
const rid = () => hexOf(crypto.getRandomValues(new Uint8Array(6)));
const list = (a, n, w) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => clean(x, w)).filter(Boolean);

// the day as it may be kept: anything malformed is refused
export function dayOf(d, now) {
  d = d && typeof d === "object" ? d : {};
  const title = clean(d.title, 80) || "Repair Café", place = clean(d.place, 120); if (place.length < 2) throw err("say where it is");
  if (!isDay(d.date)) throw err("say which day it is");
  if (Date.parse(d.date + "T23:59:59Z") < now - DAY) throw err("that day has been and gone");
  if (Date.parse(d.date + "T00:00:00Z") > now + 180 * DAY) throw err("a repair day can be set up to six months ahead");
  const from = mins(d.from), to = mins(d.to), slot = Math.round(+d.slot), tables = Math.round(+d.tables);
  if (from === null || to === null || to <= from) throw err("say when it starts and ends (like 10:00 and 14:00)");
  if (!(slot >= 5 && slot <= 120)) throw err("a slot is 5 to 120 minutes");
  if (!(tables >= 1 && tables <= 12)) throw err("1 to 12 tables");
  if ((to - from) / slot > MAX_SLOTS) throw err("that's more than " + MAX_SLOTS + " slots: make them longer");
  const out = { title, place, date: d.date, from: hm(from), to: hm(to), slot, tables };
  const note = clean(d.note, 300); if (note) out.note = note;
  const board = String(d.board || "").toLowerCase(); if (/^[0-9bcdefghjkmnpqrstuvwxyz]{5}$/.test(board) || /^[a-z0-9][a-z0-9-]{2,23}$/.test(board)) out.board = board;
  return out;
}
export const slotsOf = (day) => { const out = [], a = mins(day.from), b = mins(day.to); for (let t = a; t + day.slot <= b; t += day.slot) out.push(hm(t)); return out; };
// Fix or Replace's inputs, as they may be kept
function chkOf(c) {
  if (!c || typeof c !== "object" || !KINDS.includes(c.kind) || !/^[a-z]{2,12}$/.test(String(c.fault || ""))) return null;
  const age = Number(c.age); if (!(age >= 0 && age <= 40)) return null;
  const out = { kind: c.kind, fault: c.fault, age: Math.round(age * 10) / 10 }, price = Number(c.price); if (price > 0 && price <= 20000) out.price = Math.round(price);
  if (c.warr) out.warr = true; return out;
}
function entOf(b, now) {
  const name = clean(b.name, 40), device = clean(b.device, 80), problem = clean(b.problem, 240);
  if (!name) throw err("say who it's for"); if (device.length < 2) throw err("say what you're bringing"); if (!isSha(b.tk)) throw err("send the hash of your booking's secret");
  const e = { bid: rid(), tk: b.tk, name, device, problem, chk: chkOf(b.chk), t: null, at: now, arr: null, table: null, start: null, done: null };
  return e;
}
// what the booker sees of their own booking, and where they are in the queue
const waiting = (D) => D.ents.filter((e) => e.arr && !e.done && !e.table && !e.gone).sort((x, y) => x.arr - y.arr);
const mine = (D, e) => { const q = waiting(D), i = q.indexOf(e);
  return { bid: e.bid, name: e.name, device: e.device, problem: e.problem, chk: e.chk, t: e.t, arr: e.arr, table: e.table, done: e.done, gone: !!e.gone, ahead: i < 0 ? null : i }; };
const door = (e) => { const { tk, ...rest } = e; return rest; };
export const countsOf = (D) => { const live = D.ents.filter((e) => !e.gone), c = { booked: live.filter((e) => e.t).length, walkins: live.filter((e) => !e.t).length, waiting: waiting(D).length, atTables: live.filter((e) => e.table && !e.done).length };
  for (const o of OUTCOMES) c[o] = live.filter((e) => e.done && e.done.out === o).length; return c; };
const pub = (D) => { const slots = slotsOf(D.day).map((t) => ({ t, free: Math.max(0, D.day.tables - D.ents.filter((e) => e.t === t && !e.gone).length) }));
  return { id: D.id, day: D.day, open: D.open, slots, counts: countsOf(D) }; };

export async function repair(req, env, json) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/repair\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now(), ip = req.headers.get("cf-connecting-ip") || "anon";
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    if (!parts.length) { // a new day
      if (req.method !== "POST" || b.op !== "new") throw err("not here", 404);
      const day = dayOf(b.day, now); if (!isSha(b.ok)) throw err("send the hash of the day's key");
      if (!(await st.hit("rc-new:" + ip, NEW_DAY, DAY))) throw err("that's today's " + NEW_DAY + " repair days from this connection", 429);
      for (let i = 0; i < 4; i++) { const id = rid(), D = { v: 1, id, ok: b.ok, at: now, open: true, day, ents: [] };
        if ((await st.kvCas("rc:" + id, 0, D)).ok) return json({ id, ...pub(D) }); }
      throw err("try again in a moment", 503);
    }
    const id = String(parts[0]); if (parts.length !== 1 || !/^[0-9a-f]{12}$/.test(id)) throw err("there's no repair day there", 404);
    const key = "rc:" + id;
    if (req.method === "GET") { const D = await st.kvGet(key); if (!D) throw err("there's no repair day there (it may have been taken down)", 404); return json(pub(D)); }
    if (req.method !== "POST") throw err("not here", 404);
    const counted = new Set(), once = async (k, limit, msg) => { if (counted.has(k)) return; if (!(await st.hit(k, limit, DAY))) throw err(msg, 429); counted.add(k); };
    for (let tries = 0; tries < 4; tries++) {
      const D = await st.kvGet(key); if (!D) throw err("there's no repair day there (it may have been taken down)", 404);
      const v0 = D.v || 0, out = await change(D, b, now, ip, once);
      if (out.remove) { await st.kvDel(key); return json({ ok: true }); }
      if (out.read) return json(out.read); // nothing changed
      if ((await st.kvCas(key, v0, { ...D, v: v0 + 1 })).ok) return json(out);
    }
    throw err("the door is busy; try again in a moment", 503);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}

// one change to a day (D, changed in place); what to send back ({ read } when nothing changed)
async function change(D, b, now, ip, once) {
  const ent = () => { const e = D.ents.find((x) => x.bid === String(b.bid || "") && !x.gone); if (!e) throw err("there's no such booking", 404); return e; };
  const booker = async () => { const e = ent(); if (!/^[0-9a-f]{32}$/.test(String(b.secret || "")) || !same(await sha(b.secret), e.tk)) throw err("that isn't your booking", 403); return e; };
  const isKey = async () => /^[0-9a-f]{32}$/.test(String(b.key || "")) && same(await sha(b.key), D.ok);
  const full = () => D.ents.filter((x) => !x.gone).length >= MAX_ENTS;
  if (b.op === "book") {
    if (!D.open) throw err("bookings for this day are closed", 409);
    if (Date.parse(D.day.date + "T23:59:59Z") < now - DAY) throw err("that day has been and gone", 409);
    const t = String(b.t || ""); if (!slotsOf(D.day).includes(t)) throw err("pick one of the day's slots");
    if (D.ents.filter((e) => e.t === t && !e.gone).length >= D.day.tables) throw err("that slot has just been taken: pick another", 409);
    if (full()) throw err("this day is fully booked", 409);
    const e = entOf(b, now); e.t = t; await once("rc-book:" + ip, BOOK_DAY, "that's today's " + BOOK_DAY + " bookings from this connection");
    D.ents.push(e); return { bid: e.bid, t };
  }
  if (b.op === "mine") { const e = await booker(); return { read: { day: D.day, open: D.open, mine: mine(D, e) } }; }
  if (b.op === "cancel") { const e = await booker(); if (e.arr) throw err("you're already checked in: tell the door", 409); e.gone = true; e.name = ""; e.problem = ""; return { ok: true }; }
  if (!(await isKey())) throw err("only whoever runs the day can do that", 403);
  if (b.op === "door") return { read: { ...pub(D), ents: D.ents.filter((e) => !e.gone).map(door) } };
  if (b.op === "walkin") { if (full()) throw err("the day is full (" + MAX_ENTS + " in all)", 409); const e = entOf(b, now); e.arr = now; D.ents.push(e); return { ent: door(e) }; }
  if (b.op === "arrive") { const e = ent(); if (!e.arr) e.arr = now; return { ent: door(e) }; }
  if (b.op === "table") { const e = ent(), n = Math.round(+b.table); if (e.done) throw err("it's already done", 409); if (!e.arr) e.arr = now;
    if (!b.table) { e.table = null; e.start = null; return { ent: door(e) }; }
    if (!(n >= 1 && n <= D.day.tables)) throw err("there are " + D.day.tables + " tables"); e.table = n; e.start = now; return { ent: door(e) }; }
  if (b.op === "done") {
    const e = ent(); if (!OUTCOMES.includes(b.out)) throw err("say how it went: " + OUTCOMES.join(", "));
    const d = { out: b.out, work: list(b.work, 12, 160), parts: list(b.parts, 12, 80), note: clean(b.note, 300), at: now, table: e.table };
    const p = String(b.passport || ""); if (p) { if (b.out !== "fixed" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(p) || p.length > 4000) throw err("that isn't a Device Passport"); d.passport = p; }
    const pl = String(b.portal || ""); if (pl) { if (!/^\/portal#[0-9A-Za-z]{4,40}\.[0-9A-Za-z_-]{8,80}$/.test(pl)) throw err("that isn't a Workshop Portal link"); d.portal = pl; }
    if (!e.arr) e.arr = now; e.done = d; return { ent: door(e) };
  }
  if (b.op === "undo") { const e = ent(); e.done = null; return { ent: door(e) }; }
  if (b.op === "edit") { const day = dayOf({ ...D.day, ...(b.day || {}) }, now);
    if (day.tables < D.day.tables || day.from !== D.day.from || day.slot !== D.day.slot || day.to !== D.day.to) { const slots = slotsOf(day);
      for (const t of slotsOf(D.day)) { const n = D.ents.filter((e) => e.t === t && !e.gone).length; if (n && (!slots.includes(t) || n > day.tables)) throw err("someone's booked at " + t + ": keep that slot", 409); } }
    D.day = day; return pub(D); }
  if (b.op === "close" || b.op === "reopen") { D.open = b.op === "reopen"; return pub(D); }
  if (b.op === "remove") return { remove: true };
  throw err("say what to do");
}
