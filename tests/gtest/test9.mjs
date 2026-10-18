import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, setReflect } = H;
const ins = (t, d, st) => { db.prepare("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,?)").run(Date.now(), t, d || "d", st || "open"); return db.prepare("SELECT last_insert_rowid() i").get().i; };
const st = (id) => db.prepare("SELECT status FROM idea WHERE id=?").get(id).status;
await call("/genesis"); // first wake
// the ideas on Anders's screen at 10:19 pm, plus one unrelated idea and one he's building
const ids = ["Automated Test Suite for Directive Execution Safety", "Generic Safety Wrapper for Directive Handlers", "Complete Trailing Question Filter", "Directive Execution Mode Safety Wrapper", "Comprehensive Test Suite for Directive Handlers"].map((t) => ins(t));
const keep = ins("Voice memo inbox", "Let Anders leave voice notes."), mine = ins("Directive Confirmation Safeguard", "d", "building"), pr = await call("/new", { brief: "Directive Confirmation Safeguard mission" });
db.prepare("UPDATE idea SET pid=?, by_='anders' WHERE id=?").run(pr.id, mine);
const g = await call("/genesis");
assert.ok(ids.every((i) => st(i) === "dismissed")); assert.equal(st(keep), "open"); assert.notEqual(st(mine), "dismissed");
assert.ok(g.journal.some((j) => /^Closed 5 ideas on topics the changelog has settled/.test(j.text))); console.log("  ✓ the five settled-topic ideas close by themselves (journal says so); an unrelated idea and his running mission stay");
// a reflection with conversations: settled topics and near-copies of closed ideas are dropped, real new ideas kept
await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", cid: "z", messages: [{ role: "user", text: "let's talk about my week" }] });
setReflect(JSON.stringify({ journal: "j", add: [], retire: [], ideas: [{ title: "Directive Fallback Layer v2", detail: "wrap directive handlers" }, { title: "Comprehensive Test Suite for Directive Handlers", detail: "tests" }, { title: "Weekly recap for Anders", detail: "Summarise his week every Sunday." }] }));
let r = await call("/genesis/reflect", {}); assert.deepEqual(r.ideas, ["Weekly recap for Anders"]); assert.equal(r.dropped.length, 2); console.log("  ✓ new ideas on settled topics or copies of closed ones are dropped; a fresh one is kept");
// a reflection with no new conversations adds no ideas at all
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), seen: [] });
setReflect(JSON.stringify({ journal: "read the changes", add: [], retire: [], ideas: [{ title: "Something shiny", detail: "x" }] }));
r = await call("/genesis/reflect", {}); assert.equal(r.ok, true); assert.deepEqual(r.ideas, []); assert.match(calls.at(-1).user, /Settled, and closed for you/); console.log("  ✓ a reflection with no new conversations (just changes to read) adds no ideas");
console.log("all passed"); process.exit(0);
