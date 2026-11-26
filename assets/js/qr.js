/* A small QR code maker for the workshop's own links, with no library and no network: byte mode, error correction level
   M (about 15% of the code can be damaged and it still reads), versions 1 to 10 (up to 213 bytes). It's enough for a
   link, which is what it's for (In Case's card for paramedics).
     QR.matrix(text)        → { size, get(x, y) → true for a dark module }
     QR.svg(text, { pad })  → an <svg> string, dark on white, crisp at any size
   Exposed as window.QR, and to Node as module.exports for the tests. */
(function (root) {
  "use strict";
  // version → [EC codewords per block, [blocks, data codewords] per group], level M
  const M = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
  // GF(256), the field the error correction works in
  const EXP = new Array(512), LOG = new Array(256); { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); } g = next; } return g; }
  function rsEncode(data, n) { const gen = rsGen(n), res = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) { const c = res[i]; if (c) for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], c); } return res.slice(data.length); }
  const dataCap = (v) => M[v][1].reduce((s, [b, d]) => s + b * d, 0);

  function codewords(bytes, v) {
    const cap = dataCap(v), bits = [], put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
    // split into blocks, add each block's error correction, then interleave
    const [ecn, groups] = M[v], blocks = []; let at = 0;
    for (const [count, size] of groups) for (let i = 0; i < count; i++) { const d = data.slice(at, at + size); at += size; blocks.push({ d, e: rsEncode(d, ecn) }); }
    const out = [], maxD = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecn; i++) for (const b of blocks) out.push(b.e[i]);
    return out;
  }
  // BCH codes for the format (level M, mask) and version information
  const bch = (val, poly, len) => { let v = val << (len - 1); const top = 31 - Math.clz32(poly); while (v && 31 - Math.clz32(v) >= top) v ^= poly << (31 - Math.clz32(v) - top); return (val << (len - 1)) | v; };
  const formatBits = (mask) => bch((0b00 << 3) | mask, 0b10100110111, 11) ^ 0b101010000010010;
  const versionBits = (v) => bch(v, 0b1111100100101, 13);
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];

  function build(v, cws, mask) {
    const n = v * 4 + 17, m = Array.from({ length: n }, () => new Array(n).fill(null)), fn = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= n || y >= n) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[v]; for (const ay of al) for (const ax of al) { if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    // format information, around the finders (and the dark module)
    const f = formatBits(mask);
    for (let i = 0; i <= 5; i++) set(8, i, ((f >>> i) & 1) === 1); set(8, 7, ((f >>> 6) & 1) === 1); set(8, 8, ((f >>> 7) & 1) === 1); set(7, 8, ((f >>> 8) & 1) === 1);
    for (let i = 9; i < 15; i++) set(14 - i, 8, ((f >>> i) & 1) === 1);
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, ((f >>> i) & 1) === 1); for (let i = 8; i < 15; i++) set(8, n - 15 + i, ((f >>> i) & 1) === 1);
    set(8, n - 8, true);
    if (v >= 7) { const vb = versionBits(v); for (let i = 0; i < 18; i++) { const bit = ((vb >>> i) & 1) === 1, a = n - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit); set(b, a, bit); } }
    // the data, in two-column strips from the bottom right, up and down in turn
    const bits = []; for (const c of cws) for (let i = 7; i >= 0; i--) bits.push((c >>> i) & 1); for (let i = 0; i < REMAINDER[v]; i++) bits.push(0);
    let k = 0, upward = true;
    for (let right = n - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
      for (let i = 0; i < n; i++) { const y = upward ? n - 1 - i : i; for (let j = 0; j < 2; j++) { const x = right - j; if (fn[y][x]) continue; const bit = k < bits.length ? bits[k++] === 1 : false; m[y][x] = MASKS[mask](x, y) ? !bit : bit; } }
      upward = !upward; }
    return m;
  }
  // how bad a mask looks to a reader (the standard's four penalty rules); the lowest wins
  function penalty(m) {
    const n = m.length; let p = 0;
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) { let run = 1; for (let b = 1; b < n; b++) { const cur = pass ? m[b][a] : m[a][b], prev = pass ? m[b - 1][a] : m[a][b - 1]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    const pat = [true, false, true, true, true, false, true];
    for (let y = 0; y < n; y++) for (let x = 0; x + 6 < n; x++) for (const dir of [0, 1]) { let hit = true; for (let i = 0; i < 7; i++) if ((dir ? m[x + i][y] : m[y][x + i]) !== pat[i]) { hit = false; break; } if (!hit) continue;
      const lightBefore = (() => { for (let i = 1; i <= 4; i++) { const xx = x - i; if (xx < 0) return true; if (dir ? m[xx][y] : m[y][xx]) return false; } return true; })();
      const lightAfter = (() => { for (let i = 7; i <= 10; i++) { const xx = x + i; if (xx >= n) return true; if (dir ? m[xx][y] : m[y][xx]) return false; } return true; })();
      if (lightBefore || lightAfter) p += 40; }
    let dark = 0; for (const row of m) for (const c of row) if (c) dark++;
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  }
  function matrix(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let v = 1; while (v <= 10 && dataCap(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error("too long for a QR code here (213 bytes at most)");
    const cws = codewords(bytes, v); let best = null, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) { const mm = build(v, cws, mask), p = penalty(mm); if (p < bestP) { best = mm; bestP = p; } }
    return { size: best.length, version: v, get: (x, y) => !!best[y][x] };
  }
  function svg(text, o = {}) {
    const q = matrix(text), pad = o.pad == null ? 4 : o.pad, s = q.size + pad * 2; let d = "";
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += "M" + (x + pad) + " " + (y + pad) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges"' + (o.label ? ' role="img" aria-label="' + String(o.label).replace(/[<>"&]/g, "") + '"' : ' aria-hidden="true"') + '><rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  const api = { matrix, svg };
  if (typeof module === "object" && module.exports) module.exports = api; else root.QR = api;
})(typeof window !== "undefined" ? window : globalThis);
