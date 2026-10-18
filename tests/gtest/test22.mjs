// Genesis picks its own tools (a planning call, two rounds), and models are ranked by how they actually do.
import assert from "node:assert/strict";
const hits = [];
const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = async (u) => {
  u = typeof u === "string" ? u : String(u.url || u); hits.push(u);
  if (u.includes("en.wikipedia.org/w/api.php") && u.includes("generator=search")) return J({ query: { pages: { 1: { index: 1, title: "Durable Objects pricing", fullurl: "https://developers.cloudflare.com/durable-objects/platform/pricing/", extract: "Durable Objects are billed by requests and duration." } } } });
  if (u.includes("en.wikipedia.org/w/api.php")) return J({ query: { search: [{ title: "Cloudflare", snippet: "a web infrastructure company" }] } });
  if (u.includes("en.wikipedia.org/api/rest_v1/page/summary/")) return J({ title: "Cloudflare", extract: "Cloudflare, Inc. is an American company that provides content delivery network services.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Cloudflare" } } });
  if (u.startsWith("https://developers.cloudflare.com/")) return new Response("<html><title>Pricing · Durable Objects</title><body><p>Requests: $0.15 per million. Duration: $12.50 per million GB-s.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
  throw new Error("offline in this test: " + u);
};
const H = await import("./harness.mjs"); const { call, calls, setResponder } = H;
const M = "workers-ai|@cf/openai/gpt-oss-120b"; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
let plans = 0, reply = null;
setResponder((sys, user) => {
  if (!/You decide which tools Genesis/.test(sys)) return null; plans++;
  if (reply) return reply(user);
  if (/ALREADY GATHERED \(round 1 results/.test(user)) return JSON.stringify({ calls: [{ tool: "read", arg: "https://developers.cloudflare.com/durable-objects/platform/pricing/" }] });
  return "Sure! ```json\n" + JSON.stringify({ calls: [{ tool: "web", arg: "Durable Objects pricing 2026" }, { tool: "wiki", arg: "Cloudflare" }, { tool: "vigil", arg: "markets" }, { tool: "teleport", arg: "x" }] }) + "\n```";
});
const chat = async (text, extra, owner = true) => { const p0 = plans; const r = await call("/chat", { model: M, cid: "a", messages: [{ role: "user", text }], ...(extra || {}) }, owner); return { r, sys: calls.at(-1).sys, planned: plans - p0 }; };

// 1 · it plans, runs what it chose, then reads the best page in a second round
let { r, sys, planned } = await chat("How much do Cloudflare Durable Objects cost these days, and who makes them?", {}, false);
assert.equal(planned, 2); const pc = calls.find((c) => /You decide which tools Genesis/.test(c.sys)); assert.equal(pc.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
assert.match(pc.sys, /- web \(search query\)/); assert.doesNotMatch(pc.sys, /- vigil/); ok("a visitor's planner sees the public tools only, on Llama 3.3 70B");
assert.match(sys, /Durable Objects are billed by requests and duration/); assert.match(sys, /WIKIPEDIA: Cloudflare, Inc\. is an American company/); assert.match(sys, /PAGE Pricing · Durable Objects[\s\S]*Requests: \$0\.15 per million/);
assert.ok(r.tools.some((t) => /^searched the web: Durable Objects pricing/.test(t)) && r.tools.includes("read Wikipedia: Cloudflare") && r.tools.includes("read developers.cloudflare.com"), JSON.stringify(r.tools));
assert.ok(!r.tools.some((t) => /Vigil|teleport/.test(t))); ok("round 1: web + Wikipedia; round 2: it read the pricing page in full; an owner-only tool and an unknown one were refused");
assert.ok(r.sources.some((x) => x.url === "https://developers.cloudflare.com/durable-objects/platform/pricing/")); assert.match(sys, /Genesis plans its own lookups/); ok("what it read is cited as a source, and Genesis knows it planned its own lookups");

// 2 · no planning where it isn't worth it
for (const [t, ex] of [["thanks!", {}], ["ok", {}], ["what's the weather like in Leeds tomorrow and should I bring a coat", { voice: true }], ["write me a haiku about rain please", { agent: false }]]) assert.equal((await chat(t, ex)).planned, 0, t);
ok("small talk, voice (speed first) and agent:false skip the planner");

// 3 · nonsense or nothing from the planner: it just answers
reply = () => "I think you should search for it."; ({ r, planned } = await chat("Tell me something interesting about octopus cognition"));
assert.equal(planned, 1); assert.ok(r.text && !r.error); ok("a planner reply that isn't JSON means no lookups, and the answer still comes");
reply = () => JSON.stringify({ calls: [] }); ({ r, planned } = await chat("Explain recursion with a short example in Python")); assert.equal(planned, 1); assert.equal(r.tools.filter((t) => /searched|read /.test(t)).length, 0, JSON.stringify(r.tools)); ok("“nothing needed” is respected: one quick call, no lookups");

// 4 · it doesn't repeat what the automatic triggers already did
reply = () => JSON.stringify({ calls: [{ tool: "read", arg: "https://developers.cloudflare.com/durable-objects/platform/pricing/" }] });
({ r } = await chat("summarise https://developers.cloudflare.com/durable-objects/platform/pricing/ for me"));
assert.equal(r.tools.filter((t) => t === "read developers.cloudflare.com").length, 1); ok("a link already read isn't read twice");
reply = null;

// 4b · live progress: what it did is readable by the sender's own id while the answer is prepared, and only by them
reply = null; await call("/chat", { model: M, cid: "s", sid: "abc12345xyz", messages: [{ role: "user", text: "What does Cloudflare charge for Durable Objects now?" }] });
let st = await call("/steps?sid=abc12345xyz"); assert.ok(st.steps.some((t) => /^searched the web/.test(t)) && st.steps.includes("read developers.cloudflare.com"), JSON.stringify(st));
assert.deepEqual((await call("/steps?sid=abc12345xyz", null, false)).steps, []); assert.deepEqual((await call("/steps?sid=nope0000")).steps, []); ok("live steps: the owner's request shows its steps to the owner only; an unknown id shows nothing");
// 4c · the build tool: only the owner, only when he asks for something built, one mission per message
reply = () => JSON.stringify({ calls: [{ tool: "build", arg: "A pomodoro timer with a task list, sounds and a dark theme, as one HTML page." }, { tool: "build", arg: "a second one" }] });
const before = H.db.prepare("SELECT COUNT(*) c FROM proj").get().c;
r = (await chat("Build me a pomodoro timer with a task list and sounds")).r; const after = H.db.prepare("SELECT COUNT(*) c FROM proj").get().c;
assert.equal(after - before, 1); assert.ok(r.tools.includes("started a Swarm mission"), JSON.stringify(r.tools)); const pj = H.db.prepare("SELECT * FROM proj ORDER BY ts DESC LIMIT 1").get(); assert.match(pj.brief, /^A pomodoro timer with a task list/);
assert.match(calls.at(-1).sys, new RegExp("SWARM MISSION STARTED just now for this request \\(id " + pj.id + "\\)[^]*hive-app\\?p=" + pj.id)); ok("asked to build something, Genesis starts one Swarm mission itself and the answer carries its link");
const b2 = H.db.prepare("SELECT COUNT(*) c FROM proj").get().c; await chat("What's the best way to structure a pomodoro timer?"); assert.equal(H.db.prepare("SELECT COUNT(*) c FROM proj").get().c, b2); ok("a question that merely mentions it starts nothing, even if the planner asks");
const b3 = H.db.prepare("SELECT COUNT(*) c FROM proj").get().c; await chat("Build me a pomodoro timer", {}, false); assert.equal(H.db.prepare("SELECT COUNT(*) c FROM proj").get().c, b3); ok("a visitor can't make Genesis start missions");
reply = null;
// 5 · ranking by results: failures and 👎 move a model down, 👍 up
const h = H.hive, id = "workers-ai|@cf/meta/llama-4-scout-17b-16e-instruct", base = h.rank(id);
for (let i = 0; i < 10; i++) h.note(id, i < 5); h._perf = null; assert.equal(h.rank(id), base + 2); ok("half its calls failing: it drops two places (" + base + " → " + h.rank(id) + ")");
for (let i = 0; i < 10; i++) h.note(id, true); h._perf = null; assert.equal(h.rank(id), base + 1); ok("recovering (5 of 20 failed): one place down");
for (let i = 0; i < 3; i++) H.db.prepare("INSERT INTO turn(ts,cid,model,said,reply,rating) VALUES(?,?,?,?,?,?)").run(Date.now(), "z", id, "q", "a", 1); h._perf = null;
assert.equal(h.rank(id), base); ok("three 👍 from Anders lift it back");
const pf = await call("/perf"); const row = pf.models.find((m) => m.model === "@cf/meta/llama-4-scout-17b-16e-instruct"); assert.equal(row.ok, 15); assert.equal(row.fail, 5);
assert.ok(pf.models.find((m) => m.model === "@cf/openai/gpt-oss-120b").ok >= 5); assert.equal((await call("/perf", null, false)).error, "owner only"); ok("/perf shows every model's record (chats counted too); it's the owner's");
console.log("all " + n + " checks passed"); process.exit(0);
