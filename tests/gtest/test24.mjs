// AutoFaber learns from how its builds ran: runs are reported, its reflection reads them, and so does its next choice.
import assert from "node:assert/strict";
globalThis.fetch = async () => { throw new Error("offline in this test"); };
const H = await import("./harness.mjs"); const { call, calls, db, setResponder, setReflect } = H; H.hive.sql();
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const mk = (id, title, by) => { db.prepare("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok,own) VALUES(?,?,?,?,?,0,'t',?,100,'c',1)").run(id, title, title, "done", "```html run\n<!doctype html><p>" + title + "</p>\n```", Date.now()); db.prepare("INSERT INTO idea(ts,title,detail,status,pid,by_,done_ts) VALUES(?,?,?,?,?,?,?)").run(Date.now(), title, "x", "built", id, by, Date.now()); };
await call("/genesis"); mk("g1", "Tide Clock", "genesis"); mk("g2", "Orbit Garden", "genesis"); mk("g3", "Crater Atlas", "genesis");
assert.equal((await call("/ran", { id: "g1", ok: true }, false)).error, "only whoever started this project can report a run");
await call("/ran", { id: "g1", ok: true, why: "ran clean" }); await call("/ran", { id: "g2", ok: false, why: "Uncaught ReferenceError: THREE is not defined" });
assert.equal(JSON.parse(db.prepare("SELECT ran FROM proj WHERE id='g2'").get().ran).ok, false); assert.equal((await call("/ran", { id: "g1", ok: true, ctok: "c" }, false)).ok, true); ok("a run is recorded by the owner or whoever holds the mission's key, nobody else");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), reflected: Date.now() - 2 * 3600e3 });
setReflect(JSON.stringify({ journal: "One of three broke.", add: [], retire: [], ideas: [], close: [] })); await call("/genesis/reflect", {});
const rs = calls.find((c) => /reflecting privately/.test(c.sys)); assert.match(rs.user, /"Tide Clock" \(you started it\): \[ran clean in a browser\]/); assert.match(rs.user, /"Orbit Garden" \(you started it\): \[failed when it ran: Uncaught ReferenceError: THREE is not defined\]/); assert.match(rs.user, /"Crater Atlas" \(you started it\): \[not run in a browser yet\]/);
ok("reflecting, it sees which of its builds ran clean, which failed and why, and which nobody has run");
setResponder((sys) => /You have free time/.test(sys) ? JSON.stringify({ title: "Star Hopper", detail: "Guides the eye from bright stars to faint targets.", kind: "app", size: "small", why: "clear skies" }) : null);
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 }); const rnd = Math.random; Math.random = () => 0.9; await call("/genesis/tick", {}); Math.random = rnd;
const inv = calls.find((c) => /You have free time/.test(c.sys)); assert.ok(inv); assert.match(inv.user, /YOUR BUILDS' TRACK RECORD \(when they were run in a browser\): 1 of 2 ran clean\. Failures: "Orbit Garden": Uncaught ReferenceError: THREE is not defined\. Learn from them/);
ok("choosing its next build, it reads its track record (1 of 2 ran clean) and the failure, and is told to learn from it");
console.log("all " + n + " checks passed"); process.exit(0);
