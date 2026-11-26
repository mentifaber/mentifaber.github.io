// Street Skills (/api/skills/<board>, game plan GP-11.2): Street Library for what people can do. Who on the street can fix
// a bike, translate a letter, help with a tax form or sit with a dog; an ask goes to them, and thanks are counted, never
// money. A board is the same place as Street Board's and Street Library's.
//
// An offer: { id, what, kind, note, by, at, ok, asks, thanks }. Whoever offers keeps a key; only a hash of it (ok) is kept
// here and never handed out, so only they can take the offer down or mark an ask answered. Anyone can ask (a name and a
// short message) and anyone can say thanks, once a day per connection per offer.
//   GET  /api/skills/<board>                                                  → { offers }
//   POST /api/skills/<board> { op: "add", offer: { id, what, kind, note, by }, ok } · { op: "ask", id, by, text }
//                            { op: "thank", id } · { op: "answered", id, key, aid } · { op: "remove", id, key }
// Kept in the Store Durable Object, one record per board ("sk:<board>"), every change written with kvCas against its version.
import { boardOk } from "./board.js";
export const SKILL_KINDS = ["fix", "help", "care", "teach", "lift", "make"];
const DAY = 864e5, MAX = 200, ADDS_DAY = 20, ASKS_DAY = 30, MAX_ASKS = 8;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const pub = (x) => ({ id: x.id, what: x.what, kind: x.kind, note: x.note, by: x.by, at: x.at, asks: x.asks, thanks: x.thanks });

export async function skills(req, env, json) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/skills\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now(), ip = req.headers.get("cf-connecting-ip") || "anon";
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    const name = String(parts[0] || "").toLowerCase(); if (parts.length !== 1 || !boardOk(name)) throw err("a board is a 5-letter place code or a name of 3 to 24 letters, digits and hyphens", 404);
    const key = "sk:" + name;
    if (req.method === "GET") return json({ offers: ((await st.kvGet(key)) || { offers: [] }).offers.map(pub) });
    if (req.method !== "POST") throw err("not here", 404);
    const counted = new Set(), once = async (k, limit, msg) => { if (counted.has(k)) return; if (!(await st.hit(k, limit, DAY))) throw err(msg, 429); counted.add(k); };
    for (let tries = 0; tries < 4; tries++) {
      const S = (await st.kvGet(key)) || { offers: [] }, v0 = S.v || 0, out = await change(S, b, now, ip, once, name);
      if ((await st.kvCas(key, v0, { ...S, v: v0 + 1 })).ok) return json(out);
    }
    throw err("the street is busy; try again in a moment", 503);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}

async function change(S, b, now, ip, once, board) {
  const offer = () => { const x = S.offers.find((o) => o.id === String(b.id || "")); if (!x) throw err("that isn't on this street's list", 404); return x; };
  const owner = async (x) => { if (!/^[0-9a-f]{32}$/.test(String(b.key || "")) || !same(await sha(b.key), x.ok)) throw err("only whoever offered it can do that", 403); };
  if (b.op === "add") {
    const o = b.offer || {}, id = String(o.id || ""), what = clean(o.what, 60), by = clean(o.by, 24);
    if (!/^[0-9a-f]{12}$/.test(id) || what.length < 3) throw err("say what you can do"); if (!by) throw err("say who you are, as the street knows you");
    if (!/^[0-9a-f]{64}$/.test(String(b.ok || ""))) throw err("send the hash of your key for it");
    if (S.offers.some((x) => x.id === id)) throw err("that's already on the list", 409); if (S.offers.length >= MAX) throw err("this street's list is full (" + MAX + ")", 409);
    await once("sk-add:" + ip, ADDS_DAY, "that's today's " + ADDS_DAY + " offers from this connection");
    const x = { id, what, kind: SKILL_KINDS.includes(o.kind) ? o.kind : "help", note: clean(o.note, 200), by, at: now, ok: b.ok, asks: [], thanks: 0 };
    S.offers.unshift(x); return { offer: pub(x) };
  }
  if (b.op === "ask") {
    const x = offer(), by = clean(b.by, 24), text = clean(b.text, 200); if (!by) throw err("say who's asking"); if (text.length < 3) throw err("say what you need");
    await once("sk-ask:" + ip, ASKS_DAY, "that's today's " + ASKS_DAY + " asks from this connection");
    x.asks = [...x.asks.filter((a) => a.at > now - 30 * DAY), { aid: hexOf(crypto.getRandomValues(new Uint8Array(4))), by, text, at: now }].slice(-MAX_ASKS); return { offer: pub(x) };
  }
  if (b.op === "thank") { const x = offer(); await once("sk-thank:" + board + ":" + x.id + ":" + ip, 1, "you've thanked them today already"); x.thanks = (x.thanks || 0) + 1; return { offer: pub(x) }; }
  if (b.op === "answered") { const x = offer(); await owner(x); const aid = String(b.aid || ""); x.asks = x.asks.filter((a) => a.aid !== aid); return { offer: pub(x) }; } // each ask by its own id: two can arrive in the same millisecond
  if (b.op === "remove") { const x = offer(); await owner(x); S.offers = S.offers.filter((o) => o !== x); return { ok: true }; }
  throw err("say what to do: add, ask, thank, answered or remove");
}
