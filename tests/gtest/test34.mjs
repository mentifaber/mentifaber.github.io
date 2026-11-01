// Visual answers (assets/hive/visual.js): the chart reader takes only sound specs; axis ticks are round; a widget's page
// carries a no-network policy ahead of anything of its own; a preview tab holds only a sandboxed frame. The prompt offers
// charts, widgets and runnable Python in typed chat, never in voice (where replies are read aloud).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const H = await import("./harness.mjs"); const { calls } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const V = createRequire(import.meta.url)(REPO + "/assets/hive/visual.js");

const s = V.spec('{"type":"line","title":"Users","labels":["Jan","Feb"],"series":[{"name":"A","data":[1,"2"]},{"data":[3,null]}],"unit":"%"}');
assert.equal(s.type, "line"); assert.deepEqual(s.series.map((x) => x.data), [[1, 2], [3, null]]); assert.equal(s.series[1].name, "Series 2");
assert.equal(V.spec('{"type":"bar","series":[{"data":[1,"abc"]}]}'), null, "a value that isn't a number"); assert.equal(V.spec("{oops"), null); assert.equal(V.spec('{"series":[]}'), null);
assert.equal(V.spec('{"type":"pie","series":[{"data":[3,-1]}]}'), null, "no negative slices"); assert.equal(V.spec('{"type":"weird","data":[1,2]}').type, "bar");
assert.deepEqual(V.spec('{"data":[5,6,7]}').labels, ["1", "2", "3"]);
ok("the chart reader takes only sound specs: numbers, at least one point, no negative slices; labels are filled in when missing");
assert.deepEqual(V.ticks(0, 87), [0, 20, 40, 60, 80, 100]); assert.deepEqual(V.ticks(-3, 12), [-5, 0, 5, 10, 15]); assert.deepEqual(V.ticks(0, 0.37), [0, 0.1, 0.2, 0.3, 0.4]);
ok("axis ticks are round numbers that cover the data");
const svg = V.chart('{"type":"pie","title":"Share <b>","labels":["a","b"],"series":[{"data":[1,3]}]}');
assert.match(svg, /<path class='s0'/); assert.match(svg, /75%/); assert.doesNotMatch(svg, /<b>/, "titles are escaped"); assert.equal(V.chart("nope"), null);
ok("a pie chart draws its slices with percentages; text from the model is escaped");

const doc = V.widgetDoc("<html><head><script>alert(1)</script></head><body>hi</body></html>", "w1");
assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("alert(1)"), "the policy comes before the widget's own script");
assert.match(doc, /default-src 'none'/); assert.match(V.widget("<p>x</p>"), /sandbox='allow-scripts'/); assert.doesNotMatch(V.widget("<p>x</p>"), /allow-same-origin/);
const page = V.sandboxedPage("<script>steal()</script>"); assert.doesNotMatch(page.replace(/srcdoc="[^"]*"/, ""), /<script/i, "the tab's own page has no script"); assert.match(page, /<iframe sandbox='[^']*allow-scripts[^']*'/); assert.doesNotMatch(page, /allow-same-origin/);
ok("a widget's page puts a no-network policy before its own code, in a frame without the app's origin; a preview tab holds only such a frame");

H.setResponder(() => "fine");
const chat = (voice) => H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", voice, messages: [{ role: "user", text: "Compare the populations of France and Spain" }] }, false);
let c0 = calls.length; await chat(false); assert.match(calls.slice(c0).at(-1).sys, /Visual answers: when numbers compare[\s\S]*```chart[\s\S]*```widget[\s\S]*```python/);
c0 = calls.length; await chat(true); assert.doesNotMatch(calls.slice(c0).at(-1).sys, /Visual answers/);
ok("typed chat is offered charts, widgets and runnable Python; voice, read aloud, is not");
console.log("visual answers: all checks passed");
