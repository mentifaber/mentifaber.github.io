// NULLSPACE · the radio. Talks to a LoRa mesh node straight from the browser, so the deck still works with no internet at all.
//   Meshtastic  over Bluetooth (Web Bluetooth) or USB (Web Serial): protobuf ToRadio/FromRadio, text on the TEXT_MESSAGE_APP port
//   MeshCore    over Bluetooth (Nordic UART) or USB: the companion-radio protocol, channel text messages
//   Simulator   two browser tabs (?profile=a, ?profile=b) become two nodes on a pretend mesh, for trying everything without hardware
// Encrypted NULLSPACE messages ride inside ordinary channel text as "NS1…" so they cross any mesh; plain text from other
// people on the channel shows up too ("open band"), and you can answer it in plain text.
(() => {
"use strict";
const R = (NS.Radio = { kind: null, via: null, state: "off", me: { num: 0, name: "" }, nodes: new Map(), channels: [], log: [], h: {}, sent: 0, got: 0, on(t, f) { (R.h[t] = R.h[t] || []).push(f); } });
const emit = (t, a) => (R.h[t] || []).forEach((f) => { try { f(a); } catch (e) { console.error(e); } });
const log = (s) => { R.log.push(NS.clock(Date.now()) + "  " + s); if (R.log.length > 300) R.log.shift(); emit("log", s); };
const setState = (s, why) => { R.state = s; if (why) log(why); emit("state"); };
R.can = { ble: "bluetooth" in navigator, serial: "serial" in navigator };
// how many characters of text fit in one encrypted radio packet (it depends on the firmware's packet size)
R.maxChars = () => (R.kind === "meshcore" ? 150 : R.kind ? 228 : 0); // the text field size of one packet
R.maxText = () => NS.rfRoom(R.maxChars(), NS.me && NS.me.handle);
const node = (num) => { let n = R.nodes.get(num); if (!n) { n = { num, name: "!" + (num >>> 0).toString(16).padStart(8, "0"), short: "", snr: null, rssi: null, hops: null, heard: 0 }; R.nodes.set(num, n); } return n; };

// ═══ protobuf, just enough of it ═════════════════════════════════════════════════════════════
const PB = {
  varint(n) { const out = []; let v = BigInt.asUintN(64, BigInt(n)); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; },
  field(num, wt, payload) { return [...PB.varint((num << 3) | wt), ...payload]; },
  v: (num, n) => PB.field(num, 0, PB.varint(n)),
  f32: (num, n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return PB.field(num, 5, [...b]); },
  bytes: (num, u8) => PB.field(num, 2, [...PB.varint(u8.length), ...u8]),
  msg: (parts) => Uint8Array.from(parts.flat()),
  // decode to { field: [values] }: varints as BigInt, fixed32 as {u32, f32}, length-delimited as Uint8Array
  dec(u8) { const out = {}; let i = 0; const rv = () => { let r = 0n, s = 0n, b; do { b = u8[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80 && i < u8.length); return r; };
    while (i < u8.length) { const key = Number(rv()), num = key >> 3, wt = key & 7; let val;
      if (wt === 0) val = rv(); else if (wt === 5) { const dv = new DataView(u8.buffer, u8.byteOffset + i, 4); val = { u32: dv.getUint32(0, true), i32: dv.getInt32(0, true), f32: dv.getFloat32(0, true) }; i += 4; } else if (wt === 1) { i += 8; continue; } else if (wt === 2) { const len = Number(rv()); val = u8.subarray(i, i + len); i += len; } else break;
      (out[num] = out[num] || []).push(val); }
    return out; },
};
const one = (o, n) => (o[n] ? o[n][0] : undefined), int32 = (b) => (b === undefined ? undefined : Number(BigInt.asIntN(32, b))), uint = (b) => (b === undefined ? undefined : Number(b)), str = (u) => (u ? NS.dec.decode(u) : "");
R._pb = PB;

// ═══ Meshtastic ══════════════════════════════════════════════════════════════════════════════
const MT = { SVC: "6ba1b218-15a8-461f-9fa8-5dcae273eafd", TO: "f75c76d2-129e-4dad-a1dd-7866124401e7", FROM: "2c55e69e-4993-11ed-b878-0242ac120002", NUM: "ed9da18c-a800-4f66-a670-aa7547e34453", TEXT: 1, POSITION: 3, NODEINFO: 4, BROADCAST: 0xffffffff };
const mtWantConfig = (id) => PB.msg([PB.v(3, id)]);
const mtText = (text, ch, id) => PB.msg([PB.bytes(1, PB.msg([PB.f32(2, MT.BROADCAST), PB.v(3, ch), PB.bytes(4, PB.msg([PB.v(1, MT.TEXT), PB.bytes(2, NS.enc.encode(text))])), PB.f32(6, id), PB.v(9, 3), PB.v(10, 1)]))]);
function mtFromRadio(u8) {
  const fr = PB.dec(u8);
  if (fr[3]) { const mi = PB.dec(fr[3][0]); R.me.num = uint(one(mi, 1)) >>> 0; log("my node " + node(R.me.num).name); }
  if (fr[4]) { const ni = PB.dec(fr[4][0]), n = node(uint(one(ni, 1)) >>> 0); if (ni[2]) { const u = PB.dec(ni[2][0]); n.name = str(one(u, 2)) || n.name; n.short = str(one(u, 3)); } if (ni[3]) { const p = PB.dec(ni[3][0]); if (p[1] && p[2]) { n.lat = p[1][0].i32 / 1e7; n.lon = p[2][0].i32 / 1e7; } } if (ni[4]) n.snr = +ni[4][0].f32.toFixed(1); if (ni[5]) n.heard = ni[5][0].u32 * 1000; if (ni[9]) n.hops = uint(ni[9][0]); if (n.num === R.me.num) R.me.name = n.name; emit("nodes"); }
  if (fr[10]) { const c = PB.dec(fr[10][0]), idx = uint(one(c, 1)) || 0, role = uint(one(c, 3)) || 0, set = c[2] ? PB.dec(c[2][0]) : {}; if (role) { R.channels[idx] = { index: idx, name: str(one(set, 3)) || (idx === 0 ? "Primary" : "Channel " + idx), primary: role === 1 }; emit("channels"); } }
  if (fr[7]) { setState("on", "config complete · " + R.nodes.size + " nodes"); }
  if (fr[2]) {
    const p = PB.dec(fr[2][0]), from = (one(p, 1) || { u32: 0 }).u32 >>> 0, ch = uint(one(p, 3)) || 0, d = p[4] ? PB.dec(p[4][0]) : null; if (!d) return;
    const port = uint(one(d, 1)), payload = one(d, 2) || new Uint8Array(), n = node(from), snr = p[8] ? +p[8][0].f32.toFixed(1) : null, rssi = int32(one(p, 12)), hl = uint(one(p, 9)), hs = uint(one(p, 15));
    n.heard = Date.now(); if (snr != null) n.snr = snr; if (rssi) n.rssi = rssi; if (hs != null && hl != null) n.hops = hs - hl;
    if (port === MT.TEXT) { R.got++; emit("packet", { text: str(payload), from, fromName: n.name, ch, snr, rssi, hops: n.hops, at: Date.now() }); }
    else if (port === MT.POSITION) { const q = PB.dec(payload); if (q[1] && q[2]) { n.lat = q[1][0].i32 / 1e7; n.lon = q[2][0].i32 / 1e7; } }
    else if (port === MT.NODEINFO) { const u = PB.dec(payload); n.name = str(one(u, 2)) || n.name; n.short = str(one(u, 3)); }
    emit("nodes");
  }
}
const meshtastic = {
  async ble() {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [MT.SVC] }] }), gatt = await dev.gatt.connect(), svc = await gatt.getPrimaryService(MT.SVC);
    const to = await svc.getCharacteristic(MT.TO), from = await svc.getCharacteristic(MT.FROM), num = await svc.getCharacteristic(MT.NUM); let draining = false;
    const drain = async () => { if (draining) return; draining = true; try { for (let i = 0; i < 500; i++) { const v = await from.readValue(); if (!v.byteLength) break; mtFromRadio(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))); } } catch (e) { log("read: " + e.message); } draining = false; };
    await num.startNotifications(); num.addEventListener("characteristicvaluechanged", drain); dev.addEventListener("gattserverdisconnected", () => setState("off", "bluetooth disconnected"));
    R.write = async (u8) => to.writeValue(u8); R.close = () => { try { gatt.disconnect(); } catch (e) {} };
    await R.write(mtWantConfig(Math.floor(Math.random() * 1e9))); await drain(); R.me.name = R.me.name || dev.name || "";
  },
  async serial() {
    const port = await navigator.serial.requestPort(); await port.open({ baudRate: 115200 }); const writer = port.writable.getWriter(); let stop = false;
    R.write = async (u8) => { const h = new Uint8Array(4 + u8.length); h[0] = 0x94; h[1] = 0xc3; h[2] = u8.length >> 8; h[3] = u8.length & 255; h.set(u8, 4); await writer.write(h); };
    R.close = async () => { stop = true; try { writer.releaseLock(); await port.close(); } catch (e) {} };
    (async () => { const reader = port.readable.getReader(); let buf = new Uint8Array(0), text = "";
      try { while (!stop) { const { value, done } = await reader.read(); if (done) break; const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
        for (;;) { const s = buf.indexOf(0x94); if (s < 0) { text += NS.dec.decode(buf); buf = new Uint8Array(0); break; } if (s > 0) { text += NS.dec.decode(buf.subarray(0, s)); buf = buf.subarray(s); } if (buf.length < 4) break; if (buf[1] !== 0xc3) { buf = buf.subarray(1); continue; } const len = (buf[2] << 8) | buf[3]; if (len > 512) { buf = buf.subarray(1); continue; } if (buf.length < 4 + len) break; mtFromRadio(buf.slice(4, 4 + len)); buf = buf.subarray(4 + len); }
        if (text.includes("\n")) { const lines = text.split("\n"); text = lines.pop(); for (const l of lines) if (l.trim()) log("dev: " + l.trim().slice(0, 120)); } } } catch (e) { log("serial: " + e.message); } setState("off", "usb disconnected"); })();
    await writer.write(new Uint8Array(32).fill(0xc3)); await R.write(mtWantConfig(Math.floor(Math.random() * 1e9)));
  },
  send: (text, ch) => R.write(mtText(text, ch, Math.floor(Math.random() * 0xffffffff))),
};
R._mt = { mtText, mtWantConfig, mtFromRadio };

// ═══ MeshCore (companion radio protocol) ════════════════════════════════════════════════════
const MC = { SVC: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", RX: "6e400002-b5a3-f393-e0a9-e50e24dcca9e", TX: "6e400003-b5a3-f393-e0a9-e50e24dcca9e" };
const u32le = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return [...b]; };
const mcCmd = { appStart: () => Uint8Array.from([1, 3, 0, 0, 0, 0, 0, 0, ...NS.enc.encode("NULLSPACE")]), setTime: () => Uint8Array.from([6, ...u32le(Date.now() / 1000)]), contacts: () => Uint8Array.from([4]), syncNext: () => Uint8Array.from([10]), chanText: (ch, text) => Uint8Array.from([3, 0, ch, ...u32le(Date.now() / 1000), ...NS.enc.encode(text)]), advert: () => Uint8Array.from([7, 1]) };
function mcFrame(u8) {
  const code = u8[0], dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), cstr = (o, max) => { const s = u8.subarray(o, o + max), z = s.indexOf(0); return NS.dec.decode(z < 0 ? s : s.subarray(0, z)); };
  if (code === 5) { R.me.name = cstr(58, 64).replace(/[^\x20-\x7e -￿]/g, "") || R.me.name || "meshcore"; R.me.num = dv.getUint32(4, true); setState("on", "companion ready · " + R.me.name); R.send2(mcCmd.setTime()); R.send2(mcCmd.contacts()); R.send2(mcCmd.syncNext()); return; }
  if (code === 3 && u8.length >= 144) { const key = NS.hex(u8.subarray(1, 7)), num = parseInt(key.slice(0, 8), 16) >>> 0, n = node(num); n.name = cstr(100, 32) || n.name; const lat = dv.getInt32(136, true), lon = dv.getInt32(140, true); if (lat || lon) { n.lat = lat / 1e6; n.lon = lon / 1e6; } n.heard = dv.getUint32(132, true) * 1000; n.key = key; emit("nodes"); return; }
  if (code === 8 || code === 17) { const o = code === 17 ? 4 : 1, snr = code === 17 ? dv.getInt8(1) / 4 : null, ch = u8[o], hops = u8[o + 1] === 0xff ? 0 : u8[o + 1], raw = NS.dec.decode(u8.subarray(o + 7)); const m = raw.match(/^([^:]{1,32}): ([\s\S]*)$/), name = m ? m[1] : "?", text = m ? m[2] : raw, n = [...R.nodes.values()].find((x) => x.name === name) || { name, num: 0 }; if (n.num) { n.heard = Date.now(); if (snr != null) n.snr = snr; n.hops = hops; } R.got++; emit("packet", { text, from: n.num || 0, fromName: name, ch, snr, rssi: null, hops, at: Date.now() }); R.send2(mcCmd.syncNext()); emit("nodes"); return; }
  if (code === 7 || code === 16) { const o = code === 16 ? 4 : 1, key = NS.hex(u8.subarray(o, o + 6)), num = parseInt(key.slice(0, 8), 16) >>> 0, n = node(num), tt = u8[o + 7], off = o + 12 + (tt === 2 ? 4 : 0); R.got++; emit("packet", { text: NS.dec.decode(u8.subarray(off)), from: num, fromName: n.name, ch: -1, dm: true, snr: code === 16 ? dv.getInt8(1) / 4 : null, rssi: null, hops: u8[o + 6], at: Date.now() }); R.send2(mcCmd.syncNext()); return; }
  if (code === 0x83) { R.send2(mcCmd.syncNext()); return; } // a message is waiting
  if (code === 0x80 || code === 0x8a) { R.send2(mcCmd.contacts()); return; } // somebody advertised
  if (code === 1) log("radio said: error"); if (code === 10) {} // no more messages
}
const meshcore = {
  async ble() {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [MC.SVC] }] }), gatt = await dev.gatt.connect(), svc = await gatt.getPrimaryService(MC.SVC), rx = await svc.getCharacteristic(MC.RX), tx = await svc.getCharacteristic(MC.TX);
    await tx.startNotifications(); tx.addEventListener("characteristicvaluechanged", (e) => { const v = e.target.value; mcFrame(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))); }); dev.addEventListener("gattserverdisconnected", () => setState("off", "bluetooth disconnected"));
    let q = Promise.resolve(); R.send2 = (u8) => (q = q.then(() => rx.writeValueWithResponse ? rx.writeValueWithResponse(u8) : rx.writeValue(u8)).catch((e) => log("write: " + e.message))); R.close = () => { try { gatt.disconnect(); } catch (e) {} };
    R.send2(mcCmd.appStart());
  },
  async serial() {
    const port = await navigator.serial.requestPort(); await port.open({ baudRate: 115200 }); const writer = port.writable.getWriter(); let stop = false;
    let q = Promise.resolve(); R.send2 = (u8) => (q = q.then(() => writer.write(Uint8Array.from([0x3c, u8.length & 255, u8.length >> 8, ...u8]))).catch((e) => log("write: " + e.message)));
    R.close = async () => { stop = true; try { writer.releaseLock(); await port.close(); } catch (e) {} };
    (async () => { const reader = port.readable.getReader(); let buf = new Uint8Array(0);
      try { while (!stop) { const { value, done } = await reader.read(); if (done) break; const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
        for (;;) { const s = buf.indexOf(0x3e); if (s < 0) { buf = new Uint8Array(0); break; } buf = buf.subarray(s); if (buf.length < 3) break; const len = buf[1] | (buf[2] << 8); if (len > 300) { buf = buf.subarray(1); continue; } if (buf.length < 3 + len) break; mcFrame(buf.slice(3, 3 + len)); buf = buf.subarray(3 + len); } } } catch (e) { log("serial: " + e.message); } setState("off", "usb disconnected"); })();
    R.send2(mcCmd.appStart());
  },
  send: (text, ch) => R.send2(mcCmd.chanText(ch, text)),
};
R._mc = { mcFrame, mcCmd };

// ═══ the simulator: tabs on this computer are nodes on a pretend mesh (BroadcastChannel is the air) ═══
const sim = {
  air: null,
  async air_() {
    const air = (sim.air = new BroadcastChannel("nullspace-air")), num = parseInt(NS.me.node.slice(0, 8), 16) >>> 0; R.me = { num, name: NS.me.handle + " (sim)" };
    R.channels = [{ index: 0, name: "LongFast", primary: true }, { index: 1, name: "Crew", primary: false }];
    const beacon = () => air.postMessage({ t: "node", num, name: R.me.name });
    air.onmessage = (e) => { const m = e.data, n = node(m.num); n.name = m.name || n.name; n.heard = Date.now(); n.snr = +(Math.random() * 14 - 6).toFixed(1); n.rssi = -60 - Math.floor(Math.random() * 60); n.hops = Math.floor(Math.random() * 3);
      if (m.t === "node") { if (m.ask) beacon(); emit("nodes"); return; }
      if (m.t === "text") setTimeout(() => { R.got++; emit("packet", { text: m.text, from: m.num, fromName: n.name, ch: m.ch, snr: n.snr, rssi: n.rssi, hops: n.hops, at: Date.now() }); emit("nodes"); }, 250 + Math.random() * 500); };
    R.close = () => { clearInterval(sim.bt); air.close(); }; sim.bt = setInterval(beacon, 15000); air.postMessage({ t: "node", num, name: R.me.name, ask: 1 });
    setState("on", "simulator on: other tabs with ?profile=… are other nodes"); emit("channels");
  },
  send: async (text, ch) => sim.air.postMessage({ t: "text", num: R.me.num, name: R.me.name, text, ch }),
};

// ═══ the public face ═════════════════════════════════════════════════════════════════════════
const DRIVERS = { meshtastic, meshcore, sim };
R.connect = async (kind, via) => {
  if (R.state === "on" || R.state === "connecting") await R.disconnect();
  R.kind = kind; R.via = via; R.nodes = new Map(); R.channels = []; R.me = { num: 0, name: "" }; setState("connecting", "connecting to " + kind + " over " + via + "…");
  try { const d = DRIVERS[kind]; if (kind === "sim") await d.air_(); else { if (via === "ble" && !R.can.ble) throw new Error("this browser has no Bluetooth (try Chrome on Android or a computer)"); if (via === "serial" && !R.can.serial) throw new Error("this browser has no USB serial (try Chrome or Edge on a computer)"); await d[via](); if (kind === "meshtastic") setTimeout(() => { if (R.state === "connecting") setState("on", "connected"); }, 6000); else setTimeout(() => { if (R.state === "connecting") setState("on", "connected (no self info yet)"); }, 4000); }
    NS.store.set("radio", { kind, via }); } catch (e) { setState("error", "could not connect: " + (e && e.message || e)); R.kind = null; throw e; }
};
R.disconnect = async () => { try { R.close && (await R.close()); } catch (e) {} R.close = null; R.kind = null; setState("off", "radio off"); };
R.sendText = async (text, ch) => { if (R.state !== "on") throw new Error("no radio"); await DRIVERS[R.kind].send(text, ch | 0); R.sent++; log("tx ch" + (ch | 0) + " · " + text.length + " chars"); };
})();
