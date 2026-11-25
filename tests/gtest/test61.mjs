// Every page's head tags are in its head. A browser ends the <head> at the first thing that can't be there (here, the
// hidden search heading), and a <title>, robots, referrer or description tag after that lands in the body, where it's
// ignored: the Nest's "noindex" and description were. This checks each page's source: none of those tags after <body>.
import assert from "node:assert/strict"; import { readdirSync, readFileSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname, bad = [];
for (const f of readdirSync(REPO).filter((x) => x.endsWith(".html"))) {
  const s = readFileSync(REPO + "/" + f, "utf8"), b = s.search(/<body[\s>]/i); if (b < 0) continue;
  const after = s.slice(b).replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, "");
  const hit = /^\s*<(title>|meta name="(robots|referrer|description|viewport)"|link rel="canonical")/im.exec(after);
  if (hit) bad.push(f + ": " + hit[0].trim().slice(0, 40));
}
assert.deepEqual(bad, [], "head tags after <body>:\n" + bad.join("\n"));
console.log("  ✓ every page's title, robots, referrer, description, viewport and canonical tags are in its head"); console.log("test61: all checks passed");
