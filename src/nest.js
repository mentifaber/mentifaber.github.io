// The Nest Registry (nest.html): the baby gift registry, on mentifaber.org. One Durable Object holds it: documents by path
// (items/*, claims/*, people/*, meta/settings, meta/thanks), the people who have joined, short locks, and the invite key.
// Who is asking: the owner is the Vigil session (the Worker sets x-nest-owner); a guest joined with the invite link and
// holds a cookie (an id and a secret; only the secret's hash is kept). Nothing loads for anyone else. The rules:
//   items/*, meta/*          the owner and co-parents (settings.parents; only the owner changes who those are)
//   claims/{id}, people/{id} that person (the owner may change any)
//   locks/{itemId}           anyone in the registry, for a few seconds, so two people can't take the last one at once
//   photos                   the owner and co-parents upload; anyone in the registry sees them (R2: nest/<id>)
//   GET  /api/nest/state?v=  everything, or { same: true } when nothing changed since version v
//   POST /api/nest/join      { key, name }: a guest joins with the invite key (the owner just gives a name)
//   POST /api/nest/doc       { path, data } writes a document; data: null deletes it
//   POST /api/nest/lock      { path, ttlMs } → { acquired }
//   POST /api/nest/invite    (owner) a new invite key; the old link stops letting new people in
//   POST /api/nest/blob      an image (JPEG, PNG, WebP or GIF, 3 MB) → { id };  GET /api/nest/blob/<id>
//   POST /api/nest/find      (parents) products for an item: brands, photos, prices, links (src/nest-find.js, through Hive)
//   POST /api/nest/grab      (parents) { url }: a product photo the parents kept, copied into the registry's own storage
import { DurableObject } from "cloudflare:workers";

const PATH = /^(items|claims|people|locks)\/[A-Za-z0-9_-]{1,64}$|^meta\/(settings|thanks)$/, BLOB_ID = /^b[a-f0-9]{20}$/;
const MAX_DOC = 64 * 1024, MAX_DOCS = 3000, MAX_PEOPLE = 400, BLOB_MAX = 3e6, IMAGE = /^image\/(jpeg|png|webp|gif)$/;
const J = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const FIND_DAY = 120;
const privateHost = (h) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(h) || !/\./.test(h);
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

export class Nest extends DurableObject {
  q() {
    const q = this.ctx.storage.sql;
    if (!this.ready) {
      q.exec("CREATE TABLE IF NOT EXISTS doc(path TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS person(id TEXT PRIMARY KEY, name TEXT, sec TEXT, at INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS lock(path TEXT PRIMARY KEY, holder TEXT, until INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT)");
      this.ready = true;
    }
    return q;
  }
  kv(k, v) { const q = this.q(); if (v === undefined) { const r = q.exec("SELECT v FROM kv WHERE k=?", k).toArray()[0]; return r ? r.v : null; } q.exec("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, String(v)); }
  bump() { const v = (+this.kv("v") || 0) + 1; this.kv("v", v); return v; }
  doc(path) { const r = this.q().exec("SELECT data FROM doc WHERE path=?", path).toArray()[0]; return r ? JSON.parse(r.data) : null; }
  invite() { let k = this.kv("invite"); if (!k) { k = rnd(12); this.kv("invite", k); } return k; }

  async who(req) {
    if (req.headers.get("x-nest-owner") === "1") { const p = this.q().exec("SELECT name FROM person WHERE id='owner'").toArray()[0]; return { id: "owner", name: (p && p.name) || "", owner: true }; }
    const m = /(?:^|;\s*)nest=([a-z0-9]{1,20})\.([a-f0-9]{48})(?:;|$)/.exec(req.headers.get("cookie") || ""); if (!m) return null;
    const p = this.q().exec("SELECT id, name, sec FROM person WHERE id=?", m[1]).toArray()[0];
    return p && same(p.sec, await sha(m[2])) ? { id: p.id, name: p.name, owner: false } : null;
  }
  parent(me) { const s = this.doc("meta/settings") || {}; return !!(me && (me.owner || (Array.isArray(s.parents) && s.parents.includes(me.id)))); }
  mayWrite(me, path) {
    const [col, id] = path.split("/");
    if (col === "items" || col === "meta") return this.parent(me);
    if (col === "claims" || col === "people") return me.owner || id === me.id;
    return false; // locks go through /lock
  }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api\/nest/, "") || "/", post = req.method === "POST";
    const body = post && !/^\/blob/.test(path) ? await req.json().catch(() => ({})) : {};
    if (path === "/join" && post) {
      const name = cleanName(body.name); if (!name) return J({ error: "say your name, so the parents know who's giving what" }, 400);
      if (req.headers.get("x-nest-owner") === "1") { this.q().exec("INSERT INTO person(id,name,sec,at) VALUES('owner',?,'',?) ON CONFLICT(id) DO UPDATE SET name=excluded.name", name, Date.now()); this.invite(); this.bump(); return J({ ok: true, id: "owner" }); }
      const key = this.kv("invite"); if (!key || !same(body.key, key)) return J({ error: "that invite link isn't valid any more: ask the parents for the current one" }, 403);
      if ((this.q().exec("SELECT COUNT(*) AS n FROM person").toArray()[0] || {}).n >= MAX_PEOPLE) return J({ error: "the registry is full of guests already" }, 429);
      const id = "g" + rnd(8), tok = rnd(24);
      this.q().exec("INSERT INTO person(id,name,sec,at) VALUES(?,?,?,?)", id, name, await sha(tok), Date.now()); this.bump();
      return J({ ok: true, id }, 200, { "set-cookie": "nest=" + id + "." + tok + "; Path=/api/nest; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax" });
    }
    const me = await this.who(req);
    if (!me) return J({ error: "this registry is private: open the invite link the parents sent you", need: "invite" }, 401);
    if (path === "/state" && !post) {
      const v = this.kv("v") || "0"; if (url.searchParams.get("v") === v) return J({ v, same: true });
      const docs = {}; for (const r of this.q().exec("SELECT path, data FROM doc").toArray()) if (!r.path.startsWith("locks/")) docs[r.path] = JSON.parse(r.data);
      const profiles = {}; for (const r of this.q().exec("SELECT id, name FROM person").toArray()) profiles[r.id] = { name: r.name };
      const parent = this.parent(me);
      return J({ v, me: { id: me.id, name: me.name, owner: me.owner, parent }, docs, profiles, invite: parent ? (me.owner ? this.invite() : this.kv("invite")) : undefined });
    }
    if (path === "/doc" && post) {
      const p = String(body.path || ""); if (!PATH.test(p) || p.startsWith("locks/")) return J({ error: "not a registry document" }, 400);
      if (!this.mayWrite(me, p)) return J({ error: "you can't change that" }, 403);
      if (body.data === null) { this.q().exec("DELETE FROM doc WHERE path=?", p); return J({ ok: true, v: this.bump() }); }
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return J({ error: "a document is an object" }, 400);
      let data = body.data;
      if (p === "meta/settings" && !me.owner) { const cur = this.doc(p) || {}; data = { ...data, parents: cur.parents || [] }; } // co-parents can't change who the parents are
      const text = JSON.stringify(data); if (text.length > MAX_DOC) return J({ error: "that's too much for one entry" }, 413);
      if (!this.doc(p) && (this.q().exec("SELECT COUNT(*) AS n FROM doc").toArray()[0] || {}).n >= MAX_DOCS) return J({ error: "the registry is full" }, 413);
      this.q().exec("INSERT INTO doc(path,data,at) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, at=excluded.at", p, text, Date.now());
      return J({ ok: true, v: this.bump() });
    }
    if (path === "/lock" && post) {
      const p = String(body.path || ""); if (!/^locks\/[A-Za-z0-9_-]{1,64}$/.test(p)) return J({ error: "not a lock" }, 400);
      const now = Date.now(), ttl = Math.max(500, Math.min(15000, +body.ttlMs || 6000)), cur = this.q().exec("SELECT holder, until FROM lock WHERE path=?", p).toArray()[0];
      if (cur && cur.until > now && cur.holder !== me.id) return J({ acquired: false });
      this.q().exec("INSERT INTO lock(path,holder,until) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET holder=excluded.holder, until=excluded.until", p, me.id, now + ttl);
      return J({ acquired: true, until: now + ttl });
    }
    if (path === "/invite" && post) { if (!me.owner) return J({ error: "only the owner makes a new invite link" }, 403); const k = rnd(12); this.kv("invite", k); this.bump(); return J({ ok: true, invite: k }); }
    if (path === "/blob" && post) {
      if (!this.parent(me)) return J({ error: "only the parents add photos" }, 403); if (!this.env.MODELS) return J({ error: "photo storage isn't set up" }, 503);
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!IMAGE.test(type)) return J({ error: "a JPEG, PNG, WebP or GIF, please" }, 415);
      const buf = await req.arrayBuffer(); if (!buf.byteLength) return J({ error: "that file is empty" }, 400); if (buf.byteLength > BLOB_MAX) return J({ error: "that photo is too big (3 MB at most)" }, 413);
      const id = "b" + rnd(10); await this.env.MODELS.put("nest/" + id, buf, { httpMetadata: { contentType: type } }); return J({ id });
    }
    if (path === "/find" && post) {
      if (!this.parent(me)) return J({ error: "only the parents look for products" }, 403); if (!this.env.HIVE) return J({ error: "the product finder isn't set up" }, 503);
      const day = new Date().toISOString().slice(0, 10), used = this.kv("find:" + day) | 0; if (used >= FIND_DAY) return J({ error: "that's today's " + FIND_DAY + " product searches; more tomorrow" }, 429); this.kv("find:" + day, used + 1);
      const ask = { name: body.name, cat: body.cat, notes: body.notes, brand: body.brand, color: body.color, size: body.size, price: body.price, look: body.look };
      const r = await this.env.HIVE.get(this.env.HIVE.idFromName("hive")).fetch(new Request("https://mentifaber.org/api/hive/nest/find", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify(ask) }));
      return J(await r.json().catch(() => ({ error: "the product finder didn't answer" })), r.ok ? 200 : 502);
    }
    if (path === "/grab" && post) {
      if (!this.parent(me)) return J({ error: "only the parents keep products" }, 403); if (!this.env.MODELS) return J({ error: "photo storage isn't set up" }, 503);
      let u; try { u = new URL(String(body.url || "")); } catch (e) { return J({ error: "not a photo address" }, 400); }
      if (u.protocol !== "https:" || privateHost(u.hostname)) return J({ error: "not a public photo" }, 400);
      const r = await fetch(u.href, { headers: { accept: "image/*", "user-agent": "Mozilla/5.0 (compatible; MentifaberNest/1)" }, redirect: "follow", signal: AbortSignal.timeout(10000) }).catch(() => null);
      const type = r && (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!r || !r.ok || !IMAGE.test(type || "")) return J({ error: "couldn't fetch that photo" }, 502);
      const buf = await r.arrayBuffer(); if (!buf.byteLength || buf.byteLength > BLOB_MAX) return J({ error: "that photo is too big" }, 413);
      const id = "b" + rnd(10); await this.env.MODELS.put("nest/" + id, buf, { httpMetadata: { contentType: type } }); return J({ id });
    }
    const bm = /^\/blob\/([a-z0-9]+)$/.exec(path);
    if (bm && !post) {
      if (!BLOB_ID.test(bm[1]) || !this.env.MODELS) return J({ error: "no such photo" }, 404);
      const o = await this.env.MODELS.get("nest/" + bm[1]); if (!o) return J({ error: "no such photo" }, 404);
      const type = (o.httpMetadata && o.httpMetadata.contentType) || "image/jpeg";
      return new Response(o.body, { headers: { "content-type": IMAGE.test(type) ? type : "application/octet-stream", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
    }
    return J({ error: "not found" }, 404);
  }
}
