// Every page's own scripts parse: a slip in a page's inline <script> (a comment that swallows the rest of its line, a
// stray bracket) stops the whole page. One did: the Nest registry showed no items until it was fixed (#324). Each inline
// script is checked with `node --check` (as a module where it is one), so this fails in seconds, before anything ships.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const dir = mkdtempSync(tmpdir() + "/pages-"), bad = [];
let n = 0;
for (const f of readdirSync(REPO).filter((x) => x.endsWith(".html"))) {
  const html = readFileSync(REPO + "/" + f, "utf8");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1], code = m[2];
    if (/\bsrc=/i.test(attrs) || !code.trim()) continue; // a file's script is checked where it lives
    const type = (/\btype=["']?([^"'\s>]+)/i.exec(attrs) || [])[1] || "";
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue; // JSON-LD, templates, data
    const file = dir + "/s" + ++n + (type === "module" ? ".mjs" : ".cjs");
    writeFileSync(file, code);
    try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); }
    catch (e) { bad.push(f + " script " + n + ": " + String(e.stderr || e.message).split("\n").filter((l) => /Error/.test(l))[0]); }
  }
}
rmSync(dir, { recursive: true, force: true });
assert.deepEqual(bad, [], "pages whose own scripts don't parse:\n" + bad.join("\n"));
console.log("ok - " + n + " inline scripts across the pages parse");
