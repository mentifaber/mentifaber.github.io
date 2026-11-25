// The workshop's seal (/api/seal/*): one ECDSA P-256 key, made on first use inside the Store Durable Object and never
// exported, signs two kinds of record. Nothing about a record is stored: the signed record is the whole of it, and
// anyone can check it in their browser against the public key at /api/seal/key.
//
//   passport  a Device Passport: what the workshop did to a device (model, work, parts, battery health, warranty).
//             Only the owner (a Vigil session) can issue one. The record travels in the link's #fragment, which is
//             never sent to any server, so the passport page checks it in the browser.
//   witness   a Witness record: a photo's SHA-256, taken and hashed on the phone, plus where the phone said it was.
//             The time is the server's own, which is what makes a record worth having: it proves this exact photo
//             existed by then. The photo itself never leaves the phone. Anyone may ask, within a daily limit.
//   claim     a Claim Kit: a case (an insurance claim, a deposit dispute, a warranty fight) and the fingerprint of
//             every photo, receipt, document and dated note in it, in order. The files stay on the device and travel
//             in the kit beside the record; the record proves that exactly these files were together by then.
//   inventory a Move-in, Move-out inspection: a property, which walk it was (move-in or move-out), and room by room each
//             item's condition and note and every photo's fingerprint. The photos stay on the device and travel in
//             the kit; the record proves the rooms looked like this, in these photos, by then.
//
// A record is "<payload>.<signature>", both base64url: payload is JSON { v, kind, iat (ms), kid, data }, the signature
// is ECDSA P-256 / SHA-256 over the payload's bytes (raw r||s, as WebCrypto makes it).

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
let keyCache = null; // { priv: CryptoKey, pub: JWK, kid }

async function key(env) {
  if (keyCache) return keyCache;
  const k = await env.STORE.get(env.STORE.idFromName("main")).sealKey(); // made once, inside the object, so there's only ever one
  const priv = await crypto.subtle.importKey("jwk", k.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const pub = { kty: k.pub.kty, crv: k.pub.crv, x: k.pub.x, y: k.pub.y };
  const kid = b64u(await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(pub)))).slice(0, 16);
  return (keyCache = { priv, pub, kid });
}

async function sign(env, kind, data) {
  const k = await key(env), payload = b64u(enc.encode(JSON.stringify({ v: 1, kind, iat: Date.now(), kid: k.kid, data })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.priv, enc.encode(payload));
  return payload + "." + b64u(sig);
}

const num = (v, lo, hi) => { const n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : undefined; };
const list = (a, n, w) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => clean(x, w)).filter(Boolean);

function passportData(b) {
  const device = clean(b.device, 80); if (!device) throw Object.assign(new Error("name the device"), { status: 400 });
  const work = list(b.work, 12, 160); if (!work.length) throw Object.assign(new Error("say what work was done"), { status: 400 });
  const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 12).map((p) => ({ name: clean(p && p.name, 80), pn: clean(p && p.pn, 40) })).filter((p) => p.name);
  const out = { device, work, parts, date: /^\d{4}-\d\d-\d\d$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10) };
  const serial = clean(b.serial, 40); if (serial) out.serial = serial;
  const bat = num(b.battery, 0, 100); if (bat !== undefined) out.battery = Math.round(bat);
  const wd = num(b.warrantyDays, 0, 3650); if (wd !== undefined) out.warrantyDays = Math.round(wd);
  const note = clean(b.note, 400); if (note) out.note = note;
  out.ref = clean(b.ref, 24) || Date.now().toString(36).toUpperCase();
  return out;
}

function witnessData(b) {
  const sha = String(b.sha256 || "").toLowerCase(); if (!/^[0-9a-f]{64}$/.test(sha)) throw Object.assign(new Error("send the photo's SHA-256, not the photo"), { status: 400 });
  const out = { sha256: sha, name: clean(b.name, 120), bytes: num(b.bytes, 0, 2e9) };
  const lat = num(b.lat, -90, 90), lon = num(b.lon, -180, 180);
  if (lat !== undefined && lon !== undefined) { out.lat = Math.round(lat * 1e5) / 1e5; out.lon = Math.round(lon * 1e5) / 1e5; const acc = num(b.acc, 0, 1e6); if (acc !== undefined) out.acc = Math.round(acc); }
  const note = clean(b.note, 200); if (note) out.note = note;
  return out;
}

const CLAIM_KINDS = ["insurance", "deposit", "warranty", "other"], CLAIM_WHAT = ["photo", "receipt", "document", "note"];
export const CLAIM_ITEMS = 60;
function claimData(b) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const title = clean(b.title, 100); if (!title) throw bad("give the case a name");
  const raw = Array.isArray(b.items) ? b.items : []; if (!raw.length) throw bad("add something to the kit first");
  if (raw.length > CLAIM_ITEMS) throw bad("a kit holds at most " + CLAIM_ITEMS + " items");
  const items = raw.map((x, i) => {
    x = x && typeof x === "object" ? x : {}; const sha = String(x.sha256 || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) throw bad("item " + (i + 1) + ": send its SHA-256, not the file");
    const it = { n: i + 1, what: CLAIM_WHAT.includes(x.what) ? x.what : "document", name: clean(x.name, 120), sha256: sha };
    const by = num(x.bytes, 0, 2e9); if (by !== undefined) it.bytes = Math.round(by);
    if (/^\d{4}-\d\d-\d\d$/.test(x.date || "")) it.date = x.date;
    const note = clean(x.note, 300); if (note) it.note = note;
    return it;
  });
  const out = { title, kind: CLAIM_KINDS.includes(b.kind) ? b.kind : "other", items };
  const party = clean(b.party, 100); if (party) out.party = party;
  const amt = num(b.amount, 0, 1e9); if (amt !== undefined && amt > 0) out.amount = Math.round(amt * 100) / 100;
  return out;
}

export const INV_ROOMS = 30, INV_ITEMS = 20, INV_PHOTOS = 150, INV_CONDS = ["good", "fair", "worn", "damaged", "missing"];
function inventoryData(b) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const property = clean(b.property, 120); if (!property) throw bad("say which property it is");
  if (!["in", "out"].includes(b.phase)) throw bad("say whether it's the move-in or the move-out walk");
  const raw = Array.isArray(b.rooms) ? b.rooms : []; if (!raw.length) throw bad("add a room first"); if (raw.length > INV_ROOMS) throw bad("at most " + INV_ROOMS + " rooms");
  let photos = 0;
  const rooms = raw.map((r, i) => {
    r = r && typeof r === "object" ? r : {}; const name = clean(r.name, 60); if (!name) throw bad("room " + (i + 1) + " needs a name");
    const items = (Array.isArray(r.items) ? r.items : []).slice(0, INV_ITEMS + 1); if (items.length > INV_ITEMS) throw bad(name + ": at most " + INV_ITEMS + " items");
    const ph = Array.isArray(r.photos) ? r.photos : []; photos += ph.length; if (photos > INV_PHOTOS) throw bad("at most " + INV_PHOTOS + " photos in all");
    return { name,
      items: items.map((x) => { x = x && typeof x === "object" ? x : {}; const it = { what: clean(x.what, 60) || "Item" }; if (INV_CONDS.includes(x.cond)) it.cond = x.cond; const note = clean(x.note, 200); if (note) it.note = note; return it; }),
      photos: ph.map((x, k) => { const sha = String((x && x.sha256) || "").toLowerCase(); if (!/^[0-9a-f]{64}$/.test(sha)) throw bad(name + ", photo " + (k + 1) + ": send its SHA-256, not the photo"); const o = { name: clean(x.name, 120), sha256: sha }; const by = num(x.bytes, 0, 2e9); if (by !== undefined) o.bytes = Math.round(by); return o; }) };
  });
  const out = { property, phase: b.phase, rooms }; if (/^\d{4}-\d\d-\d\d$/.test(b.date || "")) out.date = b.date;
  for (const k of ["landlord", "tenant"]) { const v = clean(b[k], 80); if (v) out[k] = v; }
  return out;
}

export const WITNESS_DAY = 100, CLAIM_DAY = 20; // records a visitor's address may ask for a day

export async function seal(req, env, json, owner) {
  const url = new URL(req.url), sub = url.pathname.replace(/^\/api\/seal\/?/, "");
  if (sub === "key" && req.method === "GET") { const k = await key(env); return json({ kid: k.kid, alg: "ES256", jwk: k.pub }, 200, { "cache-control": "public, max-age=3600" }); }
  if ((sub === "passport" || sub === "witness" || sub === "claim" || sub === "inventory") && req.method === "POST") {
    let b = {}; try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); }
    try {
      if (sub === "passport") { if (!owner) return json({ error: "only the workshop can issue a Device Passport" }, 403); return json({ record: await sign(env, "passport", passportData(b)) }); }
      const ip = req.headers.get("cf-connecting-ip") || "anon";
      if (sub === "claim" || sub === "inventory") { const d = sub === "claim" ? claimData(b) : inventoryData(b); // checked before it counts against the day's limit
        if (!owner && !(await env.STORE.get(env.STORE.idFromName("main")).hit("claim:" + ip, CLAIM_DAY, 864e5))) return json({ error: "that's today's " + CLAIM_DAY + " sealed kits from this connection; try again tomorrow" }, 429);
        return json({ record: await sign(env, sub, d) }); }
      if (!owner && !(await env.STORE.get(env.STORE.idFromName("main")).hit("witness:" + ip, WITNESS_DAY, 864e5))) return json({ error: "that's today's " + WITNESS_DAY + " Witness records from this connection; try again tomorrow" }, 429);
      return json({ record: await sign(env, "witness", witnessData(b)) });
    } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
  }
  return json({ error: "not here" }, 404);
}
