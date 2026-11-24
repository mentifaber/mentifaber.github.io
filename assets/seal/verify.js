/* Checks a record signed by the workshop's seal (src/seal.js) in this browser: the public key comes from
   /api/seal/key, and a record is "<payload>.<signature>", base64url, ECDSA P-256 / SHA-256 over the payload.
     WorkshopSeal.check(record) → { good, body: { v, kind, iat, kid, data } } (good is false for anything altered)
     WorkshopSeal.sha256(file)  → the file's SHA-256 as hex, worked out on this device */
(() => {
  const unb = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (String(s).length % 4)) % 4)), (c) => c.charCodeAt(0));
  let pub = null;
  const key = () => pub || (pub = fetch("/api/seal/key").then((r) => { if (!r.ok) throw new Error("the workshop's key isn't reachable right now"); return r.json(); })
    .then(async (k) => ({ kid: k.kid, key: await crypto.subtle.importKey("jwk", k.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]) }))
    .catch((e) => { pub = null; throw e; }));
  async function check(record) {
    const m = /^([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{40,})$/.exec(String(record || "").trim()); if (!m) return { good: false, why: "That isn't a sealed record." };
    let body; try { body = JSON.parse(new TextDecoder().decode(unb(m[1]))); } catch (e) { return { good: false, why: "That record is damaged." }; }
    const k = await key(); if (body.kid !== k.kid) return { good: false, body, why: "This record wasn't signed with the workshop's key." };
    const good = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.key, unb(m[2]), new TextEncoder().encode(m[1])).catch(() => false);
    return good ? { good, body, kid: k.kid } : { good: false, body, why: "This record has been changed since the workshop signed it." };
  }
  async function sha256(file) { const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  window.WorkshopSeal = { check, sha256, key };
})();
