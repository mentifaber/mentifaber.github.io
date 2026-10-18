// A busy model (Groq's per-minute limit, overload) hands the turn to another mind instead of failing; it then sits out as long
// as its provider asked; errors read plainly; voice asks for less room.   node test19.mjs <repo>
import assert from "node:assert/strict";
const H = await import("./harness.mjs"), { calls } = H;
const busy = "Rate limit reached for model `openai/gpt-oss-20b` in organization `org_01ky14pxskepdtxwvc9ey4q20z` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 3954, Requested 5439. Please try again in 10.4475s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing";
let failAll = false;
H.setResponder(() => { const m = calls[calls.length - 1].model; if (failAll || /gpt-oss-20b/.test(m)) throw Object.assign(new Error(busy), { status: 429 }); return "Hello from " + m.split("/").pop() + "."; });
const sse = async (body) => { const r = await H.hive.fetch(new Request("https://mentifaber.org/api/hive/chat", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify({ stream: true, ...body }) }));
  const t = await r.text(), ev = []; for (const c of t.split("\n\n")) { const e = (/^event: (.*)$/m.exec(c) || [])[1], d = (/^data: (.*)$/m.exec(c) || [])[1]; if (e && d) ev.push([e, JSON.parse(d)]); } return ev; };
const M = "workers-ai|@cf/openai/gpt-oss-20b", msg = (t) => [{ role: "user", text: t }];
const ok = (m) => console.log("ok", m);

let n0 = calls.length, ev = await sse({ model: M, cid: "v1", voice: true, messages: msg("Say my name") });
const text = ev.filter((e) => e[0] === "delta").map((e) => e[1].t).join(""), done = ev.find((e) => e[0] === "done");
assert.ok(!ev.some((e) => e[0] === "error"), "no error event: " + JSON.stringify(ev.filter((e) => e[0] === "error")));
assert.match(text, /Hello from llama-3\.3-70b/); assert.match(done[1].model, /llama-3\.3-70b/); assert.ok(done[1].tools.some((t) => /gpt-oss-20b was busy \(its per-minute limit\), so llama-3\.3-70b answered/.test(t)), done[1].tools.join(" | "));
const first = calls.slice(n0); assert.equal(first.filter((c) => /gpt-oss-20b/.test(c.model)).length, 1);
ok("rate-limited mid-conversation: llama-3.3-70b answered instead, and the turn says why (" + done[1].tools.slice(-1)[0] + ")");

n0 = calls.length; ev = await sse({ model: M, cid: "v1", voice: true, messages: msg("Again") });
assert.equal(calls.slice(n0).filter((c) => /gpt-oss-20b/.test(c.model)).length, 0, "the busy model wasn't asked again while it cools"); assert.ok(!ev.some((e) => e[0] === "error"));
ok("while it cools (Groq said 10.4 s) it isn't asked at all: the next turn goes straight to another mind");

H.hive._cool = {}; n0 = calls.length; await sse({ model: "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast", cid: "v2", voice: true, messages: msg("Hi") });
assert.equal(calls[n0].model.split("/").pop(), "llama-3.3-70b-instruct-fp8-fast"); ok("a voice turn on Workers AI still gets its usual room");

failAll = true; H.hive._cool = {}; ev = await sse({ model: M, cid: "v3", messages: msg("Hi") });
const err = ev.find((e) => e[0] === "error"); assert.ok(err, "an error when no mind is free");
assert.doesNotMatch(err[1].error, /org_|https?:|console\.groq|Upgrade/); assert.match(err[1].error, /per-minute limit|busy|overloaded|limit/i);
ok("when every mind is busy the error is plain: “" + err[1].error + "”");

const j = await H.call("/chat", { model: M, cid: "v4", messages: msg("Hi") });
assert.ok(j.error && !/org_|https?:/.test(j.error), JSON.stringify(j)); ok("the non-streamed path says it plainly too");
failAll = false; H.hive._cool = {}; const j2 = await H.call("/chat", { model: M, cid: "v5", messages: msg("Hi") });
assert.match(j2.text, /Hello from llama/); assert.ok(j2.tools.some((t) => /was busy/.test(t))); ok("…and falls back to another mind when one is free");
console.log("all passed"); process.exit(0);
