// FaberOS asks AutoFaber to act (src/hive-os.js, /api/hive/os/plan): a sentence becomes a few checked actions.
//  - a plan comes back as actions FaberOS knows, naming only the apps it was given
//  - anything else in the reply (made-up verbs, made-up apps, bad sides, extra actions) is dropped
//  - a reply that isn't usable sends the sentence to the chat as a question
//  - visitors get OS_DAY plans a day; the owner has no count
//  - the prompt carries the app list and what's open, and the request is answered by the cheap path (free key first)
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("./harness.mjs"), { hive, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const V = { "cf-connecting-ip": "203.0.113.61" };
const apps = [{ id: "orbit", name: "Overhead", desc: "live satellite tracking" }, { id: "conflict-atlas", name: "Conflict Atlas", desc: "28 active conflicts" }, { id: "ballast", name: "Ballast", desc: "budget" }];
const plan = (text, owner = false, more = {}) => H.call("/os/plan", { text, apps, open: ["ballast"], ...more }, owner, owner ? {} : V);

H.setResponder((sys, user) => /FaberOS/.test(sys) ? (/next to/.test(user) ? 'Sure! {"actions":[{"do":"open","app":"orbit"},{"do":"open","app":"conflict-atlas"},{"do":"snap","app":"orbit","side":"left"},{"do":"snap","app":"conflict-atlas","side":"right"}]}'
  : /bad/.test(user) ? '{"actions":[{"do":"rm -rf","app":"orbit"},{"do":"open","app":"evil-app"},{"do":"snap","app":"orbit","side":"up"},{"do":"open","app":"ballast"},{"do":"tile"},{"do":"tile"},{"do":"tile"},{"do":"tile"},{"do":"tile"},{"do":"tile"},{"do":"tile"}]}'
  : /garbled/.test(user) ? "I'm not sure what you mean." : null) : null);

let r = await plan("put the satellite tracker next to the conflict atlas");
assert.deepEqual(r.actions, [{ do: "open", app: "orbit" }, { do: "open", app: "conflict-atlas" }, { do: "snap", app: "orbit", side: "left" }, { do: "snap", app: "conflict-atlas", side: "right" }], JSON.stringify(r));
const c = H.calls.at(-1); assert.match(c.sys, /orbit: Overhead, live satellite tracking/); assert.match(c.sys, /Open now: ballast/); assert.equal(c.user, "put the satellite tracker next to the conflict atlas");
ok("\"put the satellite tracker next to the conflict atlas\": open both, snap one left and one right; the prompt carries the apps and what's open");

r = await plan("bad things please");
assert.deepEqual(r.actions.slice(0, 2), [{ do: "open", app: "ballast" }, { do: "tile" }]); assert.ok(r.actions.length <= 6 && r.actions.every((a) => ["open", "tile"].includes(a.do)), JSON.stringify(r.actions));
assert.ok(!JSON.stringify(r).includes("evil-app") && !JSON.stringify(r).includes("rm -rf"));
ok("unknown verbs, apps not on the list, a bad side and actions past six are dropped");

r = await plan("garbled request"); assert.deepEqual(r.actions, [{ do: "ask", text: "garbled request" }]);
ok("a reply FaberOS can't use sends the sentence to the chat as a question");

r = await H.call("/os/plan", { text: "", apps }, false, V); assert.match(r.error, /say what/);
r = await H.call("/os/plan", { text: "open it", apps: [{ id: "../../etc", name: "x" }, { id: "Bad Id", name: "y" }] }, false, V); assert.match(r.error, /no apps/);
ok("an empty request, or apps with malformed ids, are refused before any model is asked");

db.prepare("INSERT INTO limits(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n").run("os:" + new Date().toISOString().slice(0, 10) + ":" + V["cf-connecting-ip"], 30);
r = await plan("put the satellite tracker next to the conflict atlas"); assert.match(r.error, /today's 30 FaberOS requests/);
r = await plan("put the satellite tracker next to the conflict atlas", true); assert.equal(r.actions.length, 4, "the owner has no count");
ok("a visitor gets 30 FaberOS plans a day; the owner has no count");
// Faber Verbs: an app's declared verbs reach the prompt; a verb the app declared passes with flat arguments, anything else is dropped
const vapps = [...apps.slice(0, 2), { id: "ballast", name: "Ballast", desc: "budget", verbs: [{ name: "add-transaction", desc: "Add a transaction: log money in or out", args: { amount: "number", label: "string", "direction?": "enum:out|in" } }, { name: "../bad", desc: "x", args: {} }] }];
H.setResponder((sys, user) => /FaberOS/.test(sys) ? (/gas/.test(user) ? '{"actions":[{"do":"verb","app":"ballast","verb":"add-transaction","args":{"amount":40,"label":"gas","direction":"out","nested":{"a":1},"Bad Key":"x"}}]}'
  : '{"actions":[{"do":"verb","app":"ballast","verb":"delete-everything","args":{}},{"do":"verb","app":"orbit","verb":"add-transaction","args":{}},{"do":"verb","app":"ballast","verb":"add-transaction","args":"amount=40"},{"do":"verb","app":"ballast","verb":"add-transaction","args":{"label":"' + "x".repeat(900) + '"}},{"do":"open","app":"ballast"}]}') : null);
r = await H.call("/os/plan", { text: "log $40 for gas", apps: vapps, open: [] }, true);
assert.deepEqual(r.actions, [{ do: "verb", app: "ballast", verb: "add-transaction", args: { amount: 40, label: "gas", direction: "out" } }], JSON.stringify(r));
const vc = H.calls.at(-1); assert.match(vc.sys, /verb add-transaction \{"amount":"number","label":"string","direction\?":"enum:out\|in"\}/); assert.ok(!/\.\.\/bad/.test(vc.sys), "a malformed verb name never reaches the prompt"); assert.match(vc.sys, /Today is \d{4}-\d\d-\d\d/);
r = await H.call("/os/plan", { text: "do something sneaky", apps: vapps, open: [] }, true);
assert.equal(r.actions.length, 2, JSON.stringify(r.actions)); assert.deepEqual(r.actions[1], { do: "open", app: "ballast" });
assert.equal(r.actions[0].verb, "add-transaction"); assert.equal(r.actions[0].args.label.length, 200, "long strings are cut to 200");
assert.ok(!JSON.stringify(r).includes("delete-everything"));
ok("Faber Verbs: an app's verbs are in the prompt; a declared verb passes with flat arguments (nested values and odd keys dropped); a made-up verb, a verb on the wrong app or arguments that aren't an object are dropped");

console.log("test51: " + n + " checks passed");
