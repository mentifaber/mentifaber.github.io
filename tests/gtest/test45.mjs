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
globalThis.fetch = async (u, o = {}) => { const url = String(u && u.url || u), body = o.body && typeof o.body === "string" ? JSON.parse(o.body) : null;
  if (/\/models$/.test(url)) return Response.json({ data: /cerebras/.test(url) ? [{ id: "gpt-oss-120b" }, { id: "qwen-3-32b" }, { id: "llama3.1-8b" }] : /openai/.test(url) ? [{ id: "gpt-4.1" }] : [] });
  if (/audio\/transcriptions$/.test(url)) { sent.push({ url, form: o.body }); return Response.json({ text: " hello there", segments: [{ text: " hello there", no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.1 }] }); }
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
const free = await add("cerebras", "csk-free-0123456789"); assert.ok(free.ok, JSON.stringify(free)); await call("/keys/set", { kid: free.key.id, guests: true }); sent.length = 0; // shared with visitors (a new key is the owner's until switched on)
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
a = await ag.fetch(areq(false)); aj = await a.json(); assert.equal(a.status, 200, JSON.stringify(aj)); assert.match(aj.model, /hosted: gpt-oss-120b/, "no free key: GPT-OSS 120B on Workers AI");
assert.ok(H.calls.some((c) => c.model === "@cf/openai/gpt-oss-120b"));
await hive.rest(); a = await ag.fetch(areq(false)); assert.equal(a.status, 429); assert.match((await a.json()).error, /allowance is used up/);
ok("MENTIFABER AGENT 1.0 works without paid Containers: hosted Qwen3 (a free key, else Workers AI), streamed or whole, as before");
// 7. voice, the dearest thing on the allowance: a daily share of Aura and of live listening; Groq's free Whisper hears
hive.quota = 0; db.prepare("DELETE FROM limits").run(); H.ttsCalls.length = 0;
const say = (text) => call("/tts", { text, voice: "a2:thalia" }, false, V);
let used = []; for (let k = 0; k < 4; k++) used.push((await say("x".repeat(450))).j.used);
assert.deepEqual(used, ["Aura-2 thalia", "Aura-2 thalia", "Aura-2 thalia", "MeloTTS"], "1,500 characters of Aura a day, then MeloTTS");
const listen = () => call("/listen-ok", { }, true).then((r) => r.j.ok); let oks = 0; for (let k = 0; k < 22; k++) if (await listen()) oks++;
assert.equal(oks, 20, "20 live-listening turns a day; after that the ears use Whisper");
H.calls.length = 0; sent.length = 0; let sx = await call("/stt", { audio: "data:audio/wav;base64,UklGRg==", lang: "en" }, false, V);
assert.equal(sx.j.text, "", "no Groq key: Whisper on Workers AI (the fake hears nothing)"); assert.ok(!sent.some((x) => /groq/.test(x.url)));
await add("groq", "gsk-free-0123456789"); sx = await call("/stt", { audio: "data:audio/wav;base64,UklGRg==", lang: "en" }, false, V);
assert.equal(sx.j.text, "hello there"); assert.ok(sent.some((x) => /api\.groq\.com\/openai\/v1\/audio\/transcriptions/.test(x.url)), "Groq's free Whisper heard it");
ok("voice keeps to a daily share: Aura-2 for 1,500 characters then MeloTTS, live listening for 20 turns then Whisper, and Whisper on Groq's free tier when there's a key");
// 8. a model Cloudflare retires: the asker gets another, and it's gone from the menu, Auto, Council and the swarm
db.prepare("DELETE FROM limits").run(); hive.quota = 0; await H.call("/keys/del", { kid: (db.prepare("SELECT id FROM vault WHERE provider='groq'").get() || {}).id });
for (const r of db.prepare("SELECT id FROM vault").all()) await H.call("/keys/del", { kid: r.id });
const dead = "@cf/meta/llama-3.1-70b-instruct"; H.setResponder((sys, user) => null);
const realRun = H.env.AI.run; H.env.AI.run = async (m, inp) => { if (m === dead) throw new Error("5028: " + m + " was deprecated on 2026-11-20. See the model catalog for alternatives"); return realRun(m, inp); };
let rr = await chat("workers-ai|" + dead, "hello there"); assert.equal(rr.status, 200, JSON.stringify(rr.j)); assert.match(rr.j.text, /steady/); assert.ok(rr.j.tools.some((t) => /answered/.test(t)), JSON.stringify(rr.j.tools));
let menu = (await call("/models", null, false, V)).j.models.map((m) => m.id); assert.ok(!menu.includes("workers-ai|" + dead), "gone from the menu");
rr = await chat("workers-ai|" + dead, "hello again"); assert.equal(rr.status, 200); assert.ok(rr.j.tools.some((t) => /retired by Cloudflare/.test(t)), "an old menu still gets an answer, and says why");
assert.ok(!(await hive.roster(true)).some((a) => a.model === dead), "and the swarm leaves it out");
H.env.AI.run = realRun;
ok("a model Cloudflare retires (error 5028) is retired by itself: the asker gets another, and it leaves the menu, Auto, Council and the swarm");
console.log("the AI on the free plan: all checks passed");
