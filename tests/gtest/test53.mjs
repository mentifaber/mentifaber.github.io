// The Workshop Portal (src/portal.js, /api/portal/*), through the real Worker and the real Store on in-memory storage:
//  - the board (list, open, edit, delete jobs) answers only the owner's real session
//  - a client's link opens only its own job, and never shows the token or the workshop's private notes
//  - a client can approve the quote once, and write messages (a daily limit per job)
//  - the quote total is worked out here; bad amounts, statuses, services, passport links and addresses are refused
//  - a hosted site's status is checked from here, at most once every 5 minutes
import assert from "node:assert/strict"; import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname; let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const OUT = new URL("./w53/", import.meta.url).pathname; mkdirSync(OUT + "src", { recursive: true });
writeFileSync(OUT + "cf-shim.mjs", "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint {}\n");
for (const f of readdirSync(REPO + "/src").filter((f) => f.endsWith(".js")))
  writeFileSync(OUT + "src/" + f, readFileSync(REPO + "/src/" + f, "utf8").replace(/from "cloudflare:workers"/g, 'from "../cf-shim.mjs"').replace(/from "\.\.\/([^"]+\.json)";/g, 'from "' + REPO + '/$1" with { type: "json" };'));
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const pinged = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { const s = String(u.url || u); if (/^https:\/\/client-site\.example/.test(s)) { pinged.push(s); return new Response(null, { status: 200 }); } if (/down\.example/.test(s)) { pinged.push(s); throw new Error("refused"); } return realFetch(u, o); };
const { default: worker, Store } = await import(OUT + "src/worker.js");
const mem = new Map();
const storage = { get: async (k) => structuredClone(mem.get(k)), put: async (k, v) => { mem.set(k, structuredClone(v)); }, delete: async (k) => mem.delete(k), list: async ({ prefix }) => new Map([...mem].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), getAlarm: async () => null, setAlarm: async () => {} };
const real = "e".repeat(64), st = new Store({ storage, setWebSocketAutoResponse() {} }, {});
st.getSession = async (t) => (t === real ? { app: "vigil", exp: Date.now() + 1e9 } : null);
const env = { STORE: { idFromName: (x) => x, get: () => st }, HIVE: { idFromName: (x) => x, get: () => ({ fetch: async () => Response.json({}) }) }, ASSETS: { fetch: async () => new Response("asset") } }, ctx = { waitUntil() {}, passThroughOnException() {} };
const go = async (path, method = "GET", body, h = {}) => { const r = await worker.fetch(new Request("https://mentifaber.org/api/portal/" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.4", ...h }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx); return { status: r.status, j: await r.json() }; };
const O = { cookie: "mf_vigil=" + real };

// 1 · the board is the owner's
for (const h of [{}, { cookie: "mf_vigil=" + "f".repeat(64) }, { "x-hive-owner": "1" }]) { assert.equal((await go("jobs", "GET", undefined, h)).status, 403); assert.equal((await go("jobs", "POST", { title: "x" }, h)).status, 403); }
ok("the board (list and open jobs) refuses a visitor, a made-up session cookie and an owner header");

// 2 · open a job, quote it
let r = await go("jobs", "POST", { title: "Screen and battery", service: "repair", clientName: "Sam", clientEmail: "sam@example.com", quote: { items: [{ desc: "OLED screen", amount: 189.5 }, { desc: "Battery", amount: "79" }, { desc: "free coffee", amount: -5 }, { desc: "", amount: 3 }], note: "Parts arrive Thursday" } }, O);
assert.equal(r.status, 200, JSON.stringify(r.j)); const job = r.j.job;
assert.match(job.id, /^[0-9a-f]{10}$/); assert.match(job.token, /^[0-9a-f]{32}$/); assert.equal(job.status, "quote");
assert.deepEqual(job.quote.items, [{ desc: "OLED screen", amount: 189.5 }, { desc: "Battery", amount: 79 }]); assert.equal(job.quote.total, 268.5);
for (const bad of [{ title: "" }, { title: "x", service: "hacking" }, { title: "x", quote: { items: [{ desc: "x", amount: "lots" }] } }]) assert.equal((await go("jobs", "POST", bad, O)).status, 400, JSON.stringify(bad));
r = await go("jobs/" + job.id, "POST", { status: "teleported" }, O); assert.equal(r.status, 400);
r = await go("jobs/" + job.id, "POST", { passport: "https://evil.example/passport#x" }, O); assert.match(r.j.error, /Device Passport link/);
r = await go("jobs/" + job.id, "POST", { site: "javascript:alert(1)" }, O); assert.equal(r.status, 400);
r = await go("jobs/" + job.id, "POST", { note: "Customer was rude, charge extra", private: true }, O); assert.equal(r.status, 200);
ok("the owner opens a job; the quote total is worked out here (negative and empty lines dropped); a bad title, service, amount, status, passport link or address is refused");

// 3 · the client's view
const T = job.token;
for (const t of ["", "0".repeat(32), T.slice(0, 31) + (T.at(-1) === "a" ? "b" : "a"), T + "0"]) assert.equal((await go("job/" + job.id + "?t=" + t)).status, 404);
r = await go("job/" + job.id + "?t=" + T); assert.equal(r.status, 200);
const cv = JSON.stringify(r.j); assert.ok(!cv.includes(T), "the token isn't in the client's view"); assert.ok(!/rude/.test(cv), "private notes stay private"); assert.ok(!/sam@example/.test(cv), "nor the client's own email");
assert.equal(r.j.job.quote.total, 268.5); assert.equal(r.j.job.client.name, "Sam");
ok("a client's link opens only with its exact token, and the client's view carries no token, no private notes and no email");

// 4 · approve once, write messages
r = await go("job/" + job.id + "/approve", "POST", { t: "0".repeat(32) }); assert.equal(r.status, 404);
r = await go("job/" + job.id + "/approve", "POST", { t: T }); assert.equal(r.j.job.status, "approved"); assert.ok(r.j.job.approvedAt);
r = await go("job/" + job.id + "/approve", "POST", { t: T }); assert.equal(r.status, 409);
r = await go("job/" + job.id + "/message", "POST", { t: T, text: "Can you also check the camera?" }); assert.match(r.j.job.timeline.at(-1).text, /camera/); assert.equal(r.j.job.timeline.at(-1).by, "client");
const b = await go("jobs/" + job.id, "GET", undefined, O); assert.equal(b.j.job.unread, true, "the board marks it unread");
mem.set("r:portal-msg:" + job.id, { n: 30, until: Date.now() + 864e5 }); r = await go("job/" + job.id + "/message", "POST", { t: T, text: "again" }); assert.equal(r.status, 429);
ok("the client approves the quote once (not twice, not without the token), and writes to the workshop, which marks the job unread; 30 messages a day per job");

// 5 · requoting resets the approval; passports and hosted sites
r = await go("jobs/" + job.id, "POST", { quote: { items: [{ desc: "Screen only", amount: 189.5 }] }, status: "quote" }, O); assert.equal(r.j.job.approvedAt, null);
r = await go("jobs/" + job.id, "POST", { passport: "https://mentifaber.org/passport#abc.def", site: "client-site.example/shop" }, O); assert.equal(r.j.job.passport, "https://mentifaber.org/passport#abc.def"); assert.equal(r.j.job.site, "https://client-site.example/shop");
r = await go("job/" + job.id + "?t=" + T); assert.deepEqual([r.j.job.site.check.up, r.j.job.site.check.status], [true, 200]); assert.equal(pinged.length, 1);
await go("job/" + job.id + "?t=" + T); assert.equal(pinged.length, 1, "checked at most once every 5 minutes");
await go("jobs/" + job.id, "POST", { site: "https://down.example" }, O); r = await go("job/" + job.id + "?t=" + T); assert.equal(r.j.job.site.check.up, false);
ok("a new quote needs a new approval; a passport link and a hosted site attach, and the site's status is checked from here at most every 5 minutes (down shows down)");

// 6 · list and delete
r = await go("jobs", "GET", undefined, O); assert.equal(r.j.jobs.length, 1);
assert.equal((await go("jobs/" + job.id, "DELETE", undefined, O)).status, 200); assert.equal((await go("job/" + job.id + "?t=" + T)).status, 404);
ok("the board lists the jobs; a deleted job's link stops working");
console.log("test53: " + n + " checks passed");
