// The Street Node (node/street-node.mjs), run as its own process the way a Raspberry Pi would run it, beside a stand-in
// for mentifaber.org that answers with the site's own board code:
//  - a phone joining the box is sent to the street's page: the checks phones make ("generate_204" and the rest), and any
//    page from the wider internet, redirect to it; the page sets the street for both apps
//  - it serves Street Board and Street Library, and the same /api/board and /api/library, from the box; nothing else of
//    the site (no source, no tests)
//  - what's posted is kept in its file, and still there after the box restarts
//  - sealing needs the workshop: with no internet it says so (503), and Street Library keeps the photo's fingerprint
//  - with an internet connection it swaps the street's notices with the site (both ways) and keeps the workshop's seal key
import assert from "node:assert/strict"; import { spawn } from "node:child_process"; import http from "node:http"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname);
const { board } = await import(REPO + "/src/board.js");
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "node-")), DATA = path.join(tmp, "box.json");
const free = () => new Promise((r) => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

// the stand-in for mentifaber.org
const mem = new Map(), upst = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, hit: async () => true };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const UP = await free(), site = http.createServer(async (q, r) => { const chunks = []; for await (const c of q) chunks.push(c);
  if (q.url === "/api/seal/key") { r.writeHead(200, { "content-type": "application/json" }); return r.end(JSON.stringify({ kid: "w1", jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" } })); }
  const res = await board(new Request("http://site" + q.url, { method: q.method, headers: { "content-type": "application/json", "cf-connecting-ip": "box" }, body: q.method === "POST" ? Buffer.concat(chunks) : undefined }), { STORE: { idFromName: (x) => x, get: () => upst } }, json);
  r.writeHead(res.status, { "content-type": "application/json" }); r.end(await res.text()); }).listen(UP);

let box = null, PORT = 0;
const start = async (extra = []) => { PORT = await free(); box = spawn(process.execPath, [REPO + "/node/street-node.mjs", "--board", "elm-street", "--port", String(PORT), "--data", DATA, ...extra], { stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; box.stdout.on("data", (d) => (out += d)); box.stderr.on("data", (d) => (out += d)); box.out = () => out;
  for (let i = 0; i < 100 && !/Street Node for/.test(out); i++) await new Promise((r) => setTimeout(r, 50)); assert.match(out, /Street Node for elm-street on port/); };
const stop = () => new Promise((r) => { box.on("exit", r); box.kill("SIGTERM"); });
const get = (p, o = {}) => fetch("http://localhost:" + PORT + p, { redirect: "manual", ...o });
const post = (p, b) => get(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const now = Date.now(), notice = (id, text) => ({ id, kind: "need", text, by: "Ann", at: now - 6e4, exp: now + 864e5 });

await start();
for (const p of ["/generate_204", "/hotspot-detect.html", "/connecttest.txt", "/some/page/on/the/internet"]) { const r = await get(p); assert.equal(r.status, 302, p); assert.equal(r.headers.get("location"), "/"); }
let r = await get("/"), html = await r.text(); assert.equal(r.status, 200); assert.match(html, /elm-street<\/b>'s Street Node/); assert.match(html, /localStorage\.setItem\("street:board",JSON\.stringify\("elm-street"\)\)/); assert.match(html, /localStorage\.setItem\("library:board"/);
assert.match(html, /This box isn't connected to mentifaber\.org/);
ok("a phone joining the box is sent to the street's page (the phones' online checks and any outside page redirect there); it sets the street for both apps");

for (const p of ["/street", "/library", "/street.html", "/assets/ns/radio.js", "/assets/seal/verify.js"]) { r = await get(p); assert.equal(r.status, 200, p); }
assert.match(await (await get("/street")).text(), /Street Board/); assert.match(await (await get("/library")).text(), /Street Library/);
for (const p of ["/src/board.js", "/tests/gtest/test74.mjs", "/node/street-node.mjs", "/assets/../src/board.js", "/hive.html", "/care.html"]) { r = await get(p); assert.notEqual(r.status, 200, p + " isn't served"); }
ok("it serves Street Board, Street Library and what they load, and none of the rest of the site (no source, no tests)");

r = await post("/api/board/elm-street", { posts: [notice("aaaaaaaaaaa1", "Need drinking water for two, 12 Oak St")] }); assert.equal(r.status, 200); assert.equal((await r.json()).added, 1);
assert.equal((await (await get("/api/board/elm-street")).json()).posts[0].text, "Need drinking water for two, 12 Oak St");
r = await post("/api/library/elm-street", { op: "add", item: { id: "bbbbbbbbbbb1", what: "Generator (2 kW)", by: "Bea" }, ok: "c".repeat(64) }); assert.equal(r.status, 200);
assert.equal((await (await get("/api/library/elm-street")).json()).items[0].what, "Generator (2 kW)");
r = await post("/api/seal/witness", { sha256: "d".repeat(64) }); assert.equal(r.status, 503); assert.match((await r.json()).error, /needs the internet/);
assert.equal((await get("/api/seal/key")).status, 503, "no key fetched yet");
ok("the same /api/board and /api/library as the site, from the box; sealing says it needs the internet (503)");

await stop(); assert.ok(fs.existsSync(DATA)); await start();
assert.equal((await (await get("/api/board/elm-street")).json()).posts.length, 1, "the notice is still there"); assert.equal((await (await get("/api/library/elm-street")).json()).items.length, 1, "and the generator");
ok("what's posted is kept in the box's file, and still there after it restarts");

// a connection: the box swaps the street's notices with the site
await board(new Request("http://site/api/board/elm-street", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "phone" }, body: JSON.stringify({ posts: [notice("ccccccccccc1", "Road closed at Elm and 3rd")] }) }), { STORE: { idFromName: (x) => x, get: () => upst } }, json);
await stop(); await start(["--upstream", "http://localhost:" + UP, "--sync", "60"]);
for (let i = 0; i < 100 && !(mem.get("sb:elm-street") || { posts: [] }).posts.some((p) => p.id === "aaaaaaaaaaa1"); i++) await new Promise((r2) => setTimeout(r2, 50));
assert.deepEqual(mem.get("sb:elm-street").posts.map((p) => p.text).sort(), ["Need drinking water for two, 12 Oak St", "Road closed at Elm and 3rd"], "the box's notice reached the site");
for (let i = 0; i < 100 && (await (await get("/api/board/elm-street")).json()).posts.length < 2; i++) await new Promise((r2) => setTimeout(r2, 50));
assert.deepEqual((await (await get("/api/board/elm-street")).json()).posts.map((p) => p.text).sort(), ["Need drinking water for two, 12 Oak St", "Road closed at Elm and 3rd"], "and the site's came to the box");
assert.equal((await (await get("/api/seal/key")).json()).kid, "w1", "the workshop's key is kept for checking seals offline");
const node = await (await get("/api/node")).json(); assert.equal(node.board, "elm-street"); assert.ok(node.sync.at); assert.equal(node.sync.error, null);
assert.match(await (await get("/")).text(), /Last swap with mentifaber\.org: .* UTC/);
ok("with a connection it swaps the street's notices with the site, both ways, and keeps the workshop's seal key");

await stop(); site.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log("street node: all checks passed");
