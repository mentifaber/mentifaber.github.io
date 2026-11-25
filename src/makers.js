// Foundry for other makers (/api/makers/*): apps made by other people, in FaberOS and Foundry (GP-3.3).
//
// A maker sends a faberos/1 manifest (the format the workshop's own apps use, checked by the same rules as /makers'
// checker) with a way to reach them. They get a private status link (/makers#status=<id>.<token>). The workshop (a
// Vigil session) sees the queue and approves, sends back with a note, or pulls an app. Approved apps are listed for
// FaberOS and Foundry; FaberOS opens each in a sandboxed window that can talk to it only from the app's own address,
// with only the permissions its manifest declares, and its Faber Verbs become things AutoFaber can do.
// An update from the same maker (same id, same token) waits for review while the approved version stays listed.
//
//   POST /api/makers/submit           { manifest, contact, note, token? }  → { id, token, status }
//   GET  /api/makers/status?id=&t=    the maker's view: status and the workshop's note
//   GET  /api/makers/apps             the approved apps, as FaberOS and Foundry read them
//   GET  /api/makers/queue            the workshop: every submission (owner)
//   POST /api/makers/review           the workshop: { id, decision: approve|reject|pull, note } (owner)
//
// Kept in the Store Durable Object, one key per app ("mk:<id>").
import validate from "./faber-validate.js";

const MAX_APPS = 300, SUBMITS_DAY = 5, PENDING_MAX = 60;
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
const rid = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

// an app's tile is drawn from its glyph: only simple shapes with plain numbers survive, rebuilt here, so a glyph can't
// carry script, links or styles into FaberOS
const SHAPES = { path: ["d"], circle: ["cx", "cy", "r"], ellipse: ["cx", "cy", "rx", "ry"], rect: ["x", "y", "width", "height", "rx"], line: ["x1", "y1", "x2", "y2"], polyline: ["points"], polygon: ["points"] };
export function safeGlyph(g) {
  const out = [];
  for (const m of String(g || "").slice(0, 4000).matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^<>]*?)\/?>/gi)) {
    const tag = m[1].toLowerCase(), at = [];
    for (const k of SHAPES[tag]) { const v = new RegExp("\\s" + k + "\\s*=\\s*\"([^\"]*)\"", "i").exec(m[2]); if (v && /^[0-9MmLlHhVvCcSsQqTtAaZz.,\s+-]{1,800}$/.test(v[1])) at.push(k + '="' + v[1].trim() + '"'); }
    if (at.length) out.push("<" + tag + " " + at.join(" ") + "/>");
    if (out.length >= 12) break;
  }
  return out.join("") || '<rect x="5" y="5" width="14" height="14" rx="3"/>';
}
// what FaberOS and Foundry are given: the manifest's own fields, nothing the maker or workshop wrote privately
export function publicApp(m, by) {
  const a = { id: "x-" + m.id, maker: true, by: clean(by, 60) || null, name: clean(m.name, 40), desc: clean(m.desc, 600), entry: m.entry, cat: m.cat || "tools",
    status: "live", hue: Number.isInteger(m.hue) ? m.hue : 38, glyph: safeGlyph(m.glyph), permissions: Array.isArray(m.permissions) ? m.permissions : [],
    kit: !!m.kit, platforms: { web: true, android: null, install: false }, widgets: [] };
  if (Array.isArray(m.accepts) && m.accepts.length) a.accepts = m.accepts;
  if (Array.isArray(m.verbs) && m.verbs.length) a.verbs = m.verbs.map((v) => ({ name: v.name, label: clean(v.label, 60), desc: clean(v.desc, 200), changes: v.changes === true, args: v.args || {}, words: clean(v.words, 200) }));
  return a;
}
const mine = (r) => ({ id: r.id, name: r.manifest.name, status: r.status, note: r.note || "", listed: !!r.approved, update: !!r.next, sent: r.at, updated: r.updated });

export async function makers(req, env, json, owner, deps = {}) {
  const url = new URL(req.url), part = url.pathname.replace(/^\/api\/makers\/?/, "").split("/")[0];
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now();
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    if (part === "apps" && req.method === "GET") {
      const apps = (await st.kvList("mk:")).map(([, r]) => r).filter((r) => r.approved).map((r) => publicApp(r.approved, r.by)).sort((a, c) => a.name.localeCompare(c.name));
      return new Response(JSON.stringify({ apps }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=120" } });
    }
    if (part === "submit" && req.method === "POST") {
      const m = b.manifest, r0 = validate(m); if (!r0.ok) throw err("the manifest isn't ready: " + r0.errors.slice(0, 3).join(" "), 422);
      const contact = clean(b.contact, 120); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw err("an email address, so the workshop can reach you about the app");
      const prev = await st.kvGet("mk:" + m.id), token = clean(b.token, 40);
      if (prev && !(token && same(token, prev.token))) throw err("that id is taken: choose another, or send the update with your status link", 409);
      if (!prev) { const all = await st.kvList("mk:"); if (all.length >= MAX_APPS) throw err("Foundry isn't taking new apps right now; try again later", 503); if (all.filter(([, r]) => r.status === "pending").length >= PENDING_MAX) throw err("the review queue is full; try again in a few days", 503); }
      const ip = req.headers.get("cf-connecting-ip") || "?"; if (!(await st.hit("makers:" + ip, SUBMITS_DAY, 864e5))) throw err("that's today's " + SUBMITS_DAY + " submissions from here", 429);
      const keep = { ...m, format: "faberos/1" };
      const r = prev ? { ...prev, contact, by: clean(b.by, 60) || prev.by, notes: clean(b.note, 1000), status: "pending", note: "", updated: now, ...(prev.approved ? { next: keep } : { manifest: keep }) }
        : { id: m.id, token: rid(16), manifest: keep, contact, by: clean(b.by, 60), notes: clean(b.note, 1000), status: "pending", note: "", at: now, updated: now };
      if (prev && prev.approved) r.manifest = prev.manifest;
      await st.kvPut("mk:" + m.id, r);
      if (deps.alert) await deps.alert({ title: "Foundry: " + (prev ? "an update to " : "a new app, ") + clean(m.name, 40), body: clean(m.desc, 140), urgent: false, url: "/makers#review" }).catch(() => {});
      return json({ id: r.id, token: r.token, status: r.status, link: "/makers#status=" + r.id + "." + r.token });
    }
    if (part === "status" && req.method === "GET") {
      const r = await st.kvGet("mk:" + clean(url.searchParams.get("id"), 40)), t = url.searchParams.get("t") || "";
      if (!r || !/^[0-9a-f]{32}$/.test(t) || !same(t, r.token)) throw err("this link doesn't open a submission", 404);
      return json({ app: mine(r) });
    }
    if (part === "queue" && req.method === "GET") {
      if (!owner) return json({ error: "only the workshop reviews apps" }, 403);
      const all = (await st.kvList("mk:")).map(([, r]) => ({ ...mine(r), manifest: r.next || r.manifest, contact: r.contact, by: r.by || "", notes: r.notes || "", check: validate(r.next || r.manifest) }));
      return json({ apps: all.sort((a, c) => (a.status === "pending" ? 0 : 1) - (c.status === "pending" ? 0 : 1) || c.updated - a.updated) });
    }
    if (part === "review" && req.method === "POST") {
      if (!owner) return json({ error: "only the workshop reviews apps" }, 403);
      const r = await st.kvGet("mk:" + clean(b.id, 40)); if (!r) throw err("no such app", 404);
      const note = clean(b.note, 1000), d = b.decision;
      if (d === "approve") { const m = r.next || r.manifest, v = validate(m); if (!v.ok) throw err("it doesn't pass the checks any more: " + v.errors[0], 422); r.approved = m; r.manifest = m; delete r.next; r.status = "approved"; }
      else if (d === "reject") { if (r.next) delete r.next; r.status = r.approved ? "approved" : "changes"; }
      else if (d === "pull") { delete r.approved; delete r.next; r.status = "pulled"; }
      else throw err("approve, reject or pull");
      r.note = note; r.updated = now; await st.kvPut("mk:" + r.id, r);
      return json({ app: { ...mine(r), manifest: r.manifest } });
    }
    return json({ error: "not here" }, 404);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
}
