// AutoFaber Tasks (src/hive-tasks.js): standing requests on a schedule, in the owner's own time zone (daylight saving
// included), run through the real chat, kept in an inbox, announced with a push. Owner only; the cron runs what's due.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const T = await import("./src/hive-tasks.js");

// ── schedules ──
const NY = "America/New_York", iso = (ms) => new Date(ms).toISOString().slice(0, 16);
// US clocks go back on Sunday Nov 1, 2026: 07:30 is 11:30 UTC on Saturday, 12:30 UTC on Sunday
assert.equal(iso(T.nextRun({ every: "day", at: "07:30", tz: NY }, Date.parse("2026-10-31T12:00:00Z"))), "2026-11-01T12:30");
assert.equal(iso(T.nextRun({ every: "day", at: "07:30", tz: NY }, Date.parse("2026-10-31T10:00:00Z"))), "2026-10-31T11:30");
assert.equal(iso(T.nextRun({ every: "weekday", at: "07:30", tz: NY }, Date.parse("2026-10-30T13:00:00Z"))), "2026-11-02T12:30", "Friday after 07:30 → Monday");
assert.equal(iso(T.nextRun({ every: "week", dow: 3, at: "18:00", tz: "Europe/Lisbon" }, Date.parse("2026-11-01T00:00:00Z"))), "2026-11-04T18:00", "Wednesday 18:00 in Lisbon (UTC+0 in winter)");
assert.equal(iso(T.nextRun({ every: "hour", at: "00:15" }, Date.parse("2026-11-01T09:20:00Z"))), "2026-11-01T10:15");
assert.equal(iso(T.nextRun({ every: "day", at: "07:30", tz: "Not/AZone" }, Date.parse("2026-11-01T09:00:00Z"))), "2026-11-02T07:30", "an unknown zone is read as UTC");
assert.equal(T.when({ every: "weekday", at: "07:30", tz: NY }), "every weekday at 07:30 (New York)");
ok("schedules run at his own clock time: across the daylight-saving change, weekdays only, weekly on a day, hourly; an unknown zone falls back to UTC");

// ── the routes ──
globalThis.fetch = async () => new Response("{}", { status: 404 });
H.setResponder((sys, user) => /follow-up questions/.test(sys) ? '{"q":[]}' : /You decide which tools/.test(sys) ? '{"calls":[]}' : /You plan web research/.test(sys) ? '{"queries":["ai agents news"]}' : /You check claims/.test(sys) ? '{"v":["S"]}' :
  /scheduled task “AI brief”/.test(user) ? "## Today\n\nThree things changed overnight. A new open model topped the coding charts [1]." : "Fine.");
assert.match((await H.call("/tasks", null, false)).error, /owner's/);
let r = await H.call("/tasks/add", { prompt: "Brief me on AI agents news", title: "AI brief", every: "weekday", at: "07:30", tz: NY, mode: "research" });
assert.ok(r.ok); assert.equal(r.task.when, "every weekday at 07:30 (New York)"); const id = r.task.id;
assert.match((await H.call("/tasks/add", { prompt: "hi" })).error, /say what/);
ok("the owner adds a task (visitors can't); it says when it will run");

let c0 = calls.length; r = await H.call("/tasks/run", { id });
assert.ok(r.ok); const mine = calls.slice(c0);
assert.ok(mine.some((c) => /You plan web research/.test(c.sys)), "a research task runs Deep Research");
const answer = mine.find((c) => /RESEARCH MODE/.test(c.sys)); assert.match(answer.user, /This is your scheduled task “AI brief”, every weekday at 07:30 \(New York\), running at/);
let L = await H.call("/tasks"); assert.equal(L.unseen, 1); assert.match(L.inbox[0].text, /Three things changed overnight[\s\S]*\*\*Evidence check\*\*/); assert.equal(L.inbox[0].title, "AI brief"); assert.ok(L.tasks[0].last && L.tasks[0].next > Date.now());
const alert = db.prepare("SELECT * FROM alert WHERE cat='tasks' ORDER BY id DESC").get(); assert.equal(alert.title, "✓ AI brief"); assert.match(alert.body, /Three things changed overnight/); assert.equal(alert.url, "/hive-app#mind/tasks");
ok("a run goes through the real chat (here Deep Research with its evidence check), lands in the inbox, and queues a push to his phone");
await H.call("/tasks/seen", { run: L.inbox[0].id }); assert.equal((await H.call("/tasks")).unseen, 0);
ok("reading a result clears its badge");

// the cron: only what's due, at most two a tick; a paused task never runs
const b2 = (await H.call("/tasks/add", { prompt: "Wrap up the markets", every: "day", at: "17:15", tz: NY })).task.id, b3 = (await H.call("/tasks/add", { prompt: "Check the weather in Porto", every: "day", at: "06:00", tz: "Europe/Lisbon" })).task.id;
const b4 = (await H.call("/tasks/add", { prompt: "Anything new on Hugging Face", every: "hour", at: "00:05" })).task.id;
db.prepare("UPDATE task_job SET next=? WHERE id IN (?,?,?)").run(Date.now() - 1000, b2, b3, b4); await H.call("/tasks/toggle", { id: b4, on: false }); db.prepare("UPDATE task_job SET next=? WHERE id=?").run(Date.now() - 1000, b4);
r = await H.call("/tasks/tick", {}); assert.deepEqual(r.ran.map((x) => x.id).sort(), [b2, b3].sort());
assert.deepEqual((await H.call("/tasks/tick", {})).ran, [], "nothing left due");
ok("the cron runs what's due (here two), skips a paused task, and each run sets its next time");

// a run that fails says so, it isn't dressed up
const realRun = H.env.AI.run; H.env.AI.run = async () => { throw new Error("model unavailable"); };
r = await H.call("/tasks/run", { id: b2 }); H.env.AI.run = realRun; assert.equal(r.ok, false);
L = await H.call("/tasks"); const bad = L.inbox.find((x) => x.job === b2 && !x.ok); assert.match(bad.text, /couldn't run|model unavailable|no model could answer/);
assert.equal(db.prepare("SELECT title FROM alert WHERE cat='tasks' ORDER BY id DESC").get().title, "⚠ Wrap up the markets");
ok("a run that fails is kept as a failure, and the push says so");
await H.call("/tasks/del", { id: b2 }); L = await H.call("/tasks"); assert.ok(!L.tasks.some((t) => t.id === b2)); assert.ok(!L.inbox.some((x) => x.job === b2));
ok("removing a task removes its results too");
// asked in chat: the planner sets it up, in his time zone, and the answer says it's set
let round = 0; H.setResponder((sys, user) => /You decide which tools/.test(sys) ? (round++ === 0 ? '{"calls": [{"tool": "schedule", "arg": "week:friday | 16:45 | research | Write a digest of this week in AI agents: releases, papers, what is worth trying"}]}' : '{"calls": []}') : /follow-up/.test(sys) ? '{"q":[]}' : "Done: it's set.");
c0 = calls.length; await H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", tz: "Europe/Lisbon", messages: [{ role: "user", text: "Every Friday at 4:45pm, send me a digest of the week in AI agents" }] });
const made = (await H.call("/tasks")).tasks.find((t) => /digest of this week in AI agents/.test(t.prompt));
assert.ok(made, "the task exists"); assert.equal(made.every, "week"); assert.equal(made.dow, 5); assert.equal(made.at, "16:45"); assert.equal(made.tz, "Europe/Lisbon"); assert.equal(made.mode, "research");
assert.match(calls.slice(c0).find((c) => /You are /.test(c.sys) && /SCHEDULED TASK CREATED/.test(c.sys)).sys, /SCHEDULED TASK CREATED just now: “Write a digest of this week in AI agents[^”]*”, every Friday at 16:45 \(Lisbon\)/);
round = 0; const before = (await H.call("/tasks")).tasks.length;
await H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", tz: "Europe/Lisbon", messages: [{ role: "user", text: "Every Friday at 4:45pm, send me a digest of the week in AI agents" }] }, false);
assert.equal((await H.call("/tasks")).tasks.length, before, "a visitor's planner can't schedule");
const A = await import("./src/hive-agent.js"); assert.deepEqual(A.parseCalls('{"calls":[{"tool":"schedule","arg":"day | 07:00"}]}', true, []), [], "a schedule without depth and instruction is ignored");
ok("asked in chat, the planner schedules it (his zone, day, time, depth) and the answer confirms it; visitors can't, and half-specified calls are ignored");
console.log("AutoFaber Tasks: all checks passed");
