import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, setReflect } = H;
const M = "workers-ai|@cf/openai/gpt-oss-120b";
await call("/chat", { model: M, cid: "a", messages: [{ role: "user", text: "hello" }] });
let sys = calls.at(-1).sys; assert.match(sys, /YOUR STATE RIGHT NOW: Latest changes to AutoFaber: 2026-10-19: You are AutoFaber now, Fabe for short/); console.log("  ✓ in chat, AutoFaber knows the latest changes to Hive");
// two open ideas: one the change covers, one it doesn't; one building idea it must not touch
const ins = (t, st) => { db.prepare("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,?)").run(Date.now(), t, "d", st); return db.prepare("SELECT last_insert_rowid() i").get().i; };
const a = ins("Fallback Response Handler", "open"), b = ins("Voice memos", "open"), c = ins("Directive Confirmation Safeguard", "building");
const { CHANGES } = await import("./src/hive-genesis.js"); const key = ([at, t]) => at + ":" + t.slice(0, 24);
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), reflected: Date.now(), seen: CHANGES.filter(([, t]) => !/Instruction mode is built/.test(t)).map(key) }); // read everything except instruction mode, and reflected just now
setReflect(JSON.stringify({ journal: "Anders built instruction mode natively; my middleware follow-ups aren't needed.", add: [], retire: [], ideas: [], close: [{ id: a, why: "instruction mode is built in" }, { id: c, why: "covered" }, { id: 999 }] }));
const r = await call("/genesis/reflect", {}); assert.equal(r.ok, true, JSON.stringify(r));
const u = calls.at(-1).user; assert.match(u, /CHANGES TO AUTOFABER SINCE YOUR LAST REFLECTION[\s\S]*Instruction mode is built into Hive[\s\S]*was NOT used/); assert.doesNotMatch(u, /Real system checks/); console.log("  ✓ the reflection reads only the changes it hasn't read yet, even ones older than its last reflection");
assert.match(u, new RegExp("\\[" + a + "\\] Fallback Response Handler \\[open\\]")); console.log("  ✓ ideas are listed with ids so it can close them");
const st = (id) => db.prepare("SELECT status FROM idea WHERE id=?").get(id).status;
assert.equal(st(a), "dismissed"); assert.equal(st(b), "open"); assert.equal(st(c), "building"); assert.deepEqual(r.closed, ["Fallback Response Handler (instruction mode is built in)"]);
console.log("  ✓ it closed the covered idea; a running mission and unknown ids are left alone");
const g = await call("/genesis"); assert.match(g.journal.find((j) => j.kind === "reflection").text, /\(1 idea closed\)/); console.log("  ✓ journal notes what it closed");
// a change newer than the last reflection makes it due, even with no new chats
const { Genesis } = await import("./src/hive-genesis.js");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), reflected: Date.now() - 20 * 60e3, nAt: 1e9 }); assert.equal(await Genesis.due(H.hive), false, "everything read: not due");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), seen: [] }); assert.equal(await Genesis.due(H.hive), true); console.log("  ✓ after a reflection it has read them all; an unread change makes it reflect, even without new chats");
console.log("all passed"); process.exit(0);
