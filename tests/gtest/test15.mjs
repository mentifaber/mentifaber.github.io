// Swarm results that run: repair (fix from runtime errors, or make runnable), versions kept, who may ask, the list.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, setResponder } = H; const ok = (m) => console.log("  ✓ " + m);
const { readFileSync } = await import("node:fs"); assert.match(readFileSync(process.argv[2] + "/src/hive.js", "utf8"), /reply with '## Run it' and ONE complete file he can run as-is/); ok("the integrator is told to lead with something runnable");
let r = await call("/new", { brief: "A tiny counter app with a reset button" }); const id = r.id, ctok = r.ctok; assert.ok(id);
const broken = "<!doctype html><html><body><button id=b>+</button><script>document.getElementById('b').onclick=()=>count++;undefinedThing();</script></body></html>";
const final = "# Counter\n\n## Run it\n\n```html run\n" + broken + "\n```\n\nNotes: it counts.";
db.prepare("UPDATE proj SET status='done', final=? WHERE id=?").run(final, id);
setResponder((sys, user) => /fixing a runnable result/.test(sys) ? "Here you go:\n```html\n<!doctype html><html><body><button id=b>+</button><span id=n>0</span><script>let count=0;document.getElementById('b').onclick=()=>{count++;document.getElementById('n').textContent=count};</script></body></html>\n```" :
  /has nothing anyone can run/.test(sys) ? "```python\nimport statistics\nprint(statistics.mean([1, 2, 3, 4]))\n```" : null);
r = await call("/repair", { id, mode: "fix", lang: "html", code: broken, errors: ["ReferenceError: undefinedThing is not defined (line 1)", "ReferenceError: count is not defined"] }, false, { "cf-connecting-ip": "203.0.113.50" });
assert.equal(r.status, 401); ok("a stranger can't spend a mission's calls on fixes");
const calls0 = db.prepare("SELECT calls FROM proj WHERE id=?").get(id).calls;
r = await call("/repair", { id, ctok, mode: "fix", lang: "html", code: broken, errors: ["ReferenceError: undefinedThing is not defined (line 1)", "ReferenceError: count is not defined"] }, false, { "cf-connecting-ip": "203.0.113.50" });
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.version, 2); assert.equal(r.kept, 1);
const fixed = db.prepare("SELECT final, calls FROM proj WHERE id=?").get(id); assert.match(fixed.final, /^# Counter\n\n## Run it\n\n```html run\n<!doctype html>.*let count=0/s); assert.doesNotMatch(fixed.final, /undefinedThing/); assert.match(fixed.final, /Notes: it counts\.$/); assert.ok(fixed.calls > calls0);
const fixCall = calls.find((c) => /fixing a runnable result/.test(c.sys)); assert.match(fixCall.user, /WHAT HAPPENED WHEN IT RAN:\nReferenceError: undefinedThing/); assert.match(fixCall.user, /THE FILE \(html\):/);
ok("the starter's key gets a fix: the broken block replaced in place (the rest kept), the errors went to the model, the call was counted");
let st = await call("/state?id=" + id + "&ctok=" + ctok, null, false); assert.equal(st.project.versions.length, 1); assert.match(st.project.versions[0].note, /before fixing: ReferenceError: undefinedThing/);
const v1 = await call("/version?id=" + id + "&v=1&ctok=" + ctok, null, false); assert.match(v1.final, /undefinedThing/); ok("the broken version is kept as v1, with what was wrong");
db.prepare("UPDATE proj SET final=? WHERE id=?").run("# Report\n\nThe average of the samples is about 2.5, computed with Python's statistics module.", id);
r = await call("/repair", { id, mode: "demo" }); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.lang, "python");
const demo = db.prepare("SELECT final FROM proj WHERE id=?").get(id).final; assert.match(demo, /^## Run it\n\n```python run\nimport statistics\nprint\(statistics\.mean\(\[1, 2, 3, 4\]\)\)\n```\n\n# Report/); ok("a write-up with nothing to run gets a runnable Python program on top (owner asked)");
setResponder(() => "I can't do that."); r = await call("/repair", { id, mode: "demo" }); assert.equal(r.status, 502); assert.match(r.error, /didn't come back as a runnable file/); ok("a reply without a runnable file changes nothing");
r = await call("/repair", { id, ctok, mode: "fix", lang: "html", code: "", errors: [] }, false); assert.equal(r.status, 400); ok("a fix needs the code and what went wrong");
db.prepare("INSERT INTO idea(ts,title,detail,status,pid,by_) VALUES(?,?,?,?,?,?)").run(Date.now(), "Counter", "x", "built", id, "genesis");
const list = await call("/list", null, false); const row = list.projects.find((p) => p.id === id); assert.equal(row.has, true); assert.equal(row.by, "genesis"); ok("the mission list says which have something to run, and which Genesis started");
db.prepare("UPDATE proj SET calls=cap+30 WHERE id=?").run(id); r = await call("/repair", { id, mode: "demo" }); assert.equal(r.status, 429); ok("a mission over its budget gets no more fixes");
console.log("all passed");
