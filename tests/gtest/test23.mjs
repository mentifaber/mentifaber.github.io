// Genesis's library: documents kept for good, cut into passages, found by meaning, cited in chat; owner only.
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { u = typeof u === "string" ? u : String(u.url || u);
  if (u.startsWith("https://example.org/lathe")) return new Response("<html><title>Haas ST-10 manual</title><body>" + "<p>Spindle warm-up: run the spindle at 500 rpm for ten minutes before cutting, then step up to 2000 rpm.</p>".repeat(3) + "<p>" + "Coolant concentration should sit between six and eight percent on the refractometer. ".repeat(40) + "</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
  throw new Error("offline: " + u); };
const H = await import("./harness.mjs"); const { call, calls, db, setResponder } = H;
const { passages } = await import("./src/hive-library.js");
// embeddings that behave like a real model's: texts about the same thing land close together
const CONCEPTS = [/spindle|warm.?up|lathe|rpm/i, /coolant|refractometer/i, /lagoon|tidal|swansea|turbine|seawall|estuary/i, /strike price|critic|economic|offshore wind/i, /cat|limerick/i, /sentence number/i];
const run0 = H.hive.env.AI.run.bind(H.hive.env.AI);
H.hive.env.AI.run = async (model, input) => { if (!/bge/.test(model)) return run0(model, input);
  return { data: input.text.map((t) => { const v = new Array(384).fill(0.01); CONCEPTS.forEach((re, i) => { const m = String(t).match(new RegExp(re.source, "gi")); if (m) v[i] += 1 + Math.min(m.length, 6) * 0.2; }); return v; }) }; };
const M = "workers-ai|@cf/openai/gpt-oss-120b"; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);

// passages: about 1,400 characters, cut at sentence ends, overlapping
const long = Array.from({ length: 60 }, (_, i) => "Sentence number " + i + " talks about tidal lagoons and turbines in the estuary.").join(" ");
const ps = passages(long); assert.ok(ps.length >= 3 && ps.every((p) => p.length <= 1400 && /\.$/.test(p))); assert.ok(ps[1].startsWith(ps[0].slice(-150).trim().split(". ").pop().slice(0, 10)) || ps[0].slice(-200).includes(ps[1].slice(0, 20))); ok("long text is cut into ~1,400-character passages at sentence ends, overlapping");

// add: pasted text, and a page by link
assert.equal((await call("/library/add", { text: "x" }, false)).error, "the library is the owner's: sign in on Vigil first"); ok("visitors can't touch the library");
let r = await call("/library/add", { title: "Swansea lagoon notes", text: "The Swansea Bay tidal lagoon would hold sixteen turbines in a nine-kilometre seawall and make about 530 gigawatt hours a year.\n\nIts critics pointed to the strike price, which was higher than offshore wind.\n\n" + long });
assert.equal(r.title, "Swansea lagoon notes"); assert.ok(r.chunks >= 4); r = await call("/library/add", { url: "https://example.org/lathe" });
assert.equal(r.title, "Haas ST-10 manual"); assert.ok(r.chars > 3000, "a page keeps more than chat's 12,000-character cut: " + r.chars);
const lib = await call("/library"); assert.equal(lib.docs.length, 2); assert.ok(lib.used >= 6); ok("pasted notes and a page by link are kept, embedded passage by passage (" + lib.used + " passages)");
assert.match((await call("/library/add", { text: "too short" })).error, /nothing to keep/); ok("nothing worth keeping is refused");

// search by meaning, at most two passages per document
let s = await call("/library/search?q=" + encodeURIComponent("how long should the spindle warm up before cutting")); assert.equal(s.hits[0].title, "Haas ST-10 manual"); assert.match(s.hits[0].text, /Spindle warm-up/); ok("search finds the manual's warm-up passage first");

// chat: matching passages arrive as MATERIAL, cited
await call("/chat", { model: M, cid: "l", messages: [{ role: "user", text: "remind me how long the spindle warm-up on the lathe is" }], agent: false });
let sys = calls.at(-1).sys; assert.match(sys, /FROM HIS LIBRARY: "Haas ST-10 manual", passage \d+ of \d+ \(https:\/\/example\.org\/lathe\):\n[^\n]*Spindle warm-up: run the spindle at 500 rpm/); ok("in chat, the matching passage comes along as MATERIAL with its document, passage and link");
await call("/chat", { model: M, cid: "l", messages: [{ role: "user", text: "write me a limerick about cats" }], agent: false }); assert.doesNotMatch(calls.at(-1).sys, /FROM HIS LIBRARY/); ok("an unrelated message carries nothing from the library");
const vr = await call("/chat", { model: M, cid: "v", messages: [{ role: "user", text: "how long is the spindle warm-up on the lathe" }], agent: false }, false); assert.doesNotMatch(calls.at(-1).sys, /FROM HIS LIBRARY/); ok("a visitor's chat never sees his library");

// the planner can search it too
setResponder((sys) => /You decide which tools Genesis/.test(sys) ? (/- library/.test(sys) ? JSON.stringify({ calls: [{ tool: "library", arg: "Swansea lagoon strike price" }] }) : JSON.stringify({ calls: [] })) : null);
r = await call("/chat", { model: M, cid: "p", messages: [{ role: "user", text: "What did my notes say critics thought of the lagoon's economics?" }] });
assert.ok(r.tools.some((t) => /^searched your library: Swansea lagoon strike price/.test(t)), JSON.stringify(r.tools)); assert.match(calls.at(-1).sys, /strike price, which was higher than offshore wind/); ok("the planner can search the library by itself");

// remove
await call("/library/remove", { id: lib.docs.find((d) => d.title === "Haas ST-10 manual").id }); assert.equal((await call("/library")).docs.length, 1); assert.equal(db.prepare("SELECT COUNT(*) c FROM chunk WHERE doc NOT IN (SELECT id FROM doc)").get().c, 0);
s = await call("/library/search?q=" + encodeURIComponent("spindle warm-up")); assert.ok(!s.hits.some((h) => h.title === "Haas ST-10 manual")); ok("removing a document removes its passages, and search stops finding it");
console.log("all " + n + " checks passed"); process.exit(0);
