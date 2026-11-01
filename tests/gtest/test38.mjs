// Fact check (src/hive-check.js): the checkable claims in an answer are picked out and searched side by side; a model that
// didn't write the answer weighs each against what was found: supported, contradicted or unclear, with its source.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const C = await import("./src/hive-check.js");

assert.deepEqual(C.parseClaims('Here: {"claims": [{"claim": "The Eiffel Tower is 330 metres tall", "search": "Eiffel Tower height"}, {"claim": "short", "search": "x"}]}'), [{ claim: "The Eiffel Tower is 330 metres tall", q: "Eiffel Tower height" }]);
ok("claims are read from the picker's JSON; ones too short to check are dropped");

globalThis.fetch = async (u) => { u = String(u);
  if (/wikipedia\.org\/w\/api\.php/.test(u)) return Response.json({ query: { search: [{ title: "Eiffel Tower", snippet: "tower" }] } });
  if (/wikipedia\.org\/api\/rest_v1/.test(u)) return Response.json({ title: "Eiffel Tower", extract: "The Eiffel Tower is 330 metres (1,083 ft) tall and was completed in 1889.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Eiffel_Tower" } } });
  return new Response("{}", { status: 404 }); };
H.hive.web = async (q) => [{ title: "Paris guide: " + q, url: "https://example.org/" + encodeURIComponent(q), text: "Completed in 1889 for the World's Fair; it was the tallest structure until 1930." }];
let judged = null;
H.setResponder((sys, user) => {
  if (/You pick out the claims/.test(sys)) return '{"claims": [{"claim": "The Eiffel Tower is 330 metres tall", "search": "Eiffel Tower height"}, {"claim": "It was completed in 1901", "search": "Eiffel Tower completed"}, {"claim": "It is painted every 3 years", "search": "Eiffel Tower painting schedule"}]}';
  if (/You check claims against the sources found/.test(sys)) { judged = { user, model: calls[calls.length - 1].model }; return '{"v": [{"verdict": "S", "source": "1.2", "note": "Wikipedia gives 330 m"}, {"verdict": "C", "source": "2.1", "note": "completed in 1889"}, {"verdict": "U", "source": null, "note": "nothing on painting"}]}'; }
  return "ok";
});
const answer = "The Eiffel Tower in Paris is 330 metres tall. It was completed in 1901 and is repainted every three years.";
let r = await H.call("/factcheck", { text: answer, question: "Tell me about the Eiffel Tower", writer: "workers-ai|@cf/openai/gpt-oss-120b" }, false);
assert.deepEqual(r.claims.map((c) => c.verdict), ["supported", "contradicted", "unclear"]);
assert.deepEqual(r.claims[0].source, { title: "Eiffel Tower · Wikipedia", url: "https://en.wikipedia.org/wiki/Eiffel_Tower" }); assert.equal(r.claims[1].source.url, "https://example.org/Eiffel%20Tower%20completed"); assert.equal(r.claims[2].source, null, "unclear names no source");
assert.equal(judged.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "the writer (gpt-oss) doesn't judge its own answer");
assert.match(judged.user, /CLAIM 1: The Eiffel Tower is 330 metres tall\n  SOURCE 1\.1 \(Paris guide: Eiffel Tower height\): Completed in 1889[\s\S]*SOURCE 1\.2 \(Eiffel Tower · Wikipedia\): The Eiffel Tower is 330 metres/);
ok("each claim is searched, judged by a model that didn't write the answer, and comes back supported, contradicted or unclear with its source");

H.setResponder((sys) => /You pick out the claims/.test(sys) ? '{"claims": []}' : "ok");
r = await H.call("/factcheck", { text: "I'd suggest starting with the smaller project, since it fits your schedule better." }, false); assert.deepEqual(r.claims, []); assert.match(r.note, /no checkable claims/);
H.setResponder((sys) => /You pick out the claims/.test(sys) ? '{"claims": [{"claim": "The Eiffel Tower is 330 metres tall", "search": "Eiffel Tower height"}]}' : /You check claims/.test(sys) ? "Looks right to me!" : "ok");
r = await H.call("/factcheck", { text: answer }, false); assert.match(r.error, /didn't give a verdict/);
ok("an answer with nothing checkable says so; a checker that won't give verdicts is reported as a failure, not a pass");

for (let i = 0; i < 7; i++) await H.call("/factcheck", { text: "short" }, false);
assert.match((await H.call("/factcheck", { text: answer }, false)).error, /today's 10 fact checks/);
ok("visitors get ten fact checks a day");
console.log("fact check: all checks passed");
