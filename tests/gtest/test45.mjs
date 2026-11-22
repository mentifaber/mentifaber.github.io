// The AI on Cloudflare's free plan (src/hive.js, src/agent.js): its 10,000 daily neurons cover only ~30 big-model calls,
// so free-tier keys (Cerebras, Groq, Gemini, Mistral, GitHub, OpenRouter's ":free" models) carry the load.
//  - when Workers AI's allowance is used up, visitors and the apps get a stand-in from a FREE key (never a paid one)
//  - Auto sends text to a free key when there is one; pictures still go to Workers AI's eyes
//  - the build swarm gets a daily share of Workers AI (SWARM_WAI_DAY), the rest is kept for people
//  - background asks (cheap) try a free key first, Workers AI after
//  - MENTIFABER AGENT 1.0 without containers: hosted Qwen3 answers, in the same OpenAI-style replies
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const sent = []; let cerebrasDown = false;
globalThis.fetch = async (u, o = {}) => { const url = String(u && u.url || u), body = o.body ? JSON.parse(o.body) : null;
  if (/\/models$/.test(url)) return Response.json({ data: /cerebras/.test(url) ? [{ id: "gpt-oss-120b" }, { id: "qwen-3-32b" }, { id: "llama3.1-8b" }] : /openai/.test(url) ? [{ id: "gpt-4.1" }] : [] });
  if (/chat\/completions$/.test(url)) { sent.push({ url, model: body.model, msgs: body.messages });
    if (/cerebras/.test(url) && cerebrasDown) return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
    return Response.json({ choices: [{ message: { content: (/cerebras/.test(url) ? "FREE " : "PAID ") + body.model } }] }); }
  throw new Error("offline: " + url); };
const H = await import("./harness.mjs"), { hive, db } = H; const call = async (...a) => { const r = await H.call(...a); return { status: r.status, j: r }; }; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const V = { "cf-connecting-ip": "203.0.113.9" };
const add = async (provider, key) => (await call("/keys/add", { provider, key })).j;
const paid = await add("openai", "sk-paid-0123456789"); assert.ok(paid.ok, JSON.stringify(paid));
const chat = (model, text, owner = false, more = {}) => call("/chat", { model, messages: [{ role: "user", text, ...more }] }, owner, owner ? {} : V);

// 1. allowance used up, only a paid key: visitors wait, the owner is answered
await hive.rest();
let r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "what's a good name for a bakery?"); assert.equal(r.status, 429); assert.match(r.j.error, /free AI allowance is used up/); assert.match(r.j.error, /Come back/);
assert.ok(!sent.some((s) => /openai/.test(s.url)), "a paid key never answers for a visitor");
r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "what's a good name for a bakery?", true); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.match(r.j.text, /^PAID/, "the owner's own paid key stands in for the owner");
ok("allowance used up with only a paid key: a visitor is told when to come back; the owner's paid key answers only for the owner");

// 2. a free key: visitors and the apps carry on
const free = await add("cerebras", "csk-free-0123456789"); assert.ok(free.ok, JSON.stringify(free)); sent.length = 0;
r = await chat("workers-ai|@cf/openai/gpt-oss-120b", "what's a good name for a bakery?"); assert.equal(r.status, 200, JSON.stringify(r.j));
assert.match(r.j.text, /^FREE /); assert.ok(r.j.tools.some((t) => /free allowance resting/.test(t))); assert.ok(sent.every((s) => /cerebras/.test(s.url)), "only the free key was asked");
ok("allowance used up: a visitor (or an app asking for a Workers AI model) is answered by a free-tier key");

// 3. Auto: text to a free key even while the allowance lasts; pictures to Workers AI's eyes
hive.quota = 0; db.prepare("DELETE FROM limits").run(); sent.length = 0; H.calls.length = 0;
r = await chat("auto|best", "explain how compound interest works"); assert.equal(r.status, 200, JSON.stringify(r.j));
assert.match(r.j.model, /^k:/); assert.match(r.j.text, /^FREE gpt-oss-120b/, "the strongest free model"); assert.ok(r.j.tools.some((t) => /on a free key/.test(t))); assert.equal(H.calls.filter((c) => !/bge/.test(c.model)).length, 0, "no Workers AI call at all, the tool planner included");
r = await chat("auto|best", "hi"); assert.match(r.j.text, /^FREE llama3\.1-8b/, "a quick one gets a fast free model");
r = await chat("auto|best", "what is in this picture?", false, { images: ["data:image/png;base64,iVBORw0KGgo="] }); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.match(r.j.model, /^workers-ai\|/, "pictures stay with Workers AI's eyes");
ok("Auto sends text to the best free key (a fast one for quick asks), keeping Cloudflare's allowance for pictures and voice");

// 4. a free key that's busy: the answer still comes (Workers AI), and the key rests
cerebrasDown = true; hive._cool = {}; hive._bad = {}; hive._badM = {}; sent.length = 0;
const t = await hive.cheap("@cf/meta/llama-3.3-70b-instruct-fp8-fast", "You plan.", [{ role: "user", text: "plan a picnic" }], 300);
assert.match(t, /Systems are steady/, "Workers AI answered after the free key refused"); assert.ok(sent.some((s) => /cerebras/.test(s.url)), "the free key was tried first");
cerebrasDown = false; hive._cool = {}; hive._bad = {}; hive._badM = {}; sent.length = 0;
assert.match(await hive.cheap("@cf/meta/llama-3.3-70b-instruct-fp8-fast", "You plan.", [{ role: "user", text: "plan a picnic" }], 300), /^FREE/);
ok("background asks (product finder, research, fact checks, rewrites) use a free key first and Workers AI when it's busy");

// 5. the swarm's share of Workers AI
assert.equal(hive.waiOff(), 0); assert.equal(hive.qx(), "");
db.prepare("INSERT INTO limits(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n").run("swarm-wai:" + new Date().toISOString().slice(0, 10), 20);
assert.ok(hive.waiOff() > Date.now()); assert.match(hive.qx(), /workers-ai/); assert.equal(new Date(hive.waiOff()).getUTCHours(), 0, "until just after midnight UTC");
db.prepare("DELETE FROM limits").run();
ok("the build swarm has a daily share of Workers AI (20 calls); after it, only keys work on builds and the rest is kept for people");

// 6. MENTIFABER AGENT 1.0 without containers: hosted Qwen3, OpenAI-style
assert.equal((await call("/standin", { messages: [{ role: "user", text: "hi" }] }, false, V)).status, 401, "not open to the public directly");
writeFileSync(new URL("./src/agent.js", import.meta.url), readFileSync((process.argv[2] || new URL("../..", import.meta.url).pathname) + "/src/agent.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-shim.mjs"'));
const { Agent } = await import("./src/agent.js?" + Date.now()); const st = new Map([["st", { meta: { label: "Qwen3 8B", key: "k", size: 5e9 }, origin: "https://mentifaber.org" }]]);
const ag = new Agent({ storage: { get: async (k) => st.get(k), put: async (k, v) => st.set(k, v), delete: async () => {}, getAlarm: async () => null, setAlarm: async () => {} } }, { AGENT_PUBLIC: "1", HIVE: { idFromName: () => "h", get: () => ({ fetch: (q) => hive.fetch(q) }) } });
const areq = (stream, owner) => new Request("http://agent/v1/chat/completions", { method: "POST", headers: owner ? { "x-agent-owner": "1" } : V, body: JSON.stringify({ messages: [{ role: "system", content: "Be brief." }, { role: "user", content: [{ type: "text", text: "hello" }] }], stream, max_tokens: 50 }) });
sent.length = 0; let a = await ag.fetch(areq(false)); let aj = await a.json(); assert.equal(a.status, 200, JSON.stringify(aj));
assert.equal(aj.choices[0].message.content, "FREE qwen-3-32b", "Qwen3 on the free key first"); assert.match(aj.model, /MENTIFABER AGENT 1\.0 \(hosted: qwen-3-32b\)/);
assert.equal(sent[0].msgs[0].content, "Be brief.", "the app's system prompt is kept");
a = await ag.fetch(areq(true)); const sse = await a.text(); assert.match(a.headers.get("content-type"), /event-stream/); assert.match(sse, /"content":"FREE qwen-3-32b"/); assert.match(sse, /data: \[DONE\]/);
await hive.fetch(new Request("https://mentifaber.org/api/hive/keys/del", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify({ kid: free.key.id }) }));
a = await ag.fetch(areq(false)); aj = await a.json(); assert.equal(a.status, 200, JSON.stringify(aj)); assert.match(aj.model, /hosted: qwen3-30b-a3b/, "no free key: Qwen3 on Workers AI");
assert.ok(H.calls.some((c) => c.model === "@cf/qwen/qwen3-30b-a3b-fp8"));
await hive.rest(); a = await ag.fetch(areq(false)); assert.equal(a.status, 429); assert.match((await a.json()).error, /allowance is used up/);
ok("MENTIFABER AGENT 1.0 works without paid Containers: hosted Qwen3 (a free key, else Workers AI), streamed or whole, as before");
console.log("the AI on the free plan: all checks passed");
