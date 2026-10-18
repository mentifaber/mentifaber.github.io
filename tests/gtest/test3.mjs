import assert from "node:assert/strict";
const H = await import("./harness.mjs");
const { call, db } = H; H.env.HIVE_SLOW_TICK = "400";
const ids = []; for (let i = 0; i < 4; i++) ids.push((await call("/new", { brief: "Mission number " + i + ": build a small tool" })).id);
H.setDelay(600);
let t0 = Date.now(); await H.hive.alarm(); const plan = Date.now() - t0;
await new Promise((r) => setTimeout(r, 800)); // let the plans land before the work phase
const calls = ids.map((id) => db.prepare("SELECT calls FROM proj WHERE id=?").get(id).calls);
console.log("  one tick with 4 missions planning (each model call 600 ms):", plan, "ms; calls per mission", calls.join(","));
assert.ok(plan < 1500, "planning ran concurrently (sequential would be ≥ 2400 ms)"); assert.ok(calls.every((c) => c >= 1)); console.log("  ✓ all four missions moved on the same tick, in parallel");
// work phase: each tick returns after one slow-tick window, not one per mission
db.prepare("UPDATE proj SET status='working'").run(); for (const id of ids) for (let k = 0; k < 3; k++) db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,tries,ts) VALUES(?,?,?,?,?,'open',0,?)").run(id, "coder", "t" + k, "d", "[]", Date.now());
H.setDelay(2000); t0 = Date.now(); await H.hive.alarm(); const work = Date.now() - t0;
console.log("  one work tick (each call 2 s, slow-tick window 0.4 s):", work, "ms");
assert.ok(work < 1200, "sequential would be ≥ 1600 ms"); console.log("  ✓ a work tick waits one window for everyone, not one per mission");
const fly = Object.values(H.hive._fly || {}).reduce((a, n) => a + n, 0); console.log("  jobs in flight across missions:", fly); assert.ok(fly > 4 && fly <= 30); console.log("  ✓ work is spread across missions, under the global cap of 30");
await new Promise((r) => setTimeout(r, 2500)); console.log("all passed"); process.exit(0);
