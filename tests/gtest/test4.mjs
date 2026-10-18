import assert from "node:assert/strict";
const H = await import("./harness.mjs");
const { call, db, calls } = H; H.env.HIVE_SLOW_TICK = "300";
const A = (await call("/new", { brief: "Mission A: a slow-to-assemble tool" })).id, B = (await call("/new", { brief: "Mission B: a quick tool" })).id;
// A has all its tasks done and needs assembling (one long call); B has open work
db.prepare("UPDATE proj SET status='working'").run();
for (let k = 0; k < 2; k++) db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,output,tries,ts) VALUES(?,?,?,?,?,'done',?,0,?)").run(A, "coder", "a" + k, "d", "[]", "x".repeat(3000), Date.now());
for (let k = 0; k < 2; k++) db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,tries,ts) VALUES(?,?,?,?,?,'open',0,?)").run(B, "coder", "b" + k, "d", "[]", Date.now());
H.setDelayFn((sys) => /INTEGRATOR/.test(sys) ? 2500 : 100);
let t0 = Date.now(); await H.hive.alarm(); const t1 = Date.now() - t0;
assert.equal(db.prepare("SELECT status FROM proj WHERE id=?").get(A).status, "integrating"); console.log("  tick 1:", t1, "ms · A started assembling (a 2.5 s call)");
assert.ok(t1 < 1000, "the tick didn't wait for A's long assembly"); console.log("  ✓ the tick moved on after one window instead of waiting for A");
const integr = () => calls.filter((c) => /INTEGRATOR/.test(c.sys)).length;
await new Promise((r) => setTimeout(r, 200)); t0 = Date.now(); await H.hive.alarm(); await H.hive.alarm(); await new Promise((r) => setTimeout(r, 400));
const bDone = db.prepare("SELECT COUNT(*) c FROM task WHERE pid=? AND status IN ('review','done')").get(B).c;
assert.ok(bDone >= 1, "B made progress while A assembled"); console.log("  ✓ B kept working (" + bDone + " tasks moved on) while A assembled");
await new Promise((r) => setTimeout(r, 2600)); assert.equal(db.prepare("SELECT status FROM proj WHERE id=?").get(A).status, "done"); assert.equal(integr(), 1, "A's assembly was never started twice"); console.log("  ✓ A finished assembling on its own and is done; its assembly ran exactly once across three ticks");
console.log("all passed"); process.exit(0);
