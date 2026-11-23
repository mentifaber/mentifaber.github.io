// A daily budget for background work: on the free plan every Durable Object on the account shares 5,000,000 rows read a
// day. AutoFaber's own background (swarm missions, reflection, scheduled jobs) stops for the day once AutoFaber has read
// 2,500,000 rows, so the Nest, Tether and the rest always keep theirs; requests themselves are never gated.
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("./harness.mjs"), { hive, db } = H; let n = 0; const ok = (m) => console.log("ok " + ++n + " - " + m);
let alarm = null; hive.ctx.storage.setAlarm = async (t) => { alarm = t; }; hive.ctx.storage.getAlarm = async () => alarm;
const V = { "cf-connecting-ip": "203.0.113.8" };
const r = await H.call("/new", { brief: "A pomodoro timer with a chime" }, false, V); assert.ok(r.id, JSON.stringify(r));
// today's total already near the line: one more statement's worth tips it over
const day = "rows:" + new Date().toISOString().slice(0, 10);
await hive.ctx.storage.put(day, { "SELECT * FROM turn": { calls: 10, rows: 2600000 } });
hive._rows.day = null; hive._rows.loading = null; alarm = null;
await hive.alarm(); await H.settle();
const next = new Date(alarm); assert.equal(next.getUTCHours(), 0); assert.ok(alarm > Date.now() && alarm - Date.now() <= 864e5 + 6 * 60e3, "the next tick is just after midnight UTC");
const feed = db.prepare("SELECT text FROM feed WHERE pid=? AND kind='quota'").all(r.id).map((x) => x.text);
assert.equal(feed.length, 1); assert.match(feed[0], /Resting until 00:05 UTC/);
await hive.alarm(); assert.equal(db.prepare("SELECT COUNT(*) c FROM feed WHERE pid=? AND kind='quota'").get(r.id).c, 1, "said once, not every tick");
ok("over its share, a mission rests until just after midnight UTC, and says so once");
let j = await H.call("/genesis/tick", {}, true); assert.match(j.skipped || "", /share of today's free storage reads/);
j = await H.call("/tasks/tick", {}, true); assert.match(j.skipped || "", /share/);
ok("the scheduled jobs (reflection, the world watch, the owner's tasks) skip while it's over");
j = await H.call("/models"); assert.ok(Array.isArray(j.models) && j.models.length, "people's requests still work");
ok("requests aren't gated: the models list still answers");
// a new day: the budget is fresh
await hive.ctx.storage.delete(day); hive._rows.day = null; hive._rows.dayRows = 0; hive._rows.by = new Map(); hive._rows.cs = [];
j = await H.call("/genesis/tick", {}, true); assert.ok(!j.skipped, JSON.stringify(j).slice(0, 120)); ok("a fresh day: background work runs again");
process.exit(0);
