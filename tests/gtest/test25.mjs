// Genesis is renamed AutoFaber (Fabe for short): a stored mind keeps everything but its name, and all three names still reach it.
import assert from "node:assert/strict";
globalThis.fetch = async () => { throw new Error("offline in this test"); };
const H = await import("./harness.mjs"); H.hive.sql();
const { Genesis } = await import("./src/hive-genesis.js"); const { directive } = await import("./src/hive.js"); const { Mind } = await import("./src/hive-mind.js");
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);

const s0 = await Genesis.self(H.hive); assert.equal(s0.name, "AutoFaber"); ok("a new mind wakes as AutoFaber");
await H.hive.ctx.storage.put("genesis", { ...s0, name: "Genesis", reflected: 42 });
const s1 = await Genesis.self(H.hive); assert.equal(s1.name, "AutoFaber"); assert.equal(s1.was, "Genesis"); assert.equal(s1.reflected, 42);
assert.equal((await H.hive.ctx.storage.get("genesis")).name, "AutoFaber"); ok("a mind stored as Genesis is renamed once, keeping everything else");
const blk = await Genesis.block(H.hive, "gpt-oss-120b"); assert.match(blk, /You are AutoFaber \(Fabe for short\)/); assert.match(blk, /named you Genesis in your first conversation[^.]*renamed you AutoFaber on October 19, 2026/);
ok("it knows its name, its short name and its history");
for (const w of ["AutoFaber", "Fabe", "Genesis", "hive"]) {
  assert.equal(Genesis.taught(w + ", from now on keep answers short"), "keep answers short", w);
  assert.ok(directive(w + ", add a dark mode to Orbit Watch"), w);
  assert.equal(Mind.heard(w + ", remember that I take my coffee black"), "I take my coffee black", w);
}
ok("lessons, instructions and “remember …” work addressed to AutoFaber, Fabe, Genesis or Hive");
console.log("all " + n + " checks passed"); process.exit(0);
