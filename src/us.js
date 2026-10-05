// Barycenter ("us"): a private two-person space. Every message is encrypted in the browser with a key only the
// two people hold (it lives wrapped under each person's password), so this file only ever sees sealed bytes
// plus the little a server must know: who sent it, when, how urgent, and when a capsule may open.
//
// Storage is the Store Durable Object's key-value space, under "us:":
//   cfg               { users:[a,b], names:{a:"…",b:"…"} }        acct:<user> { v, wrap }   inv { hash, forUser, by, exp }
//   m:<ts>-<rnd>      one sealed message { from, ts, lvl, unlock, ct, iv, blob, dl, rd, ak }
//   ev:<ts>-<rnd>     the change feed both phones poll: new / dl (arrived) / rd (seen) / ak (answered) / del
//   due:<unlock>:<id> capsules waiting for their moment        esc:<id> alerts that repeat until answered
//   sub:<hash>        Web Push subscriptions                    seen:<user> last time each person had the app open
//   b:<id>            encrypted attachments (photos, voice)

const P = "us:";
const pad = (n) => String(Math.floor(n)).padStart(13, "0");
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const slug = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
const cleanName = (n) => String(n || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 24);
const HEX64 = /^[a-f0-9]{64}$/, B64 = /^[A-Za-z0-9+/=_-]+$/;
// lvl 1 "loud": a high-urgency push, then two reminders if unread. lvl 2 "SOS": every 45s until she taps "I'm here".
const ESC = { 1: { max: 2, every: 150e3 }, 2: { max: 40, every: 45e3 } };
const MAX_CT = 120000, MAX_BLOB = 1.6 * 1024 * 1024, MAX_BLOBS = 400, KEEP_EV = 500;

const kvOf = (s) => ({ get: (k) => s.kvGet(k), put: (k, v) => s.kvPut(k, v), del: (k) => s.kvDel(k), list: (p, o) => s.kvList(p, o) });
async function emit(kv, ev) { const k = P + "ev:" + pad(Date.now()) + "-" + rnd(2); await kv.put(k, { ...ev, at: Date.now() }); return k; }
async function lastEv(kv) { const r = await kv.list(P + "ev:", { reverse: true, limit: 1 }); return r.length ? r[0][0].slice(P.length + 3) : "0"; } // "0" = before the first event, so a brand-new space still has a cursor
async function notify(kv, deps, to, urgency) {
  const v = await deps.vapid(); let n = 0;
  for (const [k, sub] of await kv.list(P + "sub:")) {
    if (sub.user !== to) continue;
    const st = await deps.sendPush(sub, v, urgency).catch(() => 0);
    if (st === 404 || st === 410) await kv.del(k); else if (st >= 200 && st < 300) n++;
  }
  return n;
}
const showTo = (m, user, now) => m.from === user || !(m.unlock && m.unlock > now);

export async function usHandle(req, env, a) {
  const { s, me, owner, deps } = a, kv = kvOf(s), J = deps.json, url = new URL(req.url);
  const [op, arg] = url.pathname.replace(/^\/api\/us\/?/, "").split("/");
  const now = Date.now(), ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45);
  const body = async () => { try { return JSON.parse(await req.text()); } catch { return null; } };
  const cfg = await kv.get(P + "cfg"), other = (u) => cfg && cfg.users.find((x) => x !== u);

  if (op === "status") { const inv = await kv.get(P + "inv"); return J({ configured: !!cfg, owner: !!owner, invite: !!(inv && inv.exp > now) }); }
  if (op === "push" && arg === "key") return J({ key: (await s.vapid()).pub });

  // ── getting in: the first person creates the space (with the owner session), the other claims an invite ──
  if (op === "setup" && req.method === "POST") {
    if (!owner) return J({ error: "sign in as the owner first" }, 401);
    if (cfg) return J({ error: "this space already exists" }, 409);
    const b = await body(), m = b && b.me, p = b && b.partner;
    const u1 = slug(m && m.name), u2 = slug(p && p.name);
    if (!u1 || !u2 || u1 === u2 || !HEX64.test(m.verifier || "") || !/^[A-Za-z0-9+/=]{40,200}$/.test(m.wrap || "") || !HEX64.test(b.invite || "")) return J({ error: "check the names, password and invite" }, 400);
    await kv.put(P + "cfg", { users: [u1, u2], names: { [u1]: cleanName(m.name), [u2]: cleanName(p.name) }, at: now });
    await kv.put(P + "acct:" + u1, { v: m.verifier, wrap: m.wrap, at: now });
    await kv.put(P + "inv", { hash: b.invite, forUser: u2, by: u1, exp: now + 14 * 864e5 });
    return J({ ok: true, user: u1 });
  }
  if ((op === "invite" && req.method === "GET") || (op === "claim" && req.method === "POST")) {
    if (!cfg) return J({ error: "nothing here yet" }, 404);
    if (!(await s.hit("usinv:" + ip, 20, 15 * 60e3))) return J({ error: "slow down" }, 429);
    const b = op === "claim" ? await body() : null, code = String(op === "claim" ? (b && b.code) || "" : url.searchParams.get("code") || "");
    const inv = await kv.get(P + "inv");
    if (!inv || inv.exp < now || inv.hash !== (await sha(code))) return J({ error: "this invite is not valid any more" }, 404);
    if (op === "invite") return J({ user: inv.forUser, name: cfg.names[inv.forUser], from: cfg.names[inv.by] });
    if (!HEX64.test(b.verifier || "") || !/^[A-Za-z0-9+/=]{40,200}$/.test(b.wrap || "")) return J({ error: "bad request" }, 400);
    await kv.put(P + "acct:" + inv.forUser, { v: b.verifier, wrap: b.wrap, at: now });
    await kv.del(P + "inv");
    return J({ ok: true, user: inv.forUser });
  }

  // ── everything below needs a signed-in member ──
  if (!cfg || !me || !cfg.users.includes(me.user)) return J({ error: "signed out" }, 401);
  const mine = me.user, them = other(mine);

  if (op === "me") {
    const acct = await kv.get(P + "acct:" + mine), seen = (await kv.get(P + "seen:" + them)) || 0;
    return J({ user: mine, name: cfg.names[mine], first: cfg.users[0] === mine, partner: { user: them, name: cfg.names[them], seen, joined: !!(await kv.get(P + "acct:" + them)) }, wrap: acct.wrap, now });
  }
  if (op === "invite" && req.method === "POST") { // either of you can invite the other back in (new device, forgotten password)
    const b = await body(); if (!b || !HEX64.test(b.hash || "")) return J({ error: "bad request" }, 400);
    await kv.put(P + "inv", { hash: b.hash, forUser: them, by: mine, exp: now + 14 * 864e5 });
    return J({ ok: true });
  }
  if (op === "password" && req.method === "POST") {
    const b = await body(); if (!b || !HEX64.test(b.verifier || "") || !/^[A-Za-z0-9+/=]{40,200}$/.test(b.wrap || "")) return J({ error: "bad request" }, 400);
    await kv.put(P + "acct:" + mine, { v: b.verifier, wrap: b.wrap, at: now });
    return J({ ok: true });
  }

  if (op === "sync") { // the change feed; also says "I'm here" to the other side
    const lastSeen = (await kv.get(P + "seen:" + mine)) || 0; if (now - lastSeen > 20e3) await kv.put(P + "seen:" + mine, now);
    const after = url.searchParams.get("ev") || "", partnerSeen = (await kv.get(P + "seen:" + them)) || 0;
    if (!after) return J({ events: [], ev: await lastEv(kv), seen: partnerSeen, now });
    const rows = await kv.list(P + "ev:", { startAfter: P + "ev:" + after, limit: 100 }), events = [];
    let cur = after;
    for (const [k, ev] of rows) {
      cur = k.slice(P.length + 3);
      if (ev.to && ev.to !== mine) continue;
      if (ev.t === "new") {
        const m = await kv.get(P + "m:" + ev.id); if (!m || !showTo(m, mine, now)) continue;
        if (m.from !== mine && !m.dl) { m.dl = now; await kv.put(P + "m:" + ev.id, m); await emit(kv, { t: "dl", id: ev.id, to: m.from }); }
        events.push({ k: cur, t: "new", m: { id: ev.id, ...m } });
      } else events.push({ k: cur, t: ev.t, id: ev.id, at: ev.at, ...(ev.rx ? { rx: ev.rx } : {}) });
    }
    if (Math.random() < .03) { const all = await kv.list(P + "ev:"); if (all.length > KEEP_EV * 1.4) for (const [k] of all.slice(0, all.length - KEEP_EV)) await kv.del(k); }
    return J({ events, ev: cur, seen: partnerSeen, now });
  }
  if (op === "history") { // older messages, oldest first; "before" is an id
    const before = url.searchParams.get("before"), limit = Math.min(100, +url.searchParams.get("limit") || 60);
    const rows = await kv.list(P + "m:", { reverse: true, limit: limit * 2, ...(before ? { end: P + "m:" + before } : {}) });
    const out = []; for (const [k, m] of rows) { if (!showTo(m, mine, now)) continue; out.push({ id: k.slice(P.length + 2), ...m }); if (out.length >= limit) break; }
    return J({ msgs: out.reverse(), more: rows.length >= limit * 2 || out.length >= limit, ev: await lastEv(kv), now });
  }
  if (op === "send" && req.method === "POST") {
    if (!(await s.hit("ussend:" + mine, 200, 60e3))) return J({ error: "slow down" }, 429);
    const b = await body(); if (!b || typeof b.ct !== "string" || b.ct.length > MAX_CT || !B64.test(b.ct) || typeof b.iv !== "string" || b.iv.length !== 16 || !B64.test(b.iv)) return J({ error: "bad message" }, 400);
    const quiet = !!b.q, lvl = quiet ? 0 : [0, 1, 2].includes(b.lvl) ? b.lvl : 0, unlock = +b.unlock > now + 10e3 && +b.unlock < now + 5 * 365 * 864e5 ? Math.floor(+b.unlock) : 0;
    let blob = null; if (b.blob) { if (!/^[a-f0-9]{16}$/.test(b.blob) || !(await kv.get(P + "b:" + b.blob))) return J({ error: "attachment missing" }, 400); blob = b.blob; }
    const id = pad(now) + "-" + rnd(2), m = { from: mine, ts: now, lvl, q: quiet ? 1 : 0, unlock, ct: b.ct, iv: b.iv, blob, dl: 0, rd: 0, ak: 0 };
    await kv.put(P + "m:" + id, m);
    if (unlock) {
      await kv.put(P + "due:" + pad(unlock) + ":" + id, { id, to: them });
      await emit(kv, { t: "new", id, to: mine }); await s.usAt(unlock);
    } else {
      await emit(kv, { t: "new", id });
      const live = await s.usPoke(them, { t: "poke" }).catch(() => 0), pushed = quiet || live ? 0 : await notify(kv, deps, them, lvl ? "high" : "normal").catch(() => 0);
      if (lvl >= 1) { const e = { id, to: them, lvl, n: 0, next: now + ESC[lvl].every }; await kv.put(P + "esc:" + id, e); await s.usAt(e.next); }
      return J({ id, ts: now, pushed });
    }
    return J({ id, ts: now, capsule: true });
  }
  if (op === "ack" && req.method === "POST") { // seen / answered
    const b = await body(), ids = Array.isArray(b && b.ids) ? b.ids.slice(0, 100) : [];
    for (const id of ids) {
      const m = await kv.get(P + "m:" + id); if (!m || m.from === mine) continue;
      let ch = false; if (!m.rd) { m.rd = now; ch = true; await emit(kv, { t: "rd", id, to: m.from }); }
      if (b.ak && !m.ak) { m.ak = now; ch = true; await emit(kv, { t: "ak", id, to: m.from }); }
      if (ch) { await kv.put(P + "m:" + id, m); await s.usPoke(m.from, { t: "poke" }).catch(() => 0); }
    }
    return J({ ok: true });
  }
  if (op === "react" && req.method === "POST") { // an emoji on a message; stored on the message, shown to both
    const b = await body(), id = b && String(b.id || ""), e = b && String(b.e || "").slice(0, 8), m = id && await kv.get(P + "m:" + id);
    if (!m || !showTo(m, mine, now)) return J({ error: "gone" }, 404);
    m.rx = { ...(m.rx || {}) }; if (e) m.rx[mine] = e; else delete m.rx[mine];
    await kv.put(P + "m:" + id, m); await emit(kv, { t: "rx", id, rx: m.rx, to: them }); await s.usPoke(them, { t: "poke" }).catch(() => 0);
    return J({ ok: true, rx: m.rx });
  }
  if (op === "live") { // upgrade to the encrypted live line (see usLive* below)
    if (req.headers.get("upgrade") !== "websocket") return J({ error: "websocket only" }, 426);
    const h = new Headers(req.headers); h.set("x-us-user", mine);
    return s.fetch(new Request(req.url, { headers: h }));
  }
  if (op === "message" && req.method === "DELETE" && arg) {
    const m = await kv.get(P + "m:" + arg); if (!m || m.from !== mine) return J({ error: "not yours" }, 403);
    await kv.del(P + "m:" + arg); await kv.del(P + "esc:" + arg); if (m.blob) await kv.del(P + "b:" + m.blob);
    if (m.unlock) await kv.del(P + "due:" + pad(m.unlock) + ":" + arg);
    await emit(kv, { t: "del", id: arg }); await s.usPoke(them, { t: "poke" }).catch(() => 0);
    return J({ ok: true });
  }
  if (op === "blob") {
    if (req.method === "GET" && arg) { const r = await kv.get(P + "b:" + arg); return r ? new Response(r.b, { headers: { "content-type": "application/octet-stream", "cache-control": "private, max-age=31536000, immutable" } }) : J({ error: "gone" }, 404); }
    if (req.method === "POST") {
      const bytes = await req.arrayBuffer(); if (!bytes.byteLength || bytes.byteLength > MAX_BLOB) return J({ error: "too big (1.6 MB max)" }, 413);
      const id = rnd(8); await kv.put(P + "b:" + id, { by: mine, at: now, b: bytes });
      const all = await kv.list(P + "b:"); if (all.length > MAX_BLOBS) for (const [k] of all.sort((x, y) => x[1].at - y[1].at).slice(0, all.length - MAX_BLOBS)) await kv.del(k);
      return J({ id });
    }
  }
  if (op === "peek") { // what the notification shows: who, how urgent, how many; never what was said
    const rows = await kv.list(P + "m:", { reverse: true, limit: 30 }); let n = 0, lvl = 0;
    for (const [, m] of rows) if (m.from !== mine && !m.rd && showTo(m, mine, now)) { n++; lvl = Math.max(lvl, m.lvl); }
    return J({ from: cfg.names[them], n, lvl });
  }
  if (op === "push" && (arg === "subscribe" || arg === "unsubscribe") && req.method === "POST") {
    const b = await body(), ep = b && (b.sub ? b.sub.endpoint : b.endpoint); if (typeof ep !== "string") return J({ error: "bad request" }, 400);
    const id = (await sha(ep)).slice(0, 32);
    if (arg === "unsubscribe") { await kv.del(P + "sub:" + id); return J({ ok: true }); }
    if (!(deps.PUSH_HOSTS.test(ep) || (env.PUSH_TEST_HOST && ep.startsWith(env.PUSH_TEST_HOST)))) return J({ error: "bad subscription" }, 400);
    await kv.put(P + "sub:" + id, { endpoint: ep, user: mine });
    return J({ ok: true });
  }
  return J({ error: "not found" }, 404);
}

// Durable Object alarm: opens capsules when their time comes and repeats loud alerts until they're answered.
export async function usAlarm(st, deps) {
  const stg = st.ctx.storage, kv = { get: (k) => stg.get(k), put: (k, v) => stg.put(k, v), del: (k) => stg.delete(k), list: async (p, o) => [...(await stg.list({ prefix: p, ...(o || {}) })).entries()] };
  const d2 = { ...deps, vapid: () => st.vapid() }, now = Date.now(); let next = Infinity;
  for (const [k, due] of await kv.list(P + "due:", { limit: 40 })) {
    const t = +k.slice(P.length + 4, P.length + 17);
    if (t > now) { next = Math.min(next, t); break; }
    const m = await kv.get(P + "m:" + due.id);
    if (m) {
      await emit(kv, { t: "new", id: due.id, to: due.to }); await st.usPoke(due.to, { t: "poke" }).catch(() => 0); await notify(kv, d2, due.to, m.lvl ? "high" : "normal").catch(() => 0);
      if (m.lvl >= 1) await kv.put(P + "esc:" + due.id, { id: due.id, to: due.to, lvl: m.lvl, n: 0, next: now + ESC[m.lvl].every });
    }
    await kv.del(k);
  }
  for (const [k, e] of await kv.list(P + "esc:")) {
    const m = await kv.get(P + "m:" + e.id), done = !m || (e.lvl >= 2 ? m.ak : m.rd || m.ak);
    if (done || e.n >= ESC[e.lvl].max) { await kv.del(k); continue; }
    if (e.next > now) { next = Math.min(next, e.next); continue; }
    await notify(kv, d2, e.to, "high").catch(() => 0); e.n++; e.next = now + ESC[e.lvl].every; await kv.put(k, e); next = Math.min(next, e.next);
  }
  if (next < Infinity) await stg.setAlarm(Math.max(next, now + 500));
}

// ── the live line: a hibernatable WebSocket per device. The server is a blind relay: it forwards opaque frames to the
// other person's devices (typing, touch, voice-call signalling, all sealed in the browser with the space key) and only
// ever reads the two fields it needs, who is sending and the frame size. Presence is "is any device of theirs connected".
const FRAME_MAX = 16 * 1024;
export function usLiveUpgrade(st, req) {
  const user = req.headers.get("x-us-user"); if (!user) return new Response("no", { status: 400 });
  if (typeof WebSocketPair === "undefined") return new Response("no sockets here", { status: 501 });
  const pair = new WebSocketPair(), [client, server] = [pair[0], pair[1]];
  st.ctx.acceptWebSocket(server, [user]); server.serializeAttachment({ user, at: Date.now() });
  const others = st.ctx.getWebSockets().filter((w) => !w.deserializeAttachment() || w.deserializeAttachment().user !== user);
  try { server.send(JSON.stringify({ t: "hi", pres: others.length > 0 })); } catch {}
  for (const w of others) try { w.send(JSON.stringify({ t: "pres", on: true })); } catch {}
  return new Response(null, { status: 101, webSocket: client });
}
export function usLiveMessage(st, ws, msg) {
  const a = ws.deserializeAttachment(); if (!a || typeof msg !== "string" || msg.length > FRAME_MAX) return;
  const now = Date.now(); a.w = a.w && now - a.w[0] < 1000 ? [a.w[0], a.w[1] + 1] : [now, 1]; if (a.w[1] > 40) return; ws.serializeAttachment(a); // 40 frames a second is plenty
  for (const w of st.ctx.getWebSockets()) { const b = w.deserializeAttachment(); if (b && b.user !== a.user) try { w.send(msg); } catch {} }
}
export function usLiveClose(st, ws) {
  const a = ws.deserializeAttachment(); try { ws.close(1000, "bye"); } catch {}
  if (!a) return;
  const rest = st.ctx.getWebSockets().filter((w) => w !== ws), mine = rest.some((w) => (w.deserializeAttachment() || {}).user === a.user);
  if (!mine) for (const w of rest) try { w.send(JSON.stringify({ t: "pres", on: false })); } catch {}
}
// Tell a person's open devices something happened. Returns how many heard it (so a push can be skipped when they're looking).
export function usPoke(st, user, frame) {
  let n = 0; for (const w of st.ctx.getWebSockets(user)) try { w.send(JSON.stringify(frame)); n++; } catch {}
  return n;
}
