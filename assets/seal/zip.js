/* A store-only zip writer (photos and PDFs are compressed already) and a reader, for kits built on the device:
   Claim Kit (/claim) and Move-in, Move-out (/movein). The reader also takes a kit someone unzipped and zipped again
   (deflated, inside a folder), and drops folders and macOS's __MACOSX copies.
     KitZip.zip([{ name, data: Uint8Array, date? }]) → Blob
     KitZip.unzip(blob) → Map(file name → Uint8Array) */
(() => {
"use strict";
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = t[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function zip(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = CRC(f.data), d = f.date || new Date(), tm = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dt = (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + f.data.length;
  }
  const size = cen.reduce((n, x) => n + x.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: "application/zip" });
}
async function unzip(blob) { // also reads a kit someone unzipped and zipped again (deflated, inside a folder)
  const u = new Uint8Array(await blob.arrayBuffer()), v = new DataView(u.buffer); let e = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("That isn't a zip file.");
  const out = new Map(), dec = new TextDecoder(); let p = v.getUint32(e + 16, true);
  for (let i = 0, n = v.getUint16(e + 10, true); i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("That zip is damaged.");
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true), name = dec.decode(u.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl; if (name.endsWith("/") || /(^|\/)__MACOSX\//.test(name)) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true); let data = u.subarray(start, start + csize);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else if (method !== 0) throw new Error("That zip uses a packing this page can't read: unzip it and choose claim.json with the files instead.");
    out.set(name.replace(/^.*\//, ""), data);
  }
  return out;
}
window.KitZip = { zip, unzip };
})();
