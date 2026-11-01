// AutoFaber reply health and the quick path (Phase 2 of the improvement brief: observability; plus what the Nov 1 stream
// captures found).
//   · every chat reply is counted, never its words: lookups before the model, first word, whole reply, and how it ended
//     (complete, token cap, looped, time cap, empty, failed); the owner reads the rates at GET /replies, visitors can't
//   · a quick ask (what AutoFaber is, the date, a sum) makes no planner call and no lookups: the captures saw the planner send
//     "what exactly are you?" to Wikipedia, and each planner call held the first word back
//   · the time sits at the end of the system prompt, so its long start is the same from one message to the next
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const A = await import("./src/hive-agent.js");

// ── the quick path ──
for (const t of ["Hi! What are you, and what can you do?", "What is today's date? One line.", "What is 17 × 23? Reply with just the number.", "perfect thanks. last thing: what's today's date, and what exactly are you?", "What day is it?"])
  { assert.ok(A.quickAsk(t), t); assert.equal(A.worthPlanning(t), false, t); }
for (const t of ["what are you doing about the latest arXiv papers on diffusion models?", "What is the capital of Mongolia?", "who are you and what are the latest papers on protein folding from deepmind", "What time is it in Tokyo right now and what is the weather there?", "what can you do with a CSV of sales data from my store"])
  { assert.equal(A.quickAsk(t), false, t); assert.equal(A.worthPlanning(t), true, t); }
ok("quick asks (who AutoFaber is, the date, a sum) skip the planner; anything that needs looking up still gets planned");

const seen = []; globalThis.fetch = async (u) => { seen.push(String(u)); return new Response("{}", { status: 404 }); }; // record any lookup
const sse = async (body, owner = false) => { const r = await H.hive.fetch(new Request("https://mentifaber.org/api/hive/chat", { method: "POST", headers: { "content-type": "application/json", ...(owner ? { "x-hive-owner": "1" } : {}), "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ stream: true, ...body }) }));
  const t = await r.text(), ev = []; for (const c of t.split("\n\n")) { const e = (/^event: (.*)$/m.exec(c) || [])[1], d = (/^data: (.*)$/m.exec(c) || [])[1]; if (e && d) ev.push([e, JSON.parse(d)]); } return ev; };
const OSS = "workers-ai|@cf/openai/gpt-oss-120b", msg = (t) => [{ role: "user", text: t }];
H.setResponder((sys) => (/You decide which tools/.test(sys) ? '{"calls":[{"tool":"wiki","arg":"Today"}]}' : "I'm AutoFaber, the assistant on mentifaber.org."));

let c0 = calls.length; seen.length = 0;
let ev = await sse({ model: OSS, messages: [{ role: "user", text: "hey" }, { role: "assistant", text: "Hi!" }, { role: "user", text: "perfect thanks. last thing: what's today's date, and what exactly are you?" }] });
assert.ok(ev.some((e) => e[0] === "done")); const mine = calls.slice(c0);
assert.equal(mine.filter((c) => /You decide which tools/.test(c.sys)).length, 0, "no planner call"); assert.equal(seen.filter((u) => /wikipedia|yahoo|finance/.test(u)).length, 0, "no lookups: " + seen.join(" "));
const sys = mine.at(-1).sys; assert.match(sys, /Fit the length to the question/); assert.match(sys, /not a catalogue of every ability/); assert.match(sys, /\n\nNow: \d{4}-\d\d-\d\d \d\d:\d\d UTC\.$/, "the time is the last thing in the prompt");
assert.doesNotMatch(sys.slice(0, -40), /Now: \d{4}/, "and nowhere earlier");
ok("\"what's today's date, and what exactly are you?\" goes straight to the model: no planner, no Wikipedia; the time ends the prompt");

c0 = calls.length; ev = await sse({ model: OSS, messages: msg("What are the most cited papers on retrieval augmented generation?") });
assert.ok(calls.slice(c0).filter((c) => /You decide which tools/.test(c.sys)).length >= 1, "a real question is still planned");
ok("a question that needs looking up still gets its planner call");

// ── reply health ──
db.prepare("DELETE FROM reply").run();
await sse({ model: OSS, messages: msg("Tell me a short story about a lighthouse keeper") });
const realRun = H.env.AI.run; // a model that loops: the guard stops it, and the reply is counted as looped
H.env.AI.run = async (model, input) => /You decide which tools/.test(input.messages[0].content) ? { response: '{"calls":[]}' } : new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode('data: {"response":"I am AutoFaber. "}\n\n')); for (let i = 0; i < 60; i++) c.enqueue(e.encode("data: " + JSON.stringify({ response: "Visitor: analysis: 2023-10-30 22:48 UTC\n" }) + "\n\n")); c.close(); } });
ev = await sse({ model: OSS, messages: msg("Write me a poem about autumn leaves falling") });
assert.equal(ev.find((e) => e[0] === "done")[1].cut, "loop");
H.env.AI.run = async () => { throw new Error("upstream exploded"); };
ev = await sse({ model: OSS, messages: msg("Write me a haiku about the sea at night") });
assert.ok(ev.some((e) => e[0] === "error"));
H.env.AI.run = realRun;
const rows = db.prepare("SELECT * FROM reply ORDER BY ts").all();
assert.equal(rows.length, 3); assert.ok(rows.every((r) => r.who === "visitor" && r.kind === "chat" && r.model === "@cf/openai/gpt-oss-120b"));
assert.equal(rows[0].cut, null); assert.ok(rows[0].chars > 10 && rows[0].ttft >= rows[0].prep && rows[0].ms >= rows[0].ttft, JSON.stringify(rows[0]));
assert.equal(rows[1].cut, "loop"); assert.match(rows[2].err, /upstream exploded|exploded/);
assert.ok(rows.every((r) => !("text" in r)) && !JSON.stringify(rows).includes("lighthouse"), "no words are kept");
ok("each reply is counted with its timings and how it ended (complete, looped, failed); none of its words are kept");

const vis = await H.call("/replies", null, false); assert.match(vis.error, /owner/);
const rh = await H.call("/replies?days=7", null, true);
assert.equal(rh.all.n, 3); assert.equal(rh.all.ok, 1); assert.equal(rh.all.loop, 1); assert.equal(rh.all.failed, 1); assert.equal(rh.visitors.n, 3);
assert.equal(rh.models[0].model, "@cf/openai/gpt-oss-120b"); assert.ok(rh.all.ttft50 != null && rh.all.ms50 != null);
assert.deepEqual(rh.problems.map((p) => p.cut || "err").sort(), ["err", "loop"]);
ok("GET /replies gives the owner rates per model (looped, time cap, token cap, empty, failed) and timings; visitors are refused");
console.log("AutoFaber reply health and quick path: all checks passed");
