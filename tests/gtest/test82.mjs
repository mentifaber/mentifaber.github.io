// In Case: the QR codes (assets/js/qr.js) and the card's sealed box (src/care.js's incase, /api/incase).
//  - QR codes read back: for texts from 1 to 213 bytes (versions 1 to 10), the format information in both its places names
//    level M and the mask used, every block's error correction checks out (Reed-Solomon syndromes all zero), and the data
//    decodes to the text. (Built against jsQR, a real decoder, which reads every one of these too.)
//  - the box: anyone with a card's id reads its ciphertext without the token (the key in the link is all a paramedic
//    needs); only the token writes or deletes it; Care Circle and House Kitty still need their token to read
import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const QR = require(new URL("../../assets/js/qr.js", import.meta.url).pathname);
const { incase, care, kitty } = await import(new URL("../../src/care.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);

// ── reading a QR code back ──
const EXP = new Array(512), LOG = new Array(256); { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const BLOCKS = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
function readBack(q) {
  const N = q.size, v = (N - 17) / 4, g = (x, y) => (q.get(x, y) ? 1 : 0);
  // format information: 15 bits, unmasked with 0x5412, the 5 data bits then a BCH check; both copies must agree
  let f1 = 0, f2 = 0; const c1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  c1.forEach(([x, y], i) => (f1 |= g(x, y) << i)); for (let i = 0; i < 8; i++) f2 |= g(N - 1 - i, 8) << i; for (let i = 8; i < 15; i++) f2 |= g(8, N - 15 + i) << i;
  assert.equal(f1, f2, "both copies of the format information"); const fmt = f1 ^ 0x5412;
  let rem = fmt; for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10); assert.equal(rem, 0, "the format information's BCH check");
  const level = fmt >> 13, mask = (fmt >> 10) & 7; assert.equal(level, 0, "level M");
  // which modules are the pattern's own (not data)
  const fn = Array.from({ length: N }, () => new Array(N).fill(false)), mark = (x, y) => { if (x >= 0 && y >= 0 && x < N && y < N) fn[y][x] = true; };
  for (const [cx, cy] of [[3, 3], [N - 4, 3], [3, N - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  for (let i = 0; i < N; i++) { mark(6, i); mark(i, 6); } for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); } for (let i = 0; i < 8; i++) { mark(N - 1 - i, 8); mark(8, N - 1 - i); }
  const al = ALIGN[v]; for (const ay of al) for (const ax of al) { if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(ax + dx, ay + dy); }
  if (v >= 7) for (let i = 0; i < 18; i++) { mark(N - 11 + (i % 3), Math.floor(i / 3)); mark(Math.floor(i / 3), N - 11 + (i % 3)); }
  const bits = []; let up = true;
  for (let right = N - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let i = 0; i < N; i++) { const y = up ? N - 1 - i : i; for (let j = 0; j < 2; j++) { const x = right - j; if (fn[y][x]) continue; bits.push(g(x, y) ^ (MASKS[mask](x, y) ? 1 : 0)); } } up = !up; }
  const cw = []; for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // de-interleave, check each block's syndromes, then read the data
  const [ecn, groups] = BLOCKS[v], sizes = groups.flatMap(([c, s]) => new Array(c).fill(s)), blocks = sizes.map((s) => ({ d: [], e: [] })), maxD = Math.max(...sizes); let k = 0;
  for (let i = 0; i < maxD; i++) blocks.forEach((b, bi) => { if (i < sizes[bi]) b.d.push(cw[k++]); }); for (let i = 0; i < ecn; i++) for (const b of blocks) b.e.push(cw[k++]);
  for (const b of blocks) { const all = [...b.d, ...b.e]; for (let i = 0; i < ecn; i++) { let s = 0; for (const c of all) s = mul(s, EXP[i]) ^ c; assert.equal(s, 0, "a Reed-Solomon syndrome"); } }
  const data = blocks.flatMap((b) => b.d), db = []; for (const c of data) for (let i = 7; i >= 0; i--) db.push((c >> i) & 1);
  const take = (n, at) => parseInt(db.slice(at, at + n).join(""), 2); assert.equal(take(4, 0), 0b0100, "byte mode");
  const len = take(v < 10 ? 8 : 16, 4), start = 4 + (v < 10 ? 8 : 16), out = []; for (let i = 0; i < len; i++) out.push(take(8, start + i * 8));
  return { v, mask, text: new TextDecoder().decode(Uint8Array.from(out)) };
}
const masks = new Set(); let maxV = 0;
for (const L of [1, 14, 15, 26, 27, 42, 43, 62, 63, 84, 85, 92, 106, 107, 122, 123, 151, 152, 180, 181, 213]) {
  const s = Array.from({ length: L }, (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789-._~#=/:"[(i * 7 + L) % 44]).join(""), r = readBack(QR.matrix(s));
  assert.equal(r.text, s, "length " + L); masks.add(r.mask); maxV = Math.max(maxV, r.v); }
assert.equal(maxV, 10); assert.ok(masks.size > 1, "the mask is chosen, not fixed");
const link = "https://mentifaber.org/incase#v=0123456789abcdef.Q2hpY2tlbnNfYW5kX3dhZmZsZXNfYXJlX2RlbGljaW91cw"; assert.equal(readBack(QR.matrix(link)).text, link);
assert.equal(readBack(QR.matrix("Zoë · 💊")).text, "Zoë · 💊", "UTF-8");
assert.throws(() => QR.matrix("x".repeat(214)), /too long/);
const svg = QR.svg(link, { label: "QR code for Ann's card" }); assert.match(svg, /^<svg [^>]*viewBox="0 0 49 49"[^>]*role="img" aria-label="QR code for Ann's card"/); assert.ok(!/<script/i.test(svg));
ok("QR codes read back, versions 1 to 10: both format copies agree on level M and the mask, every block's error correction checks, the text comes back (UTF-8 too)");

// ── the card's box ──
const mem = new Map(), st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvDel: async (k) => { mem.delete(k); }, hit: async () => true,
  kvCas: async (k, e, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== e) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (fn, route, path, body, tok) => { const r = await fn(new Request("https://mentifaber.org/api/" + route + "/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(tok ? { ["x-" + route + "-token"]: tok } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, json); return { s: r.status, j: await r.json() }; };
const ID = "00112233445566ff", T = "c".repeat(32), CT = "Z".repeat(40), IV = "Y".repeat(16);
assert.equal((await call(incase, "incase", ID)).s, 404, "nothing there yet");
assert.equal((await call(incase, "incase", ID, { t: T, v: 0, ct: CT, iv: IV })).s, 200);
let r = await call(incase, "incase", ID); assert.equal(r.s, 200); assert.equal(r.j.ct, CT, "read with no token: the key in the link is all a reader needs");
assert.equal((await call(incase, "incase", ID, { v: 1, ct: CT, iv: IV })).s, 403, "writing still needs the token"); assert.equal((await call(incase, "incase", ID, { t: "d".repeat(32), v: 1, ct: CT, iv: IV })).s, 403);
assert.equal((await call(incase, "incase", ID + "/delete", { t: "d".repeat(32) })).s, 403); assert.equal((await call(incase, "incase", ID + "/delete", { t: T })).s, 200); assert.equal((await call(incase, "incase", ID)).s, 404);
await call(care, "care", ID, { t: T, v: 0, ct: CT, iv: IV }); await call(kitty, "kitty", ID, { t: T, v: 0, ct: CT, iv: IV });
assert.equal((await call(care, "care", ID)).s, 403, "Care Circle still needs its token to read"); assert.equal((await call(kitty, "kitty", ID)).s, 403, "House Kitty too");
ok("the card's box: read with no token, written and deleted only with it; Care Circle and House Kitty still need their token to read");
console.log("in case: all checks passed");
