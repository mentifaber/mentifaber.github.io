// Sealed Letters (/api/letters/*): letters that open later, and only with the people chosen to open them.
//
// The browser does the cryptography (letters.html): the letter is encrypted with AES-GCM; its key K is split by Shamir's
// scheme so that k of the n friends' shares rebuild it. With a lock (a date, or "if I stop checking in"), the letter is
// encrypted under K XOR S instead, where S is a random secret the writer's browser makes and this server keeps, handing
// it out only once the lock has opened. So the site can't read a letter (it never sees K or any share), and friends can't open it early (they don't
// have S). Nothing here needs a schedule: whether a lock is open is worked out when someone asks.
//
// Kept per letter, in the Store Durable Object ("letter:<id>"): the ciphertext, its IV, the lock, S (if locked), and a
// hash of the writer's token, which lets the writer check in or delete the letter.
const MAX_CT = 90000, LETTERS_DAY = 6, DAY = 864e5;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const rnd = (n) => hexOf(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// when does the lock open? null: never locked; a time: then (for "if I stop checking in", the last check-in plus the days)
export const opensAt = (L) => !L.lock ? null : L.lock.type === "date" ? L.lock.at : L.lock.last + L.lock.days * DAY;

export async function letters(req, env, json) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/letters\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now();
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    // write one: the ciphertext and the lock; the server makes S and the writer's token
    if (!parts.length && req.method === "POST") {
      const ct = String(b.ct || ""), iv = String(b.iv || "");
      if (!/^[A-Za-z0-9_-]{16,}$/.test(ct) || ct.length > MAX_CT) throw err("send the encrypted letter (at most about 64 KB)");
      if (!/^[A-Za-z0-9_-]{16}$/.test(iv)) throw err("send the letter's IV");
      const k = +b.k, n = +b.n; if (!(Number.isInteger(k) && Number.isInteger(n) && k >= 1 && n >= k && n <= 12)) throw err("k of n: between 1 and 12 friends, k no more than n");
      let lock = null;
      if (b.lock && b.lock.type === "date") { const at = Date.parse(b.lock.at); if (!isFinite(at) || at <= now + 60e3 || at > now + 50 * 365 * DAY) throw err("pick a date in the future (within 50 years)"); lock = { type: "date", at }; }
      else if (b.lock && b.lock.type === "checkin") { const days = Math.round(+b.lock.days); if (!(days >= 7 && days <= 730)) throw err("check-in: between 7 and 730 days"); lock = { type: "checkin", days, last: now }; }
      if (!(await st.hit("letters:" + (req.headers.get("cf-connecting-ip") || "anon"), LETTERS_DAY, DAY))) throw err("that's today's " + LETTERS_DAY + " letters from this connection", 429);
      const S = lock ? String(b.S || "").toLowerCase() : null; if (lock && !/^[0-9a-f]{64}$/.test(S)) throw err("a locked letter needs its release secret");
      const id = rnd(8), token = rnd(16);
      await st.kvPut("letter:" + id, { ct, iv, k, n, lock, S, wt: await sha(token), created: now });
      return json({ id, token, opens: lock ? opensAt({ lock }) : null });
    }
    const id = parts[0]; if (!/^[0-9a-f]{16}$/.test(id || "")) throw err("no such letter", 404);
    const L = await st.kvGet("letter:" + id); if (!L) throw err("this letter doesn't exist, or its writer deleted it", 404);
    const at = opensAt(L), open = !L.lock || now >= at;
    // read it: the ciphertext always (useless without the shares); S only once the lock has opened
    if (parts.length === 1 && req.method === "GET") return json({ ct: L.ct, iv: L.iv, k: L.k, n: L.n, lock: L.lock ? { type: L.lock.type, ...(L.lock.type === "checkin" ? { days: L.lock.days } : {}) } : null, opens: at, open, ...(open && L.S ? { S: L.S } : {}), created: L.created });
    // the writer: check in (puts the "if I stop checking in" lock back by its days), or delete
    if (req.method === "POST" && (parts[1] === "checkin" || parts[1] === "delete")) {
      if (!/^[0-9a-f]{32}$/.test(String(b.token || "")) || !same(await sha(b.token), L.wt)) throw err("that isn't this letter's writer key", 403);
      if (parts[1] === "delete") { await st.kvDel("letter:" + id); return json({ ok: true }); }
      if (!L.lock || L.lock.type !== "checkin") throw err("this letter doesn't wait for check-ins");
      if (open) throw err("this letter has already opened: you didn't check in in time", 409);
      L.lock.last = now; await st.kvPut("letter:" + id, L); return json({ ok: true, opens: opensAt(L) });
    }
    return json({ error: "not here" }, 404);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}
