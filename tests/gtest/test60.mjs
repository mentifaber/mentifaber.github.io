// No class in src/ defines the same method twice. JavaScript allows it silently (the later one wins), and `node --check`
// doesn't notice, but it can quietly replace working code: the bundler (wrangler, at deploy) only warns. This reads each
// class body's top-level members (two-space indented, as the code is written) and fails on a repeat.
import assert from "node:assert/strict"; import { readdirSync, readFileSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname; const dup = [];
for (const f of readdirSync(REPO + "/src").filter((x) => x.endsWith(".js"))) {
  const parts = readFileSync(REPO + "/src/" + f, "utf8").split(/^(?=(?:export )?class \w+)/m).slice(1);
  for (const body of parts) {
    const cls = /class (\w+)/.exec(body)[1], end = body.search(/^\}/m), inner = end > 0 ? body.slice(0, end) : body, seen = new Map();
    for (const m of inner.matchAll(/^  (?:static )?(?:async )?(?:get |set )?\*?([A-Za-z_$][\w$]*)\s*\(/gm)) {
      const key = (/^  (?:static )?(?:async )?(get|set) /.exec(m[0]) || [, ""])[1] + m[1]; if (["if", "for", "while", "switch", "catch", "return"].includes(m[1])) continue;
      if (seen.has(key)) dup.push(f + ": " + cls + "." + m[1]); seen.set(key, 1);
    }
  }
}
assert.deepEqual(dup, [], "methods defined twice:\n" + dup.join("\n"));
console.log("  ✓ no class in src/ defines a method twice"); console.log("test60: all checks passed");
