// Canvas (src/hive-canvas.js): a selected passage is rewritten in place (the model sees it marked ⟦ ⟧ inside the whole
// document and sends back only the passage); with nothing selected the whole document is rewritten; presets name common
// edits; what comes back is cleaned of markers, preambles and fences the original didn't have; a failing model falls back.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const C = await import("./src/hive-canvas.js");

assert.equal(C.cleanRewrite("Here's the rewritten passage:\n\n⟦Shorter now.⟧", "  A long sentence.\n"), "  Shorter now.\n", "the passage keeps its surrounding whitespace");
assert.equal(C.cleanRewrite("```markdown\nShorter now.\n```", "A long sentence."), "Shorter now.", "fences the original didn't have come off");
assert.equal(C.cleanRewrite("```js\nlet a = 1;\n```", "```js\nvar a = 1;\n```"), "```js\nlet a = 1;\n```", "a code block stays a code block");
assert.equal(C.cleanRewrite("“Shorter now.”", "A long sentence."), "Shorter now.");
assert.equal(C.cleanRewrite("   ", "x"), "");
ok("a rewrite comes back as just the passage: markers, preambles, stray fences and quotes removed, its whitespace kept");

const doc = "# Trip\n\nWe fly to Lisbon on Friday morning and, after a long and frankly exhausting day of travel, we arrive at the hotel.\n\n## Budget\n\nAbout €300.";
const s = doc.indexOf("We fly"), e = doc.indexOf("hotel.") + 6;
H.setResponder((sys, user) => /passage is marked/.test(sys) ? "Sure, here's the passage:\n⟦We fly to Lisbon on Friday and reach the hotel that evening.⟧" : /Rewrite the whole document/.test(sys) ? "# Trip\n\nLisbon, Friday.\n\n## Budget\n\n€300." : "?");
let c0 = calls.length, r = await H.call("/canvas/rewrite", { doc, start: s, end: e, preset: "shorter" }, false);
assert.equal(r.whole, false); assert.equal(r.text, "We fly to Lisbon on Friday and reach the hotel that evening.");
const sent = calls.slice(c0)[0]; assert.equal(sent.model, "@cf/openai/gpt-oss-120b");
assert.match(sent.user, /^INSTRUCTION: Make it about half as long\.[\s\S]*# Trip\n\n⟦We fly to Lisbon on Friday morning[\s\S]*hotel\.⟧\n\n## Budget\n\nAbout €300\.$/, "the whole document, with the passage marked in place");
ok("a selected passage is rewritten in place: the model sees the whole document with the passage marked, and sends back only the passage");

r = await H.call("/canvas/rewrite", { doc, how: "Make it terse" }, false); assert.equal(r.whole, true); assert.equal(r.text, "# Trip\n\nLisbon, Friday.\n\n## Budget\n\n€300.");
r = await H.call("/canvas/rewrite", { doc, start: 0, end: doc.length, how: "Make it terse" }, false); assert.equal(r.whole, true, "selecting everything is the whole document");
ok("with nothing selected (or everything), the whole document is rewritten as asked");

const real = H.env.AI.run; H.env.AI.run = async (model, inp) => { if (/gpt-oss/.test(model)) throw new Error("capacity"); return real(model, inp); };
c0 = calls.length; r = await H.call("/canvas/rewrite", { doc, start: s, end: e, preset: "polish" }, false); H.env.AI.run = real;
assert.equal(r.model, "llama-3.3-70b-instruct-fp8-fast"); assert.match(r.text, /^We fly to Lisbon/);
ok("when the first model fails, the second writes it");

assert.match((await H.call("/canvas/rewrite", { doc, start: s, end: e }, false)).error, /say what to change/);
assert.match((await H.call("/canvas/rewrite", { doc: "  ", how: "x" }, false)).error, /nothing in the canvas/);
assert.match((await H.call("/canvas/rewrite", { doc: "a    b", start: 1, end: 4, how: "x" }, false)).error, /only blank space/);
H.setResponder(() => "   "); r = await H.call("/canvas/rewrite", { doc, how: "x" }, false); assert.match(r.error, /couldn't rewrite it: the model sent back nothing/);
ok("no instruction, an empty canvas, a blank selection and an empty reply are each said plainly");

H.setResponder(() => "Fine."); let last;
for (let i = 0; i < 40; i++) last = await H.call("/canvas/rewrite", { doc, how: "x" }, false);
assert.match(last.error, /today's 40 canvas edits/); assert.ok(!(await H.call("/canvas/rewrite", { doc, how: "x" })).error, "the owner has no daily limit");
ok("visitors get 40 canvas edits a day; the owner isn't limited");
console.log("canvas: all checks passed");
