// mentifaber.org Worker: serves the static site (the ASSETS binding) and adds
//   - server-checked logins for the sealed pages: the encrypted page body is
//     only sent to a browser holding a session from POST /api/login
//   - cloud saves (GET/PUT/DELETE /api/save/<app>) for signed-in apps
//   - a cloud photo album (/api/photos/<app>[/<t>]) for Flutterbloom
//   - notes for Flutterbloom (/api/notes/flutterbloom): read with her session,
//     written from garden-notes.html with the Vigil (owner) session
//   - List-It (/api/list/listit, /api/listimg/listit/<id>): one shared shopping
//     list for two people, each with their own login (per-user verifiers);
//     signals (/api/mood/listit: feelings, needs, replies, urgent, baby kicks)
//     notify the other person by Web Push. The page is now /pilotfish.
//   - a daily Flutterbloom reminder: Web Push subscriptions (/api/push/*) and an
//     hourly cron that sends a payloadless push at her chosen local hour
// Sessions, rate limits, saves and photos live in one SQLite-backed Durable Object.
import { DurableObject } from "cloudflare:workers";

// Login proofs: the browser sends PBKDF2-SHA256(user\0pass, SHA-256("mentifaber-login:<app>"),
// 600k iterations, 32 bytes); these are SHA-256 of the correct proofs. Guessing a password
// from them costs the same 600k-iteration work per guess as the sealed pages themselves.
const VERIFIERS = {
  vigil: "1f25049152dd71b6e4692831cb49fd82869940792ec2eeb9664ca3d74fd203c7",
  flutterbloom: "dfb479241628871f6497ff096744a383914cc98dcd77a32da7d16ce93ef83a34",
  muse: "25aab5186cfb6f715f525667e8b7b8ce3ad24d05b4aaf04a2d9782902525aa76",
  weaver: "b59d2ac35c4c4373c1e92188fe5bbef03cc3aaa23b90a426bf1a5f47ba884bad",
  graveyard: "261dec3b6c58bab0bc42a27857a907b61aba255be34f4ec43d314362dbb41fc1",
  sideways: "aa13d7c65c73f019135b485e79a0a19a00620f359a13b595c2affd79cf32dcb1",
  rootcause: "b4fa2d09b759cb87b3d7cbcf98e9541c4b263696de29876d02672c11a366823e",
  // Shared apps: one verifier per person, so the session knows who is signed in.
  listit: {
    anders: "4861b5e5cd731bd68b61d90f5a11592b748da3f00bb22e1b821f83efbafdd7cd",
    adrianna: "2d9ea0c1375a9447704e64a88c06b977f9aa73c4dcb2b487a3b2555abbe16eac",
  },
};
const PAGES = { "/vigil-app": "vigil", "/flutterbloom": "flutterbloom", "/muse-live": "muse", "/weaver-live": "weaver", "/graveyard": "graveyard", "/rootcause": "rootcause", "/sideways": "sideways" };
const SAVES = new Set(["flutterbloom"]);
const SESSION_DAYS = 180;
const MAX_SAVE = 512 * 1024;
const MAX_PHOTO = 1.5 * 1024 * 1024, MAX_PHOTOS = 60;
const MAX_LIST = 900 * 1024, MAX_LISTIMG = 1.5 * 1024 * 1024, MAX_LISTIMGS = 400;
const LOGIN_LIMIT = 10, LOGIN_WINDOW = 15 * 60 * 1000;

export class Store extends DurableObject {
  async getSession(token) {
    const s = await this.ctx.storage.get("s:" + token);
    if (!s) return null;
    if (s.exp < Date.now()) { await this.ctx.storage.delete("s:" + token); return null; }
    return s;
  }
  async putSession(token, app, user) {
    await this.ctx.storage.put("s:" + token, { app, user: user || null, exp: Date.now() + SESSION_DAYS * 864e5 });
  }
  async dropSession(token) { await this.ctx.storage.delete("s:" + token); }
  // Fixed-window counter; true while under the limit.
  async hit(key, limit, windowMs) {
    const now = Date.now(), k = "r:" + key;
    let r = await this.ctx.storage.get(k);
    if (!r || r.until < now) r = { n: 0, until: now + windowMs };
    r.n++;
    await this.ctx.storage.put(k, r);
    return r.n <= limit;
  }
  async getSave(app) { return (await this.ctx.storage.get("save:" + app)) || null; }
  async putSave(app, data) {
    const rec = { data, savedAt: Date.now() };
    await this.ctx.storage.put("save:" + app, rec);
    return rec.savedAt;
  }
  async dropSave(app) { await this.ctx.storage.delete("save:" + app); }
  // Web Push: the VAPID key pair is made on first use and kept here.
  async vapid() {
    let v = await this.ctx.storage.get("vapid");
    if (!v) {
      const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      v = { priv: await crypto.subtle.exportKey("jwk", k.privateKey), pub: b64url(await crypto.subtle.exportKey("raw", k.publicKey)) };
      await this.ctx.storage.put("vapid", v);
    }
    return v;
  }
  async putSub(id, rec) { await this.ctx.storage.put("push:" + id, rec); }
  async dropSub(id) { await this.ctx.storage.delete("push:" + id); }
  async subs() { return [...(await this.ctx.storage.list({ prefix: "push:" })).entries()].map(([k, v]) => ({ id: k.slice(5), ...v })); }
  // List-It: the whole list is one document with a revision number. A write
  // must name the revision it was built on; a stale one gets a 409 and the
  // current document, and the client replays its changes on top.
  async getList(app) { return (await this.ctx.storage.get("list:" + app)) || { rev: 0, data: null }; }
  async putList(app, base, data, user) {
    const cur = await this.getList(app);
    if (base !== cur.rev) return { conflict: true, ...cur };
    const next = { rev: cur.rev + 1, data, by: user, at: Date.now() };
    await this.ctx.storage.put("list:" + app, next);
    return next;
  }
  async getListImg(app, id) { return (await this.ctx.storage.get("limg:" + app + ":" + id)) || null; }
  async putListImg(app, id, bytes) {
    const idx = (await this.ctx.storage.get("limgs:" + app)) || [];
    if (!idx.includes(id)) {
      idx.push(id);
      for (const old of idx.splice(0, Math.max(0, idx.length - MAX_LISTIMGS))) await this.ctx.storage.delete("limg:" + app + ":" + old);
      await this.ctx.storage.put("limgs:" + app, idx);
    }
    await this.ctx.storage.put("limg:" + app + ":" + id, bytes);
  }
  async dropListImg(app, id) {
    const idx = ((await this.ctx.storage.get("limgs:" + app)) || []).filter((x) => x !== id);
    await this.ctx.storage.put("limgs:" + app, idx);
    await this.ctx.storage.delete("limg:" + app + ":" + id);
  }
  async getMoods(app) { return (await this.ctx.storage.get("moods:" + app)) || []; }
  async addMood(app, m) {
    const list = [m, ...(await this.getMoods(app))].slice(0, 60);
    await this.ctx.storage.put("moods:" + app, list);
    return list;
  }
  async putLSub(id, rec) { await this.ctx.storage.put("lpush:" + id, rec); }
  async dropLSub(id) { await this.ctx.storage.delete("lpush:" + id); }
  async lsubs() { return [...(await this.ctx.storage.list({ prefix: "lpush:" })).entries()].map(([k, v]) => ({ id: k.slice(6), ...v })); }
  async getNotes(app) { return (await this.ctx.storage.get("notes:" + app)) || []; }
  async putNotes(app, notes) { await this.ctx.storage.put("notes:" + app, notes); }

  // Photo album: the index lists {t, size} newest first; deleted photo times are
  // remembered so another device drops its copy instead of uploading it again.
  async album(app) {
    return (await this.ctx.storage.get("album:" + app)) || { photos: [], deleted: [] };
  }
  async getPhoto(app, t) { return (await this.ctx.storage.get("photo:" + app + ":" + t)) || null; }
  async putPhoto(app, t, bytes) {
    const a = await this.album(app);
    if (a.deleted.includes(t)) return a;
    if (!a.photos.some((p) => p.t === t)) {
      await this.ctx.storage.put("photo:" + app + ":" + t, bytes);
      a.photos.push({ t, size: bytes.byteLength });
      a.photos.sort((x, y) => y.t - x.t);
      for (const old of a.photos.splice(MAX_PHOTOS)) await this.ctx.storage.delete("photo:" + app + ":" + old.t);
      await this.ctx.storage.put("album:" + app, a);
    }
    return a;
  }
  async dropPhoto(app, t) {
    const a = await this.album(app);
    a.photos = a.photos.filter((p) => p.t !== t);
    if (!a.deleted.includes(t)) a.deleted = [t, ...a.deleted].slice(0, 500);
    await this.ctx.storage.delete("photo:" + app + ":" + t);
    await this.ctx.storage.put("album:" + app, a);
    return a;
  }
}

const store = (env) => env.STORE.get(env.STORE.idFromName("main"));
const json = (body, status = 200, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([a-f0-9]{64})"));
  return m ? m[1] : null;
}
async function session(req, env, app) {
  const s = await sessionRec(req, env, app);
  return s ? s.token : null;
}
async function sessionRec(req, env, app) {
  const token = cookie(req, "mf_" + app);
  if (!token) return null;
  const s = await store(env).getSession(token);
  return s && s.app === app ? { token, user: s.user || null } : null;
}
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function login(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const app = body && body.app, proof = body && body.proof;
  if (!VERIFIERS[app] || typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof)) return json({ error: "bad request" }, 400);
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await store(env).hit("login:" + app + ":" + ip, LOGIN_LIMIT, LOGIN_WINDOW))) return json({ error: "slow down" }, 429);
  const given = hex(await crypto.subtle.digest("SHA-256", Uint8Array.from(proof.match(/../g), (h) => parseInt(h, 16))));
  const v = VERIFIERS[app];
  let user = null;
  if (typeof v === "string") { if (!sameHex(given, v)) return json({ error: "wrong" }, 401); }
  else {
    for (const [name, h] of Object.entries(v)) if (sameHex(given, h)) user = name;
    if (!user) return json({ error: "wrong" }, 401);
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await store(env).putSession(token, app, user);
  return json({ ok: true, user }, 200, {
    "set-cookie": `mf_${app}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
  });
}

async function logout(req, env, app) {
  const token = VERIFIERS[app] && cookie(req, "mf_" + app);
  if (token) await store(env).dropSession(token);
  return json({ ok: true }, 200, { "set-cookie": `mf_${app}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
}

async function cloudSave(req, env, app) {
  if (!SAVES.has(app)) return json({ error: "not found" }, 404);
  if (!(await session(req, env, app))) return json({ error: "signed out" }, 401);
  const s = store(env);
  if (req.method === "GET") {
    const rec = await s.getSave(app);
    return rec ? json(rec) : json(null, 204);
  }
  if (req.method === "PUT" || req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_SAVE) return json({ error: "too big" }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
    if (!data || typeof data !== "object") return json({ error: "bad json" }, 400);
    return json({ savedAt: await s.putSave(app, data) });
  }
  if (req.method === "DELETE") { await s.dropSave(app); return json({ ok: true }); }
  return json({ error: "method" }, 405);
}

async function photos(req, env, app, t) {
  if (!SAVES.has(app)) return json({ error: "not found" }, 404);
  if (!(await session(req, env, app))) return json({ error: "signed out" }, 401);
  const s = store(env);
  if (!t) return req.method === "GET" ? json(await s.album(app)) : json({ error: "method" }, 405);
  if (!/^\d{1,15}$/.test(t)) return json({ error: "bad photo" }, 400);
  const id = Number(t);
  if (req.method === "GET") {
    const bytes = await s.getPhoto(app, id);
    return bytes
      ? new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" } })
      : json({ error: "not found" }, 404);
  }
  if (req.method === "PUT") {
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO) return json({ error: "too big" }, 413);
    const head = new Uint8Array(bytes, 0, 3);
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ error: "jpeg only" }, 415);
    return json(await s.putPhoto(app, id, bytes));
  }
  if (req.method === "DELETE") return json(await s.dropPhoto(app, id));
  return json({ error: "method" }, 405);
}

// Notes are short messages that appear in the garden: on a date ("MM-DD",
// once a year) or, with no date, one at random now and then.
const MAX_NOTES = 200;
async function notes(req, env, app) {
  if (app !== "flutterbloom") return json({ error: "not found" }, 404);
  const owner = await session(req, env, "vigil");
  const s = store(env);
  if (req.method === "GET") {
    if (!owner && !(await session(req, env, app))) return json({ error: "signed out" }, 401);
    return json({ notes: await s.getNotes(app), owner: !!owner });
  }
  if (req.method === "PUT") {
    if (!owner) return json({ error: "owner only" }, 401);
    let body;
    try { body = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
    const list = Array.isArray(body && body.notes) ? body.notes : null;
    if (!list || list.length > MAX_NOTES) return json({ error: "bad notes" }, 400);
    const clean = [];
    for (const n of list) {
      const text = String((n && n.text) || "").trim().slice(0, 2000);
      if (!text) continue;
      const on = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(n.on || "") ? n.on : "";
      clean.push({
        id: /^[a-z0-9]{6,24}$/.test(n.id || "") ? n.id : hex(crypto.getRandomValues(new Uint8Array(8))),
        on, text,
        title: String(n.title || "").trim().slice(0, 80),
        emoji: String(n.emoji || "💌").slice(0, 8),
        from: String(n.from || "").trim().slice(0, 40),
      });
    }
    await s.putNotes(app, clean);
    return json({ notes: clean });
  }
  return json({ error: "method" }, 405);
}

// List-It: a shared list. GET returns {rev, data, me}; PUT {base, data}.
const LISTS = new Set(["listit"]);
async function list(req, env, app) {
  if (!LISTS.has(app)) return json({ error: "not found" }, 404);
  const me = await sessionRec(req, env, app);
  if (!me) return json({ error: "signed out" }, 401);
  const s = store(env);
  if (req.method === "GET") return json({ ...(await s.getList(app)), me: me.user });
  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_LIST) return json({ error: "too big" }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
    if (!body || typeof body.base !== "number" || !body.data || typeof body.data !== "object") return json({ error: "bad list" }, 400);
    const r = await s.putList(app, body.base, body.data, me.user);
    return json({ ...r, me: me.user }, r.conflict ? 409 : 200);
  }
  return json({ error: "method" }, 405);
}
async function listImg(req, env, app, id) {
  if (!LISTS.has(app)) return json({ error: "not found" }, 404);
  if (!(await session(req, env, app))) return json({ error: "signed out" }, 401);
  if (!/^[a-z0-9]{8,32}$/.test(id || "")) return json({ error: "bad id" }, 400);
  const s = store(env);
  if (req.method === "GET") {
    const bytes = await s.getListImg(app, id);
    return bytes ? new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" } }) : json({ error: "not found" }, 404);
  }
  if (req.method === "PUT") {
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_LISTIMG) return json({ error: "too big" }, 413);
    const head = new Uint8Array(bytes, 0, 3);
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ error: "jpeg only" }, 415);
    await s.putListImg(app, id, bytes);
    return json({ ok: true });
  }
  if (req.method === "DELETE") { await s.dropListImg(app, id); return json({ ok: true }); }
  return json({ error: "method" }, 405);
}

// Moods: either person picks how they feel (+ a note); the other person's
// subscribed devices get a payloadless push and the service worker fetches
// the latest mood to show it.
const FEELS = new Set(["happy", "sad", "hungry", "angry", "tired", "loving", "anxious", "sick", "bored", "hug", "stressed", "excited", "lonely", "silly", "nauseous", "achy", "emotional", "cozy"]);
const NEEDS = new Set(["water", "snack", "meal", "cold", "tea", "craving", "vitamins", "rub", "cuddle", "quiet", "nap", "bath", "chores", "callme", "comehome", "pickup", "temp", "company"]);
const REPLIES = new Set(["omw", "gotit", "soon", "love", "callsoon", "done"]);
const KINDS = new Set(["talk", "urgent", "reply", "kick"]);
async function mood(req, env, app) {
  if (!LISTS.has(app)) return json({ error: "not found" }, 404);
  const me = await sessionRec(req, env, app);
  if (!me) return json({ error: "signed out" }, 401);
  const s = store(env);
  if (req.method === "GET") return json({ moods: await s.getMoods(app), me: me.user });
  if (req.method === "POST") {
    let body;
    try { body = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
    const kind = KINDS.has(body && body.kind) ? body.kind : "talk";
    const pickSet = (arr, set) => (Array.isArray(arr) ? arr : []).filter((m) => set.has(m)).slice(0, 8);
    const feel = pickSet(body.feel || body.moods, FEELS), need = pickSet(body.need, NEEDS);
    const reply = REPLIES.has(body.reply) ? body.reply : "", re = Number.isFinite(body.re) ? body.re : 0;
    const note = String(body.note || "").trim().slice(0, 1000);
    if (kind === "talk" && !feel.length && !need.length && !note) return json({ error: "empty" }, 400);
    if (kind === "reply" && !reply && !note) return json({ error: "empty" }, 400);
    const list = await s.addMood(app, { kind, feel, need, reply, re, note, by: me.user, at: Date.now() });
    const v = await s.vapid();
    let sent = 0;
    for (const sub of await s.lsubs()) {
      if (sub.user === me.user) continue;
      const st = await sendPush(sub, v, kind === "urgent" ? "high" : "normal").catch(() => 0);
      if (st === 404 || st === 410) await s.dropLSub(sub.id); else if (st >= 200 && st < 300) sent++;
    }
    return json({ moods: list, sent });
  }
  return json({ error: "method" }, 405);
}
async function listPush(req, env, app, action) {
  if (!LISTS.has(app)) return json({ error: "not found" }, 404);
  const me = await sessionRec(req, env, app);
  if (!me) return json({ error: "signed out" }, 401);
  let body;
  try { body = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
  const endpoint = body && (body.sub ? body.sub.endpoint : body.endpoint);
  if (typeof endpoint !== "string") return json({ error: "bad request" }, 400);
  const id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 32);
  if (action === "subscribe" && req.method === "POST") {
    if (!(PUSH_HOSTS.test(endpoint) || env.PUSH_TEST_HOST && endpoint.startsWith(env.PUSH_TEST_HOST))) return json({ error: "bad subscription" }, 400);
    await store(env).putLSub(id, { endpoint, user: me.user });
    return json({ ok: true });
  }
  if (action === "unsubscribe" && req.method === "POST") { await store(env).dropLSub(id); return json({ ok: true }); }
  return json({ error: "not found" }, 404);
}

// Web Push (RFC 8030/8292) without a payload: the service worker picks the
// words, so nothing needs encrypting; the request only carries a VAPID JWT.
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (str) => b64url(new TextEncoder().encode(str));
async function vapidAuth(endpoint, v) {
  const aud = new URL(endpoint).origin;
  const head = b64urlStr(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64urlStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:anders@mentifaber.org" }));
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64url(sig) + ", k=" + v.pub;
}
async function sendPush(sub, v, urgency) {
  const res = await fetch(sub.endpoint, { method: "POST", headers: { TTL: "43200", Urgency: urgency || "normal", Authorization: await vapidAuth(sub.endpoint, v), "Content-Length": "0" } });
  return res.status;
}
const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|googleapis\.com|mozilla\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//;
async function push(req, env, action) {
  const s = store(env);
  if (action === "key" && req.method === "GET") return json({ key: (await s.vapid()).pub });
  if (!(await session(req, env, "flutterbloom"))) return json({ error: "signed out" }, 401);
  let body;
  try { body = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
  if (action === "subscribe" && req.method === "POST") {
    const sub = body && body.sub;
    if (!sub || typeof sub.endpoint !== "string" || !(PUSH_HOSTS.test(sub.endpoint) || env.PUSH_TEST_HOST && sub.endpoint.startsWith(env.PUSH_TEST_HOST))) return json({ error: "bad subscription" }, 400);
    const num = (x, d) => (Number.isFinite(+x) && x !== null && x !== "" ? +x : d);
    const hour = Math.max(0, Math.min(23, Math.round(num(body.hour, 19)))), tz = Math.max(-840, Math.min(840, Math.round(num(body.tz, 0))));
    const id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint))).slice(0, 32);
    await s.putSub(id, { endpoint: sub.endpoint, hour, tz, last: "" });
    return json({ ok: true });
  }
  if (action === "unsubscribe" && req.method === "POST") {
    if (typeof (body && body.endpoint) !== "string") return json({ error: "bad request" }, 400);
    await s.dropSub(hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.endpoint))).slice(0, 32));
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}
// Hourly: for each subscription whose local time is its chosen hour, send one
// reminder a day, and skip it if she has already opened the garden today.
async function dailyReminders(env) {
  const s = store(env), v = await s.vapid(), now = Date.now();
  const save = await s.getSave("flutterbloom");
  for (const sub of await s.subs()) {
    const local = new Date(now - sub.tz * 60e3), day = local.toISOString().slice(0, 10);
    if (local.getUTCHours() !== sub.hour || sub.last === day) continue;
    const seen = save && save.data && save.data.lastSeen && new Date(save.data.lastSeen - sub.tz * 60e3).toISOString().slice(0, 10) === day;
    if (!seen) {
      const status = await sendPush(sub, v).catch(() => 0);
      if (status === 404 || status === 410) { await s.dropSub(sub.id); continue; }
    }
    await s.putSub(sub.id, { endpoint: sub.endpoint, hour: sub.hour, tz: sub.tz, last: day });
  }
}

// A sealed page without a session is sent with its ciphertext removed, so the
// lock screen shows but there is nothing to attack offline.
async function sealedPage(req, env, app) {
  const res = await env.ASSETS.fetch(req);
  const ok = res.status === 200 && (res.headers.get("content-type") || "").includes("text/html");
  if (!ok) return res;
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-store");
  headers.append("vary", "cookie");
  const out = new Response(res.body, { status: res.status, headers });
  if (await session(req, env, app)) return out;
  return new HTMLRewriter().on("script#mf-blob", { element(el) { el.setInnerContent(""); } }).transform(out);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path.startsWith("/api/")) {
      const [, , route, app, sub] = path.split("/");
      if (route === "login" && req.method === "POST") return login(req, env);
      if (route === "logout" && req.method === "POST") return logout(req, env, app);
      if (route === "save" && app) return cloudSave(req, env, app);
      if (route === "photos" && app) return photos(req, env, app, sub);
      if (route === "notes" && app) return notes(req, env, app);
      if (route === "push" && app) return push(req, env, app);
      if (route === "list" && app) return list(req, env, app);
      if (route === "listimg" && app) return listImg(req, env, app, sub);
      if (route === "mood" && app) return mood(req, env, app);
      if (route === "lpush" && app) return listPush(req, env, app, sub);
      return json({ error: "not found" }, 404);
    }
    const app = PAGES[path.replace(/\.html$/, "").replace(/\/$/, "")];
    if (app && (req.method === "GET" || req.method === "HEAD")) return sealedPage(req, env, app);
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dailyReminders(env));
  },
};
