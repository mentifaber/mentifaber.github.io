// The Nest Registry (nest.html): the baby gift registry, on mentifaber.org. One Durable Object holds it: documents by path
// (items/*, claims/*, people/*, meta/settings, meta/thanks), the people who have joined, short locks, and the invite key.
// Who is asking: the owner is the Vigil session (the Worker sets x-nest-owner); a guest joined with the invite link and
// holds a cookie (an id and a secret; only the secret's hash is kept). Nothing loads for anyone else. The rules:
//   items/*, meta/*          the owner and co-parents (settings.parents; only the owner changes who those are)
//   claims/{id}, people/{id} that person (the owner may change any)
//   locks/{itemId}           anyone in the registry, for a few seconds, so two people can't take the last one at once
//   photos                   the owner and co-parents upload; anyone in the registry sees them. Kept in R2 (nest/<id>)
//                            when the Worker has R2, otherwise in this object's own SQLite (Cloudflare's free plan with
//                            R2 off); a photo is read from whichever holds it
//   GET  /api/nest/state?v=  everything, or { same: true } when nothing changed since version v
//   POST /api/nest/join      { key, name }: a guest joins with the invite key (the owner just gives a name)
//   POST /api/nest/doc       { path, data } writes a document; data: null deletes it
//   POST /api/nest/lock      { path, ttlMs } → { acquired }
//   POST /api/nest/invite    (owner) a new invite key; the old link stops letting new people in. { which: "parent" }: a new
//                            co-parent key instead (the co-parent link: whoever opens it is a co-parent on that device)
//   POST /api/nest/upgrade   { key }: someone already in opens the co-parent link and becomes a co-parent
//   POST /api/nest/blob      an image (JPEG, PNG, WebP or GIF, 3 MB) → { id };  GET /api/nest/blob/<id>
//   POST /api/nest/find      (parents) products for an item now: brands, photos, prices, links (src/nest-find.js, through Hive)
//   POST /api/nest/findall   (parents) find products for every item that has none, in the background (an alarm works through
//                            the queue a few at a time; new items join it as they're added); the results ride along in /state
//   POST /api/nest/grab      (parents) { url }: a product photo the parents kept, copied into the registry's own storage
//   POST /api/nest/read      (parents) { id }: a photo or screenshot they just added, read by a vision model → the name,
//                            brand, price, shop and category to fill in, so adding a thing is: take a screenshot, tap Add
//   POST /api/nest/fromlink  (parents) { url }: a product link → its name, price and photo (the photo kept here)
//   (in the background, once) photos lost when R2 was switched off: cleared from the items, and each pick's photo fetched
//                            again from its shop
//   GET  /api/nest/export    (owner) everything in one file: the list, picks, gifts, notes, guests' names, details,
//                            thank-yous and suggestions, with the photos of the items and picks inside it
//   POST /api/nest/backup    (owner; the hourly cron) a copy of everything (photos stay where they are) once a day: to R2 as
//                            nest/backups/<date>.json (30 days kept), or without R2 into this object (14 days kept)
import { DurableObject } from "cloudflare:workers";
import { pageProduct, quota, checkPhoto } from "./nest-find.js";

const PATH = /^(items|claims|people|locks)\/[A-Za-z0-9_-]{1,64}$|^meta\/(settings|thanks)$/, BLOB_ID = /^b[a-f0-9]{20}$/;
const MAX_DOC = 64 * 1024, MAX_DOCS = 3000, MAX_PEOPLE = 400, BLOB_MAX = 3e6, IMAGE = /^image\/(jpeg|png|webp|gif)$/;
const J = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const MIGRATE_V = "boy-millie-1";
const PHOTO_DB_MAX = 1.9e6, REPAIR_V = "2", REPAIR_TICK = 5, PHOTO_SEARCH_DAY = 300, READ_WAIT = 20e3;
const CAT_KEYS = ["nursery", "sleep", "feeding", "diaper", "bath", "clothes", "gear", "play", "health", "mom", "books", "other"];
const READ_ASK = 'This is a photo or a screenshot of something a family wants on their baby registry, often a shop\'s product page. Reply with JSON only, no other words: {"name": "what it is, as a guest would search for it: brand and model if you can see them, under 80 characters", "brand": "brand or empty", "price": a number or null, "currency": "3-letter code or empty", "store": "the shop if you can see it, or empty", "category": one of "' + CAT_KEYS.join('", "') + '"}';
const READ_MODELS = ["@cf/meta/llama-3.2-11b-vision-instruct", "@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/llava-hf/llava-1.5-7b-hf"];
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const textOf = (r) => (r && typeof r.response === "object" && r.response ? JSON.stringify(r.response) : String((r && (r.response ?? r.description ?? (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content))) || ""));
const shopOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
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
      q.exec("CREATE TABLE IF NOT EXISTS photo(id TEXT PRIMARY KEY, type TEXT, data BLOB, at INTEGER)"); // photos, when there's no R2
      q.exec("CREATE TABLE IF NOT EXISTS backup(day TEXT PRIMARY KEY, data TEXT)"); // daily copies, when there's no R2
      this.ready = true;
    }
    return q;
  }
  kv(k, v) { const q = this.q(); if (v === undefined) { const r = q.exec("SELECT v FROM kv WHERE k=?", k).toArray()[0]; return r ? r.v : null; } q.exec("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, String(v)); }
  bump() { const v = (+this.kv("v") || 0) + 1; this.kv("v", v); return v; }
  doc(path) { const r = this.q().exec("SELECT data FROM doc WHERE path=?", path).toArray()[0]; return r ? JSON.parse(r.data) : null; }
  invite() { let k = this.kv("invite"); if (!k) { k = rnd(12); this.kv("invite", k); } return k; }
  pinvite() { let k = this.kv("pinvite"); if (!k) { k = rnd(12); this.kv("pinvite", k); } return k; }
  makeParent(id) { const s = this.doc("meta/settings") || {}, ps = Array.isArray(s.parents) ? s.parents : []; if (ps.includes(id)) return;
    this.q().exec("INSERT INTO doc(path,data,at) VALUES('meta/settings',?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, at=excluded.at", JSON.stringify({ ...s, parents: [...ps, id], updatedAt: Date.now() }), Date.now()); }

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
  used() { const u = new Set(); for (const r of this.q().exec("SELECT data FROM doc WHERE path LIKE 'items/%'").toArray()) { const it = JSON.parse(r.data); if (it.imageId) u.add(it.imageId); if (it.imageAuto) u.add(it.imageAuto); for (const o of it.options || []) if (o.i) u.add(o.i); } return u; }
  async findOne(id, look) {
    const it = this.doc("items/" + id); if (!this.findable(it)) return { error: "nothing to look for" };
    const day = new Date().toISOString().slice(0, 10), usedToday = this.kv("find:" + day) | 0; if (usedToday >= FIND_DAY) return { error: "that's today's " + FIND_DAY + " product searches; more tomorrow", later: true }; this.kv("find:" + day, usedToday + 1);
    const ask = { for: (this.doc("meta/settings") || {}).sex || "", name: it.name, cat: it.cat, notes: it.notes, brand: it.brand, color: it.color, size: it.size, price: it.price, look: look != null ? look : it.look };
    let r; try { const res = await this.env.HIVE.get(this.env.HIVE.idFromName("hive")).fetch(new Request("https://mentifaber.org/api/hive/nest/find", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify(ask) })); r = await res.json(); }
    catch (e) { r = { error: "the product finder didn't answer" }; }
    const prev = this.q().exec("SELECT data FROM find WHERE item=?", id).toArray()[0];
    if (r.products) {
      await Promise.all(r.products.map(async (p) => { if (!p.i && p.image) p.i = await this.fetchPhoto(p.image); })); // the Hive had no R2 to keep them in: the registry keeps them
      const keep = r.products.map((p) => ({ t: [p.brand, p.model].filter(Boolean).join(" ") || p.title, b: p.brand, u: p.url, i: p.i || null, r: p.image || null, p: p.price, c: p.currency, s: p.store, w: p.why, tier: p.tier, a: p.approx }));
      this.q().exec("INSERT INTO find(item,data,at) VALUES(?,?,?) ON CONFLICT(item) DO UPDATE SET data=excluded.data, at=excluded.at", id, JSON.stringify({ products: keep, at: Date.now() }), Date.now());
      if (prev) { const used = this.used(), now = new Set(keep.map((k) => k.i)); for (const o of JSON.parse(prev.data).products || []) if (o.i && !used.has(o.i) && !now.has(o.i)) await this.dropPhoto(o.i); } // last search's photos nobody kept
    } else if (!r.later) this.q().exec("INSERT INTO find(item,data,at) VALUES(?,?,?) ON CONFLICT(item) DO UPDATE SET data=excluded.data, at=excluded.at", id, JSON.stringify({ ...(prev ? JSON.parse(prev.data) : {}), error: String(r.error || "nothing found").slice(0, 200), at: Date.now() }), Date.now());
    this.bump(); return r;
  }
  // every photo on the registry, mended in the background: a missing or not-the-product photo is replaced, from the shop's
  // photo address, its product page, or an image search; a card with no photo and no picks gets a photo of the thing
  // itself (imageAuto); the finder's suggestions get theirs from their product pages. Several at once, each tick.
  // "Refresh all photos" starts a new round (the round is part of the mark each photo is checked against).
  mark() { return REPAIR_V + "." + (this.kv("photoRound") || "0"); }
  async pickPhoto(o) {
    let id = o.r ? await this.fetchPhoto(o.r, true) : null; if (id) return { id, r: o.r };
    if (o.u) { const ph = await this.pagePhoto(await this.readPage(o.u)); if (ph) return ph; }
    return this.searchPhoto([o.b && !String(o.t || "").toLowerCase().includes(String(o.b).toLowerCase()) ? o.b : "", o.t].filter(Boolean).join(" "));
  }
  async itemPhoto(it, id) { // a suggestion's photo the finder already has, else an image search for the thing
    const f = this.q().exec("SELECT data FROM find WHERE item=?", id).toArray()[0];
    for (const p of f ? JSON.parse(f.data).products || [] : []) if (p.i && (await this.hasPhoto(p.i)) && (await this.storedShaped(p.i))) return { id: p.i };
    const sex = (this.doc("meta/settings") || {}).sex;
    return this.searchPhoto([it.brand, it.name, "baby"].filter(Boolean).join(" ") + (sex && ["clothes", "sleep", "nursery", "bath", "play"].includes(it.cat) ? " " + sex : ""));
  }
  photosLeft() { // how many photos the mending still has to try this round
    const mark = this.mark(); let n = 0;
    for (const r of this.q().exec("SELECT data FROM doc WHERE path LIKE 'items/%'").toArray()) { const it = JSON.parse(r.data);
      for (const o of it.options || []) if (o.x !== mark) n++;
      if (it.kind !== "fund" && !it.imageId && !(it.options || []).length && it.autoX !== mark) n++; }
    return n;
  }
  async repair() {
    const mark = this.mark(), jobs = [], plans = []; let more = false;
    for (const row of this.q().exec("SELECT path, data FROM doc WHERE path LIKE 'items/%'").toArray()) {
      const it = JSON.parse(row.data), id = row.path.slice(6), plan = { path: row.path, set: {}, opts: new Map() };
      if (it.imageId && !(await this.hasPhoto(it.imageId))) { plan.set.imageOld = it.imageId; plan.set.imageId = null; }
      for (const o of it.options || []) {
        if (o.x === mark) continue; const key = o.u || o.t;
        if (o.i && (await this.hasPhoto(o.i)) && (await this.storedShaped(o.i))) { plan.opts.set(key, { x: mark }); continue; } // it's the product: checked
        if (o.i) { await this.dropPhoto(o.i); plan.opts.set(key, { i: null }); } // gone, or a shop's logo or banner
        if (jobs.length >= REPAIR_TICK) { more = true; continue; }
        jobs.push(this.pickPhoto(o).catch(() => null).then((ph) => plan.opts.set(key, ph ? { i: ph.id, r: ph.r || o.r || null, x: mark } : { i: null, x: mark })));
      }
      const bare = it.kind !== "fund" && !(it.imageId && !plan.set.imageOld) && !(it.options || []).length;
      if (it.imageAuto && (!bare || !(await this.hasPhoto(it.imageAuto)))) plan.set.imageAuto = null; // picks or their own photo now show instead
      else if (bare && !it.imageAuto && it.autoX !== mark) {
        if (jobs.length >= REPAIR_TICK) more = true;
        else jobs.push(this.itemPhoto(it, id).catch(() => null).then((ph) => { plan.set.imageAuto = ph ? ph.id : null; plan.set.autoX = mark; }));
      }
      plans.push(plan);
    }
    await Promise.all(jobs);
    for (const plan of plans) {
      if (!Object.keys(plan.set).length && !plan.opts.size) continue;
      const cur = this.doc(plan.path); if (!cur) continue; // written against the latest copy, so a parent's edit meanwhile isn't lost
      const next = { ...cur, ...plan.set, options: (cur.options || []).map((o) => { const f = plan.opts.get(o.u || o.t); return f ? { ...o, ...f } : o; }) };
      if ("imageOld" in plan.set && cur.imageId !== plan.set.imageOld) { next.imageId = cur.imageId; delete next.imageOld; } // changed meanwhile: theirs stands
      if (!(cur.options || []).length) delete next.options;
      if (JSON.stringify(next) !== JSON.stringify(cur)) { this.q().exec("UPDATE doc SET data=?, at=? WHERE path=?", JSON.stringify(next), Date.now(), plan.path); this.bump(); }
    }
    if (more) return true;
    // the finder's suggestions: a missing photo is cleared, then fetched again from the product page (no searches)
    let pages = Math.max(0, REPAIR_TICK - jobs.length) * 2; // page reads are cheaper than searches
    for (const r of this.q().exec("SELECT item, data FROM find").toArray()) {
      const f = JSON.parse(r.data); let changed = false; const work = [];
      for (const p of f.products || []) {
        if (p.x === mark) continue;
        if (p.i && (await this.hasPhoto(p.i))) { p.x = mark; changed = true; continue; }
        if (p.i) { p.i = null; changed = true; }
        if (pages <= 0) { more = true; continue; } pages--;
        work.push((async () => { let id = p.r ? await this.fetchPhoto(p.r, true) : null; if (!id && p.u) { const ph = await this.pagePhoto(await this.readPage(p.u).catch(() => null)); if (ph) { id = ph.id; p.r = ph.r; } } p.i = id || null; p.x = mark; })().catch(() => { p.x = mark; }));
        changed = true;
      }
      await Promise.all(work);
      if (changed) { this.q().exec("UPDATE find SET data=? WHERE item=?", JSON.stringify(f), r.item); this.bump(); }
      if (pages <= 0 && more) return true;
    }
    return more;
  }
  async alarm() { // products for queued items first, one at a time; then a few mended photos; so a new item never waits
    let next = null; const pause = this.kv("findpause") ? JSON.parse(this.kv("findpause")) : null;
    if (this.queued().length) next = pause && pause.until > Date.now() ? pause.until : await this.findTick();
    if (this.kv("migrate") !== MIGRATE_V) await this.migrate().catch((e) => console.warn("migrate", e));
    if (this.kv("repair") !== this.mark()) { const more = await this.repair().catch((e) => { console.warn("repair", e); return false; }); if (!more) this.kv("repair", this.mark()); else next = Math.min(next || Infinity, Date.now() + 1000); }
    if (this.queued().length && !next) next = Date.now() + FIND_GAP;
    if (next) await this.ctx.storage.setAlarm(next);
  }
  async findTick() { // → when to come back
    const ids = this.q().exec("SELECT item FROM findq ORDER BY at LIMIT ?", FIND_BATCH).toArray().map((r) => r.item); if (!ids.length) return null;
    const rs = await Promise.all(ids.map((id) => this.findOne(id).catch((e) => ({ error: String(e.message || e) }))));
    if (rs.some((r) => r.later)) { const t = new Date(); t.setUTCHours(24, 10, 0, 0); this.kv("findpause", JSON.stringify({ until: t.getTime(), why: rs.find((r) => r.later).error })); this.bump(); return t.getTime(); } // a daily allowance is used up: carry on after it resets (00:10 UTC)
    if (this.kv("findpause")) this.q().exec("DELETE FROM kv WHERE k='findpause'");
    for (const id of ids) this.q().exec("DELETE FROM findq WHERE item=?", id);
    this.bump(); return this.queued().length ? Date.now() + FIND_GAP : null;
  }
  // one-time changes to the registry's contents, asked for by the parents
  async migrate() {
    if (!this.q().exec("SELECT 1 AS y FROM doc WHERE path LIKE 'items/%' LIMIT 1").toArray().length) { this.kv("migrate", MIGRATE_V); return; } // a new, empty registry: nothing to change
    const s = this.doc("meta/settings") || {}; const put = (p, d) => { this.q().exec("INSERT INTO doc(path,data,at) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, at=excluded.at", p, JSON.stringify(d), Date.now()); };
    if (!s.sex) put("meta/settings", { ...s, sex: "boy" }); // it's a boy
    const items = this.q().exec("SELECT path, data FROM doc WHERE path LIKE 'items/%'").toArray().map((r) => ({ path: r.path, ...JSON.parse(r.data) }));
    const nb = items.find((x) => x.kind !== "fund" && /diaper/i.test(x.name || "") && /newborn|\bnb\b/i.test(x.name || ""));
    const mm = { t: "Millie Moon Luxury Diapers, Newborn", b: "Millie Moon", u: "https://www.babylist.com/gp/millie-moon-luxury-diapers/87471", p: 39.99, c: "USD", s: "babylist.com", w: "Soft, ultra-absorbent, up to 12 hours of leak protection", i: null, r: null };
    if (nb) { const { path, ...it } = nb; if (!(it.options || []).some((o) => /millie moon/i.test(o.t || ""))) put(path, { ...it, options: [mm, ...(it.options || [])].slice(0, 8), updatedAt: Date.now() }); }
    else put("items/i" + Date.now().toString(36) + "mm", { name: "Diapers, newborn size", kind: "item", cat: "diaper", prio: "must", qty: 4, price: 39.99, notes: "Boxes. Don't overbuy newborn size; they grow fast.", options: [mm], createdAt: Date.now(), createdBy: "owner" });
    // suggestions that weren't made for a boy: found again where colour and design matter, for items without picks yet
    const have = this.findsFor(); await this.enqueue(items.filter((x) => ["clothes", "sleep", "nursery", "bath", "play"].includes(x.cat) && !(x.options || []).length && have[x.path.slice(6)]).map((x) => x.path.slice(6)));
    this.kv("migrate", MIGRATE_V); this.bump();
  }

  // ── photos: R2 when bound, else this object's SQLite (one value there holds up to 2 MB) ──
  async putPhoto(buf, type) {
    const id = "b" + rnd(10);
    if (this.env.MODELS) await this.env.MODELS.put("nest/" + id, buf, { httpMetadata: { contentType: type } });
    else { if (buf.byteLength > PHOTO_DB_MAX) throw new Error("that photo is too big (1.9 MB at most)"); this.q().exec("INSERT INTO photo(id,type,data,at) VALUES(?,?,?,?)", id, type, new Uint8Array(buf), Date.now()); }
    return id;
  }
  async getPhoto(id) {
    const r = this.q().exec("SELECT type, data FROM photo WHERE id=?", id).toArray()[0];
    if (r) { const u = r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : new Uint8Array(r.data); return { type: r.type, body: u.slice().buffer }; }
    if (!this.env.MODELS) return null;
    const o = await this.env.MODELS.get("nest/" + id).catch(() => null);
    return o ? { type: (o.httpMetadata && o.httpMetadata.contentType) || "image/jpeg", body: await new Response(o.body).arrayBuffer() } : null;
  }
  async readShot(bytes, type) { // a vision model reads the photo; the first that answers with something usable wins
    let last = ""; const t0 = Date.now();
    for (const m of READ_MODELS) {
      const run = (inp) => this.env.AI.run(m, inp);
      const inp = /llama-3\.2/.test(m) ? { messages: [{ role: "user", content: READ_ASK }], image: [...bytes], max_tokens: 300 }
        : /llava/.test(m) ? { prompt: READ_ASK, image: [...bytes], max_tokens: 300 }
        : { messages: [{ role: "user", content: [{ type: "text", text: READ_ASK }, { type: "image_url", image_url: { url: "data:" + type + ";base64," + b64(bytes) } }] }], max_tokens: 300 };
      if (Date.now() - t0 > 2 * READ_WAIT) break;
      let out; try { out = await Promise.race([run(inp), new Promise((_, no) => setTimeout(() => no(new Error("timed out")), READ_WAIT))]); } catch (e) {
        last = String(e.message || e); if (quota(last)) return { error: "today's free AI allowance is used up: type the name in, the photo is saved", later: true };
        if (/agree|licen[cs]e|5016/i.test(last)) { try { await run({ prompt: "agree" }); out = await run(inp); } catch (e2) { last = String(e2.message || e2); continue; } } else continue; }
      const t = textOf(out), j = /\{[\s\S]*\}/.exec(t); let o = null; try { o = j && JSON.parse(j[0]); } catch (e) {}
      const name = cleanName(o && o.name).slice(0, 80); if (!name) { last = "no name in " + t.slice(0, 80); continue; }
      const price = Number(String((o.price ?? "")).replace(/[^0-9.]/g, "")); const c = String(o.category || "").toLowerCase();
      return { name, brand: cleanName(o.brand).slice(0, 80), price: price > 0 && price < 1e5 ? Math.round(price * 100) / 100 : null, currency: /^[A-Z]{3}$/.test(o.currency || "") ? o.currency : "", store: cleanName(o.store).slice(0, 40), cat: CAT_KEYS.includes(c) ? c : "" };
    }
    return { error: "couldn't read that photo: type the name in, the photo is saved", detail: last.slice(0, 160) };
  }
  async hasPhoto(id) {
    if (!id || !BLOB_ID.test(id)) return false; if (this.q().exec("SELECT 1 AS y FROM photo WHERE id=?", id).toArray().length) return true;
    if (!this.env.MODELS) return false; const o = this.env.MODELS.head ? await this.env.MODELS.head("nest/" + id).catch(() => null) : await this.env.MODELS.get("nest/" + id).catch(() => null); return !!o;
  }
  async readPage(href) { // a shop's product page → { title, price, currency, images }
    let u; try { u = new URL(String(href || "")); } catch (e) { return null; } if (u.protocol !== "https:" || privateHost(u.hostname)) return null;
    const r = await fetch(u.href, { headers: { accept: "text/html", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36" }, redirect: "follow", signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r || !r.ok || !/html/i.test(r.headers.get("content-type") || "")) return null;
    const p = pageProduct((await r.text().catch(() => "")).slice(0, 900000), r.url || u.href); p.images = [...new Set([...(p.images || []), p.og].filter(Boolean))].slice(0, 4); return p;
  }
  async pagePhoto(page) { for (const im of ((page && page.images) || []).slice(0, 2)) { const id = await this.fetchPhoto(im, true); if (id) return { id, r: im }; } return null; }
  async searchPhoto(q) { // image search through the Hive (the owner's search key), a few a day
    if (!this.env.HIVE) return null; const day = new Date().toISOString().slice(0, 10), n = this.kv("psearch:" + day) | 0; if (n >= PHOTO_SEARCH_DAY) return null; this.kv("psearch:" + day, n + 1);
    const res = await this.env.HIVE.get(this.env.HIVE.idFromName("hive")).fetch(new Request("https://mentifaber.org/api/hive/nest/photo", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify({ q }) })).catch(() => null);
    const j = res && res.ok ? await res.json().catch(() => null) : null; if (!j || !j.image) return null;
    const id = await this.fetchPhoto(j.image, true); return id ? { id, r: j.image } : null;
  }
  async storedShaped(id) { const ph = await this.getPhoto(id); return !!ph && checkPhoto("", ph.body); }
  async dropPhoto(id) { this.q().exec("DELETE FROM photo WHERE id=?", id); if (this.env.MODELS && this.env.MODELS.delete) await this.env.MODELS.delete("nest/" + id).catch(() => {}); }
  async fetchPhoto(href, check) { // a product photo from a store, checked, into the registry's storage → id, or null
    let u; try { u = new URL(String(href || "")); } catch (e) { return null; } if (u.protocol !== "https:" || privateHost(u.hostname)) return null;
    const r = await fetch(u.href, { headers: { accept: "image/*", "user-agent": "Mozilla/5.0 (compatible; MentifaberNest/1)" }, redirect: "follow", signal: AbortSignal.timeout(10000) }).catch(() => null);
    const type = r && (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!r || !r.ok || !IMAGE.test(type || "")) return null;
    const buf = await r.arrayBuffer().catch(() => null); if (!buf || !buf.byteLength || buf.byteLength > (this.env.MODELS ? BLOB_MAX : PHOTO_DB_MAX)) return null;
    if (check && !checkPhoto(u.href, buf)) return null; // a logo, an icon, a banner: not the product
    return this.putPhoto(buf, type).catch(() => null);
  }

  // ── backups ──
  snapshot() {
    const docs = {}; for (const r of this.q().exec("SELECT path, data FROM doc").toArray()) if (!r.path.startsWith("locks/")) docs[r.path] = JSON.parse(r.data);
    const people = {}; for (const r of this.q().exec("SELECT id, name, at FROM person").toArray()) people[r.id] = { name: r.name, joined: r.at };
    return { kind: "the-nest-registry-backup", version: 1, saved: new Date().toISOString(), docs, people, finds: this.findsFor() };
  }
  async backup() {
    const day = new Date().toISOString().slice(0, 10), key = this.env.MODELS ? "nest/backups/" + day + ".json" : "db:" + day;
    if (this.kv("backup") === day) return { ok: true, key, already: true };
    if (!this.env.MODELS) { // no R2: the copy stays in this object, the last 14 days
      this.q().exec("INSERT INTO backup(day,data) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET data=excluded.data", day, JSON.stringify(this.snapshot())); this.kv("backup", day);
      this.q().exec("DELETE FROM backup WHERE day < ?", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)); return { ok: true, key };
    }
    await this.env.MODELS.put(key, JSON.stringify(this.snapshot()), { httpMetadata: { contentType: "application/json" } }); this.kv("backup", day);
    if (this.env.MODELS.list && this.env.MODELS.delete) { const old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), l = await this.env.MODELS.list({ prefix: "nest/backups/" }).catch(() => ({ objects: [] }));
      for (const o of l.objects || []) if (o.key.slice(13, 23) < old) await this.env.MODELS.delete(o.key).catch(() => {}); }
    return { ok: true, key };
  }
  async photos(snap) { // the photos of the items and the parents' picks, inside the file (suggestions not kept are left out)
    const ids = new Set(); for (const [p, d] of Object.entries(snap.docs)) if (p.startsWith("items/")) { if (d.imageId) ids.add(d.imageId); for (const o of d.options || []) if (o.i) ids.add(o.i); }
    const out = {};
    for (const id of ids) { if (!BLOB_ID.test(id)) continue; const o = await this.getPhoto(id); if (!o) continue;
      const b = new Uint8Array(o.body); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      out[id] = "data:" + o.type + ";base64," + btoa(bin); }
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
      const key = this.kv("invite"), pkey = this.kv("pinvite"), asParent = !!pkey && same(body.key, pkey);
      if (!asParent && (!key || !same(body.key, key))) return J({ error: "that invite link isn't valid any more: ask the parents for the current one" }, 403);
      if ((this.q().exec("SELECT COUNT(*) AS n FROM person").toArray()[0] || {}).n >= MAX_PEOPLE) return J({ error: "the registry is full of guests already" }, 429);
      const id = "g" + rnd(8), tok = rnd(24);
      this.q().exec("INSERT INTO person(id,name,sec,at) VALUES(?,?,?,?)", id, name, await sha(tok), Date.now()); if (asParent) this.makeParent(id); this.bump();
      return J({ ok: true, id }, 200, { "set-cookie": "nest=" + id + "." + tok + "; Path=/api/nest; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax" });
    }
    const me = await this.who(req);
    if (!me) return J({ error: "this registry is private: open the invite link the parents sent you", need: "invite" }, 401);
    if (path === "/state" && !post) {
      const v = this.kv("v") || "0"; if (url.searchParams.get("v") === v) return J({ v, same: true });
      const role = me.owner ? "o" : this.parent(me) ? "p" : "g", hit = this.cache && this.cache.v === v && this.cache[role]; // the owner's reply carries the co-parent link: cached apart
      if (hit) return new Response(hit.replace('"__ME__"', JSON.stringify({ id: me.id, name: me.name, owner: me.owner, parent: role !== "g" })), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      const docs = {}; for (const r of this.q().exec("SELECT path, data FROM doc").toArray()) if (!r.path.startsWith("locks/")) docs[r.path] = JSON.parse(r.data);
      const profiles = {}; for (const r of this.q().exec("SELECT id, name FROM person").toArray()) profiles[r.id] = { name: r.name };
      const parent = this.parent(me);
      if (parent && !this.kv("seeded") && this.env.HIVE) { this.kv("seeded", 1); const have = new Set(Object.keys(this.findsFor())); await this.enqueue(Object.keys(docs).filter((p) => p.startsWith("items/")).map((p) => p.slice(6)).filter((id) => !have.has(id) && !(docs["items/" + id].options || []).length)); }
      if (parent && me.owner) { this.invite(); this.pinvite(); }
      if (parent && (this.kv("repair") !== this.mark() || this.kv("migrate") !== MIGRATE_V) && this.ctx.storage.setAlarm && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 500); // photos lost with R2: mended in the background
      const body = JSON.stringify({ v, me: "__ME__", docs, profiles, finds: parent ? this.findsFor() : undefined, findq: parent ? this.queued() : undefined, findpause: parent && this.kv("findpause") ? JSON.parse(this.kv("findpause")) : undefined, backup: parent ? this.kv("backup") || "" : undefined, photosLeft: parent && this.kv("repair") !== this.mark() ? this.photosLeft() : undefined, invite: parent ? this.kv("invite") : undefined, pinvite: parent && me.owner ? this.kv("pinvite") : undefined });
      const v2 = this.kv("v") || "0"; if (v2 === v) { if (!this.cache || this.cache.v !== v) this.cache = { v }; this.cache[me.owner ? "o" : parent ? "p" : "g"] = body; } // nothing changed while it was built: keep it for the next asker
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
    if (path === "/invite" && post) { if (!me.owner) return J({ error: "only the owner makes a new invite link" }, 403); const which = body.which === "parent" ? "pinvite" : "invite", k = rnd(12); this.kv(which, k); this.bump(); return J({ ok: true, [which]: k }); }
    if (path === "/upgrade" && post) { // already in on this device, and now opening the co-parent link
      const pkey = this.kv("pinvite"); if (!pkey || !same(body.key, pkey)) return J({ ok: true, parent: this.parent(me) });
      if (!me.owner) { this.makeParent(me.id); this.bump(); } return J({ ok: true, parent: true });
    }
    if (path === "/blob" && post) {
      if (!this.parent(me)) return J({ error: "only the parents add photos" }, 403);
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!IMAGE.test(type)) return J({ error: "a JPEG, PNG, WebP or GIF, please" }, 415);
      const buf = await req.arrayBuffer(); if (!buf.byteLength) return J({ error: "that file is empty" }, 400); if (buf.byteLength > BLOB_MAX) return J({ error: "that photo is too big (3 MB at most)" }, 413);
      try { return J({ id: await this.putPhoto(buf, type) }); } catch (e) { return J({ error: e.message }, 413); }
    }
    if (path === "/read" && post) {
      if (!this.parent(me)) return J({ error: "only the parents add things" }, 403); if (!this.env.AI) return J({ error: "reading photos isn't set up" }, 503);
      const id = String(body.id || ""); const ph = BLOB_ID.test(id) ? await this.getPhoto(id) : null; if (!ph) return J({ error: "no such photo" }, 404);
      const day = new Date().toISOString().slice(0, 10), n = this.kv("read:" + day) | 0; if (n >= 300) return J({ error: "that's today's photo readings; type the name in" }, 429); this.kv("read:" + day, n + 1);
      const r = await this.readShot(new Uint8Array(ph.body), ph.type); return J(r, r.error ? (r.later ? 429 : 502) : 200);
    }
    if (path === "/photos" && post) { // "Refresh all photos": every photo checked and found again where it's missing
      if (!this.parent(me)) return J({ error: "only the parents" }, 403);
      this.kv("photoRound", String((+this.kv("photoRound") || 0) + 1)); if (this.ctx.storage.setAlarm) await this.ctx.storage.setAlarm(Date.now() + 200);
      this.bump(); return J({ ok: true, left: this.photosLeft() });
    }
    if (path === "/fromlink" && post) {
      if (!this.parent(me)) return J({ error: "only the parents add things" }, 403);
      let u; try { u = new URL(String(body.url || "").trim()); } catch (e) { return J({ error: "that isn't a link" }, 400); }
      if (u.protocol !== "https:" || privateHost(u.hostname)) return J({ error: "that isn't a shop's link" }, 400);
      const pg = await this.readPage(u.href), ph = await this.pagePhoto(pg), store = shopOf(u.href);
      if (!pg || !pg.title) return J({ url: u.href, store, imageId: ph ? ph.id : null, error: "that shop didn't let us read the page" });
      return J({ url: u.href, store, name: pg.title, price: pg.price || null, currency: pg.currency || "", imageId: ph ? ph.id : null });
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
      if (!this.parent(me)) return J({ error: "only the parents keep products" }, 403);
      let u; try { u = new URL(String(body.url || "")); } catch (e) { return J({ error: "not a photo address" }, 400); }
      if (u.protocol !== "https:" || privateHost(u.hostname)) return J({ error: "not a public photo" }, 400);
      const id = await this.fetchPhoto(u.href); return id ? J({ id }) : J({ error: "couldn't fetch that photo" }, 502);
    }
    const bm = /^\/blob\/([a-z0-9]+)$/.exec(path);
    if (bm && !post) {
      if (!BLOB_ID.test(bm[1])) return J({ error: "no such photo" }, 404);
      const o = await this.getPhoto(bm[1]); if (!o) return J({ error: "no such photo" }, 404);
      const type = o.type;
      return new Response(o.body, { headers: { "content-type": IMAGE.test(type) ? type : "application/octet-stream", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
    }
    return J({ error: "not found" }, 404);
  }
}
