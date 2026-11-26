// The Street Node's radio (node/mesh.mjs, and the box with --mesh): Street Board's notices over a Meshtastic mesh. A
// stand-in radio speaks the Meshtastic TCP API (frames of 0x94 0xC3, a length, a protobuf ToRadio or FromRadio):
//  - the packets themselves: a text packet decodes back to its text; the radio's debug text between frames is skipped;
//    a Street Board packet holds the notice, is cut to fit one packet, and is read back only for its own street
//  - the box asks the radio for its config, and is "on" once the radio says it's ready
//  - a notice a phone posts to the box goes out over the air, once
//  - a notice heard over the air for this street comes onto the box's board, and isn't sent back out; one for another
//    street, or plain chat on the channel, isn't
//  - if the radio goes away, the box connects again by itself
import assert from "node:assert/strict"; import { spawn } from "node:child_process"; import net from "node:net"; import http from "node:http"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname);
const M = await import(REPO + "/node/mesh.mjs"), PB = M.PB_;
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const wait = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 50) { if (await f()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

// the packets
const fr = (msg) => PB.msg([PB.bytes(2, PB.msg([PB.f32(1, 0x1234abcd), PB.v(3, 0), PB.bytes(4, PB.msg([PB.v(1, 1), PB.bytes(2, new TextEncoder().encode(msg))]))]))]); // FromRadio{ packet{ from, channel, decoded{ TEXT, payload } } }
assert.deepEqual(M.fromRadio(fr("hello street")), { text: "hello street", from: 0x1234abcd, ch: 0 });
const tp = PB.dec(PB.dec(PB.dec(M.textPacket("SB1|x", 2))[1][0])[4][0]); assert.equal(new TextDecoder().decode(tp[2][0]), "SB1|x"); assert.equal(Number(tp[1][0]), 1, "on the text port");
const got = []; const feed = M.framer((m) => got.push(M.fromRadio(m))); const two = Buffer.concat([Buffer.from("INFO | boot ok\n"), M.frame(fr("one")), Buffer.from("debug\n"), M.frame(fr("two"))]);
feed(two.subarray(0, 9)); feed(two.subarray(9, 30)); feed(two.subarray(30)); assert.deepEqual(got.map((x) => x.text), ["one", "two"], "frames split across reads, with debug text between");
const now = Date.now(), p = { id: "aaaaaaaaaaa1", kind: "need", text: "Need drinking water for two, 12 Oak St", by: "Ann", at: now - 6e4, exp: now + 864e5 };
const pk = M.sbPacket(p, "elm-street"); assert.match(pk, /^SB1\|elm-street\|aaaaaaaaaaa1\|n\|[0-9a-z]+\|[0-9a-z]+\|Ann\|Need drinking water for two, 12 Oak St$/);
const back = M.sbParse(pk, "elm-street"); assert.deepEqual([back.id, back.kind, back.by, back.text], [p.id, "need", "Ann", p.text]); assert.ok(Math.abs(back.at - p.at) < 6e4);
assert.equal(M.sbParse(pk, "oak-road"), null, "another street's"); assert.equal(M.sbParse("hello all", "elm-street"), null, "plain chat");
assert.ok(new TextEncoder().encode(M.sbPacket({ ...p, text: "x".repeat(400) }, "elm-street", 200)).length <= 200, "cut to fit one packet");
ok("the packets: text in and out, frames found among the radio's debug text, a Street Board notice that fits one packet and is read only for its own street");

// a stand-in Meshtastic radio on its TCP port
const heard = [], socks = []; let configs = 0;
const radio = net.createServer((s) => { socks.push(s); s.on("error", () => {});
  s.on("data", M.framer((m) => { const t = PB.dec(m); if (t[3]) { configs++; s.write(M.frame(PB.msg([PB.v(7, Number(t[3][0]))]))); } // want_config → config_complete
    if (t[1]) { const d = PB.dec(PB.dec(t[1][0])[4][0]); heard.push(new TextDecoder().decode(d[2][0])); } })); });
await new Promise((r) => radio.listen(0, r)); const RP = radio.address().port;
const free = () => new Promise((r) => { const s = http.createServer().listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-")), PORT = await free();
const box = spawn(process.execPath, [REPO + "/node/street-node.mjs", "--board", "elm-street", "--port", String(PORT), "--data", path.join(tmp, "box.json"), "--mesh", "tcp://127.0.0.1:" + RP, "--mesh-every", "1"], { stdio: ["ignore", "pipe", "pipe"] });
let out = ""; box.stdout.on("data", (d) => (out += d)); box.stderr.on("data", (d) => (out += d));
const api = (q, b) => fetch("http://localhost:" + PORT + q, b ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) } : {}).then((r) => r.json());
try {
  assert.ok(await wait(async () => { try { return (await api("/api/node")).mesh.state === "on"; } catch (e) { return false; } }), "the box is on the radio: " + out);
  assert.equal(configs, 1);
  ok("the box asks the radio for its config, and is on the air once the radio says it's ready");

  await api("/api/board/elm-street", { posts: [p] });
  assert.ok(await wait(() => heard.some((t) => t.startsWith("SB1|elm-street|aaaaaaaaaaa1|n|"))), "sent over the air: " + JSON.stringify(heard));
  await new Promise((r) => setTimeout(r, 2500)); assert.equal(heard.filter((t) => t.includes("aaaaaaaaaaa1")).length, 1, "once");
  ok("a notice a phone posts to the box goes out over the air, once");

  const theirs = M.sbPacket({ id: "bbbbbbbbbbb1", kind: "offer", text: "Spare bottled water at no. 4", by: "Bob", at: Date.now() - 6e4, exp: Date.now() + 864e5 }, "elm-street");
  for (const s of socks) { s.write(M.frame(fr(theirs))); s.write(M.frame(fr(M.sbPacket({ ...p, id: "ccccccccccc1", text: "Oak Road's notice" }, "oak-road")))); s.write(M.frame(fr("anyone on channel 0?"))); }
  assert.ok(await wait(async () => (await api("/api/board/elm-street")).posts.some((x) => x.id === "bbbbbbbbbbb1")), "heard notice on the board");
  const posts = (await api("/api/board/elm-street")).posts; assert.deepEqual(posts.map((x) => x.text).sort(), ["Need drinking water for two, 12 Oak St", "Spare bottled water at no. 4"], "not another street's, not chat");
  await new Promise((r) => setTimeout(r, 2500)); assert.equal(heard.filter((t) => t.includes("bbbbbbbbbbb1")).length, 0, "not sent back out");
  assert.equal((await api("/api/node")).mesh.heard >= 1, true);
  ok("a notice heard over the air for this street comes onto the box's board, and isn't sent back out; another street's notice and plain chat don't");

  for (const s of socks) s.destroy(); const before = configs;
  assert.ok(await wait(() => configs > before, 9000), "connected again");
  ok("if the radio goes away, the box connects again by itself");
} finally { box.kill("SIGTERM"); radio.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log("street node radio: all checks passed");
