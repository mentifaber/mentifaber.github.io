// When a Durable Object can't answer (on the free plan: the account's daily Durable Object allowance is spent, and every
// object fails until 00:00 UTC), the site used to show Cloudflare's bare "error code: 1101". Now the Worker catches it:
// AutoFaber answers on its backup line (src/hive-lite.js: Workers AI straight from the Worker), the other APIs say what's
// wrong in JSON, and the backup line keeps its own small per-visitor allowance.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./w48/", import.meta.url).pathname;
mkdirSync(OUT + "src", { recursive: true });
writeFileSync(OUT + "cf-shim.mjs", "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint {}\n");
for (const f of readdirSync(REPO + "/src").filter((f) => f.endsWith(".js")))
  writeFileSync(OUT + "src/" + f, readFileSync(REPO + "/src/" + f, "utf8").replace(/from "cloudflare:workers"/g, 'from "../cf-shim.mjs"').replace(/from "\.\.\/([^"]+\.json)";/g, 'from "' + REPO + '/$1" with { type: "json" };'));
let n = 0; const ok = (m) => console.log("ok " + ++n + " - " + m);
const cache = new Map(); globalThis.caches = { default: { match: async (r) => { const v = cache.get(r.url); return v == null ? undefined : new Response(v); }, put: async (r, res) => { cache.set(r.url, await res.text()); } } };
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const { default: worker } = await import(OUT + "src/worker.js");
const asked = []; const AI = { run: async (model, input) => { asked.push({ model, input }); if (/gpt-oss-120b/.test(model) && input.messages.at(-1).content === "fail first") throw new Error("upstream busy"); return { response: "Hello from " + model.split("/").pop() }; } };
const down = { get: () => ({ fetch: async () => { throw new Error("Exceeded allowed volume of requests in Durable Objects free tier."); } }), idFromName: (x) => x };
const env = { AI, HIVE: down, LOBBY: down, AGENT: down, NEST: down, NULLSPACE: down, STORE: down, ASSETS: { fetch: async () => new Response("asset") } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const go = (path, body, h = {}) => worker.fetch(new Request("https://mentifaber.org" + path, body ? { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.4", ...h }, body: JSON.stringify(body) } : { headers: { "cf-connecting-ip": "198.51.100.4", ...h } }), env, ctx);
console.error = () => {}; // the Worker logs each fallback; not this test's business

// 1 · the model list comes from the backup line, not a 1101
let r = await go("/api/hive/models"); assert.equal(r.status, 200); let j = await r.json();
assert.ok(j.lite && j.models.length >= 5 && j.models.every((m) => m.id.startsWith("workers-ai|@cf/")), JSON.stringify(j).slice(0, 200)); assert.match(j.note, /backup line/);
ok("AutoFaber's models while its Durable Object is down: " + j.models.length + " free Workers AI models, marked as the backup line");

// 2 · chat answers, on the model asked for, and the body the Durable Object would have read still reaches the backup
r = await go("/api/hive/chat", { model: "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast", stream: true, messages: [{ role: "user", text: "hi there" }] }, { cookie: "mf_vigil=" + "a".repeat(64) });
j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.text, "Hello from llama-3.3-70b-instruct-fp8-fast"); assert.ok(j.lite);
assert.equal(asked.at(-1).input.messages.at(-1).content, "hi there"); assert.match(asked.at(-1).input.messages[0].content, /backup line/);
ok("chat on the backup line: the asked-for model answers, even with an owner cookie whose session check also fails");
r = await go("/api/hive/chat", { model: "auto|best", messages: [{ role: "user", text: "fail first" }] }); j = await r.json();
assert.equal(r.status, 200); assert.match(j.model, /llama-3.3-70b/, "the next model answers when the first fails");
ok("a model that fails hands the message to the next: " + j.model);

// 3 · the backup line has its own daily allowance per visitor
for (let i = 0; i < 40 && r.status === 200; i++) r = await go("/api/hive/chat", { messages: [{ role: "user", text: "again " + i }] }, { "cf-connecting-ip": "203.0.113.50" });
assert.equal(r.status, 429); assert.match((await r.json()).error, /backup line/);
r = await go("/api/hive/chat", { messages: [{ role: "user", text: "someone else" }] }, { "cf-connecting-ip": "203.0.113.51" }); assert.equal(r.status, 200);
ok("30 messages a day per visitor on the backup line, then a plain 429; another visitor still gets answers");

// 4 · what needs the stored state says it's paused; other apps' APIs answer in JSON instead of a 1101 page
r = await go("/api/hive/keys/list", {}); assert.equal(r.status, 503); assert.match((await r.json()).error, /paused/);
r = await go("/api/hive/list"); assert.equal(r.status, 200); assert.deepEqual((await r.json()).projects, []);
r = await go("/api/tether/board"); assert.equal(r.status, 503); j = await r.json(); assert.ok(j.down); assert.match(j.error, /isn't answering/);
ok("the vault says it's paused, the swarm list is empty, and Tether's board explains itself in JSON (503, retry-after)");
