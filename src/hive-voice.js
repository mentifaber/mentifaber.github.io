// AutoFaber · voice links. The owner makes a link; anyone who opens it on a phone joins as a guest and can talk to AutoFaber by
// voice, and nothing else. Each device that opens the link becomes its own guest (a token kept on that device), so one link
// serves many phones. The link carries its own limits: how many devices, how many turns a day for each, when it expires; it can
// be turned off, or one device removed, at any time. A guest token opens only /api/hive/voice/* and the live-listening socket:
// no chat history, no memory, no tools of the owner's, no vault, no missions. Guests are metered by their own id, not their network
// address (phones on mobile data share one), and a daily ceiling covers all guests together, because the free AI allowance is
// shared with everything else on the site. Nothing a guest says is stored: only counters.
//
//   POST /api/hive/voice/join   { code | token, name? }            → { token, guest, link, left, voices }
//   POST /api/hive/voice/turn   { text | audio, history?, voice? } → { heard?, text, audio, left }      (Authorization: Bearer <token>)
//   POST /api/hive/voice/stt    { audio, lang? }                   → { text }
//   POST /api/hive/voice/leave  { token }                          → { ok }
//   owner: /voice/links, /voice/links/create, /voice/links/update, /voice/links/delete, /voice/guests/remove
import { seal, unseal, transcribe, voiceOut, AURA2 } from "./hive-kit.js";

export const FREE_MODEL = "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const LIM = { days: [1, 365, 7], devices: [1, 25, 5], perDay: [5, 300, 40] }; // [min, max, default]
const ALL_DAY = 800, MAX_LINKS = 50, MAX_AUDIO = 8e6, MAX_TEXT = 1500, KEEP = 8;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v, [lo, hi, d]) => { v = Math.round(+v); return isFinite(v) && v >= lo && v <= hi ? v : d; };
const hex = (a) => [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const newCode = () => [...crypto.getRandomValues(new Uint8Array(26))].map((x) => "abcdefghijklmnopqrstuvwxyz234567"[x & 31]).join(""); // 130 bits
const newToken = () => "vg_" + hex(crypto.getRandomValues(new Uint8Array(32)));
const today = () => new Date().toISOString().slice(0, 10);
const used = (q, k) => (q.exec("SELECT n FROM limits WHERE k=?", k).toArray()[0] || { n: 0 }).n;
const bump = (q, k) => q.exec("INSERT INTO limits(k,n) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=n+1", k);

// requests the Durable Object makes on a guest's behalf: the Studio's per-address meter lets these through (the guest's own
// limits apply instead). A WeakSet, so nothing a client sends can ever be mistaken for one.
const GUEST_REQS = new WeakSet();
export const isGuestReq = (r) => GUEST_REQS.has(r);

export function voiceTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS vlink(id TEXT PRIMARY KEY, label TEXT, code TEXT, hash TEXT, ts INTEGER, exp INTEGER, devices INTEGER, per_day INTEGER, on_ INTEGER DEFAULT 1)");
  q.exec("CREATE TABLE IF NOT EXISTS vguest(id TEXT PRIMARY KEY, link TEXT, hash TEXT, name TEXT, named INTEGER DEFAULT 0, ts INTEGER, seen INTEGER, turns INTEGER DEFAULT 0)");
  q.exec("CREATE INDEX IF NOT EXISTS ix_vlink_hash ON vlink(hash)"); q.exec("CREATE INDEX IF NOT EXISTS ix_vguest_hash ON vguest(hash)"); q.exec("CREATE INDEX IF NOT EXISTS ix_vguest_link ON vguest(link)");
}

const bearer = (req, b) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() || String(b.token || b.g || "");
// a guest token → { g, l, q }, or { error, status }
async function who(h, token) {
  if (!/^vg_[0-9a-f]{64}$/.test(token)) return { error: "this device isn't connected: open the voice link again", status: 401 };
  const q = h.sql(), g = q.exec("SELECT * FROM vguest WHERE hash=?", await sha(token)).toArray()[0];
  if (!g) return { error: "this device isn't connected any more: open the voice link again", status: 401 };
  const l = q.exec("SELECT * FROM vlink WHERE id=?", g.link).toArray()[0];
  if (!l || !l.on_) return { error: "this voice link was turned off", status: 403 };
  if (l.exp < Date.now()) return { error: "this voice link has expired", status: 403 };
  return { g, l, q };
}
const left = (a) => Math.max(0, a.l.per_day - used(a.q, "vt:" + today() + ":" + a.g.id));
const voicesFree = () => AURA2.map((x) => ({ id: "a2:" + x, name: x[0].toUpperCase() + x.slice(1) }));
const view = (a, token) => ({ ...(token ? { token } : {}), guest: { id: a.g.id, name: a.g.name }, link: { label: a.l.label, expires: a.l.exp, perDay: a.l.per_day, devices: a.l.devices }, left: left(a), voices: voicesFree() });

export const Voice = {
  // ── guests ──
  async join(h, b, req, J) {
    const q = h.sql(), day = today();
    if (!h.meter(req, "vjoin", 120)) return J({ error: "too many tries from this connection today" }, 429);
    q.exec("DELETE FROM limits WHERE k GLOB 'v[tsaj]*:*' AND k NOT LIKE ?", "%" + day + "%");
    const have = bearer(req, b); // a device that is already in: it just checks in again
    if (have) { const a = await who(h, have); if (!a.error) { q.exec("UPDATE vguest SET seen=? WHERE id=?", Date.now(), a.g.id); return J(view(a)); } if (!b.code) return J({ error: a.error }, a.status); }
    const code = String(b.code || "").trim().toLowerCase();
    if (!/^[a-z2-7]{26}$/.test(code)) return J({ error: "that isn't a valid voice link" }, 400);
    const l = q.exec("SELECT * FROM vlink WHERE hash=?", await sha(code)).toArray()[0];
    if (!l) return J({ error: "that voice link doesn't exist" }, 404);
    if (!l.on_) return J({ error: "this voice link was turned off" }, 403);
    if (l.exp < Date.now()) return J({ error: "this voice link has expired" }, 403);
    const n = q.exec("SELECT COUNT(*) c FROM vguest WHERE link=?", l.id).one().c;
    if (n >= l.devices) return J({ error: "this link already has its " + l.devices + " devices connected: ask for a new one, or for a device to be removed" }, 403);
    const name = clip(b.name, 24), id = hex(crypto.getRandomValues(new Uint8Array(6))), token = newToken(), now = Date.now();
    q.exec("INSERT INTO vguest(id,link,hash,name,named,ts,seen,turns) VALUES(?,?,?,?,?,?,?,0)", id, l.id, await sha(token), name || "Guest " + (n + 1), name ? 1 : 0, now, now);
    return J(view(await who(h, token), token));
  },
  async turn(h, b, req, J) {
    const a = await who(h, bearer(req, b)); if (a.error) return J({ error: a.error }, a.status);
    const { g, l, q } = a, day = today(), lang = /^[a-z]{2}$/i.test(String(b.lang || "").slice(0, 2)) ? String(b.lang).slice(0, 2).toLowerCase() : "";
    let text = clip(b.text, MAX_TEXT), heard;
    if (!text) { // audio in: the words first
      const audio = String(b.audio || "").replace(/^data:[^,]*,/, ""); if (!audio) return J({ error: "send text or audio" }, 400);
      if (audio.length > MAX_AUDIO) return J({ error: "that's too much for one turn" }, 413);
      if (used(q, "vs:" + day + ":" + g.id) >= l.per_day * 4) return J({ error: "this device's listening for today is used up", left: left(a) }, 429);
      bump(q, "vs:" + day + ":" + g.id);
      const r = await transcribe(h.env, audio, lang, ["AutoFaber", "Fabe", "Mentifaber"]).catch(() => null);
      text = clip(r && r.text, MAX_TEXT); heard = text; if (!text) return J({ heard: "", text: "", left: left(a) });
    }
    if (used(q, "vt:" + day + ":" + g.id) >= l.per_day) return J({ error: "that's all of today's turns for this device: it resets tomorrow", left: 0 }, 429);
    if (used(q, "va:" + day + ":all") >= ALL_DAY) return J({ error: "AutoFaber has used its voice allowance for today: come back tomorrow", left: left(a) }, 429);
    bump(q, "vt:" + day + ":" + g.id); bump(q, "va:" + day + ":all");
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-KEEP * 2).map((m) => ({ role: m && m.role === "assistant" ? "assistant" : "user", text: clip(m && m.text, 700) })).filter((m) => m.text);
    const gr = new Request(req.url, { headers: new Headers() }); GUEST_REQS.add(gr);
    const body = { model: FREE_MODEL, voice: true, lang: lang || undefined, cid: "vg-" + g.id, ...(g.named ? { me: { name: g.name } } : {}), messages: [...hist, { role: "user", text }] };
    const res = await h.studio("/chat", body, false, gr, (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json" } }));
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error || !j.text) return J({ error: j.error || "AutoFaber couldn't answer just now: try again", left: left(a) }, res.ok ? 502 : res.status);
    q.exec("UPDATE vguest SET seen=?, turns=turns+1 WHERE id=?", Date.now(), g.id);
    const say = String(j.text).replace(/[*_`#>|]/g, "").trim().slice(0, 1200), want = String(b.voice || "").replace(/^a2:/, ""), spec = /^a2:/.test(String(b.voice || "")) && AURA2.includes(want) ? b.voice : "a2:thalia";
    let audio = null, ttsError;
    if (say) try { audio = "data:audio/mpeg;base64," + (await voiceOut(h.env, say, spec, null)).audio; } catch (e) { ttsError = clip(e && e.message || e, 120); }
    return J({ ...(heard != null ? { heard } : {}), text: j.text, audio, ...(ttsError ? { ttsError } : {}), left: left(a), model: j.model });
  },
  async stt(h, b, req, J) {
    const a = await who(h, bearer(req, b)); if (a.error) return J({ error: a.error }, a.status);
    const audio = String(b.audio || "").replace(/^data:[^,]*,/, ""); if (!audio || audio.length > MAX_AUDIO) return J({ error: "no audio, or more than a few minutes of it" }, 400);
    const k = "vs:" + today() + ":" + a.g.id; if (used(a.q, k) >= a.l.per_day * 4) return J({ error: "this device's listening for today is used up" }, 429);
    bump(a.q, k);
    const r = await transcribe(h.env, audio, String(b.lang || "").slice(0, 2).toLowerCase(), ["AutoFaber", "Fabe", "Mentifaber"]);
    return J({ text: r.text, dropped: r.dropped, voiced: r.voiced });
  },
  // the live-listening socket asks this before it opens (src/worker.js → /api/hive/listen-ok)
  async listenOk(h, token) {
    const a = await who(h, token); if (a.error) return false; const k = "vs:" + today() + ":" + a.g.id;
    if (used(a.q, k) >= a.l.per_day * 4) return false; bump(a.q, k); return true;
  },
  async leave(h, b, req, J) {
    const t = bearer(req, b); if (/^vg_[0-9a-f]{64}$/.test(t)) h.sql().exec("DELETE FROM vguest WHERE hash=?", await sha(t));
    return J({ ok: true });
  },

  // ── the owner's side ──
  async links(h, origin) {
    const q = h.sql(), day = today(), k = await h.vk(), out = [];
    for (const l of q.exec("SELECT * FROM vlink ORDER BY ts DESC").toArray()) {
      let code = ""; try { code = await unseal(k, l.code); } catch (e) {}
      out.push({ id: l.id, label: l.label, url: code ? origin + "/talk#" + code : "", ts: l.ts, exp: l.exp, expired: l.exp < Date.now(), on: !!l.on_, devices: l.devices, perDay: l.per_day,
        guests: q.exec("SELECT id,name,ts,seen,turns FROM vguest WHERE link=? ORDER BY ts", l.id).toArray().map((g) => ({ ...g, today: used(q, "vt:" + day + ":" + g.id) })) });
    }
    return { links: out, allToday: used(q, "va:" + day + ":all"), allCap: ALL_DAY, limits: { days: LIM.days, devices: LIM.devices, perDay: LIM.perDay } };
  },
  async route(h, path, b, owner, req, J, origin) {
    const p = path.replace(/^\/voice/, "") || "/", post = req.method === "POST";
    if (p === "/") return J({ what: "AutoFaber voice links: guests talk to AutoFaber by voice, on any number of phones, through a link the owner makes.", join: "POST /api/hive/voice/join {code}", turn: "POST /api/hive/voice/turn {text | audio} with Authorization: Bearer <token>", note: "guests get free voices and models only; nothing they say is stored" });
    if (p === "/join" && post) return this.join(h, b, req, J);
    if (p === "/turn" && post) return this.turn(h, b, req, J);
    if (p === "/stt" && post) return this.stt(h, b, req, J);
    if (p === "/leave" && post) return this.leave(h, b, req, J);
    if (!owner) return J({ error: "voice links are the owner's: sign in on Vigil first" }, 401);
    const q = h.sql();
    if (p === "/links") return J(await this.links(h, origin));
    if (p === "/links/create" && post) {
      if (q.exec("SELECT COUNT(*) c FROM vlink").one().c >= MAX_LINKS) return J({ error: "that's " + MAX_LINKS + " links: delete some first" }, 400);
      const id = hex(crypto.getRandomValues(new Uint8Array(4))), c = newCode(), days = num(b.days, LIM.days);
      q.exec("INSERT INTO vlink(id,label,code,hash,ts,exp,devices,per_day,on_) VALUES(?,?,?,?,?,?,?,?,1)", id, clip(b.label, 60) || "Voice link", await seal(await h.vk(), c), await sha(c), Date.now(), Date.now() + days * 864e5, num(b.devices, LIM.devices), num(b.perDay, LIM.perDay));
      return J({ ok: true, id, url: origin + "/talk#" + c });
    }
    if (p === "/links/update" && post) {
      const l = q.exec("SELECT * FROM vlink WHERE id=?", String(b.id || "")).toArray()[0]; if (!l) return J({ error: "no such link" }, 404);
      q.exec("UPDATE vlink SET label=?, devices=?, per_day=?, exp=?, on_=? WHERE id=?", b.label != null ? clip(b.label, 60) || l.label : l.label, b.devices != null ? num(b.devices, [LIM.devices[0], LIM.devices[1], l.devices]) : l.devices,
        b.perDay != null ? num(b.perDay, [LIM.perDay[0], LIM.perDay[1], l.per_day]) : l.per_day, b.days != null ? Date.now() + num(b.days, LIM.days) * 864e5 : l.exp, b.on != null ? (b.on === false || b.on === "false" || b.on === 0 ? 0 : 1) : l.on_, l.id);
      return J({ ok: true });
    }
    if (p === "/links/delete" && post) { q.exec("DELETE FROM vguest WHERE link=?", String(b.id || "")); q.exec("DELETE FROM vlink WHERE id=?", String(b.id || "")); return J({ ok: true }); }
    if (p === "/guests/remove" && post) { q.exec("DELETE FROM vguest WHERE id=?", String(b.id || "")); return J({ ok: true }); }
    return J({ error: "no such voice route" }, 404);
  },
};
