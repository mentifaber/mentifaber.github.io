// Foundry for other makers (src/makers.js): a maker sends a faberos/1 manifest and gets a private status link; the
// workshop approves, sends back or pulls; approved apps are listed for FaberOS and Foundry with only their manifest's
// fields (never the maker's email or notes), and a glyph that can't carry script. An update waits for review while the
// approved version stays listed. Ids belong to whoever sent them first. The checker on /makers and the server's are
// the same file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const { makers, safeGlyph, publicApp } = await import(REPO + "/src/makers.js");

assert.equal(readFileSync(REPO + "/src/faber-validate.js", "utf8"), readFileSync(REPO + "/assets/os/validate.js", "utf8"), "src/faber-validate.js is a copy of assets/os/validate.js: change both");
ok("the server checks manifests with the same rules as the makers' page");

assert.equal(safeGlyph('<path d="M4 4h16v16H4z"/><circle cx="12" cy="12" r="3"/>'), '<path d="M4 4h16v16H4z"/><circle cx="12" cy="12" r="3"/>');
assert.equal(safeGlyph('<path d="M4 4" onload="alert(1)"/><script>alert(1)</script><image href="x"/>'), '<path d="M4 4"/>');
assert.equal(safeGlyph('<path d="javascript:alert(1)"/>'), '<rect x="5" y="5" width="14" height="14" rx="3"/>');
assert.equal(safeGlyph('"><img src=x onerror=alert(1)>'), '<rect x="5" y="5" width="14" height="14" rx="3"/>');
ok("a glyph keeps only simple shapes with plain numbers: no script, handlers, images or links");

// a Store stand-in: kv and the fixed-window counter
const kv = new Map(), hits = new Map();
const STORE = { idFromName: () => "main", get: () => ({ kvGet: async (k) => (kv.has(k) ? structuredClone(kv.get(k)) : null), kvPut: async (k, v) => kv.set(k, structuredClone(v)), kvDel: async (k) => kv.delete(k),
  kvList: async (p) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, structuredClone(v)]), hit: async (k, lim) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= lim; } }) };
const env = { STORE }, alerts = [];
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const call = async (path, body, owner = false, ip = "1.2.3.4") => { const r = await makers(new Request("https://mentifaber.org/api/makers/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined }), env, json, owner, { alert: async (x) => alerts.push(x) }); return { ...(await r.json()), status: r.status }; };
const man = { format: "faberos/1", id: "tide-clock", name: "Tide Clock", desc: "High and low tides for any harbour, with a clock face.", entry: "https://tides.example.com/app", cat: "world", hue: 200,
  permissions: ["fullscreen", "geolocation"], kit: true, glyph: '<circle cx="12" cy="12" r="9" onclick="x()"/>', verbs: [{ name: "next-tide", label: "Tell me the next tide", changes: false, args: { "harbour?": "string" } }] };

assert.equal((await call("submit", { manifest: { ...man, entry: "http://x" }, contact: "a@b.co" })).status, 422, "a manifest that doesn't pass isn't taken");
assert.equal((await call("submit", { manifest: man, contact: "not an email" })).status, 400);
const s1 = await call("submit", { manifest: man, contact: "maker@tides.example.com", by: "Tide Co", note: "first app" });
assert.equal(s1.status, 200); assert.match(s1.token, /^[0-9a-f]{32}$/); assert.equal(s1.link, "/makers#status=tide-clock." + s1.token);
assert.equal(alerts.length, 1); assert.match(alerts[0].title, /a new app, Tide Clock/);
assert.deepEqual((await call("apps")).apps, [], "nothing is listed before it's reviewed");
assert.equal((await call("submit", { manifest: man, contact: "someone@else.example" })).status, 409, "someone else can't take or overwrite the id");
assert.equal((await call("status?id=tide-clock&t=" + "0".repeat(32))).status, 404);
assert.equal((await call("status?id=tide-clock&t=" + s1.token)).app.status, "pending");
ok("a maker sends a manifest (checked, with an email) and gets a private status link; the workshop is told; nothing is listed yet; the id is theirs");

assert.equal((await call("queue")).status, 403); assert.equal((await call("review", { id: "tide-clock", decision: "approve" })).status, 403);
const q = await call("queue", null, true); assert.equal(q.apps.length, 1); assert.equal(q.apps[0].contact, "maker@tides.example.com"); assert.equal(q.apps[0].check.ok, true);
await call("review", { id: "tide-clock", decision: "reject", note: "the window is blank on phones" }, true);
let st = (await call("status?id=tide-clock&t=" + s1.token)).app; assert.equal(st.status, "changes"); assert.equal(st.note, "the window is blank on phones");
await call("submit", { manifest: man, contact: "maker@tides.example.com", token: s1.token });
await call("review", { id: "tide-clock", decision: "approve", note: "lovely" }, true);
const apps = (await call("apps")).apps; assert.equal(apps.length, 1);
const a = apps[0]; assert.equal(a.id, "x-tide-clock"); assert.equal(a.maker, true); assert.equal(a.by, "Tide Co"); assert.equal(a.entry, "https://tides.example.com/app");
assert.equal(a.glyph, '<circle cx="12" cy="12" r="9"/>'); assert.deepEqual(a.verbs.map((v) => v.name), ["next-tide"]);
assert.ok(!JSON.stringify(apps).includes("maker@tides") && !JSON.stringify(apps).includes("first app") && !JSON.stringify(apps).includes("token"), "never the maker's email, notes or token");
ok("only the workshop sees the queue and decides; sent back with a note, sent again, approved: listed for FaberOS and Foundry as x-<id>, with its verbs, and nothing private");

await call("submit", { manifest: { ...man, name: "Tide Clock 2" }, contact: "maker@tides.example.com", token: s1.token });
assert.equal((await call("apps")).apps[0].name, "Tide Clock", "the approved version stays listed while an update waits");
st = (await call("status?id=tide-clock&t=" + s1.token)).app; assert.equal(st.update, true); assert.equal(st.listed, true);
await call("review", { id: "tide-clock", decision: "approve" }, true); assert.equal((await call("apps")).apps[0].name, "Tide Clock 2");
await call("review", { id: "tide-clock", decision: "pull", note: "asked for the microphone without using it" }, true);
assert.deepEqual((await call("apps")).apps, []); assert.equal((await call("status?id=tide-clock&t=" + s1.token)).app.status, "pulled");
ok("an update waits for review while the approved version stays listed; a pulled app leaves FaberOS and Foundry");

for (let i = 0; i < 6; i++) await call("submit", { manifest: { ...man, id: "app-" + i }, contact: "x@y.co" }, false, "9.9.9.9");
assert.equal((await call("submit", { manifest: { ...man, id: "app-9" }, contact: "x@y.co" }, false, "9.9.9.9")).status, 429);
ok("five submissions a day from one address");
console.log("makers: all checks passed");
