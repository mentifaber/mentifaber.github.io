// The Street Node's radio (game plan GP-9.1): Street Board's notices over a Meshtastic mesh, so the box reaches radios on
// the street and other boxes miles away, hop by hop, with no internet anywhere.
//
// The radio is a Meshtastic node the box can talk to:
//   tcp://host:4403   meshtasticd on the Pi with a LoRa board, or any Meshtastic radio on the network (its TCP API)
//   /dev/ttyACM0       a radio plugged in over USB (the box sets the port to 115200 baud, raw, with stty)
// Both speak the same frames: 0x94 0xC3, a 2-byte length, then a protobuf ToRadio (to the radio) or FromRadio (from it).
// Just enough protobuf is here for text on the TEXT_MESSAGE_APP port, the same as the phones' radio code (assets/ns/radio.js).
//
// A notice travels as one text packet, exactly as Street Board's phones send it: "SB1|board|id|k|at|exp|by|text", times
// in minutes (base 36), k the notice's first letter, cut to fit one packet. So a phone with a radio, another box, or this
// box all read the same packets.
import net from "node:net"; import fs from "node:fs"; import { execFileSync } from "node:child_process";

// ── protobuf, just enough ──
const PB = {
  varint(n) { const out = []; let v = BigInt.asUintN(64, BigInt(n)); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; },
  field: (num, wt, payload) => [...PB.varint((num << 3) | wt), ...payload],
  v: (num, n) => PB.field(num, 0, PB.varint(n)),
  f32: (num, n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return PB.field(num, 5, [...b]); },
  bytes: (num, u8) => PB.field(num, 2, [...PB.varint(u8.length), ...u8]),
  msg: (parts) => Uint8Array.from(parts.flat()),
  dec(u8) { const out = {}; let i = 0; const rv = () => { let r = 0n, s = 0n, b; do { b = u8[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80 && i < u8.length); return r; };
    while (i < u8.length) { const key = Number(rv()), num = key >> 3, wt = key & 7; let val;
      if (wt === 0) val = rv(); else if (wt === 5) { val = Buffer.from(u8.buffer, u8.byteOffset + i, 4).readUInt32LE(0); i += 4; } else if (wt === 1) { i += 8; continue; } else if (wt === 2) { const len = Number(rv()); val = u8.subarray(i, i + len); i += len; } else break;
      (out[num] = out[num] || []).push(val); }
    return out; },
};
export const PB_ = PB;
const TEXT = 1, BROADCAST = 0xffffffff;
// ToRadio{ want_config_id } and ToRadio{ packet: MeshPacket{ to: broadcast, channel, decoded: Data{ portnum: TEXT, payload }, id, hop_limit 3, want_ack } }
export const wantConfig = (id) => PB.msg([PB.v(3, id)]);
export const textPacket = (text, ch = 0, id = Math.floor(Math.random() * 0xffffffff)) => PB.msg([PB.bytes(1, PB.msg([PB.f32(2, BROADCAST), PB.v(3, ch), PB.bytes(4, PB.msg([PB.v(1, TEXT), PB.bytes(2, new TextEncoder().encode(text))])), PB.f32(6, id), PB.v(9, 3), PB.v(10, 1)]))]);
// FromRadio: a text packet ({ text, from, ch }), "config complete" ({ ready }), or nothing we use (null)
export function fromRadio(u8) {
  const fr = PB.dec(u8);
  if (fr[7]) return { ready: true };
  if (!fr[2]) return null;
  const p = PB.dec(fr[2][0]), d = p[4] ? PB.dec(p[4][0]) : null; if (!d || Number(d[1] ? d[1][0] : 0) !== TEXT) return null;
  return { text: new TextDecoder().decode(d[2] ? d[2][0] : new Uint8Array()), from: (p[1] ? p[1][0] : 0) >>> 0, ch: Number(p[3] ? p[3][0] : 0) };
}
export const frame = (u8) => { const h = Buffer.alloc(4 + u8.length); h[0] = 0x94; h[1] = 0xc3; h.writeUInt16BE(u8.length, 2); Buffer.from(u8).copy(h, 4); return h; };
// a stream of bytes from the radio → whole FromRadio messages (the radio's debug text between frames is skipped)
export function framer(onMessage) {
  let buf = Buffer.alloc(0);
  return (chunk) => { buf = Buffer.concat([buf, chunk]);
    for (;;) { const s = buf.indexOf(0x94); if (s < 0) { buf = Buffer.alloc(0); return; } if (s > 0) buf = buf.subarray(s); if (buf.length < 4) return;
      if (buf[1] !== 0xc3) { buf = buf.subarray(1); continue; } const len = buf.readUInt16BE(2); if (len > 512) { buf = buf.subarray(1); continue; } if (buf.length < 4 + len) return;
      const m = buf.subarray(4, 4 + len); buf = buf.subarray(4 + len); try { onMessage(new Uint8Array(m)); } catch (e) {} } };
}

// ── Street Board's packet ──
const LETTER = { n: "need", o: "offer", s: "safe", i: "info", a: "alert" };
export function sbPacket(p, board, room = 200) {
  const enc = new TextEncoder(), head = ["SB1", board, p.id, p.kind[0], Math.floor(p.at / 6e4).toString(36), Math.ceil(p.exp / 6e4).toString(36), (p.by || "").replace(/\|/g, "/")].join("|") + "|";
  let t = p.text.replace(/\|/g, "/"); while (enc.encode(head + t).length > room && t.length) t = t.slice(0, -2) + "…"; return head + t;
}
export function sbParse(text, board) {
  const f = String(text || "").split("|"); if (f[0] !== "SB1" || f.length < 8 || f[1] !== board || !LETTER[f[3]]) return null;
  return { id: f[2], kind: LETTER[f[3]], at: parseInt(f[4], 36) * 6e4, exp: parseInt(f[5], 36) * 6e4, ...(f[6] ? { by: f[6] } : {}), text: f.slice(7).join("|") };
}

// ── the link to the radio ──
// connect(spec, { onText }) → { send(text, ch), close(), state }; it reconnects on its own if the radio goes away
export function connect(spec, { onText, log = () => {} }) {
  const link = { state: "connecting", sent: 0, got: 0, write: null, closed: false };
  const handle = framer((m) => { const x = fromRadio(m); if (!x) return; if (x.ready) { link.state = "on"; log("radio: ready"); } else if (x.text) { link.got++; onText(x); } });
  const start = () => {
    if (link.closed) return;
    if (/^tcp:\/\//.test(spec)) {
      const u = new URL(spec), sock = net.connect(+u.port || 4403, u.hostname);
      sock.on("connect", () => { link.write = (b) => sock.write(b); sock.write(frame(wantConfig(Math.floor(Math.random() * 1e9)))); log("radio: connected to " + u.host); });
      sock.on("data", handle); sock.on("error", (e) => log("radio: " + e.message)); sock.on("close", () => { link.state = "off"; link.write = null; if (!link.closed) setTimeout(start, 5000).unref(); });
      link.close = () => { link.closed = true; sock.destroy(); };
    } else {
      try { execFileSync("stty", ["-F", spec, "115200", "raw", "-echo"]); } catch (e) { log("radio: couldn't set up " + spec + " (" + e.message + ")"); }
      const rd = fs.createReadStream(spec), wr = fs.createWriteStream(spec);
      link.write = (b) => wr.write(b); wr.write(Buffer.alloc(32, 0xc3)); wr.write(frame(wantConfig(Math.floor(Math.random() * 1e9))));
      rd.on("data", handle); rd.on("error", (e) => { log("radio: " + e.message); link.state = "off"; link.write = null; if (!link.closed) setTimeout(start, 5000).unref(); });
      link.close = () => { link.closed = true; rd.destroy(); wr.destroy(); };
    }
  };
  link.send = (text, ch = 0) => { if (!link.write) return false; link.write(frame(textPacket(text, ch))); link.sent++; return true; };
  start(); return link;
}
