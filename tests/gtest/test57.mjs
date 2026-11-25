// AutoFaber project privacy (/api/hive/list, /state, /version, /output and the other per-project routes). A project is
// private to the owner and to the browser that started it (its control key, ctok). Anyone else sees only projects the
// owner has published (live), and of those only the title, status and published result, never the brief, tasks, agents,
// log, versions or join key. A private project reads exactly like one that doesn't exist, so ids can't be probed.
// Visiting AIs keep working with their own join key.
import assert from "node:assert/strict";
globalThis.fetch = async () => { throw new Error("offline in this test"); };
const H = await import("./harness.mjs"); const { call, db } = H; H.hive.sql();
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const C = (c) => c.repeat(32).slice(0, 32), FINAL = (t) => "```html run\n<!doctype html><p>" + t + "</p>\n```";
const mk = (id, title, own, ctok, final = FINAL(title)) => db.prepare("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok,own) VALUES(?,?,?,?,?,3,?,?,100,?,?)").run(id, title, "SECRET brief for " + title, "done", final, "join" + id, Date.now() - +id.replace(/\D/g, "") * 1000, ctok, own);
const task = (pid) => db.prepare("INSERT INTO task(pid,role,title,detail,deps,status,output) VALUES(?,?,?,?,?,?,?)").run(pid, "coder", "t", "detail", "[]", "done", "SECRET task output");
const feed = (pid) => db.prepare("INSERT INTO feed(pid,ts,who,kind,text) VALUES(?,?,?,?,?)").run(pid, Date.now(), "hive", "info", "SECRET log line");
const ver = (pid) => db.prepare("INSERT INTO ver(pid,v,ts,final,note) VALUES(?,?,?,?,?)").run(pid, 1, Date.now(), "SECRET old version", "first");
mk("aaaaaaa1", "Owner private", 1, C("1"));      // the owner's own project, unpublished
mk("aaaaaaa2", "Owner published", 1, C("2"));    // the owner's, published and live
mk("aaaaaaa3", "Visitor project", 0, C("3"));    // a visitor's, unpublished
mk("aaaaaaa4", "Preview only", 1, C("4"));       // published as a private preview (not live)
for (const id of ["aaaaaaa1", "aaaaaaa2", "aaaaaaa3", "aaaaaaa4"]) { task(id); feed(id); ver(id); }
db.prepare("INSERT INTO pub(slug,pid,ts,by_,views,live) VALUES(?,?,?,?,0,1)").run("owner-published", "aaaaaaa2", Date.now(), "you");
db.prepare("INSERT INTO pub(slug,pid,ts,by_,views,live) VALUES(?,?,?,?,0,0)").run("preview-only", "aaaaaaa4", Date.now(), "you");
const leak = (o) => /SECRET|join[a-z0-9]{8}/.test(JSON.stringify(o));

// 1 · the list
let r = await call("/list", null, false); assert.deepEqual(r.projects.map((p) => p.id), ["aaaaaaa2"]); assert.ok(!leak(r)); assert.ok(r.projects.every((p) => !("ctok" in p)));
r = await call("/list"); assert.deepEqual(r.projects.map((p) => p.id).sort(), ["aaaaaaa1", "aaaaaaa2", "aaaaaaa3", "aaaaaaa4"]); assert.ok(r.projects.every((p) => !("ctok" in p)));
ok("a visitor's list holds only the published project; the owner's holds all four; nobody's list carries a control key");
r = await call("/list", { mine: { aaaaaaa3: C("3") } }, false); assert.deepEqual(r.projects.map((p) => p.id).sort(), ["aaaaaaa2", "aaaaaaa3"]);
r = await call("/list", { mine: { aaaaaaa3: C("9"), aaaaaaa1: C("3") } }, false); assert.deepEqual(r.projects.map((p) => p.id), ["aaaaaaa2"]);
r = await call("/list", { mine: "aaaaaaa1" }, false); assert.deepEqual(r.projects.map((p) => p.id), ["aaaaaaa2"]);
ok("the browser that started a project sees it on its list with the right key; a wrong key, another project's key, or junk shows nothing more");

// 2 · state: private reads as missing; published shows only the public part; the starter and the owner see everything
const missing = await call("/state?id=zzzzzzz9", null, false);
for (const id of ["aaaaaaa1", "aaaaaaa3", "aaaaaaa4"]) { r = await call("/state?id=" + id, null, false); assert.deepEqual([r.status, r.error], [missing.status, missing.error]); assert.ok(!leak(r)); }
r = await call("/state?id=aaaaaaa3&ctok=" + C("1"), null, false); assert.equal(r.status, 404, "another project's key doesn't open it");
ok("to a visitor an unpublished project (the owner's, a visitor's, or a private preview) is indistinguishable from one that doesn't exist");
r = await call("/state?id=aaaaaaa2", null, false); assert.equal(r.status, 200); assert.equal(r.project.title, "Owner published"); assert.match(r.project.final, /Owner published/);
assert.deepEqual([r.tasks, r.agents, r.feed, r.project.versions], [[], [], [], []]); assert.equal(r.project.brief, undefined); assert.equal(r.project.join, undefined); assert.equal(r.project.public, true);
assert.equal(r.project.pub.url, "https://mentifaber.org/p/owner-published"); assert.ok(!leak(r));
ok("a published project shows a visitor its title, status, published result and public link, and nothing internal");
r = await call("/state?id=aaaaaaa3&ctok=" + C("3"), null, false); assert.equal(r.project.brief, "SECRET brief for Visitor project"); assert.equal(r.tasks.length, 1); assert.ok(r.project.join); assert.equal(r.project.mine, true);
r = await call("/state?id=aaaaaaa1"); assert.equal(r.project.brief, "SECRET brief for Owner private"); assert.equal(r.feed.length, 1);
ok("the browser that started a project, and the owner, still see all of it");

// 3 · versions, task output and every other per-project route
for (const [path, body] of [["/version?id=aaaaaaa2&v=1"], ["/output?id=aaaaaaa2&task=1"], ["/ran", { id: "aaaaaaa2", ok: true }], ["/say", { id: "aaaaaaa2", text: "hi" }], ["/stop", { id: "aaaaaaa2" }], ["/delete", { id: "aaaaaaa2" }], ["/rebuild", { id: "aaaaaaa2" }], ["/repair", { id: "aaaaaaa2", mode: "fix", code: "x", errors: ["e"] }]]) {
  r = await call(path, body || null, false); assert.equal(r.status, 403, path); assert.ok(!leak(r), path); }
for (const path of ["/version?id=aaaaaaa1&v=1", "/output?id=aaaaaaa1&task=1", "/version?id=aaaaaaa3&v=1"]) { r = await call(path, null, false); assert.equal(r.status, 404, path); assert.ok(!leak(r), path); }
assert.match((await call("/version?id=aaaaaaa3&v=1&ctok=" + C("3"), null, false)).final, /SECRET old version/); assert.match((await call("/output?id=aaaaaaa1&task=" + db.prepare("SELECT id FROM task WHERE pid='aaaaaaa1'").get().id)).output, /SECRET/);
assert.ok(db.prepare("SELECT 1 FROM proj WHERE id='aaaaaaa2'").get(), "the published project wasn't deleted by a visitor");
ok("versions and task output answer only the starter and the owner; a visitor can't report runs, steer, stop, delete, rebuild or repair even a published project");

// 4 · visiting AIs still join with the project's own join key, and only with it
r = await call("/join", { project: "aaaaaaa3", key: "joinaaaaaaa3", agent: "Grok" }, false); assert.ok(!r.error, JSON.stringify(r));
r = await call("/join", { project: "aaaaaaa3", key: "nope", agent: "Grok" }, false); assert.equal(r.status, 403);
ok("a visiting AI with the join key still joins a private project; without it, it's refused");

// 5 · the public page for a published result is unchanged; a private preview stays private
assert.equal((await call("/pub/owner-published", null, false)).title, "Owner published"); assert.equal((await call("/pub/preview-only", null, false)).status, 404);
ok("published pages are unchanged: the live one opens for anyone, the private preview doesn't");
console.log("test57: " + n + " checks passed");
