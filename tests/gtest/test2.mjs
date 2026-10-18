import assert from "node:assert/strict";
const H = await import("./harness.mjs");
const { call, calls, settle, setReflect, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const M = "workers-ai|@cf/openai/gpt-oss-120b";
const { asksSystems } = await import("./src/hive-genesis.js");

// 1 · "test the systems" runs a real check; nothing invented
for (const t of ["Test system functionality after upgrades", "run a health check", "is everything working?", "how are the systems tonight", "system status"]) assert.ok(asksSystems(t), t);
for (const t of ["what's the weather", "write me a test for this function", "I'm testing a new recipe"]) assert.ok(!asksSystems(t), t);
ok("asks for a system check are recognised (and ordinary 'test' talk isn't)");
let r = await call("/chat", { model: M, cid: "a", messages: [{ role: "user", text: "Test system functionality after upgrades" }] });
let sys = calls.at(-1).sys; assert.ok(r.tools.some((t) => /^ran a system check/.test(t)), JSON.stringify(r.tools));
assert.match(sys, /LIVE SYSTEM CHECK, run by Genesis just now \(11 checks/); assert.match(sys, /✓ Durable Object storage: wrote a value and read it back/); assert.match(sys, /✓ Workers AI: embedding model answered \(384 dimensions\)/);
assert.match(sys, /✗ MENTIFABER AGENT 1\.0: no status/); assert.match(sys, /✗ Site files: assets not bound/); assert.match(sys, /anything not listed was not checked/);
ok("the reply gets real results: what passed, what didn't (no agent or assets bound in this test), nothing made up");
assert.match(sys, /never present a test run, check, measurement or action as done unless its results appear below/); assert.match(sys, /WHAT YOU CAN'T DO: change your own code or model weights, deploy, push to GitHub/); ok("and it's told plainly what it can't do or claim");
r = await call("/genesis/health"); assert.equal(r.checks.length, 11); ok("the Check systems button gets the same live results");

// 2 · it knows how it grows, and its state
assert.match(sys, /HOW YOU GROW \(this is real/); assert.match(sys, /YOUR STATE RIGHT NOW: Latest changes to Genesis: [^\n]*? \d+ exchanges remembered; 3 lessons; 0 reflections; autonomy on\. No open ideas yet\./); ok("it can describe its own growth loop and current state truthfully");

// 3 · autonomy: its own timing and its own pick (randomness pinned so the test can say which)
const rnd = Math.random; Math.random = () => 0.1; // < 0.55: one of its ideas, newest first
setReflect(JSON.stringify({ journal: "First real day.", add: [], retire: [], ideas: [{ title: "Voice memo inbox", detail: "Let Anders leave voice notes I read when I reflect." }, { title: "Morning briefing", detail: "A short daily summary of what changed and what I learned." }] }));
for (let i = 0; i < 6; i++) await call("/chat", { model: M, cid: "b", messages: [{ role: "user", text: "message " + i + " about building things" }] });
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), reflected: Date.now() - 7 * 3600e3 });
r = await call("/genesis/tick", {}); assert.equal(r.reflected, true); assert.deepEqual(r.ideas, ["Voice memo inbox", "Morning briefing"]);
assert.ok(r.build && r.build.planned > Date.now() && !r.build.started, JSON.stringify(r.build)); ok("no fixed schedule: the first tick only plans when it will build, on its own time");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 });
r = await call("/genesis/tick", {}); assert.equal(r.build.started, "Morning briefing"); assert.equal(r.build.how, "one of my ideas"); assert.equal(r.build.size, "medium"); assert.ok(r.build.next > Date.now() + 0.2 * 3600e3); const pid = r.build.pid;
ok("when its moment comes it starts one of its ideas by itself, and picks its next moment");
const p = db.prepare("SELECT * FROM proj WHERE id=?").get(pid); assert.equal(p.cap, 130); assert.equal(p.own, 1); assert.match(p.brief, /started on its own[\s\S]*working, runnable code first[\s\S]*nothing here deploys itself/);
assert.equal(db.prepare("SELECT COUNT(*) c FROM act WHERE kind='project'").get().c, 0); ok("mission: the size it chose (medium, 130 calls), runnable code first, nothing deploys; not logged as Anders's activity");
let g = await call("/genesis"); assert.equal(g.ideas.find((i) => i.pid === pid).by_, "genesis"); assert.match(g.journal[0].text, /I felt like building "Morning briefing" now \(one of my ideas; medium, up to 130 model calls/); assert.ok(g.self.next.at > Date.now()); assert.equal(g.self.today.builds, 1); ok("journal says it chose to; the panel shows its next moment and today's budget");
sys = (await call("/chat", { model: M, cid: "c", messages: [{ role: "user", text: "what are you working on?" }] }), calls.at(-1).sys);
assert.match(sys, /Being built by the Swarm: "Morning briefing" \(you started it; the swarm is planning\)/); assert.match(sys, /Ideas on your list: "Voice memo inbox"/); assert.match(sys, /you build on your own whenever you choose: no schedule/); ok("asked what it's doing, it knows what the Swarm is building and that its timing is its own");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 });
r = await call("/genesis/tick", {}); assert.equal(r.build.started, "Voice memo inbox"); const pid2 = r.build.pid;
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 });
r = await call("/genesis/tick", {}); assert.equal(r.build, undefined); ok("two missions at a time: a second starts when its moment comes, a third waits for one to finish");
db.prepare("UPDATE idea SET status='open', pid=NULL WHERE pid=?").run(pid2); db.prepare("DELETE FROM proj WHERE id=?").run(pid2); // back to one running, for what follows

// 4 · the mission finishes → it judges the result at its next reflection, and names when it builds next
db.prepare("UPDATE proj SET status='done', final=? WHERE id=?").run("# Morning briefing\n\nA panel and a Durable Object table for briefings... (code)", pid);
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), reflected: Date.now() - 2 * 3600e3 });
setReflect(JSON.stringify({ journal: "The swarm built my morning briefing. Usable, but it lacks tests.", add: [], retire: [], ideas: [{ title: "Tests for the briefing", detail: "Unit tests so it can't regress." }], next_build_hours: 5, next_build_why: "after he's had a look at the briefing" }));
r = await call("/genesis/tick", {}); assert.equal(r.reflected, true, JSON.stringify(r)); assert.match(calls.at(-1).user, /WHAT THE SWARM BUILT FROM YOUR IDEAS[\s\S]*Morning briefing" \(you started it\): \[not run in a browser yet\] # Morning briefing/); assert.match(calls.at(-1).sys, /next_build_hours/);
ok("a finished mission makes it reflect, and it reads what was built");
g = await call("/genesis"); assert.equal(g.ideas.find((i) => i.pid === pid).status, "built"); assert.equal(r.build, undefined); assert.ok(Math.abs(g.self.next.at - (Date.now() + 5 * 3600e3)) < 120e3); assert.equal(g.self.next.why, "after he's had a look at the briefing");
ok("it named its own next moment when it reflected (5 h: “after he's had a look at the briefing”), so nothing starts now");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 });
r = await call("/genesis/tick", {}); assert.equal(r.build.started, "Tests for the briefing"); ok("…and when that moment comes, it starts the newest idea");

// 5 · a failed mission returns the idea; autonomy off stops new missions
db.prepare("UPDATE proj SET status='failed' WHERE id=?").run(r.build.pid); g = await call("/genesis");
assert.equal(g.ideas.find((i) => i.title === "Tests for the briefing").status, "open"); assert.match(g.journal[0].text, /didn't finish "Tests for the briefing" \(failed\)/); ok("a failed mission puts its idea back on the list, with a journal note");
assert.equal((await call("/genesis/auto", { on: false })).auto, false); await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 });
r = await call("/genesis/tick", {}); assert.equal(r.build, undefined); assert.match((await call("/genesis")).journal[0].text, /turned my autonomy off/); assert.equal((await call("/genesis")).self.next, null); ok("autonomy off: no missions of its own, no next moment");
Math.random = rnd;
console.log("all " + n + " checks passed");
