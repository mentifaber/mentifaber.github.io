// NULLSPACE: an encrypted comms deck that talks over the internet and over LoRa mesh radio.
//
// There are no accounts. A "frequency" is a random 256-bit key that people share in person, by link or by QR; this server only ever
// sees a tag derived from it (SHA-256, so the key can't be recovered) and sealed bytes. It is a dumb relay: it keeps the recent
// transmissions for each tag so a phone that was off-grid can catch up, pokes whoever is listening, and forgets.
//
// Keys (in its own Durable Object, "Nullspace"):
//   t:<f>:<ts>-<rnd>    a transmission { id, ct, iv, b, ts, exp, dev }       d:<f>:<id>  seen ids (so bridges can't double-post)
//   b:<f>:<id>          a sealed attachment                                  p:<hash>    a push subscription { endpoint, fs:[...], dev }
//   x:<exp>:<f>:<key>   burn timers                                          rl:*        rate limits

const pad = (n) => String(Math.floor(n)).padStart(13, "0");
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const F = /^[a-f0-9]{32}$/, ID = /^[a-f0-9]{16}$/, B64 = /^[A-Za-z0-9+/=_-]+$/;
const LIM = { ct: 12000, keep: 3000, blob: 1024 * 1024, blobs: 200, days: 30, freqs: 24, burnMax: 7 * 864e5 };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const kvOf = (stg) => ({ get: async (k) => (await stg.get(k)) ?? null, put: (k, v) => stg.put(k, v), del: (k) => stg.delete(k), list: async (p, o) => [...(await stg.list({ prefix: p, ...(o || {}) })).entries()] });
async function hit(kv, key, limit, ms) { const now = Date.now(), k = "rl:" + key; let r = await kv.get(k); if (!r || r.until < now) r = { n: 0, until: now + ms }; r.n++; await kv.put(k, r); return r.n <= limit; }
function poke(st, f, frame, skip) { const s = JSON.stringify(frame); for (const w of st.ctx.getWebSockets(f)) { if (skip && w === skip) continue; const a = w.deserializeAttachment(); if (a && frame.dev && a.dev === frame.dev) continue; try { w.send(s); } catch {} } }

export async function nsFetch(st, req, deps) {
  const kv = kvOf(st.ctx.storage), url = new URL(req.url), ip = (req.headers.get("x-ns-ip") || "x").slice(0, 45), now = Date.now();
  const [op, arg] = url.pathname.replace(/^\/api\/ns\/?/, "").split("/"), q = (k) => url.searchParams.get(k) || "";
  const body = async () => { try { return JSON.parse(await req.text()); } catch { return null; } };

  if (op === "status") return J({ ok: true, now });
  if (op === "live") {
    if (req.headers.get("upgrade") !== "websocket") return J({ error: "websocket only" }, 426);
    if (typeof WebSocketPair === "undefined") return new Response("no sockets here", { status: 501 });
    if (!(await hit(kv, "lv:" + ip, 60, 60e3))) return J({ error: "slow down" }, 429);
    const fs = q("f").split(",").filter((x) => F.test(x)).slice(0, LIM.freqs), dev = ID.test(q("dev")) ? q("dev") : "";
    const pair = new WebSocketPair(), [client, server] = [pair[0], pair[1]];
    st.ctx.acceptWebSocket(server, fs.length ? fs : ["none"]); server.serializeAttachment({ fs, dev, at: now });
    return new Response(null, { status: 101, webSocket: client });
  }
  if (op === "tx" && req.method === "POST") {
    if (!(await hit(kv, "tx:" + ip, 180, 60e3))) return J({ error: "slow down" }, 429);
    const b = await body(); if (!b || !F.test(b.f || "") || !ID.test(b.id || "") || typeof b.ct !== "string" || b.ct.length > LIM.ct || !B64.test(b.ct) || typeof b.iv !== "string" || b.iv.length !== 16 || !B64.test(b.iv)) return J({ error: "bad transmission" }, 400);
    if (await kv.get("d:" + b.f + ":" + b.id)) return J({ ok: true, dup: true }); // the same message arriving twice (say, from two bridges) is stored once
    if (b.b && (!ID.test(b.b) || !(await kv.get("b:" + b.f + ":" + b.b)))) return J({ error: "attachment missing" }, 400);
    const burn = Number.isInteger(b.burn) && b.burn >= 5 && b.burn * 1000 <= LIM.burnMax ? b.burn : 0, exp = burn ? now + burn * 1000 : now + LIM.days * 864e5;
    const key = pad(now) + "-" + rnd(2), dev = ID.test(b.dev || "") ? b.dev : "", rec = { id: b.id, ct: b.ct, iv: b.iv, b: b.b || null, ts: now, exp, burn, dev, rf: b.rf ? 1 : 0 };
    await kv.put("t:" + b.f + ":" + key, rec); await kv.put("d:" + b.f + ":" + b.id, exp); await kv.put("x:" + pad(exp) + ":" + b.f + ":" + key, 1); await st.at(exp);
    if (Math.random() < .05) await trim(kv, b.f);
    poke(st, b.f, { t: "tx", f: b.f, dev });
    await notify(st, kv, deps, b.f, dev);
    return J({ ok: true, k: key, ts: now });
  }
  if (op === "rx") {
    const f = q("f"); if (!F.test(f)) return J({ error: "bad frequency" }, 400); const pre = "t:" + f + ":", after = q("after");
    const rows = await kv.list(pre, after ? { startAfter: pre + after, limit: 200 } : { reverse: true, limit: 120 }), out = [];
    const ordered = after ? rows : rows.reverse(); for (const [k, v] of ordered) if (v.exp > now) out.push({ k: k.slice(pre.length), ...v });
    return J({ tx: out, cur: ordered.length ? ordered[ordered.length - 1][0].slice(pre.length) : after, more: rows.length >= (after ? 200 : 120), now });
  }
  if (op === "blob") {
    const f = q("f"); if (!F.test(f)) return J({ error: "bad frequency" }, 400);
    if (req.method === "GET" && arg) { if (!ID.test(arg)) return J({ error: "bad id" }, 400); const x = await kv.get("b:" + f + ":" + arg); return x ? new Response(x.b, { headers: { "content-type": "application/octet-stream", "cache-control": "private, max-age=31536000, immutable" } }) : J({ error: "gone" }, 404); }
    if (req.method === "POST") {
      if (!(await hit(kv, "bl:" + ip, 30, 60e3)) || !(await hit(kv, "bd:" + ip, 120, 864e5))) return J({ error: "slow down" }, 429);
      const bytes = await req.arrayBuffer(); if (!bytes.byteLength || bytes.byteLength > LIM.blob) return J({ error: "too big (1 MB max)" }, 413);
      const id = rnd(8); await kv.put("b:" + f + ":" + id, { at: now, b: bytes });
      const all = await kv.list("b:" + f + ":"); if (all.length > LIM.blobs) for (const [k] of all.sort((x, y) => x[1].at - y[1].at).slice(0, all.length - LIM.blobs)) await kv.del(k);
      return J({ id });
    }
  }
  if (op === "push" && req.method === "POST") {
    if (!(await hit(kv, "ps:" + ip, 30, 3600e3))) return J({ error: "slow down" }, 429);
    const b = await body(), ep = b && b.sub && b.sub.endpoint; if (typeof ep !== "string") return J({ error: "bad request" }, 400);
    const id = (await sha(ep)).slice(0, 32);
    if (b.off) { await kv.del("p:" + id); return J({ ok: true }); }
    if (!(deps.PUSH_HOSTS.test(ep) || (st.env.PUSH_TEST_HOST && ep.startsWith(st.env.PUSH_TEST_HOST)))) return J({ error: "bad subscription" }, 400);
    const fs = (Array.isArray(b.fs) ? b.fs : []).filter((x) => F.test(x)).slice(0, LIM.freqs); await kv.put("p:" + id, { endpoint: ep, fs, dev: ID.test(b.dev || "") ? b.dev : "", at: now });
    return J({ ok: true });
  }
  if (op === "push" && arg === "key") return J({ key: (await deps.vapid()).pub });
  return J({ error: "not found" }, 404);
}
async function trim(kv, f) { const all = await kv.list("t:" + f + ":"); if (all.length <= LIM.keep) return; for (const [k] of all.slice(0, all.length - LIM.keep)) await kv.del(k); }
// a silent push to every device listening to this frequency, except the one that sent it and any that are on the live line right now
async function notify(st, kv, deps, f, dev) {
  const live = new Set(st.ctx.getWebSockets(f).map((w) => (w.deserializeAttachment() || {}).dev).filter(Boolean));
  const subs = (await kv.list("p:")).filter(([, s]) => s.fs.includes(f) && s.dev !== dev && !live.has(s.dev)); if (!subs.length) return;
  const v = await deps.vapid().catch(() => null); if (!v) return;
  for (const [k, s] of subs) { const r = await deps.sendPush(s, v, "normal").catch(() => 0); if (r === 404 || r === 410) await kv.del(k); }
}
// the alarm burns whatever has reached its time: burn-after-sending messages, and anything older than the retention window
export async function nsAlarm(st) {
  const kv = kvOf(st.ctx.storage), now = Date.now(); let next = Infinity;
  for (const [k] of await kv.list("x:", { limit: 200 })) {
    const t = +k.slice(2, 15); if (t > now) { next = Math.min(next, t); break; }
    const [f, key] = k.slice(16).split(":"), rec = await kv.get("t:" + f + ":" + key);
    if (rec) { await kv.del("t:" + f + ":" + key); if (rec.b) await kv.del("b:" + f + ":" + rec.b); if (rec.burn) poke(st, f, { t: "burn", f, id: rec.id }); }
    await kv.del("d:" + f + ":" + (rec ? rec.id : "")); await kv.del(k);
  }
  return next;
}
// the live line relays sealed, ephemeral frames (presence, typing, pings) to everyone else tuned to the same frequency
export function nsMessage(st, ws, msg) {
  const a = ws.deserializeAttachment(); if (!a || typeof msg !== "string" || msg.length > 8192) return;
  const now = Date.now(); a.w = a.w && now - a.w[0] < 1000 ? [a.w[0], a.w[1] + 1] : [now, 1]; ws.serializeAttachment(a); if (a.w[1] > 30) return;
  let j; try { j = JSON.parse(msg); } catch { return; } if (!F.test(j.f || "") || !a.fs.includes(j.f) || typeof j.p !== "string") return;
  const out = JSON.stringify({ t: "fx", f: j.f, p: j.p }); for (const w of st.ctx.getWebSockets(j.f)) if (w !== ws) try { w.send(out); } catch {}
}
export function nsClose(st, ws) { try { ws.close(1000, "bye"); } catch {} }
