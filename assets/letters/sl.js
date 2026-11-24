/* Sealed Letters · the cryptography, all in this browser.
     Shamir's secret sharing over GF(256) (the AES field, x^8+x^4+x^3+x+1): split(secret, n, k) gives n shares, any k of
     which rebuild the secret with combine(shares); fewer than k say nothing about it.
     AES-256-GCM for the letter itself. Nothing secret leaves this browser except the release secret S, which only a
     locked letter has and which on its own opens nothing. */
(() => {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0); x &= 0xff; } // x · 3 each step: 3 generates the field
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0), div = (a, b) => { if (!b) throw new Error("divide by zero"); return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0; };
  function split(secret, n, k) {
    if (!(k >= 1 && n >= k && n <= 255)) throw new Error("k of n out of range");
    const shares = Array.from({ length: n }, (_, i) => ({ x: i + 1, y: new Uint8Array(secret.length) }));
    for (let b = 0; b < secret.length; b++) {
      const c = new Uint8Array(k); c[0] = secret[b]; if (k > 1) crypto.getRandomValues(c.subarray(1));
      for (const s of shares) { let y = 0; for (let j = k - 1; j >= 0; j--) y = mul(y, s.x) ^ c[j]; s.y[b] = y; } // Horner
    }
    return shares;
  }
  function combine(shares) {
    const xs = shares.map((s) => s.x); if (new Set(xs).size !== xs.length) throw new Error("the same share twice");
    const out = new Uint8Array(shares[0].y.length);
    for (let b = 0; b < out.length; b++) { let v = 0;
      for (let i = 0; i < shares.length; i++) { let num = 1, den = 1; for (let j = 0; j < shares.length; j++) if (j !== i) { num = mul(num, xs[j]); den = mul(den, xs[j] ^ xs[i]); } v ^= mul(shares[i].y[b], div(num, den)); }
      out[b] = v; }
    return out;
  }
  const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(""), unhex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
  const b64u = (u) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const xor = (a, b) => a.map((x, i) => x ^ b[i]);
  const aes = (raw, use) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, [use]);
  async function seal(obj, key) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(key, "encrypt"), new TextEncoder().encode(JSON.stringify(obj))); return { ct: b64u(new Uint8Array(ct)), iv: b64u(iv) }; }
  async function unseal(ct, iv, key) { const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aes(key, "decrypt"), unb64u(ct)); return JSON.parse(new TextDecoder().decode(pt)); }
  // a share as it travels in a link: "<letter id>.<x>.<y hex>"
  const shareText = (id, s) => id + "." + s.x + "." + hex(s.y);
  const readShare = (t) => { const m = /([0-9a-f]{16})\.(\d{1,3})\.([0-9a-f]{64})/.exec(String(t || "")); return m ? { id: m[1], x: +m[2], y: unhex(m[3]) } : null; };
  window.SealedLetters = { split, combine, hex, unhex, xor, seal, unseal, shareText, readShare, random: (n) => crypto.getRandomValues(new Uint8Array(n)) };
})();
