// AutoFaber Offline (/local-ai) in Chromium. Headless Chromium has no WebGPU, which is the first case: the page says
// which browsers can run it and points to the online AutoFaber, with no errors. Then, with a stand-in for the model
// library (a fake GPU and an engine that streams a reply), the whole path: pick a model, the progress bar moves, the
// chat streams the answer, the conversation is kept for the next turn, and nothing is sent anywhere. With or without a
// model, what's on the phone (the Blackout Kit's guides, the House Manual, never a private entry) goes into the answer.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const mk = async (init) => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1180, height: 860 }, isMobile: M, hasTouch: M, serviceWorkers: "block" });
  const asked = []; await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => { asked.push(rt.request().url()); rt.abort(); }); if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.asked = asked; return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

const p1 = await mk(); await p1.goto("http://localhost:8099/local-ai.html"); await p1.waitForSelector("#nogpu:not([hidden])");
assert.equal(await p1.isHidden("#pick"), true); assert.match(await p1.textContent("#nogpu"), /needs WebGPU[\s\S]*online AutoFaber/); assert.deepEqual(p1.errs, []);
ok("without WebGPU it says which browsers can run it and points to the online AutoFaber");
// still, it answers from what's on the phone: the House Manual (never a private entry) and the Blackout Kit's guides
await p1.evaluate(() => localStorage.setItem("house:v1", JSON.stringify([{ id: "h1", kind: "shutoff", title: "Water shutoff", where: "Under the kitchen sink, blue handle", det: "Turn clockwise", priv: false }, { id: "h2", kind: "wifi", title: "Wi-Fi", where: "Router in the hall", det: "Password hunter2", priv: true }])));
await p1.fill("#q", "where's the water valve?"); await p1.press("#q", "Enter"); await p1.waitForSelector(".msg.ai");
assert.match(await p1.textContent(".msg.ai"), /Here's what's on this phone about that:\s*House Manual · Water shutoff\s*Under the kitchen sink, blue handle · Turn clockwise/);
await p1.fill("#q", "what's the wifi password?"); await p1.press("#q", "Enter"); await p1.waitForFunction(() => document.querySelectorAll(".msg.ai").length === 2);
assert.ok(!/hunter2/.test(await p1.textContent("#msgs")), "a private entry never comes out"); assert.deepEqual(p1.asked, [], "nothing goes anywhere");
// and the street's notices on this phone, while they're live
await p1.evaluate(() => { const now = Date.now(); localStorage.setItem("street:posts:elm-street", JSON.stringify([{ id: "a1", kind: "offer", text: "Spare bottled water, 2 cases, at no. 12", by: "Ann", at: now - 36e5, exp: now + 864e5 }, { id: "a2", kind: "offer", text: "Bottled water at the church hall", by: "Old", at: now - 9 * 864e5, exp: now - 864e5 }])); });
await p1.fill("#q", "is anyone offering bottled water?"); await p1.press("#q", "Enter"); await p1.waitForFunction(() => document.querySelectorAll(".msg.ai").length === 3);
const st = await p1.textContent(".msg.ai:last-child"); assert.match(st, /Street Board \(elm-street\) · Offer from Ann\s*Spare bottled water, 2 cases, at no\. 12/); assert.ok(!/church hall/.test(st), "an expired notice isn't");
ok("without a model it still answers from the phone: the House Manual's water shutoff (a loosely worded question), never a private entry, and the street's live notices");

const p = await mk(() => {
  Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => ({}) } });
  window.__WebLLM = { CreateMLCEngine: async (model, o) => { window.__model = model; for (const x of [0.1, 0.5, 1]) { o.initProgressCallback({ progress: x, text: "Fetching " + Math.round(x * 100) + "%" }); await new Promise((r) => setTimeout(r, 30)); }
    return { chat: { completions: { create: async ({ messages, stream }) => { window.__sent = messages; return (async function* () { for (const w of ["Boil ", "it ", "for ", "one ", "minute."]) { await new Promise((r) => setTimeout(r, 15)); yield { choices: [{ delta: { content: w } }] }; } })(); } } } }; } };
});
await p.goto("http://localhost:8099/local-ai.html"); await p.waitForSelector("#pick:not([hidden])");
await p.check("input[value='Qwen3-0.6B-q4f16_1-MLC']"); await p.click("#go"); await p.waitForFunction(() => /running on this device/.test(document.querySelector("#state").textContent));
assert.equal(await p.evaluate(() => window.__model), "Qwen3-0.6B-q4f16_1-MLC"); assert.match(await p.textContent("#state"), /running on this device/);
ok("with WebGPU: the chosen model loads (the progress bar moves) and the chat opens, running on the device");
await p.fill("#q", "How do I make water safe?"); await p.press("#q", "Enter");
await p.waitForFunction(() => [...document.querySelectorAll(".msg.ai")].pop().firstChild.textContent === "Boil it for one minute.");
assert.deepEqual(await p.evaluate(() => window.__sent.map((m) => m.role)), ["system", "user"]);
const sys = await p.evaluate(() => window.__sent[0].content); assert.match(sys, /Notes from this phone[\s\S]*\[1\] Blackout Kit guide · Safe water: [\s\S]*1 minute/, "the kit's guide goes to the model with the question");
await p.waitForSelector(".msg.ai .from"); assert.match(await p.textContent(".msg.ai:last-child .from"), /From this phone: Blackout Kit guide · Safe water/);
await p.fill("#q", "And without a stove?"); await p.click("#send"); await p.waitForFunction(() => document.querySelectorAll(".msg.ai").length === 3 && /minute\.$/.test([...document.querySelectorAll(".msg.ai")].pop().firstChild.textContent));
assert.deepEqual(await p.evaluate(() => window.__sent.map((m) => m.role)), ["system", "user", "assistant", "user"], "the conversation carries over");
assert.deepEqual(p.asked, [], "nothing goes anywhere"); assert.deepEqual(p.errs, []);
ok("the answer streams in, from the kit's guide that went with the question (its source shown); the next question carries the conversation; nothing is sent anywhere");
await b.close();
