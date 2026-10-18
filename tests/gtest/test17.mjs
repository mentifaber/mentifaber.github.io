// Assembling a Swarm result: the right models in the right order, "too much to read" isn't "out of money", a focused
// runnable file plus the team's files, the stitched fallback only after four real tries; fixes try more than one model.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, setResponder } = H; H.env.HIVE_SLOW_TICK = "200"; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const hive = H.hive, rk = (m) => hive.rank(m); hive.sql();
assert.ok(rk("workers-ai|@cf/deepseek-ai/deepseek-r1-distill-qwen-32b") > rk("workers-ai|@cf/openai/gpt-oss-120b")); assert.ok(rk("k:x|openai/gpt-oss-120b") < rk("workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast"));
assert.ok(rk("k:x|gpt-5.1") < rk("k:x|gpt-5.4-mini")); assert.ok(rk("k:x|deepseek-r1") < rk("workers-ai|@cf/openai/gpt-oss-120b")); assert.ok(rk("workers-ai|@cf/meta/llama-4-scout-17b-16e-instruct") > rk("workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast"));
assert.ok(rk("k:x|o3-mini") < 99); ok("ranking: a distilled R1 no longer outranks GPT-OSS 120B; minis and Scout sit below their big namesakes");

const plan = {}, seen = []; const run0 = H.env.AI.run.bind(H.env.AI);
H.env.AI.run = async (model, input, o) => { if (input && input.messages) seen.push({ model, sys: input.messages[0].content, user: input.messages.at(-1).content }); const f = plan[model]; if (f) { const r = f(input.messages[0].content, input.messages.at(-1).content); if (r instanceof Error) throw r; if (r != null) return { response: r }; } return run0(model, input, o); };
const code = (k) => "```js file=part" + k + ".js\n" + ("export function part" + k + "() { return " + k + "; }\n").repeat(30) + "```";
async function mission(brief, outputs, agents) {
  for (const r of db.prepare("SELECT id FROM proj WHERE status!='done'").all()) db.prepare("UPDATE proj SET status='done' WHERE id=?").run(r.id);
  const id = (await call("/new", { brief })).id; db.prepare("DELETE FROM agent WHERE pid=?").run(id); db.prepare("DELETE FROM task WHERE pid=?").run(id); db.prepare("UPDATE proj SET status='working' WHERE id=?").run(id);
  outputs.forEach(([role, out], k) => db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,output,tries,ts) VALUES(?,?,?,?,?,'done',?,0,?)").run(id, role, role + " task " + k, "d", "[]", out, Date.now()));
  for (const [aid, model, roles] of agents) db.prepare("INSERT INTO agent(id,pid,name,src,model,roles,status,task,done,last,score,err) VALUES(?,?,?,?,?,?,'idle',NULL,0,0,0,NULL)").run(aid, id, aid, "workers-ai", model, JSON.stringify(roles));
  return id;
}
const tick = async (id, max = 8) => { for (let i = 0; i < max; i++) { db.prepare("UPDATE agent SET status='idle', last=0 WHERE pid=? AND status='offline'").run(id); await hive.alarm(); await new Promise((r) => setTimeout(r, 30)); if (db.prepare("SELECT status FROM proj WHERE id=?").get(id).status === "done") return i + 1; } return 0; };
const page = "## Run it\n\n```html run\n<!doctype html><html><body><h1>Quotes</h1><div id=q></div><script>\n" + "const data = [{ s: 'AAPL', p: 231.2 }, { s: 'BTC', p: 67120 }];\n".repeat(20) + "document.getElementById('q').textContent = data.map((d) => d.s + ' ' + d.p).join(', ');\n</script></body></html>\n```\n\n## Notes\n- Shows quotes from sample data.";

// 1 · the order, and a prompt too big for one model
const big = new Error("Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 9402, please reduce your message size and try again. Need more tokens? Upgrade at https://console.groq.com/settings/billing");
plan["@cf/openai/gpt-oss-120b"] = (s) => /Assemble the team's approved work/.test(s) ? big : null;
plan["@cf/meta/llama-3.3-70b-instruct-fp8-fast"] = (s) => /Assemble the team's approved work/.test(s) ? "Here is the finished deliverable:\n" + page : null;
plan["@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"] = () => { throw new Error("the distill should not be asked to assemble"); };
const outs = [["architect", "A design.\n" + "Prose about the design. ".repeat(380)], ["coder", "The code.\n" + code(1) + "\n" + "Explanation. ".repeat(600)], ["coder", code(2) + "\n" + "More. ".repeat(1200)], ["tester", "Tests:\n" + code(3)], ["writer", "Docs. ".repeat(1400)], ["researcher", "Sources. ".repeat(900)]];
let id = await mission("Real-time market quote retriever", outs, [["Distill", "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", ["architect", "tester"]], ["OSS120", "@cf/openai/gpt-oss-120b", ["coordinator", "integrator", "coder"]], ["Llama33", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["coordinator", "integrator"]]]);
assert.ok(await tick(id)); const asm = seen.filter((c) => /Assemble the team's approved work/.test(c.sys));
assert.deepEqual(asm.map((c) => c.model), ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"]);
assert.doesNotMatch(asm[0].user, /trimmed to fit/); assert.match(asm[1].user, /THE TEAM'S APPROVED WORK \(trimmed to fit\)/); assert.ok(asm[1].user.length < 26000, "after a too-big error the next one reads a compact version (" + asm[1].user.length + ")");
assert.match(asm[1].user, /export function part1/); ok("strongest first (GPT-OSS 120B), then Llama 3.3 70B with the material squeezed to fit, code kept; the distill is never asked");
const oss = db.prepare("SELECT status, err FROM agent WHERE pid=? AND id='OSS120'").get(id); assert.notEqual(oss.status, "retired"); assert.match(oss.err, /Request too large/);
const feed = db.prepare("SELECT text FROM feed WHERE pid=? ORDER BY ts").all(id).map((r) => r.text).join("\n"); assert.match(feed, /too much for it to read at once; it stays on smaller jobs/); assert.doesNotMatch(feed, /no credit; trying again in 6 hours/);
ok("\"request too large\" (with a billing link in it) isn't read as out of credit: no 6-hour bench, no retirement");
let fin = db.prepare("SELECT final FROM proj WHERE id=?").get(id).final;
assert.match(fin, /^## Run it\n\n```html run\n<!doctype html>/); assert.match(fin, /## Notes\n- Shows quotes from sample data\.\n\n## The team's source files\n/);
assert.match(fin, /#### From #\d+ coder: coder task 1\n\n```js file=part1\.js\nexport function part1/); assert.match(fin, /#### From #\d+ tester: tester task 3/); assert.equal((fin.match(/```html run/g) || []).length, 1); assert.doesNotMatch(fin, /Prose about the design/);
ok("the result: the runnable file and notes first, then the team's code files (none marked to run), no preamble, no prose dump");

// 2 · stubs and failures: four real tries, then the stitched fallback that says what to do
plan["@cf/openai/gpt-oss-120b"] = (s) => /Assemble/.test(s) ? "## Run it\n\n```html run\n<p>todo</p>\n```" : null;
plan["@cf/meta/llama-3.3-70b-instruct-fp8-fast"] = (s) => /Assemble/.test(s) ? new Error("3046: Request timeout") : null;
plan["@cf/meta/llama-3.1-70b-instruct"] = (s) => /Assemble/.test(s) ? "## Run it\n\n```html run\n<!doctype html><html><body>\n" + "<p>cut off mid".repeat(80) : null;
plan["@cf/qwen/qwen2.5-coder-32b-instruct"] = (s) => /Assemble/.test(s) ? "Short." : /cut off by its length limit/.test(s) ? "still going" : null;
plan["@cf/meta/llama-3.1-8b-instruct-fast"] = () => { throw new Error("a fifth try should not happen"); };
seen.length = 0;
id = await mission("Another one", outs.slice(0, 3), [["OSS120", "@cf/openai/gpt-oss-120b", ["integrator"]], ["Llama33", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["integrator"]], ["Llama31", "@cf/meta/llama-3.1-70b-instruct", ["writer"]], ["Coder", "@cf/qwen/qwen2.5-coder-32b-instruct", ["coder"]], ["Small", "@cf/meta/llama-3.1-8b-instruct-fast", ["writer"]]]);
assert.ok(await tick(id, 10)); fin = db.prepare("SELECT final FROM proj WHERE id=?").get(id).final;
assert.equal(new Set(seen.filter((c) => /Assemble the team's approved work/.test(c.sys)).map((c) => c.model)).size, 4); assert.match(fin, /^# Another one\n\n_The integrators couldn't finish[^\n]*Make it runnable/);
const f2 = db.prepare("SELECT text FROM feed WHERE pid=? ORDER BY ts").all(id).map((r) => r.text).join("\n"); assert.match(f2, /a stub \(11 chars of code\)/); assert.match(f2, /final draft was cut off/);
ok("a stub, a timeout, a cut-off draft and a too-short one: four different models tried, then the stitched result says how to get something runnable");

// 3 · a document stays a document
plan["@cf/openai/gpt-oss-120b"] = (s) => /Assemble/.test(s) ? "# The plan\n\n" + "A thorough section of the plan with real content. ".repeat(80) : null;
id = await mission("A written strategy", [["writer", "Draft. ".repeat(900)], ["researcher", "Facts. ".repeat(900)]], [["OSS120", "@cf/openai/gpt-oss-120b", ["integrator"]]]);
assert.ok(await tick(id)); fin = db.prepare("SELECT final FROM proj WHERE id=?").get(id).final; assert.match(fin, /^# The plan/); assert.doesNotMatch(fin, /team's source files/); ok("a document with nothing to run is delivered as written, no files appended");

// 4 · a fix tries the next model when the first doesn't deliver
const R1 = await mission("Fix me please, a tool", outs.slice(0, 2), [["OSS120", "@cf/openai/gpt-oss-120b", ["integrator"]], ["Llama33", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["integrator"]]]);
db.prepare("UPDATE proj SET status='done', final=? WHERE id=?").run("# Fix me\n\nJust words.", R1);
plan["@cf/openai/gpt-oss-120b"] = (s) => /has nothing anyone can run/.test(s) ? "I'd rather not." : null;
plan["@cf/meta/llama-3.3-70b-instruct-fp8-fast"] = (s) => /has nothing anyone can run/.test(s) ? "```python\nimport statistics\nprint('works', statistics.mean([1, 2, 3, 4]))\n```" : null;
let r = await call("/repair", { id: R1, mode: "demo" }); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.lang, "python");
assert.match(db.prepare("SELECT text FROM feed WHERE pid=? ORDER BY ts DESC LIMIT 1").get(R1).text, /made the result runnable/); assert.equal(db.prepare("SELECT who FROM feed WHERE pid=? ORDER BY ts DESC LIMIT 1").get(R1).who, "Llama33");
ok("Make it runnable: the first model said no, the next one delivered");
console.log("all passed"); process.exit(0);
