// The workshop's seal (src/seal.js, /api/seal/*), through the real Worker:
//  - one key, made once even when the first requests arrive together; the public key is served, the private one never
//  - a Device Passport only for the owner's real session; a cookie anyone could make up gets a 403
//  - a passport record verifies against the public key; change one character of it and it doesn't
//  - a Witness record holds the photo's hash (never the photo), the server's own time and a rounded position; a photo
//    sent in place of the hash is refused; a visitor's address gets WITNESS_DAY records a day
import assert from "node:assert/strict"; import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname; let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const OUT = new URL("./w52/", import.meta.url).pathname; mkdirSync(OUT + "src", { recursive: true });
writeFileSync(OUT + "cf-shim.mjs", "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint {}\n");
for (const f of readdirSync(REPO + "/src").filter((f) => f.endsWith(".js")))
  writeFileSync(OUT + "src/" + f, readFileSync(REPO + "/src/" + f, "utf8").replace(/from "cloudflare:workers"/g, 'from "../cf-shim.mjs"').replace(/from "\.\.\/([^"]+\.json)";/g, 'from "' + REPO + '/$1" with { type: "json" };'));
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const { default: worker, Store } = await import(OUT + "src/worker.js");
const { WITNESS_DAY } = await import(OUT + "src/seal.js");

// the real Store class, on an in-memory storage, so sealKey and hit are the code that runs live
const mem = new Map(); let puts = 0;
const storage = { get: async (k) => mem.get(k), put: async (k, v) => { puts++; mem.set(k, structuredClone(v)); }, delete: async (k) => mem.delete(k), list: async () => new Map(), getAlarm: async () => null, setAlarm: async () => {} };
const real = "e".repeat(64), st = new Store({ storage, setWebSocketAutoResponse() {} }, {});
st.getSession = async (t) => (t === real ? { app: "vigil", exp: Date.now() + 1e9 } : null);
const STORE = { idFromName: (x) => x, get: () => st };
const env = { STORE, HIVE: { idFromName: (x) => x, get: () => ({ fetch: async () => Response.json({}) }) }, ASSETS: { fetch: async () => new Response("asset") } }, ctx = { waitUntil() {}, passThroughOnException() {} };
const go = async (path, body, h = {}) => { const r = await worker.fetch(new Request("https://mentifaber.org/api/seal/" + path, body === undefined ? { headers: h } : { method: "POST", headers: { "content-type": "application/json", ...h }, body: typeof body === "string" ? body : JSON.stringify(body) }), env, ctx); return { status: r.status, j: await r.json() }; };
const owner = { cookie: "mf_vigil=" + real }, visitor = (ip) => ({ "cf-connecting-ip": ip });

// 1 · one key
const ks = await Promise.all([go("key"), go("key"), go("key")]);
assert.ok(ks.every((k) => k.status === 200 && k.j.kid === ks[0].j.kid), JSON.stringify(ks.map((k) => k.j.kid)));
assert.equal(puts, 1, "the key is written once"); assert.deepEqual(Object.keys(ks[0].j.jwk).sort(), ["crv", "kty", "x", "y"], "only the public half: " + JSON.stringify(Object.keys(ks[0].j.jwk)));
ok("three first requests at once: one key, written once; /api/seal/key serves only its public half");

const pub = await crypto.subtle.importKey("jwk", ks[0].j.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
const unb = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const check = async (rec) => { const [p, s] = rec.split("."); const good = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb(s), new TextEncoder().encode(p)); return { good, body: JSON.parse(new TextDecoder().decode(unb(p))) }; };

// 2 · passports: owner only
const pp = { device: "iPhone 13", serial: "F2LXK0QJ0D", work: ["Replaced the screen", "Replaced the battery"], parts: [{ name: "OLED screen", pn: "661-21991" }], battery: 100, warrantyDays: 90, note: "Face ID tested" };
let r = await go("passport", pp, visitor("203.0.113.9")); assert.equal(r.status, 403);
r = await go("passport", pp, { cookie: "mf_vigil=" + "f".repeat(64) }); assert.equal(r.status, 403);
ok("a visitor, or a made-up session cookie, can't issue a Device Passport");

r = await go("passport", pp, owner); assert.equal(r.status, 200, JSON.stringify(r.j));
let v = await check(r.j.record); assert.equal(v.good, true); assert.equal(v.body.kind, "passport"); assert.equal(v.body.kid, ks[0].j.kid);
assert.equal(v.body.data.device, "iPhone 13"); assert.deepEqual(v.body.data.parts, [{ name: "OLED screen", pn: "661-21991" }]); assert.equal(v.body.data.warrantyDays, 90); assert.ok(Math.abs(v.body.iat - Date.now()) < 5000);
const bad = r.j.record.replace(/^(.{20})(.)/, (m, a, c) => a + (c === "A" ? "B" : "A")); assert.equal((await check(bad).catch(() => ({ good: false }))).good, false);
assert.equal((await go("passport", { work: ["x"] }, owner)).status, 400); assert.equal((await go("passport", { device: "x" }, owner)).status, 400);
ok("the owner's passport is signed by that key and checks out; one changed character and it doesn't; no device or no work is refused");

// 3 · witness records: the hash, never the photo
const sha = "a".repeat(64);
r = await go("witness", { photo: "data:image/jpeg;base64,/9j/4AAQ", name: "x.jpg" }, visitor("203.0.113.10")); assert.equal(r.status, 400); assert.match(r.j.error, /SHA-256, not the photo/);
r = await go("witness", { sha256: sha, name: "roof.jpg", bytes: 2048000, lat: 41.586812345, lon: -93.625012345, acc: 12.7, iat: 1, photo: "nope" }, visitor("203.0.113.10"));
v = await check(r.j.record); assert.equal(v.good, true); assert.equal(v.body.kind, "witness");
assert.deepEqual(v.body.data, { sha256: sha, name: "roof.jpg", bytes: 2048000, lat: 41.58681, lon: -93.62501, acc: 13 }); assert.ok(Math.abs(v.body.iat - Date.now()) < 5000, "the server's own time, not the one sent");
ok("a Witness record holds the photo's hash, its name and size, a rounded position and the server's own time; a photo sent in its place is refused, and extra fields are dropped");

const ip = "203.0.113.11"; mem.set("r:witness:" + ip, { n: WITNESS_DAY, until: Date.now() + 864e5 });
r = await go("witness", { sha256: sha }, visitor(ip)); assert.equal(r.status, 429); assert.match(r.j.error, /today's 100 Witness records/);
r = await go("witness", { sha256: sha }, { ...visitor(ip), ...owner }); assert.equal(r.status, 200, "the owner has no count");
ok("a visitor's address gets " + WITNESS_DAY + " Witness records a day; the owner has no count");
console.log("test52: " + n + " checks passed");
