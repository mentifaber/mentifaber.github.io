// Auto (src/hive-route.js): the best free model for each message, picked by what it needs with no extra model call, and
// the reason shown; a resting model is passed over. Follow-ups: three next questions, sent after the answer is done.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const R = await import("./src/hive-route.js");

const pick = (o) => R.autoRoute(o).model.split("/").pop();
assert.equal(pick({ text: "what's in this photo?", images: true }), "llama-4-scout-17b-16e-instruct");
assert.equal(pick({ text: "Rising seas and Venice", research: true }), "gpt-oss-120b");
assert.equal(pick({ text: "tell me a joke", voice: true }), "gpt-oss-20b");
assert.equal(pick({ text: "What's today's date?", quick: true }), "gpt-oss-20b"); assert.equal(pick({ text: "thanks!" }), "gpt-oss-20b");
assert.equal(pick({ text: "Why does this throw? const x = JSON.parse(s);" }), "gpt-oss-120b"); assert.equal(pick({ text: "Solve x^2 - 5x + 6 = 0 step by step" }), "gpt-oss-120b");
assert.equal(pick({ text: "Write a short poem for my mother's 70th birthday" }), "llama-3.3-70b-instruct-fp8-fast");
assert.equal(pick({ text: "How did the Hanseatic League shape northern European trade?" }), "gpt-oss-120b");
ok("Auto picks by need: eyes for images, the strongest for research, code and math, the fastest for voice and quick asks, a fluent writer for writing");
assert.equal(R.autoRoute({ text: "thanks" }, (c) => /gpt-oss-20b/.test(c)).model.split("/").pop(), "llama-3.3-70b-instruct-fp8-fast");
ok("a model that's resting (rate-limited or failing) is passed over for the next best");

// through the chat: the chosen model answers, and the reason rides with the answer
const sse = async (body) => { const r = await H.hive.fetch(new Request("https://mentifaber.org/api/hive/chat", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.50" }, body: JSON.stringify({ stream: true, ...body }) }));
  const t = await r.text(), ev = []; for (const x of t.split("\n\n")) { const e = (/^event: (.*)$/m.exec(x) || [])[1], d = (/^data: (.*)$/m.exec(x) || [])[1]; if (e && d) ev.push([e, JSON.parse(d)]); } return ev; };
globalThis.fetch = async () => new Response("{}", { status: 404 });
H.setResponder((sys, user) => /follow-up questions the user might ask next/.test(sys) ? (/thank/i.test(user) ? '{"q": []}' : '{"q": ["How does that compare with Lübeck today?", "Which cities joined last?", "x", "Why did the League decline after 1500?"]}') : /You decide which tools/.test(sys) ? '{"calls":[]}' : "The Hanseatic League was a network of merchant guilds and market towns that dominated Baltic trade for three centuries.");
let c0 = calls.length, ev = await sse({ model: "auto|best", messages: [{ role: "user", text: "How did the Hanseatic League shape northern European trade?" }] });
const done = ev.find((e) => e[0] === "done")[1], answerCall = calls.slice(c0).find((c) => /You are AutoFaber/.test(c.sys));
assert.equal(answerCall.model, "@cf/openai/gpt-oss-120b"); assert.equal(done.model, "workers-ai|@cf/openai/gpt-oss-120b"); assert.equal(done.tools[0], "Auto chose gpt-oss-120b: a full answer from the strongest model");
const meta = ev.find((e) => e[0] === "meta")[1]; assert.equal(meta.model, "workers-ai|@cf/openai/gpt-oss-120b");
ok("through the chat, Auto's choice answers, and the answer says which model and why");

const fi = ev.findIndex((e) => e[0] === "followups"), di = ev.findIndex((e) => e[0] === "done");
assert.ok(fi > di, "follow-ups come after the answer is done"); assert.deepEqual(ev[fi][1].q, ["How does that compare with Lübeck today?", "Which cities joined last?", "Why did the League decline after 1500?"]);
assert.equal(calls.slice(c0).find((c) => /follow-up questions/.test(c.sys)).model, "@cf/meta/llama-3.2-3b-instruct");
ok("three follow-up questions arrive after the answer is done (the answer never waits), from a small fast model; junk is dropped");
ev = await sse({ model: "auto|best", messages: [{ role: "user", text: "thank you so much, that was really helpful for my homework" }] });
assert.ok(!ev.some((e) => e[0] === "followups"), "nothing to follow a thank-you");
ev = await sse({ model: "auto|best", voice: true, messages: [{ role: "user", text: "How did the Hanseatic League shape northern European trade?" }] });
assert.ok(!ev.some((e) => e[0] === "followups"), "voice gets none"); assert.equal(ev.find((e) => e[0] === "done")[1].model, "workers-ai|@cf/openai/gpt-oss-20b");
ok("no follow-ups after a thank-you or in voice; voice on Auto gets the fastest model");

const models = await H.call("/models", null, false); assert.equal(models.models[0].id, "auto|best"); assert.equal(models.models[0].name, "Auto");
ok("Auto is the first model offered");
console.log("Auto routing and follow-ups: all checks passed");
