// Tether's leaderboard under Node: the real Lobby Durable Object (src/worker.js) on node:sqlite. A name belongs to the
// device that first posts it (by a secret key the server keeps only as a hash), so nobody can post scores, join the
// online lobby or take wins under someone else's name. Scores that break the game's physics are refused.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("./cf-shim.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
for (const f of readdirSync(REPO + "/src").filter((f) => f.endsWith(".js")))
  writeFileSync(OUT + f, readFileSync(REPO + "/src/" + f, "utf8").replace('from "cloudflare:workers"', 'from "../cf-shim.mjs"')
    .replace(/^import (\w+) from "\.\.\/([^"]+\.json)".*$/gm, (_, v, f) => "const " + v + " = " + readFileSync(REPO + "/" + f, "utf8").trim() + ";")); // JSON imports, inlined
const { Lobby } = await import(OUT + "worker.js");

class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } one() { if (this.r.length !== 1) throw new Error("one(): " + this.r.length); return this.r[0]; } }
const db = new DatabaseSync(":memory:");
const sql = { exec(q, ...a) { a = a.map((x) => (x === undefined ? null : typeof x === "boolean" ? +x : x)); const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a)); st.run(...a); return new Cursor([]); } };
const sent = [];
const ctx = { storage: { sql }, getWebSockets: () => [], acceptWebSocket() {}, setWebSocketAutoResponse() {}, waitUntil() {} };
const L = new Lobby(ctx, {});
const ok = (m) => console.log("  ✓ " + m);
const post = async (path, b) => (await L.fetch(new Request("https://mentifaber.org/api/tether/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }))).json();
const board = async (mode) => (await (await L.fetch(new Request("https://mentifaber.org/api/tether/board?mode=" + mode))).json()).rows;
const A = "a".repeat(32), B = "b".repeat(32);

// 1. the first device to post a name owns it; another device can't raise (or touch) that name's score
let r = await post("score", { name: "Sam", key: A, mode: "classic", v: 500, m: 3000 }); assert.equal(r.rank, 1);
r = await post("score", { name: "sam", key: B, mode: "classic", v: 99999, m: 3000 }); assert.equal(r.claimed, true); assert.equal(r.rank, null);
r = await post("score", { name: "Sam", mode: "classic", v: 99999, m: 3000 }); assert.equal(r.claimed, true, "no key, no name");
assert.deepEqual((await board("classic")).map((x) => [x.name, x.v]), [["Sam", 500]]);
r = await post("score", { name: "Sam", key: A, mode: "classic", v: 800, m: 3000 }); assert.equal(r.rank, 1); assert.equal((await board("classic"))[0].v, 800);
ok("a name belongs to the device that claimed it: other devices (or no key) can't post under it, in any letter case");

// 2. a different name is free for the second device; the claim is per name, not per device
r = await post("score", { name: "Riley", key: B, mode: "classic", v: 650, m: 3000 }); assert.equal(r.rank, 2);
assert.deepEqual((await board("classic")).map((x) => x.name), ["Sam", "Riley"]);
ok("other names stay free to claim");

// 3. physics: a 5000m trial can't beat ~28s, a 60s sprint can't pass ~10800m
assert.equal((await post("score", { name: "Sam", key: A, mode: "trial", v: 9.5, m: 5000 })).ok, false);
assert.equal((await post("score", { name: "Sam", key: A, mode: "sprint", v: 20000, m: 20000 })).ok, false);
assert.equal((await post("score", { name: "Sam", key: A, mode: "trial", v: 61.2, m: 5000 })).rank, 1);
ok("impossible trial times and sprint distances are refused; real ones rank");

// 4. the online lobby: a claimed name only joins from its own device
const ws = (id) => { const att = { id, name: "", status: "new" }; return { deserializeAttachment: () => att, serializeAttachment: (a) => Object.assign(att, a), send: (m) => sent.push([id, JSON.parse(m)]), att }; };
const w1 = ws("w1"); await L.webSocketMessage(w1, JSON.stringify({ t: "hello", name: "Sam", key: B }));
assert.deepEqual(sent.at(-1), ["w1", { t: "taken", name: "Sam" }]); assert.equal(w1.att.name, "");
const w2 = ws("w2"); await L.webSocketMessage(w2, JSON.stringify({ t: "hello", name: "Sam", key: A }));
assert.equal(w2.att.name, "Sam"); assert.ok(sent.some(([id, m]) => id === "w2" && m.t === "welcome"));
ok("joining the online lobby under someone else's name is refused; the owner gets in");

// 5. the hash, never the key, is stored
const rows = db.prepare("SELECT k,h FROM tclaim").all(); assert.equal(rows.length, 2); assert.ok(rows.every((x) => x.h.length === 64 && !x.h.includes(A) && !x.h.includes(B)));
ok("claims keep only a SHA-256 of the key");

// 6. the game itself: yellow speed walls break at 600, and the AI view lists gravity wells
const { createGame } = await import(OUT + "tether-core.js");
const AG = createGame(); const o = AG.start("classic", 7); assert.ok(Array.isArray(o.gravityWells));
let need = null; for (let i = 0; i < 400 && need === null; i++) { AG.step(true, .25); const l = AG.obs().lasers.find((x) => x.kind === "yellow-needs-speed"); if (l) need = l.needVx; if (AG.obs().over) AG.start("classic", 7 + i); }
assert.ok(need === null || need === 600, "speed walls break at 600 (" + need + ")");
ok("the headless game (what the server runs for AI agents) has the new rules");
console.log("tether leaderboard and rules: all checks passed");
