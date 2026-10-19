// AutoFaber doesn't keep proposing what it already has: built ideas are in front of it when it reflects, and a new idea that
// says the same thing (in other words) is dropped.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, setReflect } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const M = "workers-ai|@cf/openai/gpt-oss-120b"; H.hive.sql();
db.prepare("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,'built')").run(Date.now(), "Greeting Filter Middleware", "Strips greetings from the start of replies unless he greeted first.");
db.prepare("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,'built')").run(Date.now(), "Output Completeness Verifier", "Checks replies for unclosed code fences, tables and lists before sending, and regenerates the broken block.");
await call("/chat", { model: M, cid: "r1", messages: [{ role: "user", text: "Stop greeting me every time, and your tables keep getting cut off." }] });
setReflect(JSON.stringify({ journal: "I greeted him again and cut a table short.", add: [], retire: [], ideas: [
  { title: "Greeting-Filter Middleware v2", detail: "Strips greetings from the start of replies unless he greeted first, now later in the pipeline." },
  { title: "Completeness Verifier for Output", detail: "Checks replies for unclosed code fences, tables and lists before sending and regenerates the broken block." },
  { title: "Tide clock for the coast", detail: "A clock that shows high and low tide at his coast with the moon phase." }], close: [] }));
const r = await call("/genesis/reflect", {});
const sys = calls.find((c) => /reflecting privately/.test(c.sys));  const block = (sys.user.match(/IDEAS ALREADY ON YOUR LIST OR ALREADY BUILT[^\n]*\n(- [^\n]*\n)*/) || [""])[0]; assert.match(block, /never propose these again or variations of them/); assert.match(block, /Greeting Filter Middleware \[built\]/); assert.match(block, /Output Completeness Verifier \[built\]/); ok("built ideas are in front of it when it reflects, with: never again, nor variations");
assert.deepEqual(r.ideas, ["Tide clock for the coast"]); assert.equal(r.dropped.length, 2); assert.match(r.dropped.join(" "), /same as “Greeting Filter Middleware”[\s\S]*same as “Output Completeness Verifier”/);
assert.equal(db.prepare("SELECT COUNT(*) c FROM idea WHERE status='open'").get().c, 1); ok("a rewording of a built idea is dropped (by wording, and by meaning); a new one gets on the list");
console.log("all passed"); process.exit(0);
