// A swarm mission that can't make progress must not keep AutoFaber's object awake forever (a guard that already holds:
// when every agent goes offline the mission fails and the alarm stops). On the free plan a Durable
// Object gets ~29 awake hours a day across ALL of them; one mission ticking every 1.5 s for a day uses most of that, and
// then every object (AutoFaber, Tether's lobby, the Agent, the Nest) fails until 00:00 UTC with error 1101.
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("./harness.mjs"), { hive, db } = H; let n = 0; const ok = (m) => console.log("ok " + ++n + " - " + m);
let now = Date.UTC(2026, 10, 22, 12), alarm = null; const realNow = Date.now; Date.now = () => now;
hive.ctx.storage.setAlarm = async (t) => { alarm = t; }; hive.ctx.storage.getAlarm = async () => alarm;
H.setResponder((sys) => { if (/COORDINATOR/.test(sys)) return JSON.stringify({ title: "Timer", tasks: [{ id: 1, role: "coder", title: "the timer", deps: [] }, { id: 2, role: "designer", title: "the look", deps: [] }] }); throw Object.assign(new Error("upstream 500: internal error"), { status: 500 }); }); // the plan comes back, then every model fails, and not for quota
const V = { "cf-connecting-ip": "203.0.113.7" };
const r = await H.call("/new", { brief: "A pomodoro timer with a chime" }, false, V); assert.ok(r.id, JSON.stringify(r));
let ticks = 0; const t0 = now;
while (now - t0 < 6 * 3600e3 && alarm != null) { const at = alarm; alarm = null; now = Math.max(now + 1, at); await hive.alarm(); await H.settle(); ticks++; if (ticks > 20000) break; }
const p = db.prepare("SELECT status FROM proj WHERE id=?").get(r.id);
console.log("after", ((now - t0) / 3600e3).toFixed(2), "h:", ticks, "ticks, status", p.status, "alarm", alarm ? "armed" : "none");
assert.ok(alarm == null || p.status !== "planning" && p.status !== "working", "a mission that can't progress stops ticking (" + ticks + " ticks, still " + p.status + ")");
ok("a stuck mission stops after " + ticks + " ticks: " + p.status);
Date.now = realNow;
