// Care Circle (/api/care/<id>): the page a family shares for looking after someone (medicines and when they're due,
// appointments, visits, the rota, notes). The site can't read any of it.
//
// The browser does the cryptography (care.html): the circle's link carries a random key K in its #fragment, which never
// reaches a server. The circle is encrypted with AES-GCM under K; what's kept here is that ciphertext, its IV, a version
// number and a hash of the circle's token T, where T is worked out from K in the browser (SHA-256 of "care-token:" and
// K, so T can't give K back). Whoever has the link can read and write the circle; nobody else can, this server included.
//
// Writes are optimistic: a write names the version it was made from, and a write from an older version is refused with
// the current one (409), so the browser can apply its change again on top and nothing a sister just did is lost. The
// version is checked and the circle written in one call to the Store (kvCas), so two writes at the same moment from the
// same version can't both land.
//   GET    /api/care/<id>  (x-care-token: T)            → { v, ct, iv, at }
//   POST   /api/care/<id>  { t: T, v, ct, iv }          → { v, at }   v 0 makes the circle; otherwise v must be current
//   POST   /api/care/<id>/delete { t: T }               → { ok }      the circle is gone for everyone
const MAX_CT = 160000, DAY = 864e5;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// A box sealed in the browser: the same rules for every app that keeps a shared, encrypted record this way (Care Circle,
// House Kitty). Each has its own route, its own name for the thing in messages, and its own limits.
// openRead: anyone with the id may read the ciphertext without the token (In Case's card for paramedics: the key in the link
// is all a reader needs, and writing still takes the token, which only the family's phone holds).
export function sealedBox({ route, noun, nouns, newDay = 10, writesDay = 800, openRead = false }) {
  const a = /^[aeiou]/.test(noun) ? "an " : "a ", re = new RegExp("^/api/" + route + "/?");
  return async function (req, env, json) {
  const url = new URL(req.url), parts = url.pathname.replace(re, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now(), ip = req.headers.get("cf-connecting-ip") || "anon";
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    const id = parts[0]; if (!/^[0-9a-f]{16}$/.test(id || "")) throw err("no such " + noun, 404);
    const reading = openRead && req.method === "GET" && parts.length === 1;
    const t = String(b.t || req.headers.get("x-" + route + "-token") || ""); if (!reading && !/^[0-9a-f]{32}$/.test(t)) throw err("this link doesn't open " + a + noun, 403);
    const k = route + ":" + id, c = await st.kvGet(k), th = reading ? "" : await sha(t);
    if (c && !reading && !same(th, c.th)) throw err("this link doesn't open that " + noun, 403);
    // someone else changed it first: the current circle, for the browser to apply its change on top (or 404 if it's gone)
    const conflict = (cur) => { if (!cur) throw err("this " + noun + " doesn't exist any more", 404); if (!same(th, cur.th)) throw err("this link doesn't open that " + noun, 403); return json({ error: "someone else changed the " + noun + " first", v: cur.v, ct: cur.ct, iv: cur.iv, at: cur.at }, 409); };

    if (req.method === "GET" && parts.length === 1) { if (!c) throw err("this " + noun + " doesn't exist any more", 404); return json({ v: c.v, ct: c.ct, iv: c.iv, at: c.at }); }
    if (req.method === "POST" && parts[1] === "delete") { if (!c) throw err("this " + noun + " doesn't exist any more", 404); await st.kvDel(k); return json({ ok: true }); }
    if (req.method === "POST" && parts.length === 1) {
      const ct = String(b.ct || ""), iv = String(b.iv || ""), v = b.v;
      if (!/^[A-Za-z0-9_-]{16,}$/.test(ct) || ct.length > MAX_CT) throw err("send the encrypted " + noun + " (at most about 120 KB)");
      if (!/^[A-Za-z0-9_-]{16}$/.test(iv)) throw err("send the " + noun + "'s IV");
      if (!Number.isInteger(v) || v < 0) throw err("say which version this change was made from");
      if (!c) {
        if (v !== 0) throw err("this " + noun + " doesn't exist any more", 404);
        if (!(await st.hit(route + "-new:" + ip, newDay, DAY))) throw err("that's today's " + newDay + " new " + nouns + " from this connection", 429);
        const r = await st.kvCas(k, 0, { th, v: 1, ct, iv, at: now, created: now }); if (!r.ok) return conflict(r.cur);
        return json({ v: 1, at: now });
      }
      if (v !== c.v) return conflict(c);
      if (!(await st.hit(route + "-w:" + id, writesDay, DAY))) throw err("that's today's " + writesDay + " changes to this " + noun, 429);
      // the version is checked again where it's written, in one call: two writes from the same version can't both land
      const next = { ...c, v: c.v + 1, ct, iv, at: now }, r = await st.kvCas(k, c.v, next); if (!r.ok) return conflict(r.cur);
      return json({ v: next.v, at: now });
    }
    throw err("not here", 404);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
  };
}
export const care = sealedBox({ route: "care", noun: "circle", nouns: "circles" });
export const kitty = sealedBox({ route: "kitty", noun: "kitty", nouns: "kitties" }); // House Kitty: shared costs (kitty.html)
export const incase = sealedBox({ route: "incase", noun: "card", nouns: "cards", writesDay: 200, openRead: true }); // In Case: a card a paramedic can read from its link (incase.html)
