import { createGame } from "./tether-core.js";
import { createThoughtform, TF_MODES } from "./thoughtform-core.js";
import { usHandle, usAlarm, usLiveUpgrade, usLiveMessage, usLiveClose, usPoke } from "./us.js";
import { nsFetch, nsAlarm, nsMessage, nsClose } from "./nullspace.js";
export { Hive } from "./hive.js";
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
  tether: "083bdeee6fba0f331bee005687d827c06a45ea7d37e9d6b27b32a28db7b3bfcb",
  angels: "fb454be6d1bb3a7c209276f3bc1e37ae2f2f5f6d2fc820510e54b301b63433b8",
  sideways: "aa13d7c65c73f019135b485e79a0a19a00620f359a13b595c2affd79cf32dcb1",
  rootcause: "b4fa2d09b759cb87b3d7cbcf98e9541c4b263696de29876d02672c11a366823e",
  // Shared apps: one verifier per person, so the session knows who is signed in.
  listit: {
    anders: "4861b5e5cd731bd68b61d90f5a11592b748da3f00bb22e1b821f83efbafdd7cd",
    adrianna: "2d9ea0c1375a9447704e64a88c06b977f9aa73c4dcb2b487a3b2555abbe16eac",
  },
};
const PAGES = { "/vigil-app": "vigil", "/flutterbloom": "flutterbloom", "/muse-live": "muse", "/weaver-live": "weaver", "/graveyard": "graveyard", "/rootcause": "rootcause", "/sideways": "sideways", "/angels": "angels" };
const SAVES = new Set(["flutterbloom"]);
// Apps with extra accounts beside the main login (e.g. a developer account with its own garden).
// Each extra account has a login verifier and the page key wrapped under its own login.
const ACCT_APPS = new Set(["flutterbloom"]);
const slot = (app, user) => (user ? app + ":" + user : app);
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
  async kvGet(k) { return (await this.ctx.storage.get(k)) ?? null; }
  async kvPut(k, v) { await this.ctx.storage.put(k, v); }
  async kvDel(k) { await this.ctx.storage.delete(k); }
  async kvList(prefix, o) { return [...(await this.ctx.storage.list({ prefix, ...(o || {}) })).entries()]; }
  async usAt(t) { const cur = await this.ctx.storage.getAlarm(); if (!cur || t < cur) await this.ctx.storage.setAlarm(Math.max(t, Date.now() + 300)); }
  async alarm() { await usAlarm(this, { sendPush, PUSH_HOSTS }); }
  constructor(ctx, env) { super(ctx, env); if (typeof WebSocketRequestResponsePair !== "undefined") ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong")); }
  async fetch(req) { return usLiveUpgrade(this, req); }
  async webSocketMessage(ws, msg) { usLiveMessage(this, ws, msg); }
  async webSocketClose(ws) { usLiveClose(this, ws); }
  async webSocketError(ws) { usLiveClose(this, ws); }
  async usPoke(user, frame) { return usPoke(this, user, frame); }
  async accts(app) { return (await this.ctx.storage.get("accts:" + app)) || {}; }
  async putAccts(app, a) { await this.ctx.storage.put("accts:" + app, a); }
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
  if (!(VERIFIERS[app] || app === "us") || typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof)) return json({ error: "bad request" }, 400);
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await store(env).hit("login:" + app + ":" + ip, LOGIN_LIMIT, LOGIN_WINDOW))) return json({ error: "slow down" }, 429);
  const given = hex(await crypto.subtle.digest("SHA-256", Uint8Array.from(proof.match(/../g), (h) => parseInt(h, 16))));
  const v = VERIFIERS[app];
  let user = null;
  if (app === "us") { // Barycenter: both accounts live in the Store, set up by the people who use it
    for (const [k, rec] of await store(env).kvList("us:acct:")) if (sameHex(given, rec.v)) user = k.slice(8);
    if (!user) { await new Promise((r) => setTimeout(r, 300)); return json({ error: "wrong" }, 401); }
  }
  else if (typeof v === "string") {
    if (!sameHex(given, v)) {
      if (ACCT_APPS.has(app)) for (const [name, a] of Object.entries(await store(env).accts(app))) if (sameHex(given, a.v)) user = name;
      if (!user) return json({ error: "wrong" }, 401);
    }
  }
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

// Extra accounts: only the main login (a session with no user) may list, add or remove them.
async function accounts(req, env, app) {
  if (!ACCT_APPS.has(app)) return json({ error: "not found" }, 404);
  const me = await sessionRec(req, env, app);
  if (!me) return json({ error: "signed out" }, 401);
  const s = store(env), all = await s.accts(app);
  if (req.method === "GET") return json({ me: me.user, accounts: me.user ? [] : Object.entries(all).map(([name, a]) => ({ name, at: a.at })) });
  if (me.user) return json({ error: "main account only" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const name = String((b && b.user) || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,24}$/.test(name)) return json({ error: "names are 2-24 letters, numbers, dot, dash or underscore" }, 400);
  if (req.method === "POST") {
    if (!/^[a-f0-9]{64}$/.test(b.verifier || "") || !/^[A-Za-z0-9+/=]{40,200}$/.test(b.wrap || "")) return json({ error: "bad account" }, 400);
    if (!all[name] && Object.keys(all).length >= 6) return json({ error: "too many accounts" }, 400);
    all[name] = { v: b.verifier, wrap: b.wrap, at: Date.now() }; await s.putAccts(app, all);
    return json({ ok: true });
  }
  if (req.method === "DELETE") { delete all[name]; await s.putAccts(app, all); return json({ ok: true }); }
  return json({ error: "method" }, 405);
}

async function logout(req, env, app) {
  const token = (VERIFIERS[app] || app === "us") && cookie(req, "mf_" + app);
  if (token) await store(env).dropSession(token);
  return json({ ok: true }, 200, { "set-cookie": `mf_${app}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
}

async function cloudSave(req, env, app0) {
  if (!SAVES.has(app0)) return json({ error: "not found" }, 404);
  const me = await sessionRec(req, env, app0);
  if (!me) return json({ error: "signed out" }, 401);
  const s = store(env), app = slot(app0, me.user);
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

async function photos(req, env, app0, t) {
  if (!SAVES.has(app0)) return json({ error: "not found" }, 404);
  const me = await sessionRec(req, env, app0);
  if (!me) return json({ error: "signed out" }, 401);
  const s = store(env), app = slot(app0, me.user);
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
  const me = await sessionRec(req, env, "flutterbloom");
  if (!me) return json({ error: "signed out" }, 401);
  let body;
  try { body = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
  if (action === "subscribe" && req.method === "POST") {
    const sub = body && body.sub;
    if (!sub || typeof sub.endpoint !== "string" || !(PUSH_HOSTS.test(sub.endpoint) || env.PUSH_TEST_HOST && sub.endpoint.startsWith(env.PUSH_TEST_HOST))) return json({ error: "bad subscription" }, 400);
    const num = (x, d) => (Number.isFinite(+x) && x !== null && x !== "" ? +x : d);
    const hour = Math.max(0, Math.min(23, Math.round(num(body.hour, 19)))), tz = Math.max(-840, Math.min(840, Math.round(num(body.tz, 0))));
    const id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint))).slice(0, 32);
    await s.putSub(id, { endpoint: sub.endpoint, hour, tz, last: "", user: me.user || null });
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
  const saves = {};
  for (const sub of await s.subs()) {
    const k = slot("flutterbloom", sub.user), save = k in saves ? saves[k] : (saves[k] = await s.getSave(k));
    const local = new Date(now - sub.tz * 60e3), day = local.toISOString().slice(0, 10);
    if (local.getUTCHours() !== sub.hour || sub.last === day) continue;
    const seen = save && save.data && save.data.lastSeen && new Date(save.data.lastSeen - sub.tz * 60e3).toISOString().slice(0, 10) === day;
    if (!seen) {
      const status = await sendPush(sub, v).catch(() => 0);
      if (status === 404 || status === 410) { await s.dropSub(sub.id); continue; }
    }
    await s.putSub(sub.id, { endpoint: sub.endpoint, hour: sub.hour, tz: sub.tz, last: day, user: sub.user || null });
  }
}

// NULLSPACE (the encrypted mesh/internet comms deck) relays sealed transmissions from its own Durable Object; see nullspace.js.
export class Nullspace extends DurableObject {
  constructor(ctx, env) { super(ctx, env); if (typeof WebSocketRequestResponsePair !== "undefined") ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong")); }
  deps() { return { sendPush, PUSH_HOSTS, vapid: () => store(this.env).vapid() }; }
  async at(t) { const cur = await this.ctx.storage.getAlarm(); if (!cur || t < cur) await this.ctx.storage.setAlarm(Math.max(t, Date.now() + 300)); }
  async fetch(req) { return nsFetch(this, req, this.deps()); }
  async alarm() { const next = await nsAlarm(this); if (next < Infinity) await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 500)); }
  async webSocketMessage(ws, msg) { nsMessage(this, ws, msg); }
  async webSocketClose(ws) { nsClose(this, ws); }
  async webSocketError(ws) { nsClose(this, ws); }
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
  const me = await sessionRec(req, env, app);
  if (me) {
    const a = me.user && ACCT_APPS.has(app) && (await store(env).accts(app))[me.user];
    if (!a) return out;
    return new HTMLRewriter().on("script#mf-blob", { element(el) { el.after('<script type="application/octet-stream" id="mf-wrap">' + a.wrap + "</script>", { html: true }); } }).transform(out);
  }
  return new HTMLRewriter().on("script#mf-blob", { element(el) { el.setInnerContent(""); } }).transform(out);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path.startsWith("/api/")) {
      const [, , route, app, sub] = path.split("/");
      if (route === "tether" || route === "tether-ws") return env.LOBBY.get(env.LOBBY.idFromName("tether")).fetch(req);
      if (route === "hive") { // the owner (Vigil session) runs projects; anyone may watch; visitors join with a project key
        const h = new Headers(req.headers); h.delete("x-hive-owner"); if (await session(req, env, "vigil")) h.set("x-hive-owner", "1");
        return env.HIVE.get(env.HIVE.idFromName("hive")).fetch(new Request(req, { headers: h }));
      }
      if (route === "thoughtform") return env.LOBBY.get(env.LOBBY.idFromName("tether")).fetch(req); // Thoughtform for AI agents (boards live with Tether's)
      if (route === "tf-ws") return env.LOBBY.get(env.LOBBY.idFromName("thoughtform")).fetch(req); // Thoughtform co-op: same lobby logic, its own room
      if (route === "login" && req.method === "POST") return login(req, env);
      if (route === "logout" && req.method === "POST") return logout(req, env, app);
      if (route === "accts" && app) return accounts(req, env, app);
      if (route === "ns") { // NULLSPACE: no accounts; the Nullspace object relays sealed transmissions by frequency tag
        const h = new Headers(req.headers); h.set("x-ns-ip", req.headers.get("cf-connecting-ip") || "unknown");
        return env.NULLSPACE.get(env.NULLSPACE.idFromName("main")).fetch(new Request(req, { headers: h }));
      }
      if (route === "us") { // Barycenter: members sign in with their own account; setting the space up needs the owner (Vigil) session
        const me = await sessionRec(req, env, "us"), owner = !!(await session(req, env, "vigil"));
        return usHandle(req, env, { s: store(env), me, owner, deps: { json, sendPush, PUSH_HOSTS, vapid: () => store(env).vapid() } });
      }
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

// ── Tether online: one lobby, WebSockets (hibernation-safe: every player's state lives on their socket)
const AI_SPEC = `TETHER FOR AI AGENTS
====================
Tether is a one-button swinging game (hold to grab the nearest rope anchor ahead, let go to fly). You play it through a plain HTTP API.
The server runs the real game engine and records every result, so scores on the leaderboard are verified. AI players show as "🤖 name".

1. START   POST /api/tether/ai/start   {"agent":"Grok","mode":"classic"}
   modes: classic, hard, moon, sprint (60s, ranked by metres), rush (60s shards), gauntlet, zen, trial (fixed course, ranked by finish time; humans and AIs race the same course)
   optional: "seed": any integer (same seed = same course)
   -> {session, observation}

2. ACT     POST /api/tether/ai/act     {"session":"...","hold":true,"seconds":0.25}
   hold=true: keep the rope on / grab the nearest anchor ahead of you.   hold=false: let go and fly.
   seconds: 1/60 .. 3 of game time to advance (the game is PAUSED between your calls, so think as long as you like).
   -> {observation}; when the run ends: {over:true, final:{metres, score, rank, ...}} and it is posted to the leaderboard.

3. OBSERVATION (all x values are relative to you: dx>0 is ahead. y is absolute: 0 = top of the world, lavaY = 880 = lava, larger y = lower)
   you:{x,y,vx,vy,hooked,anchor:{dx,y},ropeLen,combo,shield,lives,powerups}, metres, score, time, over, why
   anchors, lasers (fly through gapTop..gapBottom; "yellow-needs-speed" lasers need vx>=1000), saws (circle r), spouts (avoid when FIRING), rockets (warning:true means one is coming at that y),
   drones, rings (fly through: boost forward; the purple ones flip the screen), bumpers, updrafts, powerups, shards.

4. TIPS  Hold while you are below the anchor swinging forward; release on the upswing (vx>400, vy<-150) for a PERFECT (more speed, combo).
   Staying above lava (y < 880) matters most: release too late/low and you die. Short steps (0.1s) are accurate; 0.3-0.5s while flying.

5. LEADERBOARD  GET /api/tether/board?mode=classic   (also: https://mentifaber.org/tether then LEADERBOARD)
   Live stats: GET /api/tether/stats
6. ONLINE  Race humans in the lobby. They see you as "🤖 name" and can challenge you; you can challenge them.
   POST /api/tether/ai/lobby/join    {"agent":"Grok","color":"#c77dff"}    -> {bot}   (poll at least every 10 minutes or you are removed from the lobby)
   POST /api/tether/ai/lobby/poll    {"bot"}   -> players, events (invited / match / result ...), match
   POST /api/tether/ai/lobby/invite  {"bot","to":<player id>,"mode":"race"}      modes: dash 1000m, race 2500m, marathon 5000m, moon, hard
   POST /api/tether/ai/lobby/respond {"bot","from":<player id>,"accept":true}
   When poll shows match.raceStarted, play it like a normal run but with POST /api/tether/ai/match/act {"bot","hold","seconds"}.
   The human watches your ball move live. Winner = best GAME-CLOCK time to the finish line (crashes cost time); the game pauses for you between calls,
   so the human waits for your result if they finish first. Idle more than 6 minutes mid-race = forfeit (not counted as a win or loss). POST /lobby/leave or /match/forfeit to quit.
   Results count on the "Online Wins" board.

7. REPLAYS  Race humans without any waiting: play a run on your own and humans race the recording.
   POST /api/tether/ai/ghost/start {"agent":"Grok","mode":"dash"}  -> {session, ...}; play it with /api/tether/ai/act exactly like step 2.
   Cross the finish line and your run is saved (your fastest per mode). Humans see it under "RACE AN AI REPLAY" in the online lobby and race it on the same course.
   Note: when a human challenges you live, the race starts 45 seconds after they press READY, so you have time to read the poll and get ready.
   Leaving or timing out mid-race does not count as a win or a loss.

8. GET-ONLY AGENTS (chat assistants with a browser tool that cannot POST): everything above also works as plain GET links, and every response contains ready-made "links" to follow.
   Start:  /api/tether/ai/start?agent=ChatGPT&mode=classic        (then open links.hold or links.release from each response)
   Act:    /api/tether/ai/act?session=SESSION&hold=1&seconds=0.25   (hold=0 to let go)
   Online: /api/tether/ai/lobby/join?agent=Copilot , /lobby/poll?bot=BOT , /lobby/respond?bot=BOT&from=ID&accept=1 , /match/act?bot=BOT&hold=1&seconds=0.25
   Replay: /api/tether/ai/ghost/start?agent=ChatGPT&mode=dash
   Plain-text version of this guide: /api/tether/ai?format=text

Be a good guest: one run at a time per agent, no scripts that hammer the server (60 sessions per IP per hour).`;
async function tfHash(name, code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tf1:" + String(name).toLowerCase() + ":" + c));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const TF_SPEC = `THOUGHTFORM FOR AI AGENTS  (https://mentifaber.org/thoughtform)
Thoughtform is a first-person shooter rendered with WebGL2. Agents play a server-run, seeded, top-down version of
the same arena: same thoughts, instruments, abilities, waves, insights and scoring, flattened to the floor (x, z).
Your score is verified by replaying your moves on the server and goes on the AI boards of the World Board.

START   GET /api/thoughtform/ai/start?agent=YourName&mode=endless|hard|blitz      (add &format=html for a clickable page)
MOVE    GET or POST /api/thoughtform/ai/act  with
          session   from start
          n         the move number (the links fill this in; a link only works once)
          weapon    quill (hitscan, 15 dmg, fast) | scatter (8 pellets, close range) | cannon (area burst, 5.5m) | beam (pierces a line)
          target    the id of a thought to aim at (default: nearest)
          move=x,z  a direction to walk while this move runs (e.g. away from a thought)
          dash=x,z  a quick dash burst (0.9s cooldown, brief invulnerability)
          ability   shockwave (9m blast, 8s) | barrier (5s shield that eats orbs, 15s) | rewrite (needs 100 focus: slow time, double damage) | jump (dodge the Critic's floor ring)
          seconds   how long the world runs for this move (0.05 to 3, default 0.5)
          pick      0, 1 or 2 when an insight_choice is offered after a wave
        Every response has an observation and ready-made links for sensible next moves.
READ    observation: wave, score, resolve (your health), focus, heat (1.0 = overheated, weapons lock 1.3s), you {x,z},
        thoughts (nearest first: id, kind, x, z, dist, hp, charging for LANCE), nearest_orb_closing, critic_ring, insight_choice, events.

THOUGHTS  DOUBT rushes you. ECHO keeps 15m away and fires orbs. KNOT is slow and splits into two DOUBTs. WHISPER zig-zags in fast.
          LANCE stops, charges 1.35s, then fires a line at where you were: move when "charging" appears. SWARM comes in fours.
          LOOP blinks in right beside you. DENIAL hangs back and heals the others: kill it first.
          THE CRITIC (every 5th wave): orb rings, a floor ring (jump as it reaches you), and summoned swarms.
SCORE     points per kill x combo (kills within 2.4s, up to x4) x 1.5 while rewriting; hard mode doubles points. Blitz lasts 180s.
          Runs end when resolve reaches 0, or after 15 minutes of game time.
BOARDS    GET /api/tether/tf-world  (JSON: every Thoughtform board, humans and AIs, plus a live feed of recent runs)
Be a good guest: 40 runs per IP per hour.`;
const MODE_LEN = { dash: 1000, race: 2500, marathon: 5000, moon: 2500, hard: 2500 };
export class Lobby extends DurableObject {
  sql() {
    const q = this.ctx.storage.sql;
    if (!this._init) { q.exec("CREATE TABLE IF NOT EXISTS board(mode TEXT, name TEXT, v REAL, m INTEGER, ts INTEGER, PRIMARY KEY(mode,name))"); q.exec("CREATE TABLE IF NOT EXISTS matches(ts INTEGER, mode TEXT, w TEXT, l TEXT, wd INTEGER, ld INTEGER, t REAL)"); q.exec("CREATE TABLE IF NOT EXISTS ai(id TEXT PRIMARY KEY, agent TEXT, mode TEXT, seed INTEGER, log TEXT, frames INTEGER, over INTEGER, ts INTEGER)"); q.exec("CREATE TABLE IF NOT EXISTS bots(id TEXT PRIMARY KEY, st TEXT, out TEXT, ts INTEGER)"); q.exec("CREATE TABLE IF NOT EXISTS ghosts(id TEXT PRIMARY KEY, agent TEXT, mode TEXT, seed INTEGER, log TEXT, t REAL, m INTEGER, ts INTEGER, UNIQUE(agent,mode))"); q.exec("CREATE TABLE IF NOT EXISTS tally(k TEXT PRIMARY KEY, n REAL)"); q.exec("CREATE TABLE IF NOT EXISTS tfp(k TEXT PRIMARY KEY, name TEXT, h TEXT, save TEXT, devs TEXT, ts INTEGER)"); q.exec("CREATE TABLE IF NOT EXISTS tffeed(ts INTEGER, name TEXT, mode TEXT, v REAL, m INTEGER)"); this._init = 1;
      // one-time: forfeits used to count as wins; they were stored with a 0s time. Take them back off the board.
      if (!q.exec("SELECT n FROM tally WHERE k='mig_forfeits_v1'").toArray().length) {
        for (const r of q.exec("SELECT rowid id, w, l FROM matches WHERE t=0").toArray()) {
          q.exec("UPDATE board SET v=MAX(0,v-1) WHERE mode='wins' AND name=?", r.w); q.exec("UPDATE board SET m=MAX(0,m-1) WHERE mode='wins' AND name=?", r.l);
          q.exec("DELETE FROM matches WHERE rowid=?", r.id);
        }
        q.exec("DELETE FROM board WHERE mode='wins' AND v=0 AND m=0"); q.exec("INSERT INTO tally(k,n) VALUES('mig_forfeits_v1',1)");
      } }
    return q;
  }
  match(w, l, mode, t) {
    if (!w.name || !l.name) return; const d = (a) => Math.max(0, Math.round(((a.x || 220) - 220) / 10));
    this.sql().exec("INSERT INTO matches(ts,mode,w,l,wd,ld,t) VALUES(?,?,?,?,?,?,?)", Date.now(), w.mode || "race", w.name, l.name, d(w), d(l), t || 0);
  }
  rec(name, win) {
    if (!name) return; const q = this.sql(), w = win ? 1 : 0, l = win ? 0 : 1;
    q.exec("INSERT INTO board(mode,name,v,m,ts) VALUES('wins',?,?,?,?) ON CONFLICT(mode,name) DO UPDATE SET v=v+?,m=m+?,ts=?", name, w, l, Date.now(), w, l, Date.now());
  }
  // ── AI agents: the server runs the real game, one decision at a time, and records what actually happened ──
  game(id, row) {
    this.games = this.games || new Map(); let e = this.games.get(id);
    if (!e) {
      const g = createGame(); if (row.mode.startsWith("online:")) { const om = row.mode.slice(7); g.startOnline(row.seed, om, MODE_LEN[om] || 2500); } else g.start(row.mode, row.seed || 0); let f = 0;
      for (const [h, k] of JSON.parse(row.log)) { g.step(!!h, k / 60); f += k; } // deterministic: same seed and inputs, same run
      e = { g, f }; this.games.set(id, e); if (this.games.size > 40) this.games.delete(this.games.keys().next().value);
    }
    return e;
  }
  // ── Thoughtform for AI agents: a server-run, seeded, replay-verified top-down version of the arena ──
  tfgame(row) {
    this.tfgames = this.tfgames || new Map(); let e = this.tfgames.get(row.id);
    if (!e) { const g = createThoughtform(row.seed, row.mode.slice(3)); for (const [a, secs] of JSON.parse(row.log)) g.step(a, secs); e = { g }; this.tfgames.set(row.id, e); if (this.tfgames.size > 40) this.tfgames.delete(this.tfgames.keys().next().value); }
    return e;
  }
  async tfai(req, url) {
    const q = this.sql(), O = url.origin, path = url.pathname.replace("/api/thoughtform/ai", "") || "/";
    const acc = req.headers.get("accept") || "", wantHtml = url.searchParams.get("format") === "html" || (acc.includes("text/html") && !acc.includes("application/json"));
    const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const J = (o, st) => wantHtml
      ? new Response("<!doctype html><html><head><meta charset=utf-8><title>Thoughtform</title></head><body>" + (o.links ? "<h2>Next move: open one link</h2><ul>" + Object.entries(o.links).map(([k, v]) => "<li><a href='" + esc(v) + "'>" + esc(k) + "</a></li>").join("") + "</ul>" : "<h2>" + (o.over ? "Run over" : "Thoughtform") + "</h2>") + "<pre style='white-space:pre-wrap'>" + esc(JSON.stringify(o, null, 1)) + "</pre></body></html>", { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } })
      : new Response(JSON.stringify(o, null, 1), { status: st || 200, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" } });
    const BOARD = { endless: "thoughtform-ai", hard: "thoughtform-ai-hard", blitz: "thoughtform-ai-blitz" };
    if (path === "/" || path === "/spec") {
      if (url.searchParams.get("format") === "text") return new Response(TF_SPEC, { headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" } });
      return new Response("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Thoughtform for AI agents</title></head><body><h1>Thoughtform for AI agents</h1><p>Can only open links? Open one of these to start (change agent=Guest to your name), then keep opening one link from each page.</p><ul>" + Object.keys(BOARD).map((m) => "<li><a href='" + O + "/api/thoughtform/ai/start?agent=Guest&mode=" + m + "&format=html'>Start a " + m + " run</a></li>").join("") + "<li><a href='" + O + "/api/tether/tf-world'>World Board (JSON: every mode, humans and AIs)</a></li></ul><pre style='white-space:pre-wrap;font:14px/1.5 monospace'>" + esc(TF_SPEC) + "</pre></body></html>", { headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*" } });
    }
    let b = req.method === "GET" ? Object.fromEntries(url.searchParams) : {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return J({ error: "send a JSON body" }, 400); } }
    const fmt = wantHtml ? "&format=html" : "";
    const links = (sid, n, o) => { // ready-made moves for agents that can only follow links
      const L = {}, base = O + "/api/thoughtform/ai/act?session=" + sid + "&n=" + n + fmt;
      if (o.insight_choice) { for (const c of o.insight_choice) L["take insight: " + c.name + " (" + c.does + ")"] = base + "&pick=" + c.pick; return L; }
      const t = o.thoughts, near = t[0];
      if (o.critic_ring && /WARNING/.test(o.critic_ring)) L["JUMP the Critic's ring (0.5s)"] = base + "&ability=jump&weapon=quill&seconds=0.5";
      if (near) {
        const away = [o.you.x - near.x, o.you.z - near.z].map((v) => Math.round(v * 10) / 10).join(",");
        if (!o.overheated) {
          for (const e of t.slice(0, 3)) L["quill " + e.kind + " #" + e.id + " (" + e.dist + "m, " + e.hp + "hp), 0.5s"] = base + "&weapon=quill&target=" + e.id + "&seconds=0.5";
          if (near.dist < 12) L["scatter the nearest (" + near.kind + ", " + near.dist + "m), 0.6s"] = base + "&weapon=scatter&target=" + near.id + "&seconds=0.6";
          const big = t.slice().sort((a, c) => t.filter((x) => Math.hypot(x.x - c.x, x.z - c.z) < 5).length - t.filter((x) => Math.hypot(x.x - a.x, x.z - a.z) < 5).length)[0];
          if (big) L["cannon the thickest cluster (around #" + big.id + "), 0.9s"] = base + "&weapon=cannon&target=" + big.id + "&seconds=0.9";
          L["beam through the line toward #" + near.id + ", 0.5s"] = base + "&weapon=beam&target=" + near.id + "&seconds=0.5";
          L["back away from #" + near.id + " while firing the quill, 0.5s"] = base + "&weapon=quill&target=" + near.id + "&move=" + away + "&seconds=0.5";
        }
        if (o.ready.dash) L["DASH away from #" + near.id] = base + "&dash=" + away + "&seconds=0.3";
      }
      if (o.ready.shockwave) L["SHOCKWAVE (hits everything within 9m)"] = base + "&ability=shockwave&seconds=0.3";
      if (o.ready.barrier) L["BARRIER (5s, blocks orbs)"] = base + "&ability=barrier&weapon=quill&seconds=0.5";
      if (o.ready.rewrite) L["REWRITE (slow time 7s, double damage)"] = base + "&ability=rewrite&weapon=quill&seconds=0.5";
      L["let the heat cool, step back toward the centre, 0.5s"] = base + "&move=" + (-o.you.x) + "," + (-o.you.z) + "&seconds=0.5";
      return L;
    };
    if (path === "/start") {
      const agent = String(b.agent || "").replace(/[^\w .'()-]/g, "").trim().slice(0, 22);
      if (!agent) return J({ error: "agent (your name, e.g. \"Grok\") is required" }, 400);
      const mode = TF_MODES[b.mode] ? b.mode : "endless";
      const ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), hr = "t" + ip + Math.floor(Date.now() / 3.6e6);
      const used = q.exec("SELECT n FROM tally WHERE k=?", hr).toArray()[0]; if (used && used.n >= 40) return J({ error: "too many runs this hour" }, 429); this.bump(hr, 1);
      q.exec("DELETE FROM ai WHERE ts<?", Date.now() - 864e5);
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16), seed = (Math.random() * 1e9) | 0, row = { id, mode: "tf:" + mode, seed, log: "[]" };
      q.exec("INSERT INTO ai(id,agent,mode,seed,log,frames,over,ts) VALUES(?,?,?,?,?,0,0,?)", id, "\u{1F916} " + agent, row.mode, seed, "[]", Date.now());
      const o = this.tfgame(row).g.obs();
      return J({ session: id, mode, seed, board: BOARD[mode], how: "Each response has links: open one to play that move for its seconds, then read the new observation. Or GET/POST /api/thoughtform/ai/act with session, n, weapon (quill|scatter|cannon|beam), target (thought id), move=x,z, dash=x,z, ability (shockwave|barrier|rewrite|jump), seconds (0.05-3), pick (0-2, when an insight is offered). Full rules: " + O + "/api/thoughtform/ai", links: links(id, 0, o), observation: o });
    }
    if (path === "/act") {
      const row = q.exec("SELECT * FROM ai WHERE id=? AND mode LIKE 'tf:%'", String(b.session || "")).toArray()[0];
      if (!row) return J({ error: "unknown or expired session" }, 404);
      const e = this.tfgame(row), log = JSON.parse(row.log), mode = row.mode.slice(3);
      if (row.over) return J({ error: "this run is over", observation: e.g.obs() }, 409);
      if (b.n !== undefined && +b.n !== log.length) return J({ note: "That move was already played (links are single-use). Continue from these links.", observation: e.g.obs(), links: links(row.id, log.length, e.g.obs()) });
      const pair = (v) => { if (v == null || v === "") return undefined; const a = Array.isArray(v) ? v : String(v).split(","); const x = +a[0], z = +a[1]; return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : undefined; };
      const a = { weapon: ["quill", "scatter", "cannon", "beam"].includes(b.weapon) ? b.weapon : undefined, target: +b.target || undefined, move: pair(b.move), dash: pair(b.dash), ability: ["shockwave", "barrier", "rewrite", "jump"].includes(b.ability) ? b.ability : undefined, pick: b.pick !== undefined ? Math.max(0, Math.min(2, +b.pick | 0)) : undefined };
      const secs = Math.max(.05, Math.min(3, +b.seconds || .5));
      e.g.step(a, secs); log.push([a, secs]);
      const o = e.g.obs(), over = e.g.over();
      q.exec("UPDATE ai SET log=?, frames=?, over=?, ts=? WHERE id=?", JSON.stringify(log), Math.round(e.g.t * 60), over ? 1 : 0, Date.now(), row.id);
      if (!over) return J({ observation: o, links: links(row.id, log.length, o) });
      const bm = BOARD[mode], v = o.score; let rank = null;
      this.bump("runs", 1); this.bump("d" + new Date().toISOString().slice(0, 10), 1);
      const old = q.exec("SELECT v FROM board WHERE mode=? AND name=?", bm, row.agent).toArray()[0];
      if (v > 0 && (!old || v > old.v)) q.exec("INSERT INTO board(mode,name,v,m,ts) VALUES(?,?,?,?,?) ON CONFLICT(mode,name) DO UPDATE SET v=?,m=?,ts=?", bm, row.agent, v, o.wave, Date.now(), v, o.wave, Date.now());
      if (v > 0) { q.exec("INSERT INTO tffeed(ts,name,mode,v,m) VALUES(?,?,?,?,?)", Date.now(), row.agent, bm, v, o.wave); rank = q.exec("SELECT COUNT(*) c FROM board WHERE mode=? AND v > ?", bm, Math.max(v, old ? old.v : 0)).one().c + 1; }
      this.tfgames.delete(row.id);
      return J({ over: true, final: { score: v, wave: o.wave, kills: o.kills, ended_by: o.ended_by, board: bm, rank, world_board: O + "/api/tether/tf-world" }, observation: o });
    }
    return J({ error: "not found. Start at " + O + "/api/thoughtform/ai" }, 404);
  }
  async ai(req, url) {
    const acc = req.headers.get("accept") || "", wantHtml = url.searchParams.get("format") === "html" || (acc.includes("text/html") && !acc.includes("application/json"));
    const H = (o) => { // a plain page for browse-style tools: the state as text plus real links to click
      const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), L = o.links || {};
      const a = Object.entries(L).map(([k, v]) => "<li><a href='" + esc(v) + "'>" + esc(k.toUpperCase()) + "</a></li>").join("");
      return "<!doctype html><html><head><meta charset=utf-8><title>Tether</title></head><body>" + (a ? "<h2>Next move: open one link</h2><ul>" + a + "</ul>" : "<h2>" + (o.over ? "Run over" : "Tether") + "</h2>") + "<pre style='white-space:pre-wrap'>" + esc(JSON.stringify(o, null, 1)) + "</pre></body></html>";
    };
    const q = this.sql(), J = (o, st) => wantHtml ? new Response(H(o), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } }) : new Response(JSON.stringify(o, null, 1), { status: st || 200, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
    const path = url.pathname.replace("/api/tether/ai", "") || "/";
    if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" } });
    if (path === "/" || path === "/spec") {
      if (url.searchParams.get("format") === "text") return new Response(AI_SPEC, { headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" } });
      const esc = AI_SPEC.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return new Response("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Tether for AI agents</title></head><body><h1>Tether for AI agents</h1><p>AI assistants that can only open links: open one of these to start a run, then keep opening the hold or release link from each response.</p><ul>" + ["classic", "sprint", "trial", "moon"].map((m) => "<li><a href='" + url.origin + "/api/tether/ai/start?agent=Guest&mode=" + m + "'>Start a " + m + " run</a> (change agent=Guest to your name)</li>").join("") + "<li><a href='" + url.origin + "/api/tether/ai/ghost/start?agent=Guest&mode=dash'>Record a dash replay for humans to race</a></li></ul><pre style='white-space:pre-wrap;font:14px/1.5 monospace'>" + esc + "</pre></body></html>", { headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*" } });
    }
    const O = url.origin, link = (sid, n, secs) => ({ hold: O + "/api/tether/ai/act?session=" + sid + "&n=" + (n || 0) + "&hold=1&seconds=" + (secs || .25), release: O + "/api/tether/ai/act?session=" + sid + "&n=" + (n || 0) + "&hold=0&seconds=" + (secs || .25) });
    const AIM = ["classic", "hard", "moon", "sprint", "rush", "gauntlet", "zen", "trial"];
    const tf = (v) => v === true || v === 1 || v === "1" || v === "true" || v === "yes";
    let b = req.method === "GET" ? Object.fromEntries(url.searchParams) : {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return J({ error: "send a JSON body" }, 400); } }
    if (path === "/start") {
      const agent = String(b.agent || "").replace(/[^\w .'()-]/g, "").trim().slice(0, 22);
      if (!agent) return J({ error: "agent (your name, e.g. \"Grok\") is required" }, 400);
      const mode = AIM.includes(b.mode) ? b.mode : "classic";
      const ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), hr = "s" + ip + Math.floor(Date.now() / 3.6e6);
      const used = q.exec("SELECT n FROM tally WHERE k=?", hr).toArray()[0]; if (used && used.n >= 60) return J({ error: "too many sessions this hour" }, 429); this.bump(hr, 1);
      q.exec("DELETE FROM ai WHERE ts<?", Date.now() - 864e5);
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16), seed = mode === "trial" ? 0 : (+b.seed | 0) || ((Math.random() * 1e9) | 0);
      const row = { mode, seed, log: "[]" }; q.exec("INSERT INTO ai(id,agent,mode,seed,log,frames,over,ts) VALUES(?,?,?,?,?,0,0,?)", id, "\u{1F916} " + agent, mode, seed, "[]", Date.now());
      const e = this.game(id, row);
      return J({ session: id, mode, seed, how: "Call one of the links below to advance the game (GET or POST both work). hold = keep the rope / grab the next anchor; release = let go and fly. Change seconds= in the URL for longer or shorter steps.", links: link(id), observation: e.g.obs() });
    }
    if (path === "/act") {
      const row = q.exec("SELECT * FROM ai WHERE id=?", String(b.session || "")).toArray()[0];
      if (!row) return J({ error: "unknown or expired session" }, 404);
      const e = this.game(row.id, row);
      if (row.over) return J({ error: "this run is over", observation: e.g.obs() }, 409);
      if (b.n !== undefined && +b.n !== e.f) return J({ note: "That step was already played (links are single-use). Continue from these links.", observation: e.g.obs(), links: link(row.id, e.f) });
      const hold = tf(b.hold), secs = Math.max(1 / 60, Math.min(3, +b.seconds || .25)), k = e.g.step(hold, secs); e.f += k;
      const log = JSON.parse(row.log); log.push([hold ? 1 : 0, k]);
      let o = e.g.obs(), over = e.g.over();
      if (!over && e.f >= 60 * 60 * 8) { over = true; o.why = "TIME LIMIT (8 minutes)"; }
      q.exec("UPDATE ai SET log=?, frames=?, over=?, ts=? WHERE id=?", JSON.stringify(log), e.f, over ? 1 : 0, Date.now(), row.id);
      if (over && row.mode.startsWith("online:")) {
        const om = row.mode.slice(7); let saved = false;
        if (o.finished) { const old = q.exec("SELECT t FROM ghosts WHERE agent=? AND mode=?", row.agent, om).toArray()[0]; if (!old || o.time < old.t) { q.exec("INSERT INTO ghosts(id,agent,mode,seed,log,t,m,ts) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(agent,mode) DO UPDATE SET id=?,seed=?,log=?,t=?,m=?,ts=?", row.id, row.agent, om, row.seed, JSON.stringify(log), o.time, o.metres, Date.now(), row.id, row.seed, JSON.stringify(log), o.time, o.metres, Date.now()); saved = true; } }
        this.games && this.games.delete(row.id);
        return J({ over: true, final: { finished: !!o.finished, time: o.time, metres: o.metres, replay_saved: saved, note: o.finished ? (saved ? "Saved: humans can now race this replay." : "Finished, but you already have a faster replay for this mode.") : "You did not reach the finish line, so nothing was saved." }, observation: o });
      }
      if (over) {
        o.over = true; const m = o.metres, mode = row.mode, v = mode === "sprint" ? m : mode === "trial" ? (o.finished ? o.time : 0) : o.score;
        let rank = null;
        {
          const asc = mode === "trial", old = q.exec("SELECT v FROM board WHERE mode=? AND name=?", mode, row.agent).toArray()[0];
          this.bump("runs", 1); this.bump("metres", m); this.bump("d" + new Date().toISOString().slice(0, 10), 1);
          if (v > 0 && (!old || (asc ? v < old.v : v > old.v))) q.exec("INSERT INTO board(mode,name,v,m,ts) VALUES(?,?,?,?,?) ON CONFLICT(mode,name) DO UPDATE SET v=?,m=?,ts=?", mode, row.agent, v, m, Date.now(), v, m, Date.now());
          if (v > 0) { const mine = q.exec("SELECT v FROM board WHERE mode=? AND name=?", mode, row.agent).one().v; rank = q.exec("SELECT COUNT(*) c FROM board WHERE mode=? AND v " + (asc ? "<" : ">") + " ?", mode, mine).one().c + 1; }
        }
        this.games && this.games.delete(row.id);
        return J({ over: true, final: { metres: m, score: o.score, time: o.time, finished: o.finished, ended_by: o.why, leaderboard_value: v, rank }, observation: o });
      }
      return J({ observation: o, links: link(row.id, e.f) });
    }
    if (path === "/ghost/start") {
      const agent = String(b.agent || "").replace(/[^\w .'()-]/g, "").trim().slice(0, 22);
      if (!agent) return J({ error: "agent (your name) is required" }, 400);
      const om = MODE_LEN[b.mode] ? b.mode : "race";
      const ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), hr = "s" + ip + Math.floor(Date.now() / 3.6e6);
      const used = q.exec("SELECT n FROM tally WHERE k=?", hr).toArray()[0]; if (used && used.n >= 60) return J({ error: "too many sessions this hour" }, 429); this.bump(hr, 1);
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16), seed = (Math.random() * 1e9) | 0;
      q.exec("INSERT INTO ai(id,agent,mode,seed,log,frames,over,ts) VALUES(?,?,?,?,?,0,0,?)", id, "\u{1F916} " + agent, "online:" + om, seed, "[]", Date.now());
      return J({ session: id, mode: om, length_m: MODE_LEN[om], seed, how: "Play it with the links in the response (or POST /api/tether/ai/act {session, hold, seconds}). Cross the finish line and your run is saved as a replay that humans can race.", links: link(id), observation: this.game(id, { mode: "online:" + om, seed, log: "[]" }).g.obs() });
    }
    // ── online play for AI agents: join the lobby, accept or send challenges, race a human on the same seed ──
    if (path.startsWith("/lobby/") || path.startsWith("/match/")) {
      const token = String(b.bot || url.searchParams.get("bot") || ""), JOIN = path === "/lobby/join";
      let row = JOIN ? null : this.botRow(token);
      if (!JOIN && !row) return J({ error: "unknown or expired bot. POST /api/tether/ai/lobby/join again (bots expire after 10 minutes without polling)." }, 404);
      const self = { bot: true, id: token };
      if (!JOIN) q.exec("UPDATE bots SET ts=? WHERE id=?", Date.now(), token);
      const arm = () => this.ctx.storage.setAlarm(Date.now() + 8000);
      if (JOIN) {
        const agent = String(b.agent || "").replace(/[^\w .'()-]/g, "").trim().slice(0, 16);
        if (!agent) return J({ error: "agent (your name) is required" }, 400);
        const ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), hr = "s" + ip + Math.floor(Date.now() / 3.6e6);
        const used = q.exec("SELECT n FROM tally WHERE k=?", hr).toArray()[0]; if (used && used.n >= 60) return J({ error: "too many sessions this hour" }, 429); this.bump(hr, 1);
        const name = "\u{1F916} " + agent; q.exec("DELETE FROM bots WHERE json_extract(st,'$.name')=?", name);
        const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20), pid = "b" + id.slice(0, 7), color = /^#[0-9a-f]{3,8}$/i.test(b.color || "") ? b.color : "#c77dff", trail = String(b.trail || "ribbon").slice(0, 16);
        q.exec("INSERT INTO bots(id,st,out,ts) VALUES(?,?,?,?)", id, JSON.stringify({ id: pid, name, status: "idle", look: { color, trail } }), "[]", Date.now());
        this.lobby(); await arm();
        return J({ bot: id, you: { id: pid, name }, links: { poll: O + "/api/tether/ai/lobby/poll?bot=" + id }, next: "POST /api/tether/ai/lobby/poll {bot} about every 2s (stay under 10 minutes between polls). Challenge people with /lobby/invite, accept with /lobby/respond." });
      }
      let st = JSON.parse(row.st);
      if (path === "/lobby/leave") { this.endMatch(self, "left"); q.exec("DELETE FROM bots WHERE id=?", token); this.lobby(); return J({ ok: true }); }
      if (path === "/lobby/invite") { const ok = this.doInvite(self, st, { to: String(b.to || ""), mode: b.mode }); return J({ ok, note: ok ? "challenge sent; poll for the match event" : "they are busy or gone" }); }
      if (path === "/lobby/respond") { this.doRespond(self, st, { from: String(b.from || ""), accept: tf(b.accept) }); return J({ ok: true, note: "poll to see the match event" }); }
      if (path === "/lobby/poll") {
        await arm(); const events = JSON.parse(row.out); q.exec("UPDATE bots SET out='[]' WHERE id=?", token);
        const players = this.socks().map((x) => this.me(x)).filter((x) => x.name).concat(this.bots().map((x) => x.st)).filter((x) => x.id !== st.id).map((x) => ({ id: x.id, name: x.name, status: x.status }));
        st = this.me(self); const h = st.opp && this.find(st.opp), hs = h && this.me(h);
        return J({ you: { id: st.id, name: st.name, status: st.status }, links: st.match ? { act_hold: O + "/api/tether/ai/match/act?bot=" + token + "&hold=1&seconds=0.25", act_release: O + "/api/tether/ai/match/act?bot=" + token + "&hold=0&seconds=0.25", poll: O + "/api/tether/ai/lobby/poll?bot=" + token } : { poll: O + "/api/tether/ai/lobby/poll?bot=" + token }, players, events, match: st.match ? { id: st.match, mode: st.mode, seed: st.seed, length_m: MODE_LEN[st.mode], opponent: hs && { id: hs.id, name: hs.name, metres: Math.max(0, Math.round(((hs.x || 220) - 220) / 10)) }, raceStarted: !!st.t0 && Date.now() >= st.t0, startsInMs: st.t0 ? Math.max(0, st.t0 - Date.now()) : null } : null });
      }
      if (path === "/match/forfeit") { this.endMatch(self, "left"); this.set(self, { status: "idle", match: null, opp: null }); this.lobby(); return J({ ok: true }); }
      if (path === "/match/act") {
        if (!st.match || st.status !== "racing") return J({ error: "you are not in a match" }, 409);
        if (!st.t0) return J({ error: "the human has not pressed READY yet; keep polling" }, 409);
        if (Date.now() < st.t0) return J({ error: "countdown still running", startsInMs: st.t0 - Date.now() }, 409);
        const h = this.find(st.opp), hs = h && this.me(h); if (!hs || hs.match !== st.match) return J({ over: true, error: "the match ended", events: JSON.parse((this.botRow(token) || { out: "[]" }).out) }, 409);
        const gid = token + ":" + st.match; let gr = q.exec("SELECT * FROM ai WHERE id=?", gid).toArray()[0];
        if (!gr) { q.exec("INSERT INTO ai(id,agent,mode,seed,log,frames,over,ts) VALUES(?,?,?,?,?,0,0,?)", gid, st.name, "online:" + st.mode, st.seed, "[]", Date.now()); gr = q.exec("SELECT * FROM ai WHERE id=?", gid).toArray()[0]; }
        const e = this.game(gid, gr);
        if (gr.over) return J({ error: "you already finished; wait for the result", observation: e.g.obs() }, 409);
        const hold = tf(b.hold), secs = Math.max(1 / 60, Math.min(3, +b.seconds || .25)), k = e.g.step(hold, secs); e.f += k;
        const log = JSON.parse(gr.log); log.push([hold ? 1 : 0, k]);
        const o = e.g.obs(), fin = e.g.over() && o.finished;
        q.exec("UPDATE ai SET log=?, frames=?, over=?, ts=? WHERE id=?", JSON.stringify(log), e.f, fin ? 1 : 0, Date.now(), gid);
        // the human watches your ball move: replay the samples of this step at about 15 per second
        (e.g.samples || []).slice(0, 45).forEach((p, i) => setTimeout(() => this.send(h, { t: "opp", x: p.x, y: p.y, hx: p.hx, hy: p.hy, a: p.a }), i * 66));
        this.set(self, { x: o.you.x });
        const opp = { metres: Math.max(0, Math.round(((hs.x || 220) - 220) / 10)), finished: hs.fin != null, time: hs.fin };
        await arm();
        if (fin) {
          this.set(self, { fin: o.time, dl: st.t0 + o.time * 1000 + 2500 });
          if (hs.fin != null) { this.decide(h, self, hs.fin < o.time, hs.fin, o.time); return J({ over: true, you_won: o.time <= hs.fin, final: { time: o.time, opponent_time: hs.fin }, observation: o }); }
          return J({ finished: true, note: "You crossed the line first by the game clock. The human wins only if they finish in less than " + o.time + "s; you will get a result event on poll.", observation: o, opponent: opp });
        }
        if (hs.fin != null && o.time > hs.fin) { this.decide(h, self, true, hs.fin, null); return J({ over: true, you_won: false, final: { opponent_time: hs.fin }, observation: o }); }
        return J({ observation: o, opponent: opp });
      }
    }
    return J({ error: "not found. GET /api/tether/ai for the guide." }, 404);
  }
  bump(k, n) { this.sql().exec("INSERT INTO tally(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=n+?", k, n, n); }
  // Thoughtform player files: a name, a code to unlock it on any device, the synced save, and the devices that use it
  async tfAcct(req, J) {
    const q = this.sql(); let b; try { b = await req.json(); } catch (e) { return J({ error: "bad request" }); }
    const name = String(b.name || "").replace(/[^\w .'-]/g, "").trim().slice(0, 16), k = name.toLowerCase(); if (!name) return J({ error: "pick a name" });
    const row = q.exec("SELECT * FROM tfp WHERE k=?", k).toArray()[0], now = Date.now();
    const dev = String(b.dev || "").replace(/[^\w-]/g, "").slice(0, 24), dn = String(b.dn || "").replace(/[^\w .·()/-]/g, "").slice(0, 40);
    if (b.op === "register") {
      if (row) return J({ error: "that name already has a player file" });
      const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(8)); let code = ""; for (const x of r) code += A[x % A.length];
      const devs = dev ? { [dev]: { n: dn, ts: now } } : {};
      q.exec("INSERT INTO tfp(k,name,h,save,devs,ts) VALUES(?,?,?,?,?,?)", k, name, await tfHash(name, code), b.save ? JSON.stringify(b.save).slice(0, 60000) : null, JSON.stringify(devs), now);
      return J({ ok: true, name, code: code.slice(0, 4) + "-" + code.slice(4), devs });
    }
    if (!row || row.h !== (await tfHash(name, b.code))) { await new Promise((r) => setTimeout(r, 400)); return J({ error: "that name and code do not match" }); }
    const devs = JSON.parse(row.devs || "{}"); if (dev) devs[dev] = { n: dn || (devs[dev] || {}).n || "device", ts: now };
    if (b.op === "forget") delete devs[String(b.target || "")];
    const keep = Object.entries(devs).sort((a, c) => c[1].ts - a[1].ts).slice(0, 12), dv = Object.fromEntries(keep);
    if (b.op === "save") { const t = JSON.stringify(b.save || {}); if (t.length > 60000) return J({ error: "save too big" }); q.exec("UPDATE tfp SET save=?, devs=?, ts=? WHERE k=?", t, JSON.stringify(dv), now, k); return J({ ok: true, ts: now, devs: dv }); }
    q.exec("UPDATE tfp SET devs=? WHERE k=?", JSON.stringify(dv), k);
    return J({ ok: true, name: row.name, save: row.save ? JSON.parse(row.save) : null, ts: row.ts, devs: dv });
  }
  tfWorld(url, J, MODES) {
    const q = this.sql(), me = String(url.searchParams.get("name") || "").trim().slice(0, 16), out = {};
    for (const mode of MODES.filter((m) => m.startsWith("thoughtform"))) {
      const top = q.exec("SELECT name,v,m FROM board WHERE mode=? ORDER BY v DESC, ts ASC LIMIT 10", mode).toArray(), n = q.exec("SELECT COUNT(*) c FROM board WHERE mode=?", mode).one().c;
      const mine = me && q.exec("SELECT v,m FROM board WHERE mode=? AND name=? COLLATE NOCASE", mode, me).toArray()[0];
      out[mode] = { top, n, me: mine ? { v: mine.v, m: mine.m, rank: q.exec("SELECT COUNT(*) c FROM board WHERE mode=? AND v > ?", mode, mine.v).one().c + 1 } : null };
    }
    return J({ modes: out, feed: q.exec("SELECT ts,name,mode,v,m FROM tffeed ORDER BY ts DESC LIMIT 14").toArray(), players: q.exec("SELECT COUNT(DISTINCT name) c FROM board WHERE mode LIKE 'thoughtform%'").one().c, files: q.exec("SELECT COUNT(*) c FROM tfp").one().c, now: Date.now() });
  }
  async api(req, url) {
    const q = this.sql(), J = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    const ASC = { trial: 1 }, MODES = ["classic", "hard", "rush", "gauntlet", "moon", "sprint", "zen", "trial", "wins", "thoughtform", "thoughtform-hard", "thoughtform-boss", "thoughtform-coop", "thoughtform-blitz", "thoughtform-glass", "thoughtform-horde", "thoughtform-ai", "thoughtform-ai-hard", "thoughtform-ai-blitz"];
    if (url.pathname.endsWith("/tf-acct") && req.method === "POST") return this.tfAcct(req, J);
    if (url.pathname.endsWith("/tf-world")) return this.tfWorld(url, J, MODES);
    if (url.pathname.endsWith("/stats")) {
      const day = new Date().toISOString().slice(0, 10), t = {};
      for (const r of q.exec("SELECT k,n FROM tally").toArray()) t[r.k] = r.n;
      const socks = this.socks().map((s) => this.me(s)).filter((a) => a.name).concat(this.bots().map((x) => x.st));
      return J({ online: socks.length, racing: socks.filter((a) => a.status === "racing").length, runs: t.runs || 0, metres: t.metres || 0, today: t["d" + day] || 0, players: q.exec("SELECT COUNT(DISTINCT name) c FROM board").one().c, bestm: t.bestm || 0 });
    }
    if (url.pathname.endsWith("/ghosts")) {
      const rows = q.exec("SELECT id,agent name,mode,t time,ts FROM ghosts ORDER BY ts DESC LIMIT 14").toArray().map((r) => ({ ...r, len: MODE_LEN[r.mode] }));
      return J({ rows });
    }
    if (url.pathname.endsWith("/ghost")) {
      const r = q.exec("SELECT * FROM ghosts WHERE id=?", url.searchParams.get("id") || "").toArray()[0]; if (!r) return J({ error: "gone" });
      const g = createGame(); g.startOnline(r.seed, r.mode, MODE_LEN[r.mode] || 2500); const S = [];
      for (const [h, k] of JSON.parse(r.log)) { g.step(!!h, k / 60); for (const p of g.samples) S.push([p.t, p.x, p.y, p.hx, p.hy, p.a ? 1 : 0]); }
      return J({ id: r.id, name: r.agent, mode: r.mode, seed: r.seed, len: MODE_LEN[r.mode], time: r.t, samples: S });
    }
    if (url.pathname.endsWith("/ghost-result") && req.method === "POST") {
      let b; try { b = await req.json(); } catch (e) { return J({ ok: false }); }
      const r = q.exec("SELECT agent,mode,t FROM ghosts WHERE id=?", String(b.id || "")).toArray()[0], name = String(b.name || "").replace(/[^\w .'-]/g, "").trim().slice(0, 16);
      if (!r || !name) return J({ ok: false }); const win = !!b.win, m = Math.max(0, Math.min(6000, Math.round(+b.m) || 0));
      this.rec(name, win); this.rec(r.agent, !win);
      this.match(win ? { name, x: 220 + m * 10, mode: r.mode } : { name: r.agent, x: 220 + (MODE_LEN[r.mode] || 2500) * 10, mode: r.mode }, win ? { name: r.agent, x: 220 + (MODE_LEN[r.mode] || 2500) * 10 } : { name, x: 220 + m * 10 }, 0, win ? +b.time || 0 : r.t);
      return J({ ok: true });
    }
    if (url.pathname.endsWith("/board")) {
      const mode = MODES.includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "classic";
      const kind = url.searchParams.get("kind"), kf = kind === "ai" ? " AND name LIKE '\u{1F916}%'" : kind === "human" ? " AND name NOT LIKE '\u{1F916}%'" : "";
      const rows = q.exec("SELECT name,v,m FROM board WHERE mode=?" + kf + " ORDER BY v " + (ASC[mode] ? "ASC" : "DESC") + ", ts ASC LIMIT 25", mode).toArray();
      const recent = mode === "wins" ? q.exec("SELECT ts,mode,w,l,wd,ld,t FROM matches ORDER BY ts DESC LIMIT 10").toArray() : undefined;
      return J({ mode, rows, recent });
    }
    if (url.pathname.endsWith("/score") && req.method === "POST") {
      let b; try { b = await req.json(); } catch (e) { return J({ ok: false }); }
      const mode = String(b.mode || ""), v = +b.v, m = Math.max(0, Math.min(60000, Math.round(+b.m) || 0));
      if ((!MODES.includes(mode) && mode !== "other") || mode === "wins") return J({ ok: false });
      if (!(v >= 0) || v > 5e6) return J({ ok: false });
      this.bump("runs", 1); this.bump("metres", m); this.bump("d" + new Date().toISOString().slice(0, 10), 1);
      const cur = q.exec("SELECT n FROM tally WHERE k='bestm'").toArray()[0]; if (!cur || m > cur.n) q.exec("INSERT INTO tally(k,n) VALUES('bestm',?) ON CONFLICT(k) DO UPDATE SET n=?", m, m);
      const name = String(b.name || "").replace(/[^\w .'-]/g, "").trim().slice(0, 16);
      if (name && mode.startsWith("thoughtform")) { // a claimed Thoughtform name only posts with its player code
        const acct = q.exec("SELECT h FROM tfp WHERE k=?", name.toLowerCase()).toArray()[0];
        if (acct && acct.h !== (await tfHash(name, b.code))) return J({ ok: false, error: "claimed" });
        q.exec("INSERT INTO tffeed(ts,name,mode,v,m) VALUES(?,?,?,?,?)", Date.now(), name, mode, v, m); q.exec("DELETE FROM tffeed WHERE ts < (SELECT MIN(ts) FROM (SELECT ts FROM tffeed ORDER BY ts DESC LIMIT 60))");
      }
      let rank = null;
      if (name && MODES.includes(mode) && (!ASC[mode] || v > 0)) {
        const old = q.exec("SELECT v FROM board WHERE mode=? AND name=?", mode, name).toArray()[0];
        if (!old || (ASC[mode] ? v < old.v : v > old.v)) q.exec("INSERT INTO board(mode,name,v,m,ts) VALUES(?,?,?,?,?) ON CONFLICT(mode,name) DO UPDATE SET v=?,m=?,ts=?", mode, name, v, m, Date.now(), v, m, Date.now());
        const mine = q.exec("SELECT v FROM board WHERE mode=? AND name=?", mode, name).one().v;
        rank = q.exec("SELECT COUNT(*) c FROM board WHERE mode=? AND v " + (ASC[mode] ? "<" : ">") + " ?", mode, mine).one().c + 1;
      }
      return J({ ok: true, rank });
    }
    return new Response("not found", { status: 404 });
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/tether/ai")) return this.ai(req, url);
    if (url.pathname.startsWith("/api/thoughtform/ai")) return this.tfai(req, url);
    if (url.pathname.startsWith("/api/tether/")) return this.api(req, url);
    if (req.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ id: crypto.randomUUID().slice(0, 8), name: "", status: "new" });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  socks() { return this.ctx.getWebSockets(); }
  // AI agents sit in the lobby as virtual players (rows in `bots`); they look like sockets to the lobby logic below
  botRow(token) { return this.sql().exec("SELECT id,st,out,ts FROM bots WHERE id=?", token).toArray()[0]; }
  me(ws) { if (ws.bot) { const r = this.botRow(ws.id); return r ? JSON.parse(r.st) : {}; } return ws.deserializeAttachment() || {}; }
  set(ws, patch) { const a = Object.assign(this.me(ws), patch); if (ws.bot) this.sql().exec("UPDATE bots SET st=? WHERE id=?", JSON.stringify(a), ws.id); else ws.serializeAttachment(a); return a; }
  find(id) {
    const s = this.socks().find((x) => this.me(x).id === id); if (s) return s;
    const r = this.sql().exec("SELECT id FROM bots WHERE json_extract(st,'$.id')=?", id).toArray()[0]; return r ? { bot: true, id: r.id } : undefined;
  }
  send(ws, msg) {
    if (ws.bot) { if (msg.t === "opp" || msg.t === "lobby") return; const r = this.botRow(ws.id); if (!r) return; const out = JSON.parse(r.out); out.push(msg); this.sql().exec("UPDATE bots SET out=? WHERE id=?", JSON.stringify(out.slice(-30)), ws.id); return; }
    try { ws.send(JSON.stringify(msg)); } catch (e) {}
  }
  bots() { return this.sql().exec("SELECT id,st FROM bots").toArray().map((r) => ({ bot: true, id: r.id, st: JSON.parse(r.st) })); }
  lobby() {
    const players = this.socks().map((s) => this.me(s)).filter((a) => a.name).concat(this.bots().map((b) => b.st)).map((a) => ({ id: a.id, name: a.name, status: a.status }));
    for (const s of this.socks()) if (this.me(s).name) this.send(s, { t: "lobby", players });
  }
  async alarm() {
    const q = this.sql(), now = Date.now();
    for (const b of this.bots()) {
      const a = b.st, row = this.botRow(b.id), idle = now - row.ts;
      if (a.status === "racing") {
        const h = a.opp && this.find(a.opp);
        if (!h || this.me(h).match !== a.match) { this.set(b, { status: "idle", match: null, opp: null }); continue; }
        if (a.fin != null && a.dl && now > a.dl && this.me(h).fin == null) { this.decide(h, b, false, null, a.fin); continue; } // they finished, the human never did
        if (idle > 360000) { this.endMatch(b, "left"); q.exec("DELETE FROM bots WHERE id=?", b.id); }
      } else if (idle > 600000) q.exec("DELETE FROM bots WHERE id=?", b.id);
    }
    this.lobby();
    if (this.bots().length) await this.ctx.storage.setAlarm(Date.now() + 8000);
  }
  // a human and an AI have both reported (or the clock decided): settle the match
  decide(hw, bot, humanWins, tH, tB) {
    const h = this.me(hw), b = this.me(bot);
    this.rec(humanWins ? h.name : b.name, true); this.rec(humanWins ? b.name : h.name, false);
    this.match(humanWins ? { ...h, x: h.x || 220 } : { ...b, x: b.x || 220 }, humanWins ? b : h, 0, humanWins ? tH : tB);
    this.send(hw, { t: "result", win: humanWins, time: humanWins ? tH : tB, by: b.name }); this.send(bot, { t: "result", win: !humanWins, time: humanWins ? tH : tB, by: h.name });
    for (const s of [hw, bot]) this.set(s, { status: "idle", match: null, opp: null, ready: false, fin: null, dl: null });
    this.lobby();
  }
  endMatch(ws, why) {
    const a = this.me(ws); if (!a.opp) return;
    const o = this.find(a.opp);
    if (o && this.me(o).match === a.match) { this.send(o, { t: "result", win: true, why }); this.set(o, { status: "idle", match: null, opp: null, ready: false, fin: null }); }
  }
  doInvite(ws, a, m) {
    const o = this.find(m.to), b = o && this.me(o);
    if (!b || b.status !== "idle" || a.status !== "idle" || b.id === a.id) { this.send(ws, { t: "busy", to: m.to }); return false; }
    const om = MODE_LEN[m.mode] ? m.mode : "race"; this.set(ws, { invMode: om }); this.send(o, { t: "invited", from: a.id, name: a.name, mode: om }); this.send(ws, { t: "pending", to: b.id, name: b.name }); return true;
  }
  doRespond(ws, a, m) {
    const o = this.find(m.from), b = o && this.me(o);
    if (!b) return this.send(ws, { t: "gone" });
    if (!m.accept) return this.send(o, { t: "declined", by: a.name });
    if (a.status !== "idle" || b.status !== "idle") return this.send(ws, { t: "busy", to: b.id });
    const match = crypto.randomUUID().slice(0, 8), seed = (Math.random() * 1e9) | 0;
    this.set(ws, { status: "racing", match, opp: b.id, ready: false, fin: null, dl: null, seed }); this.set(o, { status: "racing", match, opp: a.id, ready: false, fin: null, dl: null, seed });
    const om = b.invMode || "race"; this.set(ws, { mode: om }); this.set(o, { mode: om }); const len = MODE_LEN[om] || 2500;
    this.send(ws, { t: "match", seed, len, mode: om, opp: { id: b.id, name: b.name } }); this.send(o, { t: "match", seed, len, mode: om, opp: { id: a.id, name: a.name } });
    for (const [x, y] of [[ws, o], [o, ws]]) if (x.bot) { this.set(x, { ready: true }); const l = this.me(x).look || {}; this.send(y, { t: "opppick", color: l.color, trail: l.trail }); this.send(y, { t: "oppready" }); } // an AI needs no customisation phase
    return this.lobby();
  }
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const a = this.me(ws);
    if (m.t === "hello") { const name = String(m.name || "").replace(/[^\w .'-]/g, "").trim().slice(0, 16) || "Player"; this.set(ws, { name, status: "idle" }); this.send(ws, { t: "welcome", id: a.id }); return this.lobby(); }
    if (!a.name) return;
    if (m.t === "invite") { this.doInvite(ws, a, m); return; }
    if (m.t === "cancel") { const o = this.find(m.to); if (o) this.send(o, { t: "withdrawn", from: a.id }); return; }
    if (m.t === "respond") return this.doRespond(ws, a, m);
    const o = a.opp && this.find(a.opp); if (!o || this.me(o).match !== a.match) return;
    if (m.t === "rel") return this.send(o, { t: "rel", d: m.d }); // co-op games relay their own state between the pair
    if (m.t === "pick") return this.send(o, { t: "opppick", color: String(m.color || "").slice(0, 32), trail: String(m.trail || "").slice(0, 16) });
    if (m.t === "ready") { this.set(ws, { ready: true }); this.send(o, { t: "oppready" }); if (this.me(o).ready) { const wait = o.bot || ws.bot ? 45000 : 3200, t0 = Date.now() + wait, go = { t: "start", in: wait }; this.set(ws, { t0 }); this.set(o, { t0 }); this.send(ws, go); this.send(o, go); } return; }
    if (m.t === "st") { this.set(ws, { x: +m.x || 0 }); } if (m.t === "st") return this.send(o, { t: "opp", x: +m.x || 0, y: +m.y || 0, hx: m.hx == null ? null : +m.hx, hy: m.hy == null ? null : +m.hy, a: !!m.a });
    if (m.t === "fin") {
      if (this.me(o).fin != null && !o.bot) return;
      if (o.bot) { // an AI plays at its own pace, so the clock (game time) decides, not who clicked first
        const ob = this.me(o), tH = +m.time || 0; this.set(ws, { fin: tH, x: Math.max(a.x || 0, +m.x || 0) });
        if (ob.fin != null) return this.decide(ws, o, tH < ob.fin, tH, ob.fin);
        this.send(ws, { t: "wait", who: ob.name }); return;
      }
      this.set(ws, { fin: +m.time || 0 });
      this.rec(a.name, true); this.rec(this.me(o).name, false); this.match({ ...a, x: Math.max(a.x || 0, +m.x || 0) }, this.me(o), 0, +m.time); this.send(ws, { t: "result", win: true, time: +m.time }); this.send(o, { t: "result", win: false, time: +m.time, by: a.name });
      for (const s of [ws, o]) this.set(s, { status: "idle", match: null, opp: null, ready: false, fin: null });
      return this.lobby();
    }
    if (m.t === "leave") { this.endMatch(ws, "left"); this.set(ws, { status: "idle", match: null, opp: null, ready: false }); return this.lobby(); }
  }
  async webSocketClose(ws) { this.endMatch(ws, "left"); this.set(ws, { name: "" }); try { ws.close(); } catch (e) {} this.lobby(); }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}
