import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, db } = H; H.env.HIVE_SLOW_TICK = "300";
const A = (await call("/new", { brief: "Mission A, interrupted while assembling" })).id;
db.prepare("UPDATE proj SET status='integrating' WHERE id=?").run(A);
for (let k = 0; k < 2; k++) db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,output,tries,ts) VALUES(?,?,?,?,?,'done',?,0,?)").run(A, "coder", "a" + k, "d", "[]", "x".repeat(3000), Date.now());
await H.hive.alarm(); await new Promise((r) => setTimeout(r, 300));
assert.equal(db.prepare("SELECT status FROM proj WHERE id=?").get(A).status, "done"); console.log("  ✓ a mission left 'integrating' by a restart is assembled again and finishes");
process.exit(0);
