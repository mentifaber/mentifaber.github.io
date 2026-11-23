// Who may do what, checked on the server (the audit's entitlement table). The browser holds no rights of its own: what a
// visitor's page stores or claims changes nothing, and every protected route decides from the session alone.
//  1  a visitor asks for the owner's memory                → refused
//  2  a visitor opens the key vault                         → refused
//  3  a visitor asks for a model on a paid owner key        → refused, and the paid provider is never called
//  4  a visitor past the day's messages                     → refused by the server's own count
//  5  a visitor claims to be the owner in the body          → nothing changes
//  6  a request from the internet carries the owner header  → the Worker strips it; only a Vigil session sets it
//  7  the same visitor fires many messages at once          → the day's count still holds
//  8  a visitor reads what another person has in progress   → nothing comes back
//  9  owner keys and visitors (P1.03): a new free key answers only the owner until switched on; switched on, visitors
//     get at most GUEST_KEY_DAY calls a day from it, counted apart from the owner's; a paid key can never be switched on
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const sent = [];
globalThis.fetch = async (u, o = {}) => { const url = String(u && u.url || u), body = o.body && typeof o.body === "string" ? JSON.parse(o.body) : null;
  if (/\/models$/.test(url)) return Response.json({ data: /cerebras/.test(url) ? [{ id: "gpt-oss-120b" }, { id: "llama3.1-8b" }] : /openai/.test(url) ? [{ id: "gpt-4.1" }] : [] });
  if (/chat\/completions$/.test(url)) { sent.push({ url, model: body.model }); return Response.json({ choices: [{ message: { content: (/cerebras/.test(url) ? "FREE " : "PAID ") + body.model } }] }); }
  throw new Error("offline: " + url); };
const H = await import("./harness.mjs"), { hive, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const V = { "cf-connecting-ip": "203.0.113.50" };
const call = (path, body, owner, extra) => H.call(path, body, owner, extra);
const chat = (model, text, owner = false, ip = V) => call("/chat", { model, messages: [{ role: "user", text }] }, owner, owner ? {} : ip);
const today = new Date().toISOString().slice(0, 10);

// 1 · the owner's memory
for (const p of ["/mind", "/mind/list", "/mind/export", "/mind/brief"]) { const r = await call(p, null, false, V); assert.ok(r.error || !r.brief, p + " gave a visitor something: " + JSON.stringify(r).slice(0, 120)); assert.ok(!r.stable && !r.brief, p); }
ok("a visitor asking for AutoFaber's memory (the Mind and its brief) is refused");

// 2 · the vault
let r = await call("/keys", null, false, V); assert.ok(r.error && !r.keys, JSON.stringify(r).slice(0, 120));
r = await call("/keys/add", { provider: "cerebras", key: "csk-visitor-0123456789" }, false, V); assert.ok(r.error && !r.ok);
assert.equal(db.prepare("SELECT COUNT(*) c FROM vault").get().c, 0, "a visitor can't add a key either");
ok("a visitor can't list, read or add keys in the vault");

// 3 · a paid owner key
const paid = await call("/keys/add", { provider: "openai", key: "sk-paid-0123456789" }, true); assert.ok(paid.ok, JSON.stringify(paid)); sent.length = 0;
r = await chat("k:" + paid.key.id + "|gpt-4.1", "hello"); assert.match(r.error || "", /owner/); assert.equal(sent.length, 0, "the paid provider was never called");
r = await chat("k:" + paid.key.id + "|gpt-4.1", "hello", true); assert.match(r.text || "", /^PAID/, "the owner can use it");
ok("a visitor asking for a model on a paid owner key is refused before the provider is called; the owner is answered");

// 4 · the day's messages, counted on the server
db.prepare("INSERT INTO limits(k,n) VALUES(?,?)").run("chat:" + today + ":" + V["cf-connecting-ip"], 60);
r = await chat("workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast", "one more?"); assert.match(r.error || "", /today's 60 messages/);
ok("a visitor past the day's 60 messages is refused by the server's count, whatever the page thinks is left");

// 5 · claims in the request change nothing
r = await call("/keys", { owner: true, plan: "pro", tier: "owner", isOwner: 1 }, false, { ...V, "x-plan": "pro", cookie: "mf_plan=pro; owner=1" }); assert.ok(r.error && !r.keys);
r = await call("/chat", { model: "k:" + paid.key.id + "|gpt-4.1", owner: true, plan: "pro", messages: [{ role: "user", text: "hi" }] }, false, { "cf-connecting-ip": "203.0.113.51" }); assert.match(r.error || "", /owner/);
ok("a visitor who says it's the owner or on a paid plan (in the body, a header or a cookie) gets exactly what a visitor gets");

// 6 · the Worker decides who the owner is
const OUT = new URL("./w50/", import.meta.url).pathname; mkdirSync(OUT + "src", { recursive: true });
writeFileSync(OUT + "cf-shim.mjs", "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint {}\n");
for (const f of readdirSync(REPO + "/src").filter((f) => f.endsWith(".js")))
  writeFileSync(OUT + "src/" + f, readFileSync(REPO + "/src/" + f, "utf8").replace(/from "cloudflare:workers"/g, 'from "../cf-shim.mjs"').replace(/from "\.\.\/([^"]+\.json)";/g, 'from "' + REPO + '/$1" with { type: "json" };'));
const saw = []; const stub = { get: () => ({ fetch: async (req) => { saw.push({ url: req.url, owner: req.headers.get("x-hive-owner"), agent: req.headers.get("x-agent-owner") }); return Response.json({ ok: true }); } }), idFromName: (x) => x };
const cache = new Map(); globalThis.caches = { default: { match: async (q) => cache.get(q.url), put: async () => {} } };
const { default: worker } = await import(OUT + "src/worker.js");
const real = "e".repeat(64), STORE = { idFromName: (x) => x, get: () => ({ getSession: async (t) => (t === real ? { app: "vigil" } : null) }) }; // one real owner session
const env = { HIVE: stub, AGENT: stub, STORE, ASSETS: { fetch: async () => new Response("asset") } }, ctx = { waitUntil() {}, passThroughOnException() {} };
await worker.fetch(new Request("https://mentifaber.org/api/hive/keys", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1", "cf-connecting-ip": "198.51.100.7" }, body: "{}" }), env, ctx);
await worker.fetch(new Request("https://mentifaber.org/api/hive/mind/export", { headers: { "x-hive-owner": "1", cookie: "mf_vigil=" + "f".repeat(64) } }), env, ctx);
assert.equal(saw.length, 2, JSON.stringify(saw)); assert.ok(saw.every((s) => s.owner !== "1"), "an owner header from outside never reaches AutoFaber: " + JSON.stringify(saw));
await worker.fetch(new Request("https://mentifaber.org/api/hive/mind/export", { headers: { cookie: "mf_vigil=" + real } }), env, ctx); assert.equal(saw[2].owner, "1", "the real session is the owner");
ok("a direct call carrying the owner header (with or without a made-up session cookie) reaches AutoFaber as a visitor");

// 7 · many at once
const ip7 = { "cf-connecting-ip": "203.0.113.77" }; db.prepare("INSERT INTO limits(k,n) VALUES(?,?)").run("chat:" + today + ":" + ip7["cf-connecting-ip"], 57);
const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => chat("workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast", "burst " + i, false, ip7)));
const through = burst.filter((x) => !/today's 60 messages/.test(x.error || "")).length;
assert.equal(through, 3, "only the 3 left of the 60 went through: " + through); assert.equal(db.prepare("SELECT n FROM limits WHERE k=?").get("chat:" + today + ":" + ip7["cf-connecting-ip"]).n, 60);
ok("twelve messages fired at once with three left today: exactly three go through, and the count stops at 60");

// 8 · someone else's reply in the making
hive._steps = new Map([["sid-owner-1", { owner: true, list: ["reading your notes"], now: "thinking" }]]);
r = await call("/steps", { sid: "sid-owner-1" }, false, V); assert.deepEqual(r.steps, []); assert.ok(!r.now);
r = await call("/steps", { sid: "sid-owner-1" }, true); assert.deepEqual(r.steps, ["reading your notes"]);
ok("a visitor who guesses the id of the owner's reply in progress sees nothing of it");

// 9 · owner keys and visitors
db.prepare("DELETE FROM limits").run(); hive.quota = 0; await hive.rest(); sent.length = 0;
const free = await call("/keys/add", { provider: "cerebras", key: "csk-free-0123456789" }, true); assert.ok(free.ok, JSON.stringify(free));
assert.equal(free.key.guests, false, "a new key answers only the owner"); assert.equal(free.key.freeTier, true);
r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "a name for a bakery?"); assert.match(r.error || "", /allowance is used up/, "a visitor isn't answered by a key not shared with visitors");
assert.ok(!sent.length, "no key was called for the visitor");
r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "a name for a bakery?", true); assert.match(r.text || "", /^(FREE|PAID)/, "the owner is still answered");
r = await call("/keys/set", { kid: paid.key.id, guests: true }, true); assert.match(r.error || "", /free tier/, "a paid key can't be shared with visitors");
r = await call("/keys/set", { kid: free.key.id, guests: true }, false, V); assert.ok(r.error, "a visitor can't switch it on");
r = await call("/keys/set", { kid: free.key.id, guests: true }, true); assert.equal(r.key.guests, true);
sent.length = 0; r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "a name for a bakery?"); assert.match(r.text || "", /^FREE/, JSON.stringify(r).slice(0, 200));
assert.ok(sent.every((s) => /cerebras/.test(s.url)));
const used = (await call("/keys", null, true)).keys.find((k) => k.id === free.key.id); assert.ok(used.guestToday >= 1 && used.guestCap === 200, JSON.stringify(used));
const before = used.guestToday; await chat("workers-ai|@cf/openai/gpt-oss-120b", "and for a cafe?", true);
assert.equal((await call("/keys", null, true)).keys.find((k) => k.id === free.key.id).guestToday, before, "the owner's own use isn't counted as visitors'");
db.prepare("INSERT INTO limits(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n").run("gkey:" + free.key.id + ":" + today, 200);
sent.length = 0; r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "one past the cap", false, { "cf-connecting-ip": "203.0.113.90" }); assert.match(r.error || "", /allowance is used up/); assert.ok(!sent.length);
r = await call("/keys/set", { kid: free.key.id, guests: false }, true); assert.equal(r.key.guests, false);
ok("a new free key answers only the owner; switched on, visitors get up to 200 calls a day from it, counted apart from the owner; a paid key can't be shared");

console.log("test50: " + n + " checks passed");
