// Web Push (RFC 8030/8292) without a payload: the service worker picks the words (it asks the server what's
// new), so nothing needs encrypting; the request only carries a VAPID JWT. Shared by the Worker (Flutterbloom,
// List-It, Barycenter, Nullspace) and by Genesis in the Hive object (src/hive-genesis.js).
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (str) => b64url(new TextEncoder().encode(str));
async function vapidAuth(endpoint, v) {
  const aud = new URL(endpoint).origin;
  const head = b64urlStr(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64urlStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:anders@mentifaber.org" }));
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64url(sig) + ", k=" + v.pub;
}
// ttl: seconds the push service keeps trying a phone that's offline
export async function sendPush(sub, v, urgency, ttl) {
  const res = await fetch(sub.endpoint, { method: "POST", headers: { TTL: String(ttl || 43200), Urgency: urgency || "normal", Authorization: await vapidAuth(sub.endpoint, v), "Content-Length": "0" } });
  return res.status;
}
// Push services a subscription may point at (anything else would turn the server into a request relay)
export const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|googleapis\.com|mozilla\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//;
