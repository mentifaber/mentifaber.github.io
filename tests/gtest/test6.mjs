import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db } = H;
const { directive } = await import("./src/hive.js");
const yes = ["Build me a pomodoro timer", "please fix the login bug", "AutoFaber, add a dark mode to Orbit Watch", "go ahead and deploy it", "Test system functionality after upgrades", "write a haiku about bees", "can you rename the file to notes.md", "summarize this page"];
const no = ["How does this system compare to commercial grade AI systems?", "Explain how the swarm works", "Hey genesis this is anders", "Youre able to upgrade yourself now?", "My vision is to have you eventually grow by yourself", "Right on, buddy.", "Can you fix this?", "AutoFaber"];
for (const t of yes) assert.ok(directive(t), "should be an instruction: " + t); for (const t of no) assert.ok(!directive(t), "not an instruction: " + t);
console.log("  ✓ instructions recognised (" + yes.length + "), questions, chat and asks to explain left alone (" + no.length + ")");
const M = "workers-ai|@cf/openai/gpt-oss-120b";
await call("/chat", { model: M, cid: "x", messages: [{ role: "user", text: "Build me a pomodoro timer in one HTML file" }] });
let sys = calls.at(-1).sys; assert.match(sys, /This message is an instruction: do it\. Lead with the result itself/); assert.match(sys, /WHO YOU ARE\. You are AutoFaber/); assert.match(sys, /OWNER MODE/); assert.match(sys, /LESSONS YOU'VE LEARNED/);
console.log("  ✓ an instruction adds one line to the prompt; AutoFaber's identity, owner mode and lessons all stay");
await call("/chat", { model: M, cid: "x", messages: [{ role: "user", text: "Explain how the swarm works" }] }); assert.doesNotMatch(calls.at(-1).sys, /This message is an instruction/); console.log("  ✓ asking for an explanation doesn't trigger it");
await call("/chat", { model: M, cid: "v", messages: [{ role: "user", text: "write a haiku about bees" }] }, false, { "cf-connecting-ip": "9.9.9.9" }); assert.match(calls.at(-1).sys, /^You are AutoFaber[\s\S]*This message is an instruction/); console.log("  ✓ visitors' instructions get the same treatment");
// missions now carry the architecture notes
const { ARCH } = await import("./src/hive-genesis.js");
db.prepare("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,'open')").run(Date.now(), "Voice memo inbox", "Let Anders leave voice notes I read when I reflect.");
await H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), nextBuild: Date.now() - 1000 }); Math.random = () => 0.1; // its moment has come; it picks from its list
const r = await call("/genesis/tick", {}); const p = db.prepare("SELECT brief FROM proj WHERE id=?").get(r.build.pid);
assert.ok(p.brief.endsWith(ARCH)); assert.match(p.brief, /never replace or drop any of it; never buffer or rewrite a streamed reply/); console.log("  ✓ missions AutoFaber starts carry how Hive is built (JS, streaming, never replace the prompt)");
assert.match((await call("/genesis")).arch, /plain JavaScript ES modules/); console.log("  ✓ the panel's Build button gets the same notes");
console.log("all passed"); process.exit(0);
