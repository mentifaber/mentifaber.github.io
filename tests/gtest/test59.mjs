// Diagnostics: the Worker writes one structured line for each API request that failed (5xx or a thrown error) or was slow
// (8 s or more): {evt, sub, route, method, status, ms, err}. It names the subsystem and the route, so a timeout can be
// traced, and nothing private: ids and keys in the path become ":id", there's no query string (where tokens go), no
// headers or bodies, and an error keeps only its type and a short message with long hex, emails and numbers taken out.
import assert from "node:assert/strict"; import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname; let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const OUT = new URL("./w59/", import.meta.url).pathname; mkdirSync(OUT + "src", { recursive: true });
writeFileSync(OUT + "cf-shim.mjs", "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint {}\n");
for (const f of readdirSync(REPO + "/src").filter((f) => f.endsWith(".js")))
  writeFileSync(OUT + "src/" + f, readFileSync(REPO + "/src/" + f, "utf8").replace(/from "cloudflare:workers"/g, 'from "../cf-shim.mjs"').replace(/from "\.\.\/([^"]+\.json)";/g, 'from "' + REPO + '/$1" with { type: "json" };'));
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const { default: worker, diagLine } = await import(OUT + "src/worker.js");
const U = (p) => new URL("https://mentifaber.org" + p);

// 1 · which requests get a line
assert.equal(diagLine(U("/api/hive/list"), "GET", 200, 40), null, "a quick success: no line");
assert.equal(diagLine(U("/os"), "GET", 500, 40), null, "pages aren't API requests");
assert.equal(diagLine(U("/api/hive/list"), "GET", 404, 40), null, "a 4xx is the caller's answer, not a failure");
let l = diagLine(U("/api/hive/chat"), "POST", 200, 12000); assert.deepEqual([l.sub, l.route, l.status, l.slow], ["hive", "/api/hive/chat", 200, true]);
l = diagLine(U("/api/nest/state"), "GET", 503, 900); assert.deepEqual([l.evt, l.sub, l.method, l.status, l.slow], ["api", "nest", "GET", 503, undefined]);
ok("a line for each failed (5xx or thrown) or slow (8 s+) API request, naming the subsystem and route; none for quick answers, 4xx or pages");

// 2 · nothing private in it
l = diagLine(U("/api/portal/job/0a1b2c3d4e?t=" + "f".repeat(32)), "GET", 500, 50); assert.equal(l.route, "/api/portal/job/:id"); assert.ok(!JSON.stringify(l).includes("ffff"));
l = diagLine(U("/api/checkin/0123456789abcdef/ok"), "POST", 500, 50); assert.equal(l.route, "/api/checkin/:id/ok");
l = diagLine(U("/api/hive/state"), "GET", 0, 30, new TypeError("bad thing for anna@example.com on 0123456789abcdef0123 at 1764031234567"));
assert.equal(l.err, "TypeError: bad thing for … on … at …"); assert.equal(l.status, 0);
ok("ids and keys in the path become :id and the query string (tokens) is dropped; an error keeps its type, with emails, long hex and numbers taken out");

// 3 · end to end: a request whose storage throws is logged once, by route, with no token
const lines = []; const log0 = console.log; console.log = (x) => { if (typeof x === "string" && x.startsWith('{"evt"')) lines.push(JSON.parse(x)); else log0(x); };
const broken = { idFromName: (x) => x, get: () => new Proxy({}, { get: () => async () => { throw new Error("storage said no for job 9f8e7d6c5b"); } }) };
const env = { STORE: broken, HIVE: { idFromName: (x) => x, get: () => ({ fetch: async () => Response.json({}) }) }, ASSETS: { fetch: async () => new Response("asset") } }, ctx = { waitUntil() {}, passThroughOnException() {} };
const r = await worker.fetch(new Request("https://mentifaber.org/api/portal/job/0a1b2c3d4e?t=" + "a".repeat(32)), env, ctx);
console.log = log0;
assert.ok(r.status >= 500, "the request failed: " + r.status); assert.equal(lines.length, 1, JSON.stringify(lines)); assert.deepEqual([lines[0].sub, lines[0].route], ["portal", "/api/portal/job/:id"]);
assert.ok(!JSON.stringify(lines).includes("aaaa"), "no token in the log");
ok("a real failed request writes one line through the Worker, by route, with no token in it");
// 4 · reading a page for AutoFaber: stops at its size cap instead of loading all of an enormous page; private addresses
// (172.16–31.x and 0.x included now, as elsewhere on the site) are refused
const { readPage } = await import(OUT + "src/hive-kit.js"); const fetch0 = globalThis.fetch; let pulled = 0;
globalThis.fetch = async () => new Response(new ReadableStream({ pull(c) { pulled++; c.enqueue(new TextEncoder().encode("<p>" + "x".repeat(65536) + "</p>")); if (pulled > 5000) c.close(); } }), { headers: { "content-type": "text/html" } });
await readPage("https://huge.example/", 1000); assert.ok(pulled < 30, "read " + pulled + " chunks of a 330 MB page");
for (const h of ["http://172.20.0.1/", "http://0.0.0.0/", "http://10.0.0.1/", "http://localhost/", "https://[::1]/"]) await assert.rejects(readPage(h), /not a public page/, h);
globalThis.fetch = fetch0;
ok("a page AutoFaber reads stops at its size cap (not all 330 MB); private addresses, 172.16–31.x and 0.x included, are refused");
// 5 · redirects: a user-supplied address is followed hop by hop, and every new address must pass the same public test
const { fetchPublic, publicHref } = await import(OUT + "src/hive-kit.js"); const fetch1 = globalThis.fetch, seen = [];
const hops = { "https://shop.example/a": "https://shop.example/b", "https://shop.example/b": "https://cdn.example/c", "https://evil.example/x": "http://169.254.169.254/latest", "https://evil.example/y": "http://172.20.0.5/", "https://loop.example/0": "/1" };
globalThis.fetch = async (u, init) => { seen.push([String(u), init.redirect]); const to = hops[String(u)] || (/loop\.example\/\d+$/.test(String(u)) ? "/" + (+String(u).split("/").pop() + 1) : null);
  return to ? new Response(null, { status: 302, headers: { location: to } }) : new Response("ok " + u, { status: 200 }); };
let fr = await fetchPublic("https://shop.example/a", {}, publicHref); assert.equal(await fr.text(), "ok https://cdn.example/c"); assert.ok(seen.every(([, r]) => r === "manual"), "never left to the platform to follow");
await assert.rejects(fetchPublic("https://evil.example/x", {}, publicHref), /isn't public/); await assert.rejects(fetchPublic("https://evil.example/y", {}, publicHref), /isn't public/);
await assert.rejects(fetchPublic("https://loop.example/0", {}, publicHref), /too many redirects/);
await assert.rejects(readPage("https://evil.example/x"), /isn't public/, "AutoFaber's page reader goes through it");
globalThis.fetch = fetch1;
ok("redirects are followed by hand and each new address is checked: a public page that redirects to 169.254.x or 172.20.x is refused, and loops stop at 5");
console.log("test59: " + n + " checks passed");
