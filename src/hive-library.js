// Genesis · library: documents Anders hands it (pasted text, a page, a file) kept for good. Each is cut into passages,
// every passage embedded (BGE, Workers AI), and the passages that match a message by meaning ride along as MATERIAL,
// cited by document and passage. Owner only. Lives in the Genesis Durable Object's SQLite, beside the memory.
import { embedTexts, queryVec } from "./hive-mind.js";
import { readPage } from "./hive-kit.js";

const MAX_DOC = 400000, MAX_CHUNKS = 8000, SIZE = 1400, OVER = 200, HIT = 0.6;
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);

export function libraryTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS doc(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, title TEXT, src TEXT, chars INTEGER, chunks INTEGER)");
  q.exec("CREATE TABLE IF NOT EXISTS chunk(id INTEGER PRIMARY KEY AUTOINCREMENT, doc INTEGER, n INTEGER, text TEXT, vec BLOB)");
  q.exec("CREATE INDEX IF NOT EXISTS ix_chunk_doc ON chunk(doc)");
}

// passages of about SIZE characters, cut at paragraph or sentence ends where possible, overlapping a little
export function passages(text) {
  const t = String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(), out = [];
  for (let i = 0; i < t.length;) {
    let end = Math.min(t.length, i + SIZE);
    if (end < t.length) { const cut = Math.max(t.lastIndexOf("\n\n", end), t.lastIndexOf(". ", end)); if (cut > i + SIZE * 0.5) end = cut + 1; }
    const p = t.slice(i, end).trim(); if (p.length > 20) out.push(p);
    if (end >= t.length) break; i = Math.max(end - OVER, i + 1);
  }
  return out;
}

export const Library = {
  vecs(h) { // id → [doc, vector], kept in memory while the object lives
    if (!h._lib) { h._lib = new Map(); for (const r of h.sql().exec("SELECT id, doc, vec FROM chunk WHERE vec IS NOT NULL")) h._lib.set(r.id, [r.doc, new Float32Array(r.vec)]); }
    return h._lib;
  },
  list(h) { return h.sql().exec("SELECT id, ts, title, src, chars, chunks FROM doc ORDER BY id DESC").toArray(); },
  async add(h, b) {
    let text = String(b.text || ""), title = clip(b.title, 140), src = clip(b.url || b.src, 400) || null;
    if (!text.trim() && src && /^https?:\/\//.test(src)) { const pg = await readPage(src, MAX_DOC); text = pg.text; title = title || pg.title; src = pg.url; }
    text = text.slice(0, MAX_DOC); if (text.replace(/\s/g, "").length < 40) throw new Error("there's nothing to keep: paste the text, give a link, or pick a file");
    const ps = passages(text), q = h.sql(), have = q.exec("SELECT COUNT(*) c FROM chunk").one().c;
    if (have + ps.length > MAX_CHUNKS) throw new Error("the library is full (" + have + " of " + MAX_CHUNKS + " passages): remove something first");
    title = title || clip(text.split("\n").find((l) => l.trim().length > 3), 100) || "Untitled";
    const vecs = []; for (let i = 0; i < ps.length; i += 50) { const v = await embedTexts(h, ps.slice(i, i + 50).map((p) => title + "\n" + p)); if (!v) throw new Error("the embedding model is resting (Cloudflare's free allowance): try again later"); vecs.push(...v); }
    q.exec("INSERT INTO doc(ts, title, src, chars, chunks) VALUES(?,?,?,?,?)", Date.now(), title, src, text.length, ps.length); const id = q.exec("SELECT last_insert_rowid() AS id").one().id;
    ps.forEach((p, n) => { q.exec("INSERT INTO chunk(doc, n, text, vec) VALUES(?,?,?,?)", id, n + 1, p, vecs[n].buffer); const c = q.exec("SELECT last_insert_rowid() AS id").one().id; if (h._lib) h._lib.set(c, [id, vecs[n]]); });
    return { id, title, chunks: ps.length, chars: text.length };
  },
  remove(h, id) { const q = h.sql(); q.exec("DELETE FROM chunk WHERE doc=?", +id); q.exec("DELETE FROM doc WHERE id=?", +id); h._lib = null; },
  // the passages that match by meaning (or, with no vectors to hand, by shared words); at most two per document
  async search(h, text, k = 5, min = HIT) {
    const q = h.sql(); if (!q.exec("SELECT 1 FROM doc LIMIT 1").toArray().length) return [];
    let hits = []; const v = await queryVec(h, text).catch(() => null);
    if (v) { const nv = Math.hypot(...v); for (const [id, [doc, u]] of this.vecs(h)) { let d = 0, m = 0; for (let i = 0; i < u.length; i++) { d += u[i] * v[i]; m += u[i] * u[i]; } const s = d / (nv * Math.sqrt(m) || 1); if (s >= min) hits.push([id, doc, s]); } }
    else { const words = new Set(String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []); if (words.size < 2) return [];
      for (const r of q.exec("SELECT id, doc, text FROM chunk")) { const w = new Set(r.text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []); let c = 0; for (const x of words) if (w.has(x)) c++; if (c >= Math.max(2, Math.ceil(words.size * 0.5))) hits.push([r.id, r.doc, c / words.size]); } }
    hits.sort((a, b) => b[2] - a[2]); const per = {}, out = [];
    for (const [id, doc, s] of hits) { if ((per[doc] = (per[doc] || 0) + 1) > 2) continue; const r = q.exec("SELECT c.n, c.text, d.title, d.src, d.chunks FROM chunk c JOIN doc d ON d.id = c.doc WHERE c.id=?", id).toArray()[0]; if (r) out.push({ ...r, doc, score: Math.round(s * 100) / 100 }); if (out.length >= k) break; }
    return out;
  },
  text(hits) { return hits.map((x) => "FROM HIS LIBRARY: \"" + x.title + "\", passage " + x.n + " of " + x.chunks + (x.src ? " (" + x.src + ")" : "") + ":\n" + x.text); },
  async route(h, path, b, J) {
    if (path === "/library") return J({ docs: this.list(h), max: MAX_CHUNKS, used: h.sql().exec("SELECT COUNT(*) c FROM chunk").one().c });
    if (path === "/library/add") { try { return J(await this.add(h, b)); } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 400); } }
    if (path === "/library/remove") { this.remove(h, b.id); return J({ ok: true }); }
    if (path === "/library/search") return J({ hits: await this.search(h, String(b.q || ""), 8, 0.5) });
    return J({ error: "no such library route" }, 404);
  },
};
