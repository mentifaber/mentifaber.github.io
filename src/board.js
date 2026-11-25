// Street Board (/api/board/<board>): a neighbourhood noticeboard that keeps working in an outage. Posts are written on
// phones and travel phone to phone while the network is down (a link passed over AirDrop, Nearby Share or Bluetooth, or a
// LoRa mesh radio through Hopline's radio layer); whichever phone gets back online first uploads what it carries. So this
// server is the meeting point, not the source: it accepts a batch of posts from anyone, keeps each id once, and hands the
// board back to whoever asks.
//
// A board is a place: a geohash cell (about 5 km across, from the phone's location) or a name a street agrees on.
// A post: { id, kind (need, offer, info, safe, alert), text, by, at, exp }, at most 7 days long. Its writer keeps a removal
// key; only a hash of it (dk) travels with the post, so whoever relays it can't remove it, and a removal is kept as a
// tombstone until the post would have expired, so an old copy relayed later doesn't bring it back. Three flags from three
// connections hide a post. Kept in the Store Durable Object, one record per board ("sb:<board>").
const DAY = 864e5, MAX_POSTS = 250, BATCH = 40, POSTS_DAY = 60, FLAGS_HIDE = 3;
export const KINDS = ["need", "offer", "info", "safe", "alert"];
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
export const boardOk = (b) => /^[0-9bcdefghjkmnpqrstuvwxyz]{5}$/.test(b) || /^[a-z0-9][a-z0-9-]{2,23}$/.test(b);
// a post as it may be kept: anything malformed is refused, so a relay can't add fields or stretch a post's life
export function postOf(p, now) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || ""), text = clean(p.text, 160), at = Math.round(+p.at), exp = Math.round(+p.exp);
  if (!/^[0-9a-f]{12}$/.test(id) || !KINDS.includes(p.kind) || text.length < 2) return null;
  if (!(at > now - 7 * DAY && at <= now + 5 * 60e3) || !(exp > at && exp <= at + 7 * DAY) || exp <= now) return null;
  const out = { id, kind: p.kind, text, at, exp }, by = clean(p.by, 24); if (by) out.by = by;
  if (/^[0-9a-f]{64}$/.test(String(p.dk || ""))) out.dk = p.dk;
  return out;
}
const pub = (p) => (p.gone ? { id: p.id, gone: true, exp: p.exp } : { id: p.id, kind: p.kind, text: p.text, at: p.at, exp: p.exp, ...(p.by ? { by: p.by } : {}), ...(p.dk ? { dk: p.dk } : {}) });

export async function board(req, env, json) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/board\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now(), ip = req.headers.get("cf-connecting-ip") || "anon";
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    const name = String(parts[0] || "").toLowerCase(); if (!boardOk(name)) throw err("a board is a 5-letter place code or a name of 3 to 24 letters, digits and hyphens", 404);
    const key = "sb:" + name, B = (await st.kvGet(key)) || { posts: [] };
    const live = () => B.posts.filter((p) => p.exp > now), save = async () => { B.posts = live().sort((x, y) => y.at - x.at).slice(0, MAX_POSTS); await st.kvPut(key, B); };
    // the board: what's live, newest first; tombstones too, so a phone carrying an old copy drops it
    if (parts.length === 1 && req.method === "GET") {
      const since = +url.searchParams.get("since") || 0;
      return json({ board: name, now, posts: live().filter((p) => !p.hidden && (p.seen || p.at) > since).map(pub) });
    }
    // a batch from a phone: its own posts, and any it carried for others
    if (parts.length === 1 && req.method === "POST") {
      const raw = Array.isArray(b.posts) ? b.posts : []; if (!raw.length) throw err("send the posts"); if (raw.length > BATCH) throw err("at most " + BATCH + " posts at a time");
      let added = 0, refused = 0, limited = false; const have = new Map(B.posts.map((p) => [p.id, p]));
      for (const r of raw) {
        const p = postOf(r, now); if (!p) { refused++; continue; }
        if (have.has(p.id)) continue; // kept once; a later copy can't change it
        if (!(await st.hit("board:" + ip, POSTS_DAY, DAY))) { limited = true; break; } // what came before the limit is still kept
        p.seen = now; B.posts.push(p); have.set(p.id, p); added++;
      }
      if (added) await save();
      return json({ added, refused, ...(limited ? { limited: "that's today's " + POSTS_DAY + " new posts from this connection; the rest can go up tomorrow, or from another phone" } : {}), posts: live().filter((p) => !p.hidden).map(pub) });
    }
    const id = String(b.id || ""), p = B.posts.find((x) => x.id === id && x.exp > now);
    // the writer takes their post down with the key only they hold; the tombstone stays until it would have expired
    if (parts[1] === "remove" && req.method === "POST") {
      if (!p) throw err("that post isn't on this board", 404);
      if (!p.dk || !/^[0-9a-f]{32}$/.test(String(b.k || "")) || (await sha(b.k)) !== p.dk) throw err("only the person who wrote it can take it down", 403);
      Object.assign(p, { gone: true, seen: now, text: "", by: undefined }); delete p.by; delete p.dk; await save(); return json({ ok: true });
    }
    // a neighbour flags a post; three connections hide it
    if (parts[1] === "flag" && req.method === "POST") {
      if (!p || p.gone) throw err("that post isn't on this board", 404);
      const who = (await sha("flag:" + ip)).slice(0, 16); p.flags = [...new Set([...(p.flags || []), who])].slice(0, 10);
      if (p.flags.length >= FLAGS_HIDE) p.hidden = true; await save(); return json({ ok: true, hidden: !!p.hidden });
    }
    return json({ error: "not here" }, 404);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}
