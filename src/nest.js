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
//   POST /api/nest/find      (parents) products for an item now: brands, photos, prices, links (src/nest-find.js, through Hive)
//   POST /api/nest/findall   (parents) find products for every item that has none, in the background (an alarm works through
//                            the queue a few at a time; new items join it as they're added); the results ride along in /state
//   POST /api/nest/grab      (parents) { url }: a product photo the parents kept, copied into the registry's own storage
//   GET  /api/nest/export    (owner) everything in one file: the list, picks, gifts, notes, guests' names, details,
//                            thank-yous and suggestions, with the photos of the items and picks inside it
//   POST /api/nest/backup    (owner; the hourly cron) a copy of everything (photos stay in R2) saved to R2 as
//                            nest/backups/<date>.json once a day; the last 30 days are kept
import { DurableObject } from "cloudflare:workers";

const PATH = /^(items|claims|people|locks)\/[A-Za-z0-9_-]{1,64}$|^meta\/(settings|thanks)$/, BLOB_ID = /^b[a-f0-9]{20}$/;
const MAX_DOC = 64 * 1024, MAX_DOCS = 3000, MAX_PEOPLE = 400, BLOB_MAX = 3e6, IMAGE = /^image\/(jpeg|png|webp|gif)$/;
const J = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const FIND_DAY = 400, FIND_BATCH = 1, FIND_GAP = 15e3; // one item at a time, a breath apart: gentle on the free plan's limits
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
      q.exec("CREATE TABLE IF NOT EXISTS find(item TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER)");
      q.exec("CREATE TABLE IF NOT EXISTS findq(item TEXT PRIMARY KEY, at INTEGER)");
      this.ready = true;
    }
    return q;
  }
  kv(k, v) { const q = this.q(); if (v === undefined) { const r = q.exec("SELECT v FROM kv WHERE k=?", k).toArray()[0]; return r ? r.v : null; } q.exec("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, String(v)); }
  bump() { const v = (+this.kv("v") || 0) + 1; this.kv("v", v); return v; }
  doc(path) { const r = this.q().exec("SELECT data FROM doc WHERE path=?", path).toArray()[0]; return r ? JSON.parse(r.data) : null; }
  invite() { let k = this.kv("invite"); if (!k) { k = rnd(12); this.kv("invite", k); } return k; }

  // ── the product finder, in the background ──
  findable(it) { return it && it.kind !== "fund" && String(it.name || "").trim(); }
  async enqueue(ids) {
    const q = this.q(); let n = 0;
    for (const id of ids) { if (!this.findable(this.doc("items/" + id))) continue; q.exec("INSERT INTO findq(item,at) VALUES(?,?) ON CONFLICT(item) DO NOTHING", id, Date.now()); n++; }
    if (n && this.ctx.storage.setAlarm) { const a = await this.ctx.storage.getAlarm(); if (!a) await this.ctx.storage.setAlarm(Date.now() + 200); }
    return n;
  }
  findsFor() { const out = {}; for (const r of this.q().exec("SELECT item, data FROM find").toArray()) out[r.item] = JSON.parse(r.data); return out; }
  queued() { return this.q().exec("SELECT item FROM findq").toArray().map((r) => r.item); }
  used() { const u = new Set(); for (const r of this.q().exec("SELECT data FROM doc WHERE path LIKE 'items/%'").toArray()) { const it = JSON.parse(r.data); if (it.imageId) u.add(it.imageId); for (const o of it.options || []) if (o.i) u.add(o.i); } return u; }
  async findOne(id, look) {
    const it = this.doc("items/" + id); if (!this.findable(it)) return { error: "nothing to look for" };
    const day = new Date().toISOString().slice(0, 10), usedToday = this.kv("find:" + day) | 0; if (usedToday >= FIND_DAY) return { error: "that's today's " + FIND_DAY + " product searches; more tomorrow", later: true }; this.kv("find:" + day, usedToday + 1);
    const ask = { name: it.name, cat: it.cat, notes: it.notes, brand: it.brand, color: it.color, size: it.size, price: it.price, look: look != null ? look : it.look };
    let r; try { const res = await this.env.HIVE.get(this.env.HIVE.idFromName("hive")).fetch(new Request("https://mentifaber.org/api/hive/nest/find", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify(ask) })); r = await res.json(); }
    catch (e) { r = { error: "the product finder didn't answer" }; }
    const prev = this.q().exec("SELECT data FROM find WHERE item=?", id).toArray()[0];
    if (r.products) {
      const keep = r.products.map((p) => ({ t: [p.brand, p.model].filter(Boolean).join(" ") || p.title, b: p.brand, u: p.url, i: p.i || null, r: p.i ? null : p.image, p: p.price, c: p.currency, s: p.store, w: p.why, tier: p.tier, a: p.approx }));
      this.q().exec("INSERT INTO find(item,data,at) VALUES(?,?,?) ON CONFLICT(item) DO UPDATE SET data=excluded.data, at=excluded.at", id, JSON.stringify({ products: keep, at: Date.now() }), Date.now());
      if (prev && this.env.MODELS && this.env.MODELS.delete) { const used = this.used(), now = new Set(keep.map((k) => k.i)); for (const o of JSON.parse(prev.data).products || []) if (o.i && !used.has(o.i) && !now.has(o.i)) await this.env.MODELS.delete("nest/" + o.i).catch(() => {}); } // last search's photos nobody kept
    } else if (!r.later) this.q().exec("INSERT INTO find(item,data,at) VALUES(?,?,?) ON CONFLICT(item) DO UPDATE SET data=excluded.data, at=excluded.at", id, JSON.stringify({ ...(prev ? JSON.parse(prev.data) : {}), error: String(r.error || "nothing found").slice(0, 200), at: Date.now() }), Date.now());
    this.bump(); return r;
  }
  async alarm() {
    const ids = this.q().exec("SELECT item FROM findq ORDER BY at LIMIT ?", FIND_BATCH).toArray().map((r) => r.item); if (!ids.length) return;
    const rs = await Promise.all(ids.map((id) => this.findOne(id).catch((e) => ({ error: String(e.message || e) }))));
    if (rs.some((r) => r.later)) { const t = new Date(); t.setUTCHours(24, 10, 0, 0); this.kv("findpause", JSON.stringify({ until: t.getTime(), why: rs.find((r) => r.later).error })); this.bump(); await this.ctx.storage.setAlarm(t.getTime()); return; } // a daily allowance is used up: carry on after it resets (00:10 UTC)
    if (this.kv("findpause")) { this.q().exec("DELETE FROM kv WHERE k='findpause'"); }
    for (const id of ids) this.q().exec("DELETE FROM findq WHERE item=?", id);
    this.bump();
    if (this.queued().length) await this.ctx.storage.setAlarm(Date.now() + FIND_GAP);
  }

  // ── backups ──
  snapshot() {
    const docs = {}; for (const r of this.q().exec("SELECT path, data FROM doc").toArray()) if (!r.path.startsWith("locks/")) docs[r.path] = JSON.parse(r.data);
    const people = {}; for (const r of this.q().exec("SELECT id, name, at FROM person").toArray()) people[r.id] = { name: r.name, joined: r.at };
    return { kind: "the-nest-registry-backup", version: 1, saved: new Date().toISOString(), docs, people, finds: this.findsFor() };
  }
  async backup() {
    if (!this.env.MODELS) return { error: "storage isn't set up" };
    const day = new Date().toISOString().slice(0, 10), key = "nest/backups/" + day + ".json";
    if (this.kv("backup") === day) return { ok: true, key, already: true };
    await this.env.MODELS.put(key, JSON.stringify(this.snapshot()), { httpMetadata: { contentType: "application/json" } }); this.kv("backup", day);
    if (this.env.MODELS.list && this.env.MODELS.delete) { const old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), l = await this.env.MODELS.list({ prefix: "nest/backups/" }).catch(() => ({ objects: [] }));
      for (const o of l.objects || []) if (o.key.slice(13, 23) < old) await this.env.MODELS.delete(o.key).catch(() => {}); }
    return { ok: true, key };
  }
  async photos(snap) { // the photos of the items and the parents' picks, inside the file (suggestions not kept are left out)
    const ids = new Set(); for (const [p, d] of Object.entries(snap.docs)) if (p.startsWith("items/")) { if (d.imageId) ids.add(d.imageId); for (const o of d.options || []) if (o.i) ids.add(o.i); }
    const out = {}; if (!this.env.MODELS) return out;
    for (const id of ids) { if (!BLOB_ID.test(id)) continue; const o = await this.env.MODELS.get("nest/" + id).catch(() => null); if (!o) continue;
      const b = new Uint8Array(await new Response(o.body).arrayBuffer()); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      out[id] = "data:" + ((o.httpMetadata && o.httpMetadata.contentType) || "image/jpeg") + ";base64," + btoa(bin); }
    return out;
  }

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
      const role = this.parent(me) ? "p" : "g", hit = this.cache && this.cache.v === v && this.cache[role];
      if (hit) return new Response(hit.replace('"__ME__"', JSON.stringify({ id: me.id, name: me.name, owner: me.owner, parent: role === "p" })), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      const docs = {}; for (const r of this.q().exec("SELECT path, data FROM doc").toArray()) if (!r.path.startsWith("locks/")) docs[r.path] = JSON.parse(r.data);
      const profiles = {}; for (const r of this.q().exec("SELECT id, name FROM person").toArray()) profiles[r.id] = { name: r.name };
      const parent = this.parent(me);
      if (parent && !this.kv("seeded") && this.env.HIVE) { this.kv("seeded", 1); const have = new Set(Object.keys(this.findsFor())); await this.enqueue(Object.keys(docs).filter((p) => p.startsWith("items/")).map((p) => p.slice(6)).filter((id) => !have.has(id) && !(docs["items/" + id].options || []).length)); }
      if (parent && me.owner) this.invite();
      const body = JSON.stringify({ v, me: "__ME__", docs, profiles, finds: parent ? this.findsFor() : undefined, findq: parent ? this.queued() : undefined, findpause: parent && this.kv("findpause") ? JSON.parse(this.kv("findpause")) : undefined, backup: parent ? this.kv("backup") || "" : undefined, invite: parent ? this.kv("invite") : undefined });
      const v2 = this.kv("v") || "0"; if (v2 === v) { if (!this.cache || this.cache.v !== v) this.cache = { v }; this.cache[parent ? "p" : "g"] = body; } // nothing changed while it was built: keep it for the next asker
      return new Response(body.replace('"__ME__"', JSON.stringify({ id: me.id, name: me.name, owner: me.owner, parent })), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
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
      const isNew = !this.doc(p);
      this.q().exec("INSERT INTO doc(path,data,at) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, at=excluded.at", p, text, Date.now());
      if (isNew && p.startsWith("items/") && this.env.HIVE && this.findable(data) && !(data.options || []).length) await this.enqueue([p.slice(6)]); // a new item: products are found for it in the background
      return J({ ok: true, v: this.bump() });
    }
    if (path === "/lock" && post) {
      const p = String(body.path || ""); if (!/^locks\/[A-Za-z0-9_-]{1,64}$/.test(p)) return J({ error: "not a lock" }, 400);
      const now = Date.now(), ttl = Math.max(500, Math.min(15000, +body.ttlMs || 6000)), cur = this.q().exec("SELECT holder, until FROM lock WHERE path=?", p).toArray()[0];
      if (cur && cur.until > now && cur.holder !== me.id) return J({ acquired: false });
      this.q().exec("INSERT INTO lock(path,holder,until) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET holder=excluded.holder, until=excluded.until", p, me.id, now + ttl);
      return J({ acquired: true, until: now + ttl });
    }
    if (path === "/export" && !post) {
      if (!me.owner) return J({ error: "only the owner downloads the backup" }, 403);
      const snap = this.snapshot(); snap.photos = await this.photos(snap);
      return new Response(JSON.stringify(snap), { headers: { "content-type": "application/json", "cache-control": "no-store", "content-disposition": 'attachment; filename="nest-registry-backup-' + snap.saved.slice(0, 10) + '.json"' } });
    }
    if (path === "/backup" && post) { if (!me.owner) return J({ error: "owner only" }, 403); const r = await this.backup(); this.bump(); return J(r, r.error ? 503 : 200); }
    if (path === "/invite" && post) { if (!me.owner) return J({ error: "only the owner makes a new invite link" }, 403); const k = rnd(12); this.kv("invite", k); this.bump(); return J({ ok: true, invite: k }); }
    if (path === "/blob" && post) {
      if (!this.parent(me)) return J({ error: "only the parents add photos" }, 403); if (!this.env.MODELS) return J({ error: "photo storage isn't set up" }, 503);
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!IMAGE.test(type)) return J({ error: "a JPEG, PNG, WebP or GIF, please" }, 415);
      const buf = await req.arrayBuffer(); if (!buf.byteLength) return J({ error: "that file is empty" }, 400); if (buf.byteLength > BLOB_MAX) return J({ error: "that photo is too big (3 MB at most)" }, 413);
      const id = "b" + rnd(10); await this.env.MODELS.put("nest/" + id, buf, { httpMetadata: { contentType: type } }); return J({ id });
    }
    if (path === "/find" && post) {
      if (!this.parent(me)) return J({ error: "only the parents look for products" }, 403); if (!this.env.HIVE) return J({ error: "the product finder isn't set up" }, 503);
      const id = String(body.item || ""); if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !this.findable(this.doc("items/" + id))) return J({ error: "no such item" }, 404);
      const r = await this.findOne(id, body.look != null ? String(body.look).slice(0, 200) : undefined); this.q().exec("DELETE FROM findq WHERE item=?", id);
      return J(r.products ? { ok: true, find: this.findsFor()[id] } : { error: r.error }, r.products ? 200 : r.later ? 429 : 502);
    }
    if (path === "/findall" && post) {
      if (!this.parent(me)) return J({ error: "only the parents look for products" }, 403); if (!this.env.HIVE) return J({ error: "the product finder isn't set up" }, 503);
      const f = this.findsFor(), ids = this.q().exec("SELECT path, data FROM doc WHERE path LIKE 'items/%'").toArray().filter((r) => !(JSON.parse(r.data).options || []).length && (!f[r.path.slice(6)] || !(f[r.path.slice(6)].products || []).length)).map((r) => r.path.slice(6));
      const n = await this.enqueue(ids); this.bump(); return J({ ok: true, queued: n });
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
