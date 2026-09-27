#!/usr/bin/env node
// Sealed pages. Each published page below is a lock screen plus an
// AES-256-GCM ciphertext of the real page, keyed by PBKDF2-SHA256 over
// "username\0password" (600k iterations). assets/seal.js unlocks it in the
// browser. The plaintext lives only in the gitignored .private/ folder.
//
//   SEAL_USER=... SEAL_PASS=... node tools/seal.mjs <target> open
//       decrypt the published page's ciphertext -> .private/<src>
//   SEAL_USER=... SEAL_PASS=... node tools/seal.mjs <target> seal
//       encrypt .private/<src> into the published page's ciphertext
//
// To change a login: open with the old one, then seal with the new one.

import { webcrypto as crypto } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = {
  vigil: { out: "vigil-app.html", src: ".private/vigil-app.html" },
  flutterbloom: { out: "flutterbloom.html", src: ".private/flutterbloom-game.html" },
  muse: { out: "muse-live.html", src: ".private/muse-live.html" },
  weaver: { out: "weaver-live.html", src: ".private/weaver-live.html" },
};
const ITER = 600000;
const BLOB_RE = /(<script type="application\/octet-stream" id="mf-blob">)([^<]*)(<\/script>)/;

const [target, cmd] = process.argv.slice(2);
const user = process.env.SEAL_USER, pass = process.env.SEAL_PASS;
const t = TARGETS[target];
if (!t || !["open", "seal"].includes(cmd) || !user || !pass) {
  console.error(`usage: SEAL_USER=... SEAL_PASS=... node tools/seal.mjs <${Object.keys(TARGETS).join("|")}> <open|seal>`);
  process.exit(1);
}
const OUT = join(ROOT, t.out), SRC = join(ROOT, t.src);

async function deriveKey(salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(user.trim() + "\u0000" + pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const page = readFileSync(OUT, "utf8");
const m = page.match(BLOB_RE);
if (!m) { console.error(`${t.out} has no <script id="mf-blob"> to hold the ciphertext`); process.exit(1); }

if (cmd === "open") {
  const buf = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(16, 28) }, await deriveKey(buf.subarray(0, 16)), buf.subarray(28)); }
  catch { console.error("wrong username or password"); process.exit(1); }
  mkdirSync(dirname(SRC), { recursive: true });
  writeFileSync(SRC, gunzipSync(Buffer.from(pt)));
  console.log("opened ->", t.src);
} else {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(salt), gzipSync(readFileSync(SRC), { level: 9 })));
  const blob = "\n" + Buffer.concat([salt, iv, ct]).toString("base64").replace(/.{1,120}/g, "$&\n");
  writeFileSync(OUT, page.replace(BLOB_RE, (_, a, __, c) => a + blob + c));
  console.log("sealed ->", t.out, `(${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
}
