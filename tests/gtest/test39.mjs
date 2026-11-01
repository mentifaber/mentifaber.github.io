// Projects: a chat in a project carries the project's instructions and files into the prompt (src/hive.js projectText),
// within a fixed budget so they can't crowd out the rest of the answer; a chat outside a project carries nothing.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const { projectText, PROJECT_ROOM } = await import("./src/hive.js");

assert.equal(projectText(null), ""); assert.equal(projectText("x"), ""); assert.equal(projectText({ name: " ", files: [{ name: "a", text: "   " }] }), "");
const big = "x".repeat(PROJECT_ROOM), t = projectText({ name: "Kitchen  renovation", instructions: "Prices in euros.", files: [{ name: "quote.pdf", text: "Tiles: €40/m²" }, { name: "plan.txt", text: big }, { name: "late.csv", text: "never fits" }] });
assert.match(t, /PROJECT “Kitchen renovation”[\s\S]*INSTRUCTIONS, for every chat in it:\nPrices in euros\.[\s\S]*--- quote\.pdf ---\nTiles: €40\/m²[\s\S]*--- plan\.txt \(only the first part fit\) ---/);
assert.doesNotMatch(t, /late\.csv/, "a file with no room left is left out, not sent empty");
assert.ok(t.length < PROJECT_ROOM + 1500, "the files stay within the budget");
assert.equal(projectText({ name: "P", instructions: "y".repeat(9000) }).match(/y{100,}/)[0].length, 4000, "instructions are capped too");
ok("the project's name, instructions and files go into the prompt; files share a fixed budget (the last one that doesn't fit is cut, ones after it left out)");

H.setResponder((sys) => /follow-up questions/.test(sys) ? '{"q":[]}' : /You decide which tools/.test(sys) ? '{"calls":[]}' : "Fine.");
let c0 = calls.length;
await H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", project: { name: "Kitchen renovation", instructions: "Prices in euros, suppliers in Portugal.", files: [{ name: "quote.pdf", text: "Tiles: €40/m² from Revigrés" }] }, messages: [{ role: "user", text: "What will the tiles cost for 12 m²?" }] }, false);
const sys = calls.slice(c0).find((c) => /You are /.test(c.sys)).sys;
assert.match(sys, /PROJECT “Kitchen renovation”[\s\S]*Prices in euros, suppliers in Portugal\.[\s\S]*--- quote\.pdf ---\nTiles: €40\/m² from Revigrés/);
assert.ok(sys.indexOf("PROJECT “") < sys.indexOf("Now: "), "before the time, so the start of the prompt stays the same from one message to the next");
c0 = calls.length; await H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", messages: [{ role: "user", text: "What will the tiles cost for 12 m²?" }] }, false);
assert.doesNotMatch(calls.slice(c0).find((c) => /You are /.test(c.sys)).sys, /PROJECT “/);
ok("a chat in a project answers with its instructions and files (for visitors too); a chat outside one carries none");
console.log("projects: all checks passed");
