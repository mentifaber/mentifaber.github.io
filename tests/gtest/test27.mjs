// Voice links: the owner makes a link, guests join on their own devices, can talk and nothing else, and each is limited.
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { throw new Error("offline in this test: " + u); };
const H = await import("./harness.mjs"); const { call, calls, db, setStt, ttsCalls, setResponder } = H; H.hive.sql();
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const ip = (x) => ({ "cf-connecting-ip": x });
const as = (token, path, body, extra) => call("/voice" + path, body, false, { authorization: "Bearer " + token, ...(extra || {}) });

// 1 · only the owner can make links
assert.equal((await call("/voice/links", null, false)).error, "voice links are the owner's: sign in on Vigil first");
assert.equal((await call("/voice/links/create", { label: "x" }, false)).error.slice(0, 11), "voice links"); ok("making, listing and changing links is the owner's");
const mk = await call("/voice/links/create", { label: "Family phones", devices: 3, perDay: 5, days: 2 });
assert.ok(mk.ok && /^https:\/\/mentifaber\.org\/talk#[a-z2-7]{26}$/.test(mk.url), mk.url); const code = mk.url.split("#")[1];
const row = db.prepare("SELECT * FROM vlink").get(); assert.notEqual(row.code, code); assert.ok(!row.code.includes(code)); assert.ok(!JSON.stringify(row).includes(code)); ok("the owner gets a link; the database holds it sealed, never in the clear");

// 2 · devices join as guests
const j1 = await call("/voice/join", { code, name: "Sam" }, false, ip("1.1.1.1")); assert.match(j1.token, /^vg_[0-9a-f]{64}$/); assert.equal(j1.guest.name, "Sam"); assert.equal(j1.left, 5); assert.equal(j1.link.label, "Family phones"); assert.ok(j1.voices.some((v) => v.id === "a2:thalia"));
const j2 = await call("/voice/join", { code }, false, ip("1.1.1.1")); assert.equal(j2.guest.name, "Guest 2"); assert.notEqual(j2.token, j1.token);
const again = await call("/voice/join", { token: j1.token }, false, ip("1.1.1.1")); assert.equal(again.guest.id, j1.guest.id); assert.equal(again.token, undefined); assert.equal(db.prepare("SELECT COUNT(*) c FROM vguest").get().c, 2);
ok("two phones on the same address become two guests; a phone that returns with its token is the same guest, not a new one");
const j3 = await call("/voice/join", { code }, false, ip("2.2.2.2")); assert.ok(j3.token); const j4 = await call("/voice/join", { code }, false, ip("3.3.3.3")); assert.match(j4.error, /already has its 3 devices/); ok("the link's device limit holds (3 of 3)");
assert.match((await call("/voice/join", { code: "a".repeat(26) }, false)).error, /doesn't exist/); assert.match((await call("/voice/join", { code: "nope" }, false)).error, /isn't a valid/); ok("a wrong link is refused");

// 3 · a guest can talk (text or audio), by voice, with a free voice
setResponder((sys) => /SPOKEN REPLY/.test(sys) ? "Sure thing, Sam. Gold is element 79." : null);
let r = await as(j1.token, "/turn", { text: "What's gold's atomic number?", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hello!" }], voice: "a2:orion" });
assert.equal(r.text, "Sure thing, Sam. Gold is element 79."); assert.match(r.audio, /^data:audio\/mpeg;base64,/); assert.equal(r.left, 4); assert.equal(ttsCalls.at(-1).speaker, "orion");
const sys = calls.at(-1).sys; assert.match(sys, /call them Sam/); assert.doesNotMatch(sys, /OWNER MODE|OWNER'S INSTRUCTIONS|LESSONS YOU'VE LEARNED/); assert.equal(calls.at(-1).model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast"); assert.ok(calls.at(-1).messages.some((m) => m.content === "Hello!"), "the earlier turns ride along");
ok("text in → a spoken reply out (a free model, the guest's name, none of the owner's memory), one turn used");
await as(j1.token, "/turn", { text: "hi", voice: "el:abc:xyz" }); assert.equal(ttsCalls.at(-1).speaker, "thalia"); ok("only the free voices can be chosen");
setStt(() => ({ text: "Tell me a fact about the moon", transcription_info: { duration_after_vad: 2 } }));
r = await as(j2.token, "/turn", { audio: "data:audio/wav;base64,UklGRg==" }); assert.equal(r.heard, "Tell me a fact about the moon"); assert.ok(r.text); assert.equal(r.left, 4); ok("audio in works too: it's heard, answered and spoken in one call");
setStt(() => ({ text: "", transcription_info: { duration_after_vad: 0.1 } })); r = await as(j2.token, "/turn", { audio: "UklGRg==" }); assert.equal(r.heard, ""); assert.equal(r.text, ""); assert.equal(r.left, 4); ok("silence costs no turn");
assert.equal((await as(j1.token, "/stt", { audio: "UklGRg==" })).text, ""); ok("a guest can use the speech-to-text route (what the live ears fall back to)");

// 4 · limits: per device, then the link; a guest is not the address
for (let i = 0; i < 3; i++) await as(j1.token, "/turn", { text: "more " + i });
r = await as(j1.token, "/turn", { text: "one too many" }); assert.equal(r.error.slice(0, 22), "that's all of today's "); assert.equal(r.left, 0);
r = await as(j2.token, "/turn", { text: "I'm a different phone" }); assert.ok(r.text, JSON.stringify(r)); ok("each device has its own daily turns (5): the first is used up, the second phone carries on");
// 5 · a guest token opens only the voice routes
for (const [p, body] of [["/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", messages: [{ role: "user", text: "hi there friend" }] }], ["/mind", {}], ["/library", {}], ["/keys", {}], ["/genesis", {}]]) {
  const x = await call(p, body, false, { authorization: "Bearer " + j2.token }); assert.ok(!x.text || p === "/chat", p); if (p !== "/chat") assert.match(x.error || "", /owner|sign in/i, p); }
ok("a guest token doesn't open memory, the library, the vault or AutoFaber's own panel");
assert.match((await call("/voice/turn", { text: "hi" }, false)).error, /isn't connected/); assert.match((await as("vg_" + "0".repeat(64), "/turn", { text: "hi" })).error, /isn't connected/); ok("no token, or a made-up one: refused");
// 6 · the owner sees it, and can switch it off or remove a device
let L = await call("/voice/links"); const lk = L.links[0]; assert.equal(lk.url, mk.url); assert.equal(lk.guests.length, 3); assert.equal(lk.guests.find((g) => g.name === "Sam").today, 5); assert.equal(L.allToday > 0, true);
ok("the owner's list shows the link again (to copy), each device and how much it used today");
await call("/voice/guests/remove", { id: j3.guest.id }); assert.match((await as(j3.token, "/turn", { text: "hi" })).error, /isn't connected any more/); assert.ok((await call("/voice/join", { code }, false, ip("4.4.4.4"))).token); ok("removing a device ends it at once and frees its place");
await call("/voice/links/update", { id: lk.id, on: false }); assert.match((await as(j2.token, "/turn", { text: "hi" })).error, /turned off/); assert.match((await call("/voice/join", { code }, false)).error, /turned off/);
await call("/voice/links/update", { id: lk.id, on: true, perDay: 9, devices: 6 }); assert.ok((await as(j2.token, "/turn", { text: "back on" })).text); ok("turning the link off stops every device; on again, they carry on (and its limits can be changed)");
db.prepare("UPDATE vlink SET exp=?").run(Date.now() - 1000); assert.match((await as(j2.token, "/turn", { text: "hi" })).error, /expired/); await call("/voice/links/update", { id: lk.id, days: 3 }); assert.ok((await as(j2.token, "/turn", { text: "hi again" })).text); ok("an expired link stops, and extending it revives it");
// 7 · the ceiling over everyone, the live-listening gate, leaving, deleting
db.prepare("INSERT INTO limits(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=?").run("va:" + new Date().toISOString().slice(0, 10) + ":all", 800, 800); assert.match((await as(j2.token, "/turn", { text: "hi" })).error, /used its voice allowance/); db.prepare("DELETE FROM limits WHERE k LIKE 'va:%'").run(); ok("a daily ceiling covers all guests together");
assert.equal((await call("/listen-ok", { vg: j2.token }, false)).ok, true); assert.equal((await call("/listen-ok", { vg: "vg_" + "1".repeat(64) }, false)).ok, false); ok("the live-listening socket opens for a connected guest, and not for a made-up token");
await call("/voice/leave", { token: j2.token }, false); assert.match((await as(j2.token, "/turn", { text: "hi" })).error, /isn't connected any more/); ok("a guest can disconnect their own device");
await call("/voice/links/delete", { id: lk.id }); assert.equal(db.prepare("SELECT COUNT(*) c FROM vguest").get().c, 0); assert.equal((await call("/voice/links")).links.length, 0); ok("deleting a link removes its devices too");
console.log("all " + n + " checks passed"); process.exit(0);
