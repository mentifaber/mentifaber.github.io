// AutoFaber builds on its own time: random moments it shapes, projects it invents, sizes it picks, a daily budget.
import assert from "node:assert/strict";
globalThis.fetch = async () => { throw new Error("offline in this test"); }; // Vigil's feeds and GDELT are down: building must not depend on them
const H = await import("./harness.mjs"); const { call, calls, db, hive, setResponder } = H;
const { Genesis } = await import("./src/hive-genesis.js");
const ok = (m) => console.log("  ✓ " + m), G = async () => (await call("/genesis")).self, put = async (o) => H.hive.ctx.storage.put("genesis", { ...(await H.hive.ctx.storage.get("genesis")), ...o });
await call("/genesis");
// 1 · the moments it picks: spread out, not a schedule
const s0 = await H.hive.ctx.storage.get("genesis"), gaps = [];
for (let i = 0; i < 400; i++) gaps.push((Genesis.plan(hive, { ...s0 }) - Date.now()) / 3600e3);
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, short = gaps.filter((g) => g < 1.5).length, long = gaps.filter((g) => g > 5).length;
assert.ok(Math.min(...gaps) >= 0.24 && Math.max(...gaps) <= 24 && mean < 5, "mean " + mean); assert.ok(short > 60 && long > 20, short + " short, " + long + " long"); assert.ok(new Set(gaps.map((g) => Math.round(g * 12))).size > 40);
ok("its moments are spread: " + short + " of 400 within 1.5 h, " + long + " after 5 h, mean " + mean.toFixed(1) + " h; no two days alike");
for (let i = 0; i < 4; i++) db.prepare("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,'open')").run(Date.now(), "Idea " + i, "detail " + i);
const busy = []; for (let i = 0; i < 400; i++) busy.push((Genesis.plan(hive, { ...s0 }) - Date.now()) / 3600e3);
assert.ok(busy.reduce((a, b) => a + b, 0) / 400 < mean * 0.85); ok("with ideas waiting, it gets around to building sooner (mean " + (busy.reduce((a, b) => a + b, 0) / 400).toFixed(1) + " h)");
db.prepare("DELETE FROM idea").run();
// 2 · something it thinks up on the spot, sized by itself
setResponder((sys) => /You have free time/.test(sys) ? JSON.stringify({ title: "Orbit Garden", detail: "A browser toy where satellites from Vigil's feed grow into a slowly turning garden of light. Click one to see what it is.", kind: "art", size: "small", why: "I keep watching the ISS cross his map and want to make something beautiful from it." }) : null);
const rnd = Math.random; Math.random = () => 0.9;
await put({ nextBuild: Date.now() - 1000 });
let r = await call("/genesis/watch", {}); // the 15-minute watch: feeds down (offline), building goes ahead anyway
const p1 = db.prepare("SELECT p.*, i.title, i.by_ FROM idea i JOIN proj p ON p.id = i.pid WHERE i.title='Orbit Garden'").get();
assert.ok(p1, "no mission for the invented project: " + JSON.stringify(r)); assert.equal(p1.cap, 70); assert.equal(p1.by_, "genesis"); assert.match(p1.brief, /a standalone piece of software for Anders\. Deliver working, runnable code first/); assert.doesNotMatch(p1.brief, /HOW HIVE IS BUILT/);
const inv = calls.find((c) => /You have free time/.test(c.sys)); assert.ok(inv); assert.match(inv.sys, /runnable: something he can open and use, not a plan/); assert.match(inv.user, /What do you want to build\?/);
let g = await call("/genesis"); assert.match(g.journal[0].text, /I felt like building "Orbit Garden" now \(thought up just now; small, up to 70 model calls; .*I keep watching the ISS/);
ok("its moment came during a 15-minute watch with every feed down: it thought up “Orbit Garden” (art, small: 70 calls), a standalone runnable piece, and said why");
// 3 · it won't invent what it already has
db.prepare("UPDATE proj SET status='done' WHERE id=?").run(p1.id); g = await call("/genesis");
await put({ nextBuild: Date.now() - 1000 }); r = await call("/genesis/tick", {});
assert.ok(!r.build || r.build.started !== "Orbit Garden", JSON.stringify(r.build)); assert.equal(db.prepare("SELECT COUNT(*) c FROM idea WHERE title='Orbit Garden'").get().c, 1); ok("asked to invent again, a repeat of something it already built is refused");
// 4 · the budget: three of its own missions or 450 calls a day, then it rests
const four = [["Signal Loom", "A tool that weaves Vigil's alerts into a daily tapestry he can scroll."], ["Tide Clock", "A clock face that shows the tides at his coast with moon phases."], ["Crater Atlas", "A browsable map of lunar craters with depth shading and names."], ["Quiet Hours Radio", "A generative ambient music player that slows down at night."], ["Lichen Simulator", "Grows lichen colonies on a virtual rock face as the seasons turn."], ["Pocket Seismograph", "Draws the phone's accelerometer as a seismograph strip with markers."], ["Recipe Scaler", "Rescales a pasted recipe to any number of servings and converts units."], ["Star Hopper", "Guides the eye from bright stars to faint targets for a backyard telescope."], ["Glyph Forge", "Invents an alphabet of glyphs from a seed word and prints a specimen sheet."]];
let loom = 0; setResponder((sys) => /You have free time/.test(sys) ? (([title, detail]) => JSON.stringify({ title, detail, kind: "tool", size: "large", why: "patterns" }))(four[loom++ % four.length]) : null); // different ideas each time (variations of one are refused now)
db.prepare("UPDATE proj SET status='done'").run();
for (let k = 0; k < 9; k++) { await put({ nextBuild: Date.now() - 1000 }); r = await call("/genesis/tick", {}); if (r.build && r.build.pid) db.prepare("UPDATE proj SET status='done', calls=150 WHERE id=?").run(r.build.pid); }
const today = (await G()).today; assert.equal(today.builds, 8); assert.ok(today.calls <= 1100 + 150, JSON.stringify(today));
assert.ok(r.build && r.build.rested, JSON.stringify(r.build)); const s4 = await H.hive.ctx.storage.get("genesis"); assert.ok(s4.nextBuild - Date.now() > 1.9 * 3600e3); assert.match(s4.nextWhy, /^resting: 8 builds/);
ok("after 8 missions of its own in a day (its daily limit) it rests (next moment " + ((s4.nextBuild - Date.now()) / 3600e3).toFixed(1) + " h away: “" + s4.nextWhy + "”)");
// 5 · the free allowance resting, and no key to stand in: it waits
db.prepare("UPDATE proj SET ts=? WHERE 1").run(Date.now() - 2 * 864e5); hive.quota = Date.now() + 3600e3; await put({ nextBuild: Date.now() - 1000 });
r = await call("/genesis/tick", {}); assert.ok(r.build && r.build.rested); assert.match((await H.hive.ctx.storage.get("genesis")).nextWhy, /free AI allowance is resting/); hive.quota = 0; ok("Cloudflare's free allowance used up and no key of his to stand in: it waits and tries later");
// 6 · he can nudge it (it still picks what), and switch it off
await put({ nextBuild: Date.now() + 9 * 3600e3 }); r = await call("/genesis/build-now", {}); assert.ok(r.started, JSON.stringify(r)); ok("“build something now”: it starts right away (“" + r.started.slice(0, 20) + "…”, its pick)");
r = await call("/genesis/build-now", {}); assert.ok(r.started, JSON.stringify(r)); r = await call("/genesis/build-now", {}); assert.ok(r.error && /2 missions of mine are still running/.test(r.error), JSON.stringify(r)); ok("…a second too, but never more than two at once");
db.prepare("UPDATE proj SET status='done'").run(); await call("/genesis/auto", { on: false }); r = await call("/genesis/build-now", {}); assert.match(r.error, /autonomy is off/); ok("autonomy off: not even a nudge starts one");
const health = await call("/genesis/health"); assert.match(health.checks.find((c) => c.name === "AutoFaber loop").detail, /autonomy off/);
await call("/genesis/auto", { on: true }); assert.match((await call("/genesis/health")).checks.find((c) => c.name === "AutoFaber loop").detail, /autonomy on, next build of its own around \d\d:\d\d UTC/); ok("the health check says when it plans to build next");
Math.random = rnd; console.log("all passed");
