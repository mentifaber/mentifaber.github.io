// mentifaber.org Worker: serves the static site (the ASSETS binding) and adds
//   - server-checked logins for the sealed pages: the encrypted page body is
//     only sent to a browser holding a session from POST /api/login
//   - cloud saves (GET/PUT/DELETE /api/save/<app>) for signed-in apps
//   - a cloud photo album (/api/photos/<app>[/<t>]) for Flutterbloom
//   - notes for Flutterbloom (/api/notes/flutterbloom): read with her session,
//     written from garden-notes.html with the Vigil (owner) session
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
};
const PAGES = { "/vigil-app": "vigil", "/flutterbloom": "flutterbloom", "/muse-live": "muse", "/weaver-live": "weaver" };
const SAVES = new Set(["flutterbloom"]);
const SESSION_DAYS = 180;
const MAX_SAVE = 512 * 1024;
const MAX_PHOTO = 1.5 * 1024 * 1024, MAX_PHOTOS = 60;
const LOGIN_LIMIT = 10, LOGIN_WINDOW = 15 * 60 * 1000;

export class Store extends DurableObject {
  async getSession(token) {
    const s = await this.ctx.storage.get("s:" + token);
    if (!s) return null;
    if (s.exp < Date.now()) { await this.ctx.storage.delete("s:" + token); return null; }
    return s;
  }
  async putSession(token, app) {
    await this.ctx.storage.put("s:" + token, { app, exp: Date.now() + SESSION_DAYS * 864e5 });
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
  const token = cookie(req, "mf_" + app);
  if (!token) return null;
  const s = await store(env).getSession(token);
  return s && s.app === app ? token : null;
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
  if (!sameHex(given, VERIFIERS[app])) return json({ error: "wrong" }, 401);
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await store(env).putSession(token, app);
  return json({ ok: true }, 200, {
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
      return json({ error: "not found" }, 404);
    }
    const app = PAGES[path.replace(/\.html$/, "").replace(/\/$/, "")];
    if (app && (req.method === "GET" || req.method === "HEAD")) return sealedPage(req, env, app);
    return env.ASSETS.fetch(req);
  },
};
