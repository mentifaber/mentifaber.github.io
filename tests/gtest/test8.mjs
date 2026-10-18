import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, setReflect, setResponder } = H; H.env.HIVE_SLOW_TICK = "300";
// 1 · an assembly cut off mid-code is continued by the same integrator, not thrown away
const A = (await call("/new", { brief: "A tool with a lot of code" })).id; db.prepare("UPDATE proj SET status='working' WHERE id=?").run(A);
for (let k = 0; k < 2; k++) db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,output,tries,ts) VALUES(?,?,?,?,?,'done',?,0,?)").run(A, "coder", "a" + k, "d", "[]", "x".repeat(3000), Date.now());
let n = 0; setResponder((sys) => /INTEGRATOR/.test(sys) ? (++n === 1 ? "# The tool\n\n```js\n" + "const part1 = 1;\n".repeat(200) : "const part2 = 2;\n```\n\nDone.") : null);
await H.hive.alarm(); await new Promise((r) => setTimeout(r, 300));
const p = db.prepare("SELECT status, final FROM proj WHERE id=?").get(A);
assert.equal(p.status, "done"); assert.match(p.final, /part1[\s\S]*part2 = 2;\n```\n\nDone\./); assert.equal((p.final.match(/```/g) || []).length % 2, 0);
assert.match(calls.at(-1).sys, /your reply was cut off by its length limit\. Continue exactly where it stopped/); assert.equal(n, 2);
console.log("  ✓ a final draft cut off mid-code is continued by the same model: one deliverable, code blocks closed, nothing stitched");
setResponder(null);
// 2 · reflections count the habits he keeps correcting
const M = "workers-ai|@cf/openai/gpt-oss-120b"; const replies = ["Done. Want me to do more?", "Here it is.\n\nWhat's on your mind?", "Built it. The file is attached.", "Hello Genesis how are you doing tonight my friend — I'm good."];
const said = ["build the thing", "fix the other thing", "write a haiku", "Hello Genesis how are you doing tonight my friend"];
for (let i = 0; i < 4; i++) { setResponder((sys) => /reflecting privately/.test(sys) ? null : replies[i]); await call("/chat", { model: M, cid: "h", messages: [{ role: "user", text: said[i] }] }); }
setResponder(null); setReflect(JSON.stringify({ journal: "noted", add: [], retire: [], ideas: [] }));
await call("/genesis/reflect", {}); assert.match(calls.at(-1).user, /YOUR HABITS IN THESE EXCHANGES \(counted\): 2 of 4 replies ended with a question; 1 opened by repeating his words\./);
console.log("  ✓ each reflection sees its habits counted: 2 of 4 replies ended with a question, 1 echoed his words");
console.log("all passed"); process.exit(0);
