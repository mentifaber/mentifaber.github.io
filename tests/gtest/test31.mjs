// AutoFaber reliability: the defects an outside audit reported (Oct 30, 2026), reproduced as tests, then fixed.
//   1.1  a reply that loops is stopped (the audit saw ~200 lines of "Visitor: analysis: 2023-10-30 22:48 UTC"), and no
//        reply runs past its wall-clock cap; real repetition (tables, code) is left alone
//   1.2  gpt-oss's private "analysis" channel never reaches the visitor when a provider flattens the channels into text
//   1.3  the speed readout: a reply that arrives in one burst shows "one burst", not 909,024 ch/s
//   1.5  Swarm fails closed: work that fails review three times is NEEDS HUMAN, never "accepted after 2 redos", and the
//        project's verdict and completion report say so
// The provider streams here are synthetic (shaped like Workers AI's SSE, built from the audit's description and gpt-oss's
// documented channel format), not recordings: capturing real raw streams needs the live site (Phase 0, step 2).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const H = await import("./harness.mjs"); const { db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const K = await import("./src/hive-kit.js");
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const { speedOf } = createRequire(import.meta.url)(REPO + "/assets/hive/metrics.js");

// a Workers AI stream: one SSE event per chunk, optionally spaced out in time
const sseOf = (chunks, gap = 0) => new ReadableStream({ async start(c) { const e = new TextEncoder(); for (const t of chunks) { if (gap) await new Promise((r) => setTimeout(r, gap)); c.enqueue(e.encode("data: " + JSON.stringify({ response: t }) + "\n\n")); } c.enqueue(e.encode("data: [DONE]\n\n")); c.close(); } });
const envWith = (chunks, gap) => ({ AI: { run: async () => sseOf(chunks, gap) } });
const run = async (model, chunks, meta = {}, gap) => { const shown = []; const text = await K.streamComplete(envWith(chunks, gap), null, null, model, "sys", [{ role: "user", text: "hi" }], 4096, (t) => shown.push(t), meta); return { text, shown: shown.join(""), meta }; };

// ── 1.1 loop guard ──
const loopLine = "Visitor: analysis: 2023-10-30 22:48 UTC\n";
let r = await run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["I am AutoFaber. ", ...Array(200).fill(loopLine)]);
assert.equal(r.meta.cut, "loop"); assert.ok((r.text.match(/Visitor: analysis/g) || []).length <= 8, "stopped within a few repeats, not 200 (" + (r.text.match(/Visitor/g) || []).length + ")");
ok("a looping reply (the audit's 200 repeated lines) stops after a few repeats and is marked cut: loop");

const words = "the quick brown fox jumps over the lazy dog while seven wizards quietly judge boxing matches ".split(" ");
let rnd = 7; const prose = Array.from({ length: 400 }, () => words[(rnd = (rnd * 48271) % 2147483647) % words.length]).join(" ");
r = await run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["| a | b |\n|---|---|\n", ...Array(5).fill("| same row value | 1 |\n"), "```js\n", ...Array(5).fill("  total += price * qty;\n"), "```\n", prose]);
assert.equal(r.meta.cut, undefined); assert.ok(r.text.endsWith(prose));
ok("real repetition is left alone: five identical table rows, five identical code lines, then ordinary prose");

r = await run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", Array.from({ length: 60 }, (_, i) => "line " + i + " of a long answer\n"), { wall: 150 }, 10);
assert.equal(r.meta.cut, "time"); assert.ok(r.text.length > 0 && r.text.length < 60 * 24);
ok("no reply runs past its wall-clock cap (cut: time), and what arrived before the cap is kept");

// ── 1.2 channels ──
const OSS = "@cf/openai/gpt-oss-120b";
r = await run(OSS, ["ana", "lysis", "The user asks what I am. I should answer briefly.", "assistant", "final", "I'm AutoFaber, an assistant. You can chat, search and build here."]);
assert.equal(r.shown, "I'm AutoFaber, an assistant. You can chat, search and build here."); assert.equal(r.text, r.shown);
r = await run(OSS, ["<|chan", "nel|>analysis<|message|>Need 17*23.", "<|end|><|start|>assistant<|channel|>final<|message|>391", "<|return|>"]);
assert.equal(r.shown, "391");
ok("gpt-oss: the analysis channel is never shown, flattened (\"analysis…assistantfinal…\") or with <|channel|> markers, even split across chunks");
r = await run(OSS, ["analysis", "Thinking about it... still thinking..."]);
assert.equal(r.shown, ""); assert.equal(r.text, "");
ok("a reply that never leaves the analysis channel shows nothing (the chat's existing fallback then asks another model)");
r = await run(OSS, ["391"]); assert.equal(r.shown, "391");
r = await run(OSS, ["Analysis of your question: ", "17 × 23 = 391."]); assert.equal(r.shown, "Analysis of your question: 17 × 23 = 391.");
r = await run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["analysis", " of the market shows growth."]); assert.equal(r.shown, "analysis of the market shows growth.");
assert.equal(K.finalOnly(OSS, "analysisWe compute.assistantfinal391"), "391"); assert.equal(K.finalOnly("gpt-4o", "analysisassistantfinal x"), "analysisassistantfinal x");
ok("plain answers pass untouched: a short one, one that starts with \"Analysis\", and every model that isn't gpt-oss; whole replies get the same rule");

// ── 1.3 speed readout ──
assert.deepEqual(speedOf(9090, 50000, 50001, 1), { cps: 0, burst: true });
assert.deepEqual(speedOf(1200, 800, 3800, 40), { cps: 400, burst: false });
assert.deepEqual(speedOf(1200, 800, 1000, 40), { cps: 0, burst: true }, "under 250 ms of generation is a burst");
assert.deepEqual(speedOf(1200, 800, 3800, 2), { cps: 0, burst: true }, "two chunks are a burst");
assert.deepEqual(speedOf(0, 0, 0, 0), { cps: 0, burst: false });
ok("speed: a reply delivered in one burst reads \"one burst\" (the audit's 909,024 ch/s); a steady 3-second stream reads 400 ch/s");

// ── 1.5 Swarm fails closed ──
const hive = H.hive; hive.sql(); H.env.HIVE_SLOW_TICK = "200";
const page = "## Run it\n\n```html run\n<!doctype html><html><body><h1>Cases</h1><div id=c></div><script>\n" + "const cases = [{ n: 'Sample case (synthetic)', y: 2001 }];\n".repeat(20) + "document.getElementById('c').textContent = cases.length;\n</script></body></html>\n```\n\n## Notes\n- Sample data, labelled synthetic.";
H.env.AI.run = async (model, input) => { const sys = input.messages[0].content, user = input.messages.at(-1).content;
  if (/Judge only this task/.test(user)) return { response: /#2\b/.test(user) ? "REDO: the trend numbers are invented and don't add up." : "APPROVE: correct and complete." };
  if (/Assemble the team's approved work/.test(sys)) return { response: page };
  return { response: "ok" }; };
for (const r0 of db.prepare("SELECT id FROM proj WHERE status!='done'").all()) db.prepare("UPDATE proj SET status='done' WHERE id=?").run(r0.id);
const id = (await H.call("/new", { brief: "Case analyzer" })).id; db.prepare("DELETE FROM agent WHERE pid=?").run(id); db.prepare("DELETE FROM task WHERE pid=?").run(id); db.prepare("UPDATE proj SET status='working' WHERE id=?").run(id);
const ins = db.prepare("INSERT INTO task(id,pid,role,title,detail,deps,status,output,tries,ts) VALUES(?,?,?,?,?,?,?,?,?,?)");
ins.run(1, id, "coder", "Build the page", "d", "[]", "review", "```js\nconst a = 1;\n```\n" + "Work. ".repeat(200), 0, Date.now());
ins.run(2, id, "analyst", "Trend figures", "d", "[]", "review", "Trends: up 40% (invented).", 2, Date.now()); // already sent back twice
for (const [aid, model, roles] of [["Critic", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["critic"]], ["OSS120", OSS, ["integrator", "coder"]]])
  db.prepare("INSERT INTO agent(id,pid,name,src,model,roles,status,task,done,last,score,err) VALUES(?,?,?,?,?,?,'idle',NULL,0,0,0,NULL)").run(aid, id, aid, "workers-ai", model, JSON.stringify(roles));
for (let i = 0; i < 12 && db.prepare("SELECT status FROM proj WHERE id=?").get(id).status !== "done"; i++) { db.prepare("UPDATE agent SET status='idle', last=0 WHERE pid=? AND status='offline'").run(id); await hive.alarm(); await new Promise((res) => setTimeout(res, 30)); }
const T = Object.fromEntries(db.prepare("SELECT id,status,note FROM task WHERE pid=?").all(id).map((t) => [t.id, t]));
assert.equal(T[1].status, "done"); assert.equal(T[2].status, "needs_human"); assert.match(T[2].note, /^NEEDS HUMAN: REDO: the trend numbers are invented/);
const feedTxt = db.prepare("SELECT kind,text FROM feed WHERE pid=? ORDER BY ts").all(id);
assert.ok(!feedTxt.some((f) => /accepted after/i.test(f.text) || f.kind === "accept"), "nothing is ever 'accepted after N redos'");
assert.ok(feedTxt.some((f) => f.kind === "needs_human" && /FAILED review 3 times; marked NEEDS HUMAN \(not accepted\)/.test(f.text)));
ok("a task that fails review a third time becomes NEEDS HUMAN with the reviewer's reason; nothing is ever \"accepted after 2 redos\"");
const P = db.prepare("SELECT status,verdict,final FROM proj WHERE id=?").get(id);
assert.equal(P.status, "done"); assert.match(P.verdict, /^needs_human: 1 of 2 tasks failed review or were never reviewed$/);
assert.match(P.final, /^> \*\*Completion report\*\* \(AutoFaber Swarm\)\n> \*\*Needs a person to check it\.\*\* 1 of 2 tasks failed review or were never reviewed\. Reviews are models reading the work; no tests were executed\.\n> Not verified: #2 Trend figures\.\n\n## Run it/);
const asm = db.prepare("SELECT text FROM feed WHERE pid=? AND who='OSS120' ORDER BY ts DESC").get(id); assert.match(asm.text, /NEEDS HUMAN: 1 of 2 tasks failed review/);
ok("the project finishes with verdict needs_human, and its deliverable opens with a completion report naming what wasn't verified and that no tests ran");
const pj = await H.call("/state", { id }); assert.match(pj.project.verdict, /^needs_human/); assert.match((await H.call("/list")).projects.find((x) => x.id === id).verdict, /^needs_human/);
ok("the API reports the verdict, so the Swarm view labels it \"needs human\" instead of \"done\"");
console.log("AutoFaber reliability (audit items 1.1, 1.2, 1.3, 1.5): all checks passed");
