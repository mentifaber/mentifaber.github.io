// Street Library (/api/library/<board>): neighbours lend each other tools and things. A board is the same place as Street
// Board's (a 5-character geohash cell, or a name the street agrees on), so a street's noticeboard and its shelf go together.
//
// An item: { id, what, note, by, at, ok, loan, asks, past }. Its lender keeps a key; only a hash of it (ok) is kept here,
// and it's never handed out, so only the lender can lend it, mark it back or take it down. A loan: who has it, when it's
// due back, when it went out, and the SHA-256 of the photo of its condition when it went out, with that photo's Witness
// record (the workshop's signature on the photo's fingerprint and the time); the photo stays on the lender's phone. When
// it comes back, the lender marks it back with a photo's fingerprint too, and the loan moves to the item's past.
// Anyone can ask to borrow something (a name and a short message); the lender sees the asks.
//   GET  /api/library/<board>                                       → { items }
//   POST /api/library/<board> { op: "add", item: { id, what, note, by }, ok }
//                             { op: "lend", id, key, to, due, sha, witness } · { op: "back", id, key, sha }
//                             { op: "remove", id, key } · { op: "ask", id, by, text }
// Kept in the Store Durable Object, one record per board ("sl:<board>"), with a version every change is checked against.
import { boardOk } from "./board.js";
const DAY = 864e5, MAX_ITEMS = 200, ADDS_DAY = 30, ASKS_DAY = 30, MAX_ASKS = 6, MAX_PAST = 10;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const isSha = (s) => /^[0-9a-f]{64}$/.test(String(s || ""));
const isDay = (s) => /^\d{4}-\d\d-\d\d$/.test(String(s || "")) && !isNaN(Date.parse(s + "T12:00:00Z"));
// what anyone sees: never the lender's key hash
const pub = (x) => ({ id: x.id, what: x.what, note: x.note, by: x.by, at: x.at, loan: x.loan, asks: x.asks, past: x.past });

export async function library(req, env, json) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/library\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now(), ip = req.headers.get("cf-connecting-ip") || "anon";
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    const name = String(parts[0] || "").toLowerCase(); if (parts.length !== 1 || !boardOk(name)) throw err("a board is a 5-letter place code or a name of 3 to 24 letters, digits and hyphens", 404);
    const key = "sl:" + name;
    if (req.method === "GET") return json({ items: ((await st.kvGet(key)) || { items: [] }).items.map(pub) });
    if (req.method !== "POST") throw err("not here", 404);
    // every change is made to the shelf as it is now and written only if nobody changed it meanwhile (kvCas on the shelf's
    // version); if someone did, it's made again on top of theirs, so two neighbours at the same moment can't undo each other
    const counted = new Set(), once = async (k, limit, msg) => { if (counted.has(k)) return; if (!(await st.hit(k, limit, DAY))) throw err(msg, 429); counted.add(k); };
    for (let tries = 0; tries < 4; tries++) {
      const L = (await st.kvGet(key)) || { items: [] }, v0 = L.v || 0, out = await change(L, b, now, ip, once);
      if ((await st.kvCas(key, v0, { ...L, v: v0 + 1 })).ok) return json(out);
    }
    throw err("the shelf is busy; try again in a moment", 503);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}

// one change to a shelf (L, changed in place); what to send back
async function change(L, b, now, ip, once) {
    const item = () => { const x = L.items.find((i) => i.id === String(b.id || "")); if (!x) throw err("that isn't on this street's shelf", 404); return x; };
    const lender = async (x) => { if (!/^[0-9a-f]{32}$/.test(String(b.key || "")) || !same(await sha(b.key), x.ok)) throw err("only whoever put it on the shelf can do that", 403); };
    if (b.op === "add") {
      const i = b.item || {}, id = String(i.id || ""), what = clean(i.what, 60);
      if (!/^[0-9a-f]{12}$/.test(id) || what.length < 2) throw err("say what it is");
      if (!isSha(b.ok)) throw err("send the hash of your key for it");
      if (L.items.some((x) => x.id === id)) throw err("that's already on the shelf", 409);
      if (L.items.length >= MAX_ITEMS) throw err("this street's shelf is full (" + MAX_ITEMS + " things)", 409);
      await once("lib-add:" + ip, ADDS_DAY, "that's today's " + ADDS_DAY + " things from this connection");
      const x = { id, what, note: clean(i.note, 160), by: clean(i.by, 24), at: now, ok: b.ok, loan: null, asks: [], past: [] };
      L.items.unshift(x); return { item: pub(x) };
    }
    if (b.op === "ask") {
      const x = item(), by = clean(b.by, 24), text = clean(b.text, 120); if (!by) throw err("say who's asking");
      await once("lib-ask:" + ip, ASKS_DAY, "that's today's " + ASKS_DAY + " asks from this connection");
      x.asks = [...x.asks.filter((a) => a.at > now - 14 * DAY), { by, text, at: now }].slice(-MAX_ASKS); return { item: pub(x) };
    }
    if (b.op === "lend") {
      const x = item(); await lender(x); if (x.loan) throw err("it's already out, with " + x.loan.to, 409);
      const to = clean(b.to, 24), due = String(b.due || ""); if (!to) throw err("say who's borrowing it"); if (!isDay(due) || Date.parse(due + "T23:59:59Z") < now - DAY) throw err("say when it's due back");
      const loan = { to, due, out: now }; if (isSha(b.sha)) { loan.sha = b.sha; const w = String(b.witness || ""); if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(w) && w.length < 4000) loan.witness = w; }
      x.loan = loan; x.asks = x.asks.filter((a) => a.by.toLowerCase() !== to.toLowerCase()); return { item: pub(x) };
    }
    if (b.op === "back") {
      const x = item(); await lender(x); if (!x.loan) throw err("it isn't out", 409);
      const done = { ...x.loan, back: now }; if (isSha(b.sha)) done.backSha = b.sha; x.past = [done, ...x.past].slice(0, MAX_PAST); x.loan = null; return { item: pub(x) };
    }
    if (b.op === "remove") { const x = item(); await lender(x); L.items = L.items.filter((i) => i !== x); return { ok: true }; }
    throw err("say what to do: add, ask, lend, back or remove");
}
