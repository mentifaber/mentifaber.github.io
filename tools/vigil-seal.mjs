#!/usr/bin/env node
// Vigil lock: the published vigil-app.html holds only the lock screen and an
// AES-256-GCM ciphertext of the real page. The key is derived from the
// operator name and access code with PBKDF2-SHA256, so without both the page
// cannot be read — not by viewing source, not by editing localStorage.
//
//   VIGIL_USER=... VIGIL_PASS=... node tools/vigil-seal.mjs open
//       decrypt vigil-app.html -> .vigil-src/vigil-app.src.html (gitignored)
//   VIGIL_USER=... VIGIL_PASS=... node tools/vigil-seal.mjs seal
//       encrypt .vigil-src/vigil-app.src.html -> vigil-app.html
//
// To change the credentials: open with the old ones, seal with the new ones.
// Never commit .vigil-src/.

import { webcrypto as crypto } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "vigil-app.html");
const SRC = join(ROOT, ".vigil-src", "vigil-app.src.html");
const ITER = 600000;

const user = process.env.VIGIL_USER, pass = process.env.VIGIL_PASS;
const cmd = process.argv[2];
if (!user || !pass || !["open", "seal"].includes(cmd)) {
  console.error("usage: VIGIL_USER=... VIGIL_PASS=... node tools/vigil-seal.mjs open|seal");
  process.exit(1);
}

async function deriveKey(salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(user + "\u0000" + pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const BLOB_RE = /<script type="application\/octet-stream" id="vg-blob">([^<]*)<\/script>/;

if (cmd === "open") {
  const m = readFileSync(OUT, "utf8").match(BLOB_RE);
  if (!m) { console.error("vigil-app.html is not sealed"); process.exit(1); }
  const buf = Buffer.from(m[1].trim(), "base64");
  const salt = buf.subarray(0, 16), iv = buf.subarray(16, 28), ct = buf.subarray(28);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await deriveKey(salt), ct); }
  catch { console.error("wrong operator name or access code"); process.exit(1); }
  mkdirSync(dirname(SRC), { recursive: true });
  writeFileSync(SRC, gunzipSync(Buffer.from(pt)));
  console.log("opened ->", SRC);
} else {
  const src = readFileSync(SRC, "utf8");
  // The lock shell reuses the page's own head, styles and lock card, so the
  // gate looks identical to the dashboard it guards.
  const headEnd = src.indexOf("</head>");
  const lockStart = src.indexOf('<section class="lock-wrap" id="lock-section">');
  const lockEnd = src.indexOf("</section>", lockStart) + "</section>".length;
  if (headEnd < 0 || lockStart < 0) { console.error("source is missing </head> or the lock section"); process.exit(1); }
  const bodyOpen = src.slice(headEnd, lockStart);
  const lock = src.slice(lockStart, lockEnd);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(salt), gzipSync(src, { level: 9 })));
  const blob = Buffer.concat([salt, iv, ct]).toString("base64").replace(/.{1,120}/g, "$&\n");

  const shell = src.slice(0, headEnd) + bodyOpen + lock + `
<script type="application/octet-stream" id="vg-blob">
${blob}</script>
<script>
(function () {
  "use strict";
  var ITER = ${ITER}, KEY_STORE = "vigil-key";
  var user = document.getElementById("vg-user"), pass = document.getElementById("vg-pass");
  var btn = document.getElementById("vg-submit"), err = document.getElementById("vg-error");
  var card = document.querySelector(".lock-card");
  var raw = Uint8Array.from(atob(document.getElementById("vg-blob").textContent.replace(/\\s+/g, "")), function (c) { return c.charCodeAt(0); });
  var salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), ct = raw.subarray(28);
  var subtle = window.crypto && window.crypto.subtle;
  try { localStorage.removeItem("vigil-auth"); } catch (e) {}

  function b64(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  function open(key) {
    return subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct).then(function (pt) {
      var gz = new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(gz).text();
    }).then(function (html) {
      document.open(); document.write(html); document.close();
    });
  }
  function importRaw(bytes) { return subtle.importKey("raw", bytes, { name: "AES-GCM" }, true, ["decrypt"]); }

  function deny(msg) {
    err.textContent = msg; btn.disabled = false; btn.textContent = "Authenticate";
    card.classList.remove("lock-shake"); void card.offsetWidth; card.classList.add("lock-shake");
  }
  function attempt() {
    if (!subtle || !window.DecompressionStream) { deny("This browser can't open Vigil — use a current Chrome, Safari or Firefox over https."); return; }
    if (!user.value.trim() || !pass.value) { deny("Operator and access code required."); return; }
    btn.disabled = true; btn.textContent = "Verifying…"; err.textContent = "";
    subtle.importKey("raw", new TextEncoder().encode(user.value.trim() + "\\u0000" + pass.value), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
      })
      .then(function (key) {
        return subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct).then(function () { return key; });
      })
      .then(function (key) {
        return subtle.exportKey("raw", key).then(function (k) {
          try { localStorage.setItem(KEY_STORE, b64(k)); } catch (e) {}
          return open(key);
        });
      })
      .catch(function () { pass.value = ""; deny("Access denied. Try again."); });
  }
  btn.addEventListener("click", attempt);
  pass.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
  user.addEventListener("keydown", function (e) { if (e.key === "Enter") pass.focus(); });

  // Remembered device: the stored key only opens this exact ciphertext, and
  // is useless once the page is resealed with new credentials.
  var saved = null;
  try { saved = localStorage.getItem(KEY_STORE); } catch (e) {}
  if (saved && subtle && window.DecompressionStream) {
    importRaw(unb64(saved)).then(open).catch(function () { try { localStorage.removeItem(KEY_STORE); } catch (e) {} });
  }
})();
</script>
</body>
</html>
`;
  writeFileSync(OUT, shell);
  console.log("sealed ->", OUT, `(${(shell.length / 1024).toFixed(0)} KB)`);
}
