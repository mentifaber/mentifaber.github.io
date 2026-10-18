// Mind upgrade: kinds, pins, edits, relevant recall past MEM_ALL, "forget that…", noticing with review, threads,
// analysis history + "Since last time", search, export, forget-all.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, settle, db, setResponder, env } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const M = "workers-ai|@cf/openai/gpt-oss-120b";
let bge = 0; const run0 = env.AI.run.bind(env.AI); env.AI.run = async (model, input, o) => { if (/bge/.test(model) && /^Represent this sentence/.test(input.text[0])) bge++; return run0(model, input, o); };

// kinds, pins, edits
let r = await call("/mind/remember", { text: "My sister is called Maya" }); assert.equal(r.kind, "people");
r = await call("/mind/remember", { text: "I prefer short answers without filler" }); assert.equal(r.kind, "pref");
r = await call("/mind/remember", { text: "I run everything on Cloudflare Workers" }); assert.equal(r.kind, "setup");
r = await call("/mind/remember", { text: "Ship the Vigil markets panel", kind: "goal" }); assert.equal(r.kind, "goal");
ok("memories get a kind (people, preferences, setup) or the one asked for");
await settle(); assert.equal(db.prepare("SELECT COUNT(*) c FROM mem WHERE vec IS NOT NULL").get().c, 4); ok("each memory gets a meaning vector");
let mind = await call("/mind?tz=-300"); const maya = mind.memories.find((m) => /Maya/.test(m.text));
assert.equal(mind.stats.days.length, 182); assert.equal(mind.stats.grid.length, 7); assert.equal(mind.stats.grid[0].length, 24); assert.deepEqual(Object.keys(mind.kinds), ["about", "pref", "people", "work", "setup", "goal"]);
ok("/mind: a 26-week calendar, a weekday × hour grid, the kinds");
r = await call("/mind/edit", { id: maya.id, pin: true }); assert.equal(r.memory.pin, 1);
r = await call("/mind/edit", { id: maya.id, text: "Your sister Maya lives in Lisbon", kind: "people" }); assert.equal(r.memory.text, "Your sister Maya lives in Lisbon"); assert.equal(r.memory.src, "you");
r = await call("/mind/edit", { id: maya.id, text: "I prefer short answers without filler" }); assert.equal(r.status, 400); assert.match(r.error, /already remembers/);
ok("pin, edit (a re-embed), and no duplicate by editing");

// a chat carries them grouped, pinned marked; small sets ride whole
r = await call("/chat", { model: M, cid: "a1", messages: [{ role: "user", text: "What should I do this weekend?" }] }); let sys = calls.at(-1).sys;
assert.match(sys, /OWNER MEMORIES \(★ = pinned by them: always honour it\):\nPreferences:\n- I prefer short answers without filler\nPeople:\n- ★ Your sister Maya lives in Lisbon\nSetup:\n- I run everything on Cloudflare Workers\nGoals:\n- Ship the Vigil markets panel/);
assert.equal(bge, 1, "one query embedding per message, shared with Genesis's recall"); ok("chats get memories grouped by kind, pinned starred; one query vector serves memory and recall");

// past MEM_ALL: core (pinned + newest) always, the rest only when relevant
db.prepare("UPDATE mem SET ts=ts-86400000*30").run();
await call("/mind/remember", { text: "Biscuit the beagle sleeps under the desk" }); db.prepare("UPDATE mem SET ts=? WHERE text LIKE 'Biscuit%'").run(Date.now() - 86400000 * 60);
for (let i = 0; i < 40; i++) await call("/mind/remember", { text: "Filler fact number " + "abcdefghijklmnopqrstuvwxyzabcdefghijklmn"[i] + i + " about galaxies" });
await settle();
r = await call("/chat", { model: M, cid: "a2", messages: [{ role: "user", text: "What does biscuit biscuit the beagle beagle do under my desk desk while sleeps?" }] }); sys = calls.at(-1).sys;
assert.match(sys, /OWNER MEMORIES \(★[^\n]*others come up when they matter/); assert.match(sys, /★ Your sister Maya/);
assert.match(sys, /MORE OF WHAT YOU KNOW ABOUT THEM THAT MAY MATTER HERE:\nAbout you:\n- Biscuit the beagle sleeps under the desk/);
const core = sys.split("MORE OF WHAT")[0]; assert.doesNotMatch(core, /Biscuit/); assert.doesNotMatch(core, /Cloudflare Workers/, "old, unpinned and not newest: left out of the core");
r = await call("/chat", { model: M, cid: "a3", messages: [{ role: "user", text: "Tell me a joke about cheese" }] }); assert.doesNotMatch(calls.at(-1).sys, /Biscuit|MORE OF WHAT/); ok("past 40 memories: pinned + newest always, an old one comes up only when it matters");

// "forget that …"
r = await call("/chat", { model: M, cid: "a4", messages: [{ role: "user", text: "Hive, forget that Biscuit the beagle sleeps under the desk" }] });
assert.equal(db.prepare("SELECT COUNT(*) c FROM mem WHERE text LIKE 'Biscuit%'").get().c, 0);
r = await call("/chat", { model: M, cid: "a4", messages: [{ role: "user", text: "forget about it" }] }); r = await call("/chat", { model: M, cid: "a4", messages: [{ role: "user", text: "Forget the galaxies" }] });
assert.equal(db.prepare("SELECT COUNT(*) c FROM mem WHERE text LIKE 'Filler%'").get().c, 40); ok("\"forget that …\" drops the one memory meant; vague ones drop nothing");
db.prepare("DELETE FROM mem WHERE text LIKE 'Filler%'").run();

// noticing: every 10 messages, proposals wait for a yes
let noticeUser = ""; setResponder((s, u) => {
  if (/keep Genesis's long-term memory/.test(s)) { noticeUser = u; return '```json\n{"facts":[{"text":"You live in Porto","kind":"about"},{"text":"Your partner is Sam","kind":"people"},{"text":"You prefer short answers without filler","kind":"pref"},{"text":"You were in a crisis last night","kind":"about"},{"text":"You asked 14 times about the weather"}],"threads":["Finish the Vigil markets panel","Write the Hive voice docs"],"finished":[]}\n```'; }
  return null; });
db.prepare("DELETE FROM act").run();
for (let i = 0; i < 9; i++) await call("/chat", { model: M, cid: "n" + i, messages: [{ role: "user", text: "Note " + i + ": I live in Porto now and Sam and I are fixing the flat." }] });
await settle(); assert.equal(noticeUser, ""); ok("no noticing before 10 new messages");
await call("/chat", { model: M, cid: "n9", messages: [{ role: "user", text: "I still need to finish the Vigil markets panel." }] }); await settle();
assert.match(noticeUser, /ALREADY ON FILE OR TURNED DOWN[\s\S]*I prefer short answers/); assert.match(noticeUser, /WHAT THEY SAID TO GENESIS LATELY[\s\S]*Note 0[\s\S]*Vigil markets panel/);
mind = await call("/mind"); assert.deepEqual(mind.pending.memories.map((m) => m.text).sort(), ["You live in Porto", "Your partner is Sam"]);
assert.deepEqual(mind.pending.threads.map((t) => t.text).sort(), ["Finish the Vigil markets panel", "Write the Hive voice docs"]); assert.equal(mind.pending.memories.find((m) => /Sam/.test(m.text)).kind, "people");
r = await call("/chat", { model: M, cid: "n10", messages: [{ role: "user", text: "hi" }] }); assert.doesNotMatch(calls.at(-1).sys, /- You live in Porto|- Your partner is Sam|THEIR OPEN THREADS/);
ok("after 10 messages Hive proposes facts and threads (duplicates, a crisis and a count filtered out); none reach a chat before a yes");
const porto = mind.pending.memories.find((m) => /Porto/.test(m.text)), sam = mind.pending.memories.find((m) => /Sam/.test(m.text)), docs = mind.pending.threads.find((t) => /docs/.test(t.text)), panel = mind.pending.threads.find((t) => /panel/.test(t.text));
await call("/mind/review", { mem: porto.id, keep: true }); await call("/mind/review", { mem: sam.id, keep: false }); await call("/mind/review", { thread: panel.id, keep: true }); await call("/mind/review", { thread: docs.id, keep: false });
r = await call("/chat", { model: M, cid: "n11", messages: [{ role: "user", text: "hello again" }] }); sys = calls.at(-1).sys;
assert.match(sys, /About you:\n- You live in Porto/); assert.doesNotMatch(sys, /- Your partner is Sam|voice docs/); assert.match(sys, /THEIR OPEN THREADS[^\n]*\n- Finish the Vigil markets panel \(since \d{4}-\d\d-\d\d\)/);
ok("kept ones go into chats (open threads too); turned-down ones don't");
setResponder((s, u) => /keep Genesis's long-term memory/.test(s) ? JSON.stringify({ facts: [{ text: "Your partner is Sam", kind: "people" }, { text: "You build synths on weekends", kind: "about" }], threads: ["Write the Hive voice docs"], finished: [panel.id] }) : null);
r = await call("/mind/notice", {}); assert.equal(r.ok, true); assert.deepEqual(r.facts, ["You build synths on weekends"]); assert.deepEqual(r.threads, []); assert.deepEqual(r.finished, [panel.id]);
mind = await call("/mind"); assert.equal(mind.pending.threads.find((t) => t.id === panel.id).ask, "done");
await call("/mind/review", { thread: panel.id, keep: true }); assert.equal(db.prepare("SELECT status FROM thread WHERE id=?").get(panel.id).status, "done");
ok("turned-down proposals aren't made again; a finished thread is asked about, then closed on a yes");
r = await call("/mind/notice", {}); assert.equal(r.none, true); ok("\"look again\" with nothing new says so");
await call("/mind/set", { trust: true }); await call("/chat", { model: M, cid: "n12", messages: [{ role: "user", text: "I build synths every weekend with my nephew" }] });
setResponder((s) => /keep Genesis's long-term memory/.test(s) ? JSON.stringify({ facts: [{ text: "Your nephew Leo builds synths with you", kind: "people" }], threads: [], finished: [] }) : null);
await call("/mind/notice", {}); assert.equal(db.prepare("SELECT ok FROM mem WHERE text LIKE 'Your nephew Leo%'").get().ok, 1); ok("with trust on, what Hive notices is kept at once");
await call("/mind/set", { trust: false });

// threads by hand
r = await call("/mind/thread", { text: "Record the new EP" }); assert.equal(r.ok, true); r = await call("/mind/thread", { text: "record the new EP" }); assert.equal(r.status, 400);
const ep = db.prepare("SELECT id FROM thread WHERE text='Record the new EP'").get().id; await call("/mind/thread", { id: ep, status: "dropped" }); assert.equal(db.prepare("SELECT status FROM thread WHERE id=?").get(ep).status, "dropped");
r = await call("/mind/thread", { text: "Write the Hive voice docs" }); assert.equal(r.ok, true); assert.equal(db.prepare("SELECT ok FROM thread WHERE text='Write the Hive voice docs'").get().ok, 1); ok("threads by hand: added, no duplicates, dropped; one turned down earlier comes back when they add it themselves");

// analysis: open threads proposed, history kept, the second one says what changed, pinned analysis facts survive
const analyst = (s) => /Genesis's analyst/.test(s) ? "## Snapshot\nYou build things.\n" + (/## Since last time/.test(s) ? "## Since last time\n- You moved to Porto.\n" : "") + "## What you're building\nHive.\n## Open threads\n- **Hive voice docs** — started, not done\n- Sonic Veil mastering\n## Next moves\n- Ship.\n## Durable facts\n- You build Hive on Cloudflare\n- You make music as Sonic Veil" : null;
setResponder(analyst);
r = await call("/mind/analyze", {}); assert.equal(r.ok, true); assert.doesNotMatch(calls.at(-1).sys, /## Since last time/);
mind = await call("/mind"); assert.deepEqual(mind.pending.threads.map((t) => t.text), ["Sonic Veil mastering"]); assert.equal(mind.history.length, 0);
const sv = mind.memories.find((m) => /Sonic Veil/.test(m.text)); await call("/mind/edit", { id: sv.id, pin: true });
r = await call("/mind/analyze", {}); assert.match(calls.at(-1).sys, /## Since last time/); assert.match(calls.at(-1).user, /YOUR PREVIOUS ANALYSIS/); assert.match(calls.at(-1).user, /THEIR THREADS[\s\S]*Write the Hive voice docs \[open\]/);
mind = await call("/mind"); assert.equal(mind.history.length, 1); assert.match(mind.profile, /## Since last time\n- You moved to Porto/);
const old = await call("/mind/history", { at: mind.history[0].at }); assert.match(old.profile, /## Snapshot/); assert.doesNotMatch(old.profile, /Since last time/);
assert.equal(db.prepare("SELECT COUNT(*) c FROM mem WHERE text='You make music as Sonic Veil'").get().c, 1); assert.equal(db.prepare("SELECT pin FROM mem WHERE text='You make music as Sonic Veil'").get().pin, 1);
ok("analysis: its open threads are proposed (known ones skipped), the previous profile is kept, the next says what changed, a pinned fact survives");

// search and export
setResponder(null);
r = await call("/mind/search", { q: "Porto" }); assert.equal(r.memories[0].text, "You live in Porto"); assert.ok(r.activity.length >= 9); assert.ok(r.turns.some((t) => /Porto/.test(t.said)));
r = await call("/mind/search", { q: "vigil panel" }); assert.equal(r.threads[0].text, "Finish the Vigil markets panel"); assert.equal(r.threads[0].status, "done");
r = await call("/mind/search", { q: "x" }); assert.deepEqual(r, { status: 200, memories: [], threads: [], activity: [], turns: [] }); ok("search: memories, threads, activity and past conversations");
r = await call("/mind/export?tz=60"); assert.ok(r.memories.some((m) => m.ok === -1 && /Sam/.test(m.text))); assert.ok(r.threads.length >= 4); assert.ok(r.activity.length >= 10); assert.equal(r.history.length, 1); assert.match(r.profile, /Snapshot/); ok("export carries everything, turned-down proposals included");

// visitors and off
r = await call("/mind/search", { q: "Porto" }, false); assert.equal(r.status, 401);
await call("/mind/set", { on: false }); const before = noticeUser; setResponder((s) => { if (/long-term memory/.test(s)) throw new Error("should not notice"); return null; });
for (let i = 0; i < 11; i++) await call("/chat", { model: M, cid: "off" + i, messages: [{ role: "user", text: "off " + i } ] }); await settle(); ok("visitors can't search; memory off means no noticing");
await call("/mind/set", { on: true });
await call("/mind/forget", { all: true }); mind = await call("/mind"); assert.equal(mind.memories.length + mind.threads.length + mind.history.length + mind.pending.memories.length, 0); ok("forget everything clears threads, proposals and profile history too");
console.log("all passed");
